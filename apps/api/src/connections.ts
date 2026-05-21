import { createId, updateRuntimeDatabase, readRuntimeDatabase, type StoredConnection, type StoredProbeSnapshot } from "./runtime-store.js";
import { probeAgent } from "./probe.js";
import { testSshConnection, testSshConnectionWithContent } from "./ssh.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { readUserKey } from "./key-store.js";

export type ConnectionMethod = "ssh-password" | "ssh-key";

export interface ConnectionRequest {
  method?: ConnectionMethod;
  label?: string;
  fields?: Record<string, string>;
  /** Optional URL of the mock-agent or real agent running on the target machine */
  agentUrl?: string;
  /** For ssh-key: ID of a key uploaded via /api/keys (preferred over privateKeyPath) */
  keyId?: string;
}

export interface ConnectionResponse {
  connection: StoredConnection;
  probe: StoredProbeSnapshot | null;
  note: string;
}

const requiredFields: Record<ConnectionMethod, string[]> = {
  "ssh-password": ["host", "port", "username", "password"],
  "ssh-key": ["host", "port", "username"]  // privateKeyPath OR keyId, validated separately
};

const secretFields = new Set(["password", "passphrase", "privateKeyPath"]);

export async function createConnection(userId: string, input: ConnectionRequest): Promise<ConnectionResponse> {
  const method = normalizeMethod(input.method);
  const fields = normalizeFields(input.fields ?? {});

  // For ssh-key: require either privateKeyPath or keyId
  if (method === "ssh-key" && !fields.privateKeyPath && !input.keyId) {
    throw new Error("SSH key connection requires either privateKeyPath or keyId.");
  }

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

    let sshResult: import("./ssh.js").SshResult;

    if (method === "ssh-password") {
      sshResult = await testSshConnection(host, port, username, {
        type: "password",
        password: fields.password
      });
    } else if (input.keyId) {
      // 使用 Web 上传的密钥
      try {
        const privateKeyContent = await readUserKey(userId, input.keyId);
        sshResult = await testSshConnectionWithContent(
          host, port, username, privateKeyContent, fields.passphrase
        );
      } catch (err) {
        throw new Error(`Failed to load SSH key: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      sshResult = await testSshConnection(host, port, username, {
        type: "key",
        privateKeyPath: fields.privateKeyPath,
        passphrase: fields.passphrase
      });
    }

    if (sshResult.ok) {
      status = "probed";
      probeSnapshot = sshResult.snapshot;
      notes.push(`SSH connection to ${host}:${port} succeeded (${sshResult.latencyMs}ms). Comprehensive system data collected.`);
    } else {
      status = "ssh_failed";
      sshError = sshResult.error;
      notes.push(`SSH connection to ${host}:${port} failed: ${sshResult.error}`);
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
    fields: maskFieldsForStorage(fields, method, input.keyId),
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

  // 重新尝试真实 SSH 连接（使用存储的凭据）
  if (conn.method === "ssh-password" || conn.method === "ssh-key") {
    const decryptedFields = decryptStoredFields(conn.fields);
    const host = decryptedFields.host;
    const port = parseInt(decryptedFields.port ?? "22", 10) || 22;
    const username = decryptedFields.username;

    let sshResult: import("./ssh.js").SshResult | null = null;

    if (conn.method === "ssh-password") {
      const password = decryptedFields._rawPassword ?? decryptedFields.password;
      if (password && password !== "********") {
        sshResult = await testSshConnection(host, port, username, {
          type: "password",
          password
        });
      }
    } else {
      // ssh-key: check for stored keyId or privateKeyPath
      const keyId = decryptedFields._keyId;
      if (keyId) {
        try {
          const privateKeyContent = await readUserKey(userId, keyId);
          const passphrase = decryptedFields._rawPassphrase;
          sshResult = await testSshConnectionWithContent(host, port, username, privateKeyContent, passphrase);
        } catch {
          // Key may have been deleted — fall through
        }
      } else if (decryptedFields.privateKeyPath && decryptedFields.privateKeyPath !== "********") {
        sshResult = await testSshConnection(host, port, username, {
          type: "key",
          privateKeyPath: decryptedFields.privateKeyPath,
          passphrase: decryptedFields._rawPassphrase
        });
      }
    }

    if (sshResult) {
      if (sshResult.ok) {
        probeSnapshot = sshResult.snapshot;
        status = "probed";
        sshError = undefined;
      } else {
        status = "ssh_failed";
        sshError = sshResult.error;
      }
    }
  }

  // 如果 SSH 没成功且有 agentUrl，尝试 agent 探测作为备选
  if (!probeSnapshot && conn.agentUrl) {
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
      if (status !== "ssh_failed") status = "unreachable";
    }
  }

  return updateRuntimeDatabase((db2) => {
    const target = db2.connections.find((c) => c.id === connectionId && c.userId === userId);
    if (!target) return null;
    target.lastProbeAt = now;
    target.updatedAt = now;
    target.status = status;
    target.sshError = sshError;
    if (probeSnapshot) target.probeSnapshot = probeSnapshot;
    return target;
  });
}

export async function listUserConnections(userId: string): Promise<StoredConnection[]> {
  const db = await readRuntimeDatabase();
  return db.connections
    .filter((c) => c.userId === userId)
    .map((c) => ({ ...c, fields: maskFields(c.fields) }));
}

function normalizeMethod(method?: ConnectionMethod): ConnectionMethod {
  if (method === "ssh-password" || method === "ssh-key") return method;
  throw new Error("Unsupported connection method. Only ssh-password and ssh-key are supported.");
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
    Object.entries(fields)
      .filter(([key]) => !key.startsWith("_raw") && key !== "_keyId")
      .map(([key, value]) => [key, secretFields.has(key) ? "********" : value])
  );
}

/** Store raw password internally for SSH execution, but mask for API responses */
function maskFieldsForStorage(fields: Record<string, string>, method: ConnectionMethod, keyId?: string): Record<string, string> {
  const stored: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("_")) continue; // skip internal fields from frontend
    if (secretFields.has(key)) {
      stored[key] = "********";
      if (key === "password" && method === "ssh-password") {
        stored["_rawPassword"] = encryptSecret(value);
      }
      if (key === "privateKeyPath") {
        stored[key] = value; // keep path as-is
      }
      if (key === "passphrase" && value) {
        stored["_rawPassphrase"] = encryptSecret(value);
      }
    } else {
      stored[key] = value;
    }
  }
  // Store keyId reference (not the key content)
  if (keyId) {
    stored["_keyId"] = keyId;
  }
  return stored;
}

/**
 * 解密内部存储的敏感字段，仅在 SSH 执行/重新探测时使用。
 * 不暴露给 API 响应。
 */
export function decryptStoredFields(fields: Record<string, string>): Record<string, string> {
  const decrypted = { ...fields };
  if (decrypted._rawPassword) {
    try { decrypted._rawPassword = decryptSecret(decrypted._rawPassword); } catch { /* ignore */ }
  }
  if (decrypted._rawPassphrase) {
    try { decrypted._rawPassphrase = decryptSecret(decrypted._rawPassphrase); } catch { /* ignore */ }
  }
  return decrypted;
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
