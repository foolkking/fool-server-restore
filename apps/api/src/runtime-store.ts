import { randomUUID } from "node:crypto";
import { getConfig } from "./config.js";
import { SafeJsonStore } from "./db-store.js";

// Singleton store instance (reused across requests for cache efficiency)
let _store: SafeJsonStore<RuntimeDatabase> | null = null;

function getStore(): SafeJsonStore<RuntimeDatabase> {
  if (!_store) {
    _store = new SafeJsonStore<RuntimeDatabase>(getConfig().runtimeDatabasePath, 500);
  }
  return _store;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  defaultSshUser?: string;
  /** "user" = 普通用户（默认），"admin" = 系统管理员 */
  role: "user" | "admin";
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
    osPretty?: string;
    cpu: { model: string; cores: number; speedMhz: number };
    memory: { totalBytes: number; freeBytes: number; usedBytes: number; totalGb: string; freeGb: string };
    disk?: { total: string; used: string; available: string; usePercent: string };
    uptimeText?: string;
  };
  software: Array<{ name: string; version: string; source: string; status: string }>;
  configChecklist: Array<{ id: string; label: string; category: string; status: string; lastChanged: string }>;
  /** Per-source counts for summary display */
  counts?: {
    apt: number;
    rpm: number;
    snap: number;
    flatpak: number;
    npm: number;
    pip: number;
    gem: number;
    cargo: number;
    localBin: number;
    opt: number;
    userBin: number;
    nvm: number;
    pyenv: number;
    docker: number;
    enabledServices: number;
    runningServices: number;
    total: number;
  };
}

export interface StoredConnection {
  id: string;
  userId: string;
  method: "ssh-password" | "ssh-key";
  label: string;
  /** 用户自定义标签，用于分组（如 dev、staging、prod） */
  tags?: string[];
  /**
   * validated   — 字段校验通过，未做任何网络测试
   * connecting  — 正在尝试 SSH 握手（瞬态，不持久化）
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
  agentUrl?: string;
  probeSnapshot?: StoredProbeSnapshot;
  lastProbeAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUserProfile {
  id: string;
  userId: string;
  kind: "software" | "combo" | "vm-snapshot";
  /**
   * public  — 出现在配置市场，所有人可见
   * private — 仅自己可见，用于存储含隐私数据的虚拟机运行环境快照
   */
  visibility: "public" | "private";
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
  /** 来源连接 ID（vm-snapshot 类型专用） */
  sourceConnectionId?: string;
  /** 完整的虚拟机运行环境快照（含隐私数据，仅 private 可见） */
  envSnapshot?: StoredProbeSnapshot & {
    envVars?: Record<string, string>;
    configFiles?: Array<{ path: string; content: string }>;
    userNotes?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeDatabase {
  schemaVersion: string;
  users: StoredUser[];
  sessions: StoredSession[];
  connections: StoredConnection[];
  userProfiles: StoredUserProfile[];
  /** 任务历史（仅记录最近 200 条，老的自动清理） */
  tasks?: StoredTaskHistory[];
  /** 用户保存的 Playbook（含版本历史） */
  playbooks?: StoredPlaybook[];
  /** Catalog item install counter (catalogId → real install count) */
  catalogStats?: Record<string, { installs: number; lastInstalledAt: string }>;
  /** Scheduled Playbook runs (cron-style) */
  schedules?: StoredSchedule[];
  /** Drift detection baselines + history */
  driftBaselines?: StoredDriftBaseline[];
  /** Webhook subscriptions for task events */
  webhooks?: StoredWebhook[];
  /** API tokens for CI/CD integration */
  apiTokens?: StoredApiToken[];
  /** Admin overrides on top of the static catalog baseline */
  catalogOverrides?: CatalogOverride[];
}

/** 用户保存的 Playbook（支持版本历史） */
export interface StoredPlaybook {
  id: string;
  userId: string;
  name: string;
  description?: string;
  /** 当前版本号（从 1 开始递增） */
  version: number;
  /** 当前 YAML 内容 */
  yaml: string;
  /** 版本历史（最多保留 20 个版本） */
  history: Array<{
    version: number;
    yaml: string;
    savedAt: string;
    comment?: string;
  }>;
  /** 来源：catalog id、capture、user-created */
  sourceKind: "catalog" | "capture" | "user";
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Cron-style scheduled Playbook run */
export interface StoredSchedule {
  id: string;
  userId: string;
  /** Display name */
  name: string;
  /** Source: a saved playbook id, OR a catalog id; pick one */
  playbookId?: string;
  catalogId?: string;
  /** Target connections (any of) — when both are empty, fall back to all user connections */
  connectionIds: string[];
  /** Target connections matched by tags */
  tags: string[];
  /** Cron expression (5-field, UTC). Examples: "0 3 * * *" daily 03:00 UTC. */
  cron: string;
  /** Whether to actually execute or only dry-run */
  dryRun: boolean;
  /** Disabled schedules don't fire */
  enabled: boolean;
  /** When the next fire time was last computed */
  nextRunAt?: string;
  /** Last fired at (regardless of success) */
  lastRunAt?: string;
  /** Last result summary */
  lastStatus?: "succeeded" | "failed" | "partial" | "skipped";
  createdAt: string;
  updatedAt: string;
}

/** Drift baseline — snapshot of user-managed software for nightly diff */
export interface StoredDriftBaseline {
  id: string;
  userId: string;
  connectionId: string;
  /** ISO timestamp this baseline was captured */
  capturedAt: string;
  /** A compact representation: software name|source key set */
  softwareKeys: string[];
  /** Last drift report (if any) */
  lastReport?: {
    checkedAt: string;
    addedSoftware: Array<{ name: string; version: string; source: string }>;
    removedSoftware: Array<{ name: string; version: string; source: string }>;
  };
}

/** Webhook subscription — fires on task events */
export interface StoredWebhook {
  id: string;
  userId: string;
  /** Display label */
  label: string;
  /** HTTPS URL to POST event JSON to */
  url: string;
  /** Optional shared secret added as X-EnvForge-Signature: sha256=<hmac> */
  secret?: string;
  /** Event types this hook subscribes to */
  events: Array<"task.completed" | "task.failed" | "drift.detected" | "schedule.fired">;
  enabled: boolean;
  createdAt: string;
  /** Last delivery attempt */
  lastDeliveryAt?: string;
  lastDeliveryStatus?: "success" | "failed";
  lastDeliveryError?: string;
}

/** Admin override on a catalog item — adds, modifies, or hides items */
export interface CatalogOverride {
  /** baseId set when overriding/hiding a baseline item; undefined when this is a brand-new user-added item */
  baseId?: string;
  /** id for new items (matches CatalogItem.id) */
  id: string;
  /** Hide a baseline item from the market */
  hidden?: boolean;
  /** Field-level overrides applied on top of the baseline (for modify) or full item body (for new) */
  overrides?: Partial<{
    kind: "software" | "combo";
    name: string;
    nameEn: string;
    category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
    summary: string;
    summaryEn: string;
    imageTone: string;
    sensitivity: "safe" | "review" | "privileged";
    rating: number;
    installs: string;
    assets: string[];
    sourceKind: string;
    components: Array<{
      type: "software" | "system-command" | "system-config";
      label: string;
      labelEn: string;
      detail: string;
    }>;
    deployModes: Array<"system" | "docker">;
  }>;
  /** Created/updated timestamps */
  createdAt: string;
  updatedAt: string;
  /** User who made this override (admin only) */
  modifiedBy: string;
}

/** API token for CI/CD integration (separate from session tokens) */
export interface StoredApiToken {
  id: string;
  userId: string;
  /** User-friendly label (e.g. "GitHub Actions prod") */
  label: string;
  /** SHA-256 hash of the actual token; raw token is shown to user once */
  tokenHash: string;
  /** First 8 chars of the raw token, for UI display */
  tokenPrefix: string;
  createdAt: string;
  /** ISO timestamp of last use */
  lastUsedAt?: string;
  /** Optional expiry (null = never expires) */
  expiresAt?: string;
}

/** 任务历史记录 */
export interface StoredTaskHistory {
  id: string;
  userId: string;
  connectionId: string;
  /** Playbook 来源标识：catalog id 或 user profile id */
  source: string;
  sourceKind: "catalog" | "user-profile" | "captured";
  status: "running" | "succeeded" | "failed" | "cancelled";
  dryRun: boolean;
  /** 任务步骤简要日志 */
  steps: Array<{
    name: string;
    module: string;
    status: "ok" | "changed" | "failed" | "skipped" | "running";
    durationMs?: number;
    msg?: string;
  }>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export async function readRuntimeDatabase(): Promise<RuntimeDatabase> {
  const store = getStore();
  const data = await store.read();
  if (!data) {
    const database = createRuntimeDatabase();
    await store.write(database);
    return database;
  }
  return normalizeRuntimeDatabase(data);
}

export async function writeRuntimeDatabase(database: RuntimeDatabase): Promise<void> {
  await getStore().write(database);
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
    schemaVersion: "0.3.0",
    users: [],
    sessions: [],
    connections: [],
    userProfiles: [],
    tasks: [],
    playbooks: []
  };
}

function normalizeRuntimeDatabase(database: Partial<RuntimeDatabase>): RuntimeDatabase {
  return {
    schemaVersion: database.schemaVersion ?? "0.3.0",
    users: (database.users ?? []).map((u) => ({ ...u, role: u.role ?? ("user" as const) })),
    sessions: database.sessions ?? [],
    connections: (database.connections ?? []).map((c) => ({
      ...c,
      status: c.status ?? "validated",
      tags: c.tags ?? []
    })) as StoredConnection[],
    userProfiles: (database.userProfiles ?? []).map((p) => ({
      ...p,
      visibility: p.visibility ?? ("public" as const)
    })) as StoredUserProfile[],
    tasks: database.tasks ?? [],
    playbooks: database.playbooks ?? []
  };
}
