import { randomUUID } from "node:crypto";
import { getConfig } from "./config.js";
import { SafeJsonStore } from "./db-store.js";
import { getSqliteDb, initializeDatabase } from "./db-sqlite.js";

// Singleton store instance (reused across requests for cache efficiency)
let _store: SafeJsonStore<RuntimeDatabase> | null = null;

function getStore(): SafeJsonStore<RuntimeDatabase> {
  if (!_store) {
    _store = new SafeJsonStore<RuntimeDatabase>(getConfig().runtimeDatabasePath, 500);
  }
  return _store;
}

/**
 * Test-only — resets the singleton so the next read/write picks up a fresh
 * `getConfig()` (i.e. a different `FOOL_RUNTIME_DB` env value). This is the
 * **only** safe way to switch DBs mid-process under the current architecture.
 *
 * Production code never calls this.
 */
export function _resetStoreForTests(): void {
  _store = null;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  /**
   * Optional after auth-and-ecosystem spec: OAuth-only accounts have no local
   * password. P1.2 migration ensures every legacy user with passwordHash gets
   * a `provider="local"` UserIdentity row.
   */
  passwordHash?: string;
  passwordSalt?: string;
  defaultSshUser?: string;
  /** "user" = 普通用户（默认），"admin" = 系统管理员 */
  role: "user" | "admin";

  // ── Profile fields (added by auth-and-ecosystem spec, populated lazily) ──
  /** Internal handle for @ mentions and URLs. P1.2 migration generates from email local part. */
  username?: string;
  /** Display name shown in UI. Defaults to legacy `name` for old users. */
  displayName?: string;
  bio?: string;
  /** Must be HTTPS. Falls back to Gravatar by email hash when empty. */
  avatarUrl?: string;
  /** IANA timezone name, e.g. "Asia/Shanghai" */
  timezone?: string;
  /** "zh-CN" / "en-US" / "auto" */
  locale?: string;
  /** ISO timestamp; set when user verifies their email via OTP. */
  emailVerifiedAt?: string;

  // ── Security (TOTP 2FA) ──
  /** AES-256-GCM ciphertext of the TOTP base32 secret, encrypted with master key. */
  totpSecretEnc?: string;
  /** ISO timestamp; set when user successfully confirms enrolment. */
  totpEnabledAt?: string;
  /** SHA-256 hashes of unused recovery codes. Used codes are removed from the array. */
  totpRecoveryCodesHashed?: string[];

  // ── Lifecycle ──
  /** ISO timestamp; soft-delete marker. Login is rejected when set. */
  deletedAt?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Multi-provider identity association — added by auth-and-ecosystem spec.
 * One internal user can have multiple identities (local password + GitHub + Google),
 * all linked to the same `userId`.
 *
 * Uniqueness invariant: (provider, providerUserId) is globally unique.
 *   - For provider="local", providerUserId == userId (self-reference).
 *   - For OAuth providers, providerUserId is the immutable upstream id
 *     (GitHub numeric id / Google `sub`).
 */
export interface UserIdentity {
  id: string;
  userId: string;
  provider: "local" | "github" | "google";
  providerUserId: string;
  /** Snapshot of the email reported by provider at creation/last-link time. */
  providerEmail?: string;
  /** Snapshot of provider-supplied profile fields. Refreshed on each successful login. */
  providerData?: {
    avatarUrl?: string;
    displayName?: string;
    /** GitHub username / Google handle. */
    login?: string;
  };
  createdAt: string;
  /** ISO timestamp of most recent successful login through this identity. */
  lastUsedAt?: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  /**
   * 2FA-pending session (auth-and-ecosystem spec P1.10).
   *
   * The user passed the first auth factor (password OR OAuth) but their
   * account has TOTP enabled. They MUST submit a valid TOTP/recovery code
   * via POST /api/auth/login/2fa within 5 minutes to upgrade this session
   * to a regular one. Routes other than the upgrade endpoint reject this
   * session as if unauthenticated.
   */
  twofaPending?: boolean;
  /**
   * Enrollment-required session (auth-and-ecosystem spec P1.10).
   *
   * The user passed first-factor auth and is an admin who has not yet
   * configured 2FA. Per D-2.1 admin MUST enable 2FA before doing anything
   * else. This session can ONLY call /api/me/2fa/{status,enroll,confirm};
   * everything else is rejected. After successful confirm, the session is
   * rotated to a regular session and the response carries the new token.
   * 15-minute TTL — generous so the user can navigate to the enroll page,
   * scan the QR with their authenticator app without rushing.
   */
  enrollmentRequired?: boolean;
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
  /**
   * Multi-provider identity associations (added by auth-and-ecosystem spec).
   * One user can have multiple identities (local + github + google).
   * Empty for databases that haven't run migration 0004 yet.
   */
  identities?: UserIdentity[];
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
  /**
   * Email delivery log (added by auth-and-ecosystem spec P1.4).
   * Auto-pruned to most recent 200 entries on each write to bound storage.
   * Used for: rate-limit checks (per-user per-hour) + diagnostics.
   */
  emailLog?: EmailDeliveryLog[];
  /**
   * Pending email verification codes (added by auth-and-ecosystem spec P1.5).
   * Auto-pruned: expired entries are dropped on read by helpers in auth/email-codes.ts.
   */
  emailVerifCodes?: EmailVerificationCode[];
  /**
   * Pending registrations awaiting email verification (added by auth-and-ecosystem
   * spec P1.5). Same lifecycle as emailVerifCodes — purged on expiry.
   */
  pendingRegistrations?: PendingRegistration[];
  /**
   * Pending TOTP enrolments awaiting `confirm` (added by auth-and-ecosystem
   * spec P1.9). The plaintext base32 secret lives here for 10 minutes; on
   * confirm it's encrypted and moved onto the StoredUser. On expiry / new
   * enroll for the same user, the row is replaced. We persist (instead of
   * keeping in-memory) so the user can refresh the enroll page mid-flow
   * and still have the same QR.
   */
  pendingTotpEnrollments?: PendingTotpEnrollment[];
  /**
   * Pending email-change requests (added by auth-and-ecosystem spec P1.11).
   * Keyed by `id`; carries the new email + verification code linkage. On
   * `confirm` success the user.email is rewritten and the row deleted.
   */
  pendingEmailChanges?: PendingEmailChange[];
  /**
   * Per-user notification preferences (added by auth-and-ecosystem spec P1.11).
   * Default values are applied lazily on first read for users without a row;
   * P3.1 will write a migration to backfill all users at once.
   */
  notificationPrefs?: NotificationPreference[];
  /**
   * Pending password reset requests (added by auth-and-ecosystem spec P1.12).
   * Each row tracks one outstanding "forgot password" link. Token is HMAC-signed
   * server-side; row stores `usedAt` to enforce single-use atomically.
   */
  passwordResetRequests?: PasswordResetRequest[];
}

/** Each email send attempt is logged here (success or failure). */
export interface EmailDeliveryLog {
  id: string;
  /** Empty for emails sent during pre-registration (verification code to a not-yet-user). */
  userId?: string;
  /** Recipient address. Used for rate-limit on registration flow when userId unknown. */
  email: string;
  /** "verify-register" / "verify-email-change" / "password-reset" / "publish-approved" / etc. */
  type: string;
  sentAt: string;
  success: boolean;
  /** Truncated to 500 chars to bound storage. */
  errorMessage?: string;
}

/**
 * Email verification code (added by auth-and-ecosystem spec P1.5).
 *
 * Used for: registration step-1 → step-2, email-change confirmation, etc.
 * The code is stored as a SHA-256 hash; the plain digits exist only in the
 * outgoing email body and on the user's screen.
 */
export interface EmailVerificationCode {
  id: string;
  /** Empty when the user does not yet exist (registration flow). */
  userId?: string;
  email: string;
  /** SHA-256 hex of the raw 6-digit code. */
  codeHash: string;
  /** Why this code was issued — gates `verify` to the matching purpose. */
  purpose: "register" | "email-change" | "password-reset";
  /** Number of failed verify attempts. After 5, the code is invalidated. */
  attempts: number;
  expiresAt: string;
  /** Set when the code is consumed; prevents replay. */
  usedAt?: string;
}

/**
 * Pending registration (added by auth-and-ecosystem spec P1.5).
 *
 * Holds the not-yet-confirmed user data between step-1 (submit) and step-2
 * (verify code). On step-2 success, contents are written to `users` + a
 * session token issued; on expiry or 5 failed attempts, the entry is purged.
 *
 * The `pendingId` returned to the client is opaque — the client must echo it
 * along with the verification code to complete registration. This isolates
 * the verification email from the eventual session token.
 */
export interface PendingRegistration {
  id: string;
  email: string;
  /** Pre-hashed display name + handle */
  name: string;
  passwordHash: string;
  passwordSalt: string;
  /** Linked verification code id (1:1 — the row in `emailVerifCodes`). */
  codeId: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Pending TOTP enrolment (added by auth-and-ecosystem spec P1.9).
 *
 * Created by `enroll(userId)` — holds the plaintext base32 secret + the
 * otpauth:// URI + the QR data URL until the user confirms with a code.
 * Once confirmed, the secret is AES-256-GCM encrypted with the master key
 * and moved onto `StoredUser.totpSecretEnc`; this row is deleted.
 *
 * Stored on the DB instead of in-memory so the user can refresh the page,
 * navigate away and come back, etc., and still see the same QR. Limit one
 * pending row per user — re-enrolling clears the old.
 */
export interface PendingTotpEnrollment {
  userId: string;
  /** Plaintext base32 secret (lives here only until confirm). */
  secret: string;
  /** otpauth:// URI handed to the authenticator app. */
  otpauthUri: string;
  /** PNG QR code as data URL (data:image/png;base64,...). */
  qrDataUrl: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Pending email-change request (added by auth-and-ecosystem spec P1.11).
 *
 * Created by `requestEmailChange(userId, newEmail)`. Two-step like
 * registration:
 *   1. User submits new email → row created + verification code sent to NEW
 *      address (so attacker who steals session can't silently move account
 *      to their own email)
 *   2. User submits code via `confirmEmailChange(id, code)` → user.email
 *      updated, emailVerifiedAt refreshed, row deleted
 *
 * Limit: one in-flight per user. New `request` replaces any prior pending row.
 */
export interface PendingEmailChange {
  id: string;
  userId: string;
  oldEmail: string;
  newEmail: string;
  /** Linked verification code id (1:1 with row in `emailVerifCodes`). */
  codeId: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Per-user notification preferences (added by auth-and-ecosystem spec P1.11).
 *
 * Transactional emails (verification codes, password resets, admin-forced
 * 2FA disable) are NOT gated by these flags — those are always sent. Only
 * "soft" notifications (mentions, comment replies, suggestion status,
 * publish status) check this struct.
 */
export interface NotificationPreference {
  userId: string;
  /** @ mentions in comments. Default: true. */
  emailMentions: boolean;
  /** Reply to my comment. Default: false (can be noisy on busy items). */
  emailComments: boolean;
  /** Status change on a suggestion I submitted. Default: true. */
  emailSuggestionStatus: boolean;
  /** Result of a publish request I submitted. Default: true. */
  emailPublishStatus: boolean;
  /** When this row was last persisted. */
  updatedAt: string;
}

/**
 * Pending password reset request (added by auth-and-ecosystem spec P1.12).
 *
 * One row per outstanding forgot-password flow. The reset token sent to the
 * user is HMAC-signed; this row holds the metadata + single-use marker.
 *
 * Lifecycle:
 *   - `requestPasswordReset` creates a row (replacing any prior one for the
 *     same userId), sets expiresAt = now + 20 min.
 *   - `confirmPasswordReset` verifies token + sets usedAt on success.
 *   - `cleanupExpiredResetRequests` drops expired (no usedAt) immediately;
 *     keeps used rows for 24h for diagnostics.
 *
 * Security: the token is NEVER stored — only the row id. Compromise of
 * runtime-db.json does not let an attacker reuse old reset tokens (they'd
 * also need the master key to forge a fresh HMAC).
 */
export interface PasswordResetRequest {
  id: string;
  userId: string;
  /** Email at the time of issue (for diagnostics; user.email may have changed). */
  email: string;
  expiresAt: string;
  createdAt: string;
  /** Set when the reset is consumed; prevents replay. */
  usedAt?: string;
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
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
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

class Mutex {
  private queue: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.queue;
    this.queue = current.then(() => next);
    await current;
    return release;
  }
}

const dbMutex = new Mutex();

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

export async function updateRuntimeDatabase<T>(mutate: (database: RuntimeDatabase) => T | Promise<T>): Promise<T> {
  const release = await dbMutex.acquire();
  try {
    const database = await readRuntimeDatabase();
    const result = await mutate(database);
    await writeRuntimeDatabase(database);
    return result;
  } finally {
    release();
  }
}


export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function createRuntimeDatabase(): RuntimeDatabase {
  return {
    schemaVersion: "0.3.0",
    users: [],
    identities: [],
    sessions: [],
    connections: [],
    userProfiles: [],
    tasks: [],
    playbooks: []
  };
}

function normalizeRuntimeDatabase(database: Partial<RuntimeDatabase>): RuntimeDatabase {
  // Spread the input first so OPTIONAL fields outside the explicit projection
  // (apiTokens, catalogOverrides, webhooks, schedules, emailLog, emailVerifCodes,
  // pendingRegistrations, etc.) survive the round-trip. Then overwrite the
  // structurally-required fields with normalized variants.
  //
  // This was a long-standing bug: the previous version returned an object
  // built field-by-field, which silently dropped any field not in the
  // whitelist. Every write erased these fields. We hadn't noticed because
  // most optional features were rarely exercised in production.
  return {
    ...database,
    schemaVersion: database.schemaVersion ?? "0.3.0",
    users: (database.users ?? []).map((u) => ({ ...u, role: u.role ?? ("user" as const) })),
    /**
     * `identities` may be missing on databases that predate the auth-and-ecosystem
     * spec (schemaVersion < 0.4.0). The P1.2 migration backfills a `provider="local"`
     * row for every legacy user with a passwordHash. Until that runs, return an
     * empty array so callers can rely on Array methods.
     */
    identities: database.identities ?? [],
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

// ── HTML Entity Encoder Helper ──
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Comments, Likes, and Reports Relational Data Layer ──

export async function addComment(
  catalogId: string,
  userId: string,
  content: string
): Promise<any> {
  const db = await initializeDatabase();
  
  // Fetch user profile from memory/store
  const userStore = await readRuntimeDatabase();
  const user = userStore.users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");

  const commentId = createId("comment");
  const now = new Date().toISOString();
  const escapedContent = escapeHtml(content.trim());

  await db.exec("BEGIN IMMEDIATE;");
  try {
    // 1. Insert comment
    await db.run(
      `INSERT INTO catalog_comments (id, catalog_id, user_id, username, display_name, avatar_url, content, visibility, is_deleted, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'public', 0, 'active', ?)`,
      commentId,
      catalogId,
      userId,
      user.username ?? "",
      user.displayName || user.name || "",
      user.avatarUrl || null,
      escapedContent,
      now
    );

    // 2. Insert into FTS Sync Queue
    const syncId = createId("ftssync");
    await db.run(
      `INSERT INTO fts_sync_queue (id, comment_id, status, attempts, next_retry_at, created_at)
       VALUES (?, ?, 'pending', 0, ?, ?)`,
      syncId,
      commentId,
      now,
      now
    );

    await db.exec("COMMIT;");
  } catch (err) {
    await db.exec("ROLLBACK;");
    throw err;
  }

  return {
    id: commentId,
    catalogId,
    userId,
    username: user.username || "",
    displayName: user.displayName || user.name || "",
    avatarUrl: user.avatarUrl || null,
    content: escapedContent,
    visibility: "public",
    createdAt: now
  };
}

export async function getComments(
  catalogId: string,
  requestingUserId?: string,
  limit = 20,
  cursorCreatedAt?: string,
  cursorId?: string
): Promise<any> {
  const db = await initializeDatabase();
  
  let query = `
    SELECT c.*,
      (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) as likesCount,
      (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) as likedByMe
    FROM catalog_comments c
    WHERE c.catalog_id = ? AND c.visibility = 'public' AND c.is_deleted = 0
  `;
  const params: any[] = [requestingUserId || null, catalogId];

  if (cursorCreatedAt && cursorId) {
    query += ` AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?)) `;
    params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
  }

  query += ` ORDER BY c.created_at DESC, c.id DESC LIMIT ? `;
  params.push(limit);

  const comments = await db.all(query, ...params);

  // Normalize returned fields (camelCase)
  const formattedComments = comments.map((c) => ({
    id: c.id,
    catalogId: c.catalog_id,
    userId: c.user_id,
    username: c.username,
    displayName: c.display_name,
    avatarUrl: c.avatar_url || null,
    content: c.content,
    visibility: c.visibility,
    createdAt: c.created_at,
    likesCount: c.likesCount,
    likedByMe: c.likedByMe > 0
  }));

  const nextCursor =
    comments.length === limit
      ? {
          createdAt: comments[comments.length - 1].created_at,
          id: comments[comments.length - 1].id
        }
      : undefined;

  return {
    comments: formattedComments,
    nextCursor
  };
}

export async function toggleCommentLike(
  commentId: string,
  userId: string
): Promise<{ liked: boolean; likesCount: number }> {
  const db = await initializeDatabase();
  
  const comment = await db.get("SELECT 1 FROM catalog_comments WHERE id = ? AND is_deleted = 0", commentId);
  if (!comment) throw new Error("Comment not found or deleted");

  await db.exec("BEGIN IMMEDIATE;");
  try {
    const existing = await db.get("SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?", userId, commentId);
    let liked = false;

    if (existing) {
      await db.run("DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?", userId, commentId);
    } else {
      await db.run(
        "INSERT INTO comment_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)",
        userId,
        commentId,
        new Date().toISOString()
      );
      liked = true;
    }

    await db.exec("COMMIT;");
    const row = await db.get("SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?", commentId);
    
    return { liked, likesCount: row?.count || 0 };
  } catch (err) {
    await db.exec("ROLLBACK;");
    throw err;
  }
}

export async function reportComment(
  commentId: string,
  userId: string,
  reason: string
): Promise<void> {
  const db = await initializeDatabase();

  const comment = await db.get("SELECT 1 FROM catalog_comments WHERE id = ? AND is_deleted = 0", commentId);
  if (!comment) throw new Error("Comment not found or deleted");

  await db.exec("BEGIN IMMEDIATE;");
  try {
    const now = new Date().toISOString();
    const reportId = createId("report");
    
    await db.run(
      `INSERT OR IGNORE INTO comment_reports (id, comment_id, user_id, reason, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      reportId,
      commentId,
      userId,
      reason,
      now
    );

    // Dynamic escalation check
    const reportsCountRow = await db.get(
      "SELECT COUNT(*) as count FROM comment_reports WHERE comment_id = ? AND status = 'pending'",
      commentId
    );
    const reportsCount = reportsCountRow?.count || 0;

    if (reportsCount > 5) {
      await db.run(
        "UPDATE catalog_comments SET visibility = 'hidden_pending_review', status = 'flagged' WHERE id = ?",
        commentId
      );
    }

    await db.exec("COMMIT;");
  } catch (err) {
    await db.exec("ROLLBACK;");
    throw err;
  }
}

export async function getAdminReports(limit = 20, offset = 0): Promise<any[]> {
  const db = await initializeDatabase();
  
  const reports = await db.all(
    `SELECT r.*, c.content as commentContent, c.username as commentUsername, c.display_name as commentDisplayName
     FROM comment_reports r
     JOIN catalog_comments c ON r.comment_id = c.id
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    limit,
    offset
  );

  return reports.map((r) => ({
    id: r.id,
    commentId: r.comment_id,
    userId: r.user_id,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    commentContent: r.commentContent,
    commentUsername: r.commentUsername,
    commentDisplayName: r.commentDisplayName
  }));
}

export async function resolveReport(
  reportId: string,
  action: "keep" | "delete",
  adminId: string
): Promise<void> {
  const db = await initializeDatabase();

  await db.exec("BEGIN IMMEDIATE;");
  try {
    const report = await db.get("SELECT * FROM comment_reports WHERE id = ?", reportId);
    if (!report) throw new Error("Report not found");

    const resolvedStatus = action === "delete" ? "resolved_deleted" : "resolved_keep";
    await db.run("UPDATE comment_reports SET status = ? WHERE id = ?", resolvedStatus, reportId);

    if (action === "delete") {
      await db.run(
        "UPDATE catalog_comments SET visibility = 'deleted', is_deleted = 1, status = 'hidden' WHERE id = ?",
        report.comment_id
      );
      // Clean FTS record
      await db.run("DELETE FROM catalog_comments_fts WHERE comment_id = ?", report.comment_id);
    } else {
      await db.run(
        "UPDATE catalog_comments SET visibility = 'public', status = 'active' WHERE id = ?",
        report.comment_id
      );
      // Queue FTS update to restore it
      const syncId = createId("ftssync");
      const now = new Date().toISOString();
      await db.run(
        `INSERT OR IGNORE INTO fts_sync_queue (id, comment_id, status, attempts, next_retry_at, created_at)
         VALUES (?, ?, 'pending', 0, ?, ?)`,
        syncId,
        report.comment_id,
        now,
        now
      );
    }

    await db.exec("COMMIT;");
  } catch (err) {
    await db.exec("ROLLBACK;");
    throw err;
  }
}

// ── Asynchronous FTS Queue Worker State-Machine ──

export async function syncCommentsFts(): Promise<void> {
  const db = await initializeDatabase();
  const now = new Date().toISOString();

  // Find pending or retriable sync tasks
  const tasks = await db.all(
    `SELECT * FROM fts_sync_queue
     WHERE status IN ('pending', 'retry') AND next_retry_at <= ?
     LIMIT 50`,
    now
  );

  for (const t of tasks) {
    await db.exec("BEGIN IMMEDIATE;");
    try {
      const comment = await db.get("SELECT * FROM catalog_comments WHERE id = ?", t.comment_id);
      
      if (!comment || comment.is_deleted === 1 || comment.visibility !== "public") {
        // Comment is deleted or hidden, remove from FTS search index
        await db.run("DELETE FROM catalog_comments_fts WHERE comment_id = ?", t.comment_id);
      } else {
        // Active public comment, index or update it in FTS
        await db.run(
          "INSERT OR REPLACE INTO catalog_comments_fts (comment_id, content) VALUES (?, ?)",
          t.comment_id,
          comment.content
        );
      }

      // Mark as successfully synced
      await db.run("UPDATE fts_sync_queue SET status = 'synced' WHERE id = ?", t.id);
      await db.exec("COMMIT;");
    } catch (err) {
      await db.exec("ROLLBACK;");
      
      const attempts = t.attempts + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      
      if (attempts >= 5) {
        // Dead-Letter Queue (DLQ) threshold reached
        await db.run(
          "UPDATE fts_sync_queue SET status = 'dead_letter', attempts = ?, last_error = ? WHERE id = ?",
          attempts,
          lastError,
          t.id
        );
      } else {
        // Retry with exponential backoff: 5s, 25s, 125s...
        const backoffSeconds = Math.pow(5, attempts);
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();
        await db.run(
          "UPDATE fts_sync_queue SET status = 'retry', attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?",
          attempts,
          nextRetry,
          lastError,
          t.id
        );
      }
    }
  }
}

// ── Subsystem Operations (Stage 3 Queue, Inbox, and Audit Logs) ─────────────────

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  payload: string;
  status: 'pending' | 'retry' | 'sent' | 'dead_letter';
  attempts: number;
  nextRetryAt: string;
  lastError: string | null;
  createdAt: string;
}

export interface NotificationQueueProvider {
  enqueue(userId: string, type: string, payload: Record<string, any>): Promise<string>;
  processNextBatch(batchSize: number, senderFn: (item: NotificationItem) => Promise<void>): Promise<void>;
}

export class SQLiteQueueProvider implements NotificationQueueProvider {
  async enqueue(userId: string, type: string, payload: Record<string, any>): Promise<string> {
    const db = await initializeDatabase();
    const id = createId("notif");
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO notification_queue (id, user_id, type, payload, status, attempts, next_retry_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
      id,
      userId,
      type,
      JSON.stringify(payload),
      now,
      now
    );
    return id;
  }

  async processNextBatch(batchSize = 20, senderFn: (item: NotificationItem) => Promise<void>): Promise<void> {
    const db = await initializeDatabase();
    const now = new Date().toISOString();

    const rows = await db.all(
      `SELECT * FROM notification_queue
       WHERE status IN ('pending', 'retry') AND next_retry_at <= ?
       LIMIT ?`,
      now,
      batchSize
    );

    for (const r of rows) {
      const item: NotificationItem = {
        id: r.id,
        userId: r.user_id,
        type: r.type,
        payload: r.payload,
        status: r.status as any,
        attempts: r.attempts,
        nextRetryAt: r.next_retry_at,
        lastError: r.last_error || null,
        createdAt: r.created_at
      };

      await db.exec("BEGIN IMMEDIATE;");
      try {
        await senderFn(item);

        await db.run(
          "UPDATE notification_queue SET status = 'sent', next_retry_at = ? WHERE id = ?",
          new Date().toISOString(),
          item.id
        );
        await db.exec("COMMIT;");
      } catch (err) {
        await db.exec("ROLLBACK;");

        const attempts = item.attempts + 1;
        const lastError = err instanceof Error ? err.message : String(err);

        if (attempts >= 5) {
          await db.run(
            "UPDATE notification_queue SET status = 'dead_letter', attempts = ?, last_error = ? WHERE id = ?",
            attempts,
            lastError,
            item.id
          );
        } else {
          const backoffSeconds = Math.pow(5, attempts);
          const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();
          await db.run(
            "UPDATE notification_queue SET status = 'retry', attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?",
            attempts,
            nextRetry,
            lastError,
            item.id
          );
        }
      }
    }
  }
}

export interface InboxMessage {
  id: string;
  userId: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export async function addInboxMessage(
  userId: string,
  title: string,
  content: string
): Promise<InboxMessage> {
  const db = await initializeDatabase();
  const id = createId("msg");
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO inbox_messages (id, user_id, title, content, is_read, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    id,
    userId,
    title,
    content,
    now
  );
  return { id, userId, title, content, isRead: false, createdAt: now };
}

export async function getInboxMessages(
  userId: string,
  limit = 20,
  cursorCreatedAt?: string,
  cursorId?: string
): Promise<{ messages: InboxMessage[]; nextCursor?: { createdAt: string; id: string } }> {
  const db = await initializeDatabase();
  let query = `
    SELECT * FROM inbox_messages
    WHERE user_id = ?
  `;
  const params: any[] = [userId];

  if (cursorCreatedAt && cursorId) {
    query += ` AND (created_at < ? OR (created_at = ? AND id < ?)) `;
    params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
  }

  query += ` ORDER BY created_at DESC, id DESC LIMIT ? `;
  params.push(limit);

  const rows = await db.all(query, ...params);
  const messages = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    content: r.content,
    isRead: r.is_read > 0,
    createdAt: r.created_at
  }));

  const nextCursor =
    rows.length === limit
      ? {
          createdAt: rows[rows.length - 1].created_at,
          id: rows[rows.length - 1].id
        }
      : undefined;

  return { messages, nextCursor };
}

export async function markInboxMessageAsRead(id: string, userId: string): Promise<void> {
  const db = await initializeDatabase();
  await db.run(
    "UPDATE inbox_messages SET is_read = 1 WHERE id = ? AND user_id = ?",
    id,
    userId
  );
}

export async function deleteInboxMessage(id: string, userId: string): Promise<void> {
  const db = await initializeDatabase();
  await db.run(
    "DELETE FROM inbox_messages WHERE id = ? AND user_id = ?",
    id,
    userId
  );
}

export async function writeAdminAuditLog(
  adminId: string,
  action: string,
  targetId: string,
  oldValue: string | null,
  newValue: string | null,
  feedback: string | null
): Promise<void> {
  const db = await initializeDatabase();
  const id = createId("audit");
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_id, old_value, new_value, feedback, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    adminId,
    action,
    targetId,
    oldValue,
    newValue,
    feedback,
    now
  );
}

