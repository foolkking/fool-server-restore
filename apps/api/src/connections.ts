import { createId, updateRuntimeDatabase, type StoredConnection } from "./runtime-store.js";

export type ConnectionMethod = "ssh-password" | "ssh-key" | "winrm" | "docker";

export interface ConnectionRequest {
  method?: ConnectionMethod;
  label?: string;
  fields?: Record<string, string>;
}

export interface ConnectionResponse {
  connection: StoredConnection;
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

  const now = new Date().toISOString();
  const connection: StoredConnection = {
    id: createId("conn"),
    userId,
    method,
    label: normalizeLabel(input.label, method, fields),
    status: "validated",
    fields: maskFields(fields),
    maskedSecrets: Object.keys(fields).filter((field) => secretFields.has(field)),
    realConnection: false,
    createdAt: now,
    updatedAt: now
  };

  await updateRuntimeDatabase((database) => {
    database.connections.unshift(connection);
  });

  return {
    connection,
    note: "Connection fields were validated and stored as a masked local profile. No remote SSH/WinRM/Docker command was executed."
  };
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
