import { createId, updateRuntimeDatabase, readRuntimeDatabase, type StoredConnection, type StoredProbeSnapshot } from "./runtime-store.js";
import { probeAgent } from "./probe.js";
import { testSshConnection } from "./ssh.js";

export type ConnectionMethod = "ssh-password" | "ssh-key" | "winrm" | "docker";

export interface ConnectionRequest {
  method?: ConnectionMethod;
  label?: string;
  fields?: Record<string, string>;
  /** Optional URL of the mock-agent or real agent running on the target machine */
  agentUrl?: string;
}

export interface ConnectionResponse {
  connection: StoredConnection;
  probe: StoredProbeSnapshot | null;
  note: string;
}

const requiredFields: Record<ConnectionMethod, string[]> = {
  "ssh-password": ["host", "port", "username", "password"],
  "ssh-key": ["host", "port", "username", "privateKeyPath"],
  winrm: ["host", "domain", "username", "password"],
  docker: ["contextName", "host"]
};

const secretFields = new Set(["password", "passphrase", "privateKeyPath"]);

export async function createConnection(userId: string, input: ConnectionRequest): Promise<ConnectionResponse> {
  const method = normalizeMethod(input.method);
  const fields = normalizeFields(input.fields ?? {});
  const missing = requiredFields[method].filter((field) => !fields[field]);
  if (missing.length) {
    throw new Error(`Missing required connection fields: ${missing.join(", ")}`);
  }

  const agentUrl = normalizeAgentUrl(input.agentUrl);
  const now = new Date().toISOString();

  let probeSnapshot: StoredProbeSnapshot | null = null;
  let status: StoredConnection["status"] = "validated";
  let sshError: string | undefined;
  const notes: string[] = [];

  // ── 真实 SSH 连接测试 ──────────────────────────────────────
  if (method === "ssh-password" || method === "ssh-key") {
    const host = fields.host;
    const port = parseInt(fields.port ?? "22", 10) || 22;
    const username = fields.username;

    const auth =
      method === "ssh-password"
        ? ({ type: "password", password: fields.password } as const)
        : ({ type: "key", privateKeyPath: fields.privateKeyPath, passphrase: fields.passphrase } as const);

    const sshResult = await testSshConnection(host, port, username, auth);

    if (sshResult.ok) {
      status = "probed";
      probeSnapshot = sshResult.snapshot;
      notes.push(`SSH connection to ${host}:${port} succeeded (${sshResult.latencyMs}ms). Real system data collected.`);
    } else {
      status = "ssh_failed";
      sshError = sshResult.error;
      notes.push(`SSH connection to ${host}:${port} failed: ${sshResult.error}`);
    }
  }

  // ── mock-agent HTTP 探测（SSH 未成功时的备选，或 docker/winrm 方式）──
  if (status !== "probed" && agentUrl) {
    const result = await probeAgent(agentUrl);
    if (result.reachable) {
      probeSnapshot = {
        agentId: result.agentId,
        collectedAt: result.collectedAt,
        system: result.system,
        software: result.software,
        configChecklist: result.configChecklist
      };
      status = "probed";
      notes.push(`Agent at ${agentUrl} probed successfully. Real system data saved.`);
    } else {
      if (status === "validated") status = "unreachable";
      notes.push(`Agent at ${agentUrl} was not reachable.`);
    }
  }

  if (notes.length === 0) {
    notes.push("Connection fields validated and stored as a masked profile. No remote command executed.");
  }

  const connection: StoredConnection = {
    id: createId("conn"),
    userId,
    method,
    label: normalizeLabel(input.label, method, fields),
    status,
    sshError,
    fields: maskFields(fields),
    maskedSecrets: Object.keys(fields).filter((field) => secretFields.has(field)),
    realConnection: false,
    agentUrl: agentUrl ?? undefined,
    probeSnapshot: probeSnapshot ?? undefined,
    lastProbeAt: now,
    createdAt: now,
    updatedAt: now
  };

  await updateRuntimeDatabase((database) => {
    database.connections.unshift(connection);
  });

  return { connection, probe: probeSnapshot, note: notes.join(" ") };
}

export async function reprobeConnection(connectionId: string, userId: string): Promise<StoredConnection | null> {
  const db = await readRuntimeDatabase();
  const conn = db.connections.find((c) => c.id === connectionId && c.userId === userId);
  if (!conn) return null;

  const now = new Date().toISOString();
  let probeSnapshot: StoredProbeSnapshot | null = null;
  let status: StoredConnection["status"] = conn.status;
  let sshError: string | undefined;

  // 重新尝试 SSH
  if (conn.method === "ssh-password" || conn.method === "ssh-key") {
    // 注意：密码已脱敏，reprobe 只能用 agentUrl 方式
    // 如果有 agentUrl，走 agent 探测
  }

  if (conn.agentUrl) {
    const result = await probeAgent(conn.agentUrl);
    if (result.reachable) {
      probeSnapshot = {
        agentId: result.agentId,
        collectedAt: result.collectedAt,
        system: result.system,
        software: result.software,
        configChecklist: result.configChecklist
      };
      status = "probed";
    } else {
      status = "unreachable";
    }
  }

  return updateRuntimeDatabase((db2) => {
    const target = db2.connections.find((c) => c.id === connectionId && c.userId === userId);
    if (!target) return null;
    target.lastProbeAt = now;
    target.updatedAt = now;
    target.status = status;
    if (sshError !== undefined) target.sshError = sshError;
    if (probeSnapshot) target.probeSnapshot = probeSnapshot;
    return target;
  });
}

export async function listUserConnections(userId: string): Promise<StoredConnection[]> {
  const db = await readRuntimeDatabase();
  return db.connections.filter((c) => c.userId === userId);
}

function normalizeMethod(method?: ConnectionMethod): ConnectionMethod {
  if (method && method in requiredFields) return method;
  throw new Error("Unsupported connection method.");
}

function normalizeFields(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, String(value ?? "").trim()])
  );
}

function normalizeLabel(label: string | undefined, method: ConnectionMethod, fields: Record<string, string>): string {
  const cleaned = label?.trim();
  if (cleaned) return cleaned.slice(0, 100);
  return fields.host || fields.contextName || method;
}

function maskFields(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, secretFields.has(key) ? "********" : value])
  );
}

function normalizeAgentUrl(agentUrl?: string): string | null {
  const trimmed = agentUrl?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}
