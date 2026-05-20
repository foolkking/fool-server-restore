import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getConfig } from "./config.js";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  defaultSshUser?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredProbeSnapshot {
  agentId: string;
  collectedAt: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    release: string;
    uptime: number;
    cpu: { model: string; cores: number; speedMhz: number };
    memory: { totalBytes: number; freeBytes: number; usedBytes: number; totalGb: string; freeGb: string };
  };
  software: Array<{ name: string; version: string; source: string; status: string }>;
  configChecklist: Array<{ id: string; label: string; category: string; status: string; lastChanged: string }>;
}

export interface StoredConnection {
  id: string;
  userId: string;
  method: "ssh-password" | "ssh-key" | "winrm" | "docker";
  label: string;
  /**
   * validated   — 字段校验通过，未做任何网络测试
   * connecting  — 正在尝试 SSH/WinRM/Docker 握手（瞬态，不持久化）
   * ssh_ok      — SSH 握手成功，确认目标机器可达
   * ssh_failed  — SSH 握手失败（认证错误、超时、拒绝连接等）
   * probed      — SSH 成功 + 采集到真实系统数据
   * unreachable — agent HTTP 探测失败
   */
  status: "validated" | "ssh_ok" | "ssh_failed" | "probed" | "unreachable";
  sshError?: string;
  fields: Record<string, string>;
  maskedSecrets: string[];
  realConnection: false;
  /** URL of the mock-agent or future real agent on the target machine */
  agentUrl?: string;
  /** Last successful probe result from the agent */
  probeSnapshot?: StoredProbeSnapshot;
  /** ISO timestamp of last probe attempt */
  lastProbeAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUserProfile {
  id: string;
  userId: string;
  kind: "software" | "combo";
  name: string;
  nameEn: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary: string;
  summaryEn: string;
  sensitivity: "safe" | "review" | "privileged";
  components: Array<{
    type: "software" | "system-command" | "system-config";
    label: string;
    labelEn: string;
    detail: string;
  }>;
  installMode: "skip-existing" | "replace-existing";
  /** Optional markdown guide written by the user */
  guideMarkdown?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeDatabase {
  schemaVersion: string;
  users: StoredUser[];
  sessions: StoredSession[];
  connections: StoredConnection[];
  userProfiles: StoredUserProfile[];
}

export async function readRuntimeDatabase(): Promise<RuntimeDatabase> {
  const absolutePath = getConfig().runtimeDatabasePath;
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    return normalizeRuntimeDatabase(JSON.parse(raw) as Partial<RuntimeDatabase>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const database = createRuntimeDatabase();
    await writeRuntimeDatabase(database);
    return database;
  }
}

export async function writeRuntimeDatabase(database: RuntimeDatabase): Promise<void> {
  const absolutePath = getConfig().runtimeDatabasePath;
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

export async function updateRuntimeDatabase<T>(mutate: (database: RuntimeDatabase) => T): Promise<T> {
  const database = await readRuntimeDatabase();
  const result = mutate(database);
  await writeRuntimeDatabase(database);
  return result;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function createRuntimeDatabase(): RuntimeDatabase {
  return {
    schemaVersion: "0.1.0",
    users: [],
    sessions: [],
    connections: [],
    userProfiles: []
  };
}

function normalizeRuntimeDatabase(database: Partial<RuntimeDatabase>): RuntimeDatabase {
  return {
    schemaVersion: database.schemaVersion ?? "0.1.0",
    users: database.users ?? [],
    sessions: database.sessions ?? [],
    connections: (database.connections ?? []).map((c) => ({
      ...c,
      status: c.status ?? "validated"
    })) as StoredConnection[],
    userProfiles: database.userProfiles ?? []
  };
}
