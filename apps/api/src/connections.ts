import { createId, updateRuntimeDatabase, type StoredConnection, type StoredProbeSnapshot } from "./runtime-store.js";
import { probeAgent } from "./probe.js";

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

  // 如果提供了 agentUrl，尝试探测真实数据
  let probeSnapshot: StoredProbeSnapshot | null = null;
  let probeStatus: StoredConnection["status"] = "validated";

  if (agentUrl) {
    const result = await probeAgent(agentUrl);
    if (result.reachable) {
      probeSnapshot = {
        agentId: result.agentId,
        collectedAt: result.collectedAt,
        system: result.system,
        software: result.software,
        configChecklist: result.configChecklist
      };
      probeStatus = "probed";
    } else {
      probeStatus = "unreachable";
    }
  }

  const connection: StoredConnection = {
    id: createId("conn"),
    userId,
    method,
    label: normalizeLabel(input.label, method, fields),
    status: probeStatus,
    fields: maskFields(fields),
    maskedSecrets: Object.keys(fields).filter((field) => secretFields.has(field)),
    realConnection: false,
    agentUrl: agentUrl ?? undefined,
    probeSnapshot: probeSnapshot ?? undefined,
    lastProbeAt: agentUrl ? now : undefined,
    createdAt: now,
    updatedAt: now
  };

  await updateRuntimeDatabase((database) => {
    database.connections.unshift(connection);
  });

  const notes: string[] = [
    "Connection fields were validated and stored as a masked local profile. No remote SSH/WinRM/Docker command was executed."
  ];
  if (agentUrl && probeStatus === "probed") {
    notes.push(`Agent at ${agentUrl} was probed successfully. Real system data has been saved.`);
  } else if (agentUrl && probeStatus === "unreachable") {
    notes.push(`Agent at ${agentUrl} was not reachable. Connection profile saved without live data.`);
  }

  return { connection, probe: probeSnapshot, note: notes.join(" ") };
}

export async function reprobeConnection(connectionId: string, userId: string): Promise<StoredConnection | null> {
  const database = await updateRuntimeDatabase((db) => {
    const conn = db.connections.find((c) => c.id === connectionId && c.userId === userId);
    return conn ?? null;
  });
  if (!database || !database.agentUrl) return null;

  const result = await probeAgent(database.agentUrl);
  const now = new Date().toISOString();

  return updateRuntimeDatabase((db) => {
    const conn = db.connections.find((c) => c.id === connectionId && c.userId === userId);
    if (!conn) return null;
    conn.lastProbeAt = now;
    conn.updatedAt = now;
    if (result.reachable) {
      conn.status = "probed";
      conn.probeSnapshot = {
        agentId: result.agentId,
        collectedAt: result.collectedAt,
        system: result.system,
        software: result.software,
        configChecklist: result.configChecklist
      };
    } else {
      conn.status = "unreachable";
    }
    return conn;
  });
}

export async function listUserConnections(userId: string): Promise<StoredConnection[]> {
  const { connections } = await import("./runtime-store.js").then((m) => m.readRuntimeDatabase());
  return connections.filter((c) => c.userId === userId);
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
