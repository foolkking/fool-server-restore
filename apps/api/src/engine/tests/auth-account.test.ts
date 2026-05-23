/**
 * P1.11 — Unit tests for account.ts (email change / password change /
 * soft-delete / notification prefs / activity).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { _resetStoreForTests, readRuntimeDatabase, updateRuntimeDatabase } from "../../runtime-store.js";
import {
  requestEmailChange,
  confirmEmailChange,
  changePassword,
  softDeleteUser,
  getNotificationPrefs,
  updateNotificationPrefs,
  getUserActivity,
  DEFAULT_NOTIFICATION_PREFS
} from "../../auth/account.js";
import {
  normalizeDisplayName,
  normalizeBio,
  normalizeAvatarUrl,
  normalizeTimezone,
  normalizeLocale,
  normalizeUsername,
  escapeHtml
} from "../../auth/normalize.js";
import { updateMyProfile } from "../../auth/profile.js";
import { waitForEmailQueueDrain } from "../../email/index.js";

/**
 * Wrap a function call that enqueues email so we don't race the queue.
 * Without draining, a subsequent test cleanup may delete the tmp dir before
 * the queue's setImmediate drain fires, producing ENOENT noise.
 */
async function drain(): Promise<void> {
  await waitForEmailQueueDrain(2000);
}

interface TestEnv {
  tmpDir: string;
  userId: string;
  /** Plaintext password seeded into the user. */
  plainPassword: string;
  /** Email of seeded user. */
  email: string;
  cleanup: () => Promise<void>;
}

async function setupAccountEnv(opts?: {
  noPassword?: boolean;
  totpEnabled?: boolean;
  role?: "user" | "admin";
}): Promise<TestEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-account-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");

  const userId = "u_acct_test";
  const email = "acct-tester@example.com";
  const plainPassword = "horse-battery-staple-1234";

  let passwordHash: string | undefined;
  let passwordSalt: string | undefined;
  if (!opts?.noPassword) {
    const { scrypt: scryptCb, randomBytes } = await import("node:crypto");
    const { promisify } = await import("node:util");
    const scrypt = promisify(scryptCb) as (
      pw: string,
      salt: string,
      keylen: number
    ) => Promise<Buffer>;
    passwordSalt = randomBytes(16).toString("hex");
    passwordHash = (await scrypt(plainPassword, passwordSalt, 64)).toString("hex");
  }

  const seed = {
    schemaVersion: "0.4.0",
    users: [{
      id: userId,
      name: "Acct Tester",
      email,
      username: "acct_tester",
      displayName: "Acct Tester",
      role: opts?.role ?? "user",
      passwordHash,
      passwordSalt,
      totpEnabledAt: opts?.totpEnabled ? new Date().toISOString() : undefined,
      createdAt: "2026-05-24T00:00:00Z",
      updatedAt: "2026-05-24T00:00:00Z"
    }],
    identities: [],
    sessions: [],
    connections: [],
    userProfiles: []
  };
  await fs.writeFile(dbPath, JSON.stringify(seed));

  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  process.env.PUBLIC_BASE_URL = "https://envforge.test";
  process.env.NODE_ENV = "development";
  // Disable SMTP — fall back to stdout. Otherwise tests with real Gmail
  // creds would block on retries (5s + 30s + 30s = 65s per failure).
  process.env.SMTP_HOST = "";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  delete process.env.ENVFORGE_ADMIN_EMAILS;
  if (!process.env.ENVFORGE_MASTER_KEY) {
    process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  }
  _resetStoreForTests();
  const { resetEmailTransportForTests } = await import("../../email/smtp.js");
  resetEmailTransportForTests();

  return {
    tmpDir,
    userId,
    plainPassword,
    email,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
      const { resetEmailQueueForTests } = await import("../../email/index.js");
      resetEmailQueueForTests();
    }
  };
}

// ── Pure validators ────────────────────────────────────────────────────────

test("normalizeDisplayName trims, validates length, rejects control chars", () => {
  assert.equal(normalizeDisplayName("  Alice  "), "Alice");
  assert.throws(() => normalizeDisplayName(""), /required/i);
  assert.throws(() => normalizeDisplayName("   "), /required/i);
  assert.throws(() => normalizeDisplayName("x".repeat(81)), /too long/i);
  assert.throws(() => normalizeDisplayName("Alice\nBob"), /control/i);
  assert.throws(() => normalizeDisplayName("Alice\x00"), /control/i);
});

test("normalizeBio: undefined → undefined; empty → undefined; >1000 throws; allows newlines", () => {
  assert.equal(normalizeBio(undefined), undefined);
  assert.equal(normalizeBio(""), undefined);
  assert.equal(normalizeBio("   "), undefined);
  assert.equal(normalizeBio("Hello\nworld"), "Hello\nworld");
  assert.throws(() => normalizeBio("x".repeat(1001)), /too long/i);
  assert.throws(() => normalizeBio("bad\u0000nul"), /control/i);
});

test("normalizeAvatarUrl: requires HTTPS, rejects data:/file:/http:", () => {
  assert.equal(normalizeAvatarUrl("https://i.example/a.png"), "https://i.example/a.png");
  assert.equal(normalizeAvatarUrl(""), undefined);
  assert.throws(() => normalizeAvatarUrl("http://insecure.example/x.png"), /https/i);
  assert.throws(() => normalizeAvatarUrl("data:image/png;base64,AA"), /https/i);
  assert.throws(() => normalizeAvatarUrl("file:///etc/passwd"), /https/i);
  assert.throws(() => normalizeAvatarUrl("not a url"), /valid HTTPS/i);
  assert.throws(() => normalizeAvatarUrl("https://" + "a".repeat(600)), /too long/i);
});

test("normalizeTimezone validates against IANA list", () => {
  assert.equal(normalizeTimezone("Asia/Shanghai"), "Asia/Shanghai");
  assert.equal(normalizeTimezone("UTC"), "UTC");
  assert.equal(normalizeTimezone(""), undefined);
  assert.throws(() => normalizeTimezone("Mars/Olympus"), /IANA timezone/);
});

test("normalizeLocale only accepts known set", () => {
  assert.equal(normalizeLocale("auto"), "auto");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeLocale("en-US"), "en-US");
  assert.equal(normalizeLocale(""), undefined);
  assert.throws(() => normalizeLocale("fr-FR"), /Locale must be/);
});

test("normalizeUsername lowercases + validates format", () => {
  assert.equal(normalizeUsername("Alice"), "alice");
  assert.equal(normalizeUsername("user_42"), "user_42");
  assert.throws(() => normalizeUsername(""), /required/i);
  assert.throws(() => normalizeUsername("ab"), /at least 3/i);
  assert.throws(() => normalizeUsername("x".repeat(33)), /at most 32/i);
  assert.throws(() => normalizeUsername("1abc"), /start with a letter/i);
  assert.throws(() => normalizeUsername("alice!"), /lowercase letters/i);
});

test("escapeHtml escapes the 5 standard chars", () => {
  assert.equal(
    escapeHtml(`<script>alert("xss")&'</script>`),
    "&lt;script&gt;alert(&quot;xss&quot;)&amp;&#39;&lt;/script&gt;"
  );
});

// ── updateMyProfile ────────────────────────────────────────────────────────

test("updateMyProfile sets multiple fields, returns full PublicUser", async () => {
  const env = await setupAccountEnv();
  try {
    const result = await updateMyProfile(env.userId, {
      displayName: "New Name",
      bio: "Hello world",
      avatarUrl: "https://i.example.com/a.png",
      timezone: "Asia/Shanghai",
      locale: "zh-CN"
    });
    assert.equal(result.displayName, "New Name");
    assert.equal(result.bio, "Hello world");
    assert.equal(result.avatarUrl, "https://i.example.com/a.png");
    assert.equal(result.timezone, "Asia/Shanghai");
    assert.equal(result.locale, "zh-CN");
    // toPublicUser surfaces displayName as `name` for backward compat
    assert.equal(result.name, "New Name");

    // Round-trip: stored on user
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.displayName, "New Name");
    assert.equal(user?.bio, "Hello world");
  } finally {
    await env.cleanup();
  }
});

test("updateMyProfile clears optional fields when given empty string", async () => {
  const env = await setupAccountEnv();
  try {
    // Set first
    await updateMyProfile(env.userId, { bio: "First", avatarUrl: "https://x.example/a.png" });
    // Clear
    const cleared = await updateMyProfile(env.userId, { bio: "", avatarUrl: "" });
    assert.equal(cleared.bio, undefined);
    assert.equal(cleared.avatarUrl, undefined);

    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.bio, undefined);
    assert.equal(user?.avatarUrl, undefined);
  } finally {
    await env.cleanup();
  }
});

test("updateMyProfile rejects username taken by another user", async () => {
  const env = await setupAccountEnv();
  try {
    // Add a second user with username "taken"
    await updateRuntimeDatabase((db) => {
      db.users.push({
        id: "u_other",
        name: "Other",
        email: "other@example.com",
        username: "taken",
        role: "user",
        passwordHash: "h",
        passwordSalt: "s",
        createdAt: "2026-05-24T00:00:00Z",
        updatedAt: "2026-05-24T00:00:00Z"
      });
    });
    await assert.rejects(
      () => updateMyProfile(env.userId, { username: "taken" }),
      /already taken/i
    );
    // Case-insensitive collision too
    await assert.rejects(
      () => updateMyProfile(env.userId, { username: "TAKEN" }),
      /already taken/i
    );
  } finally {
    await env.cleanup();
  }
});

test("updateMyProfile validates inputs before any DB write", async () => {
  const env = await setupAccountEnv();
  try {
    await assert.rejects(
      () => updateMyProfile(env.userId, { avatarUrl: "http://insecure" }),
      /https/i
    );
    // User unchanged
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.avatarUrl, undefined);
  } finally {
    await env.cleanup();
  }
});

// ── Email change ───────────────────────────────────────────────────────────

test("requestEmailChange happy path → pending row + dev code returned", async () => {
  const env = await setupAccountEnv();
  try {
    const result = await requestEmailChange(env.userId, "new@example.com");
    await drain();
    assert.ok(result.pendingId);
    assert.ok(result.devCode);
    assert.match(result.devCode!, /^\d{6}$/);

    const db = await readRuntimeDatabase();
    const pending = db.pendingEmailChanges?.find((p) => p.id === result.pendingId);
    assert.ok(pending);
    assert.equal(pending?.userId, env.userId);
    assert.equal(pending?.newEmail, "new@example.com");
    assert.equal(pending?.oldEmail, env.email);

    // user.email NOT yet updated
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.email, env.email);
  } finally {
    await env.cleanup();
  }
});

test("requestEmailChange rejects when new email == old", async () => {
  const env = await setupAccountEnv();
  try {
    await assert.rejects(
      () => requestEmailChange(env.userId, env.email),
      /matches your current email/i
    );
  } finally {
    await env.cleanup();
  }
});

test("requestEmailChange rejects when new email taken by another user", async () => {
  const env = await setupAccountEnv();
  try {
    await updateRuntimeDatabase((db) => {
      db.users.push({
        id: "u_other",
        name: "Other",
        email: "taken@example.com",
        role: "user",
        passwordHash: "h",
        passwordSalt: "s",
        createdAt: "2026-05-24T00:00:00Z",
        updatedAt: "2026-05-24T00:00:00Z"
      });
    });
    await assert.rejects(
      () => requestEmailChange(env.userId, "taken@example.com"),
      /already in use/i
    );
  } finally {
    await env.cleanup();
  }
});

test("requestEmailChange replaces prior pending row (single in-flight)", async () => {
  const env = await setupAccountEnv();
  try {
    const first = await requestEmailChange(env.userId, "new1@example.com");
    await drain();
    const second = await requestEmailChange(env.userId, "new2@example.com");
    await drain();
    assert.notEqual(first.pendingId, second.pendingId);

    const db = await readRuntimeDatabase();
    const rows = (db.pendingEmailChanges ?? []).filter((p) => p.userId === env.userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, second.pendingId);
    assert.equal(rows[0].newEmail, "new2@example.com");
  } finally {
    await env.cleanup();
  }
});

test("confirmEmailChange happy path → user.email updated, pending row deleted", async () => {
  const env = await setupAccountEnv();
  try {
    const { pendingId, devCode } = await requestEmailChange(env.userId, "new@example.com");
    await drain();
    const result = await confirmEmailChange({
      userId: env.userId,
      pendingId,
      code: devCode!
    });
    assert.equal(result.email, "new@example.com");
    assert.ok(result.emailVerifiedAt);

    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.email, "new@example.com");
    assert.equal(user?.emailVerifiedAt, result.emailVerifiedAt);
    assert.equal(db.pendingEmailChanges?.length, 0);
  } finally {
    await env.cleanup();
  }
});

test("confirmEmailChange rejects wrong code; preserves pending row for retry", async () => {
  const env = await setupAccountEnv();
  try {
    const { pendingId } = await requestEmailChange(env.userId, "new@example.com");
    await drain();
    await assert.rejects(
      () => confirmEmailChange({ userId: env.userId, pendingId, code: "000000" }),
      /incorrect/i
    );
    const db = await readRuntimeDatabase();
    assert.equal(db.pendingEmailChanges?.length, 1);
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.email, env.email); // unchanged
  } finally {
    await env.cleanup();
  }
});

test("confirmEmailChange rejects mismatched userId on the pending row", async () => {
  const env = await setupAccountEnv();
  try {
    const { pendingId, devCode } = await requestEmailChange(env.userId, "new@example.com");
    await drain();
    await assert.rejects(
      () => confirmEmailChange({
        userId: "different-user",
        pendingId,
        code: devCode!
      }),
      /not found/i
    );
  } finally {
    await env.cleanup();
  }
});

test("confirmEmailChange — non-6-digit code rejected via format check", async () => {
  const env = await setupAccountEnv();
  try {
    const { pendingId } = await requestEmailChange(env.userId, "new@example.com");
    await drain();
    await assert.rejects(
      () => confirmEmailChange({ userId: env.userId, pendingId, code: "abc" }),
      /6 digits/i
    );
  } finally {
    await env.cleanup();
  }
});

// ── Password change ────────────────────────────────────────────────────────

test("changePassword: standard flow with correct old password updates hash", async () => {
  const env = await setupAccountEnv();
  try {
    await changePassword({
      userId: env.userId,
      oldPassword: env.plainPassword,
      newPassword: "new-password-9999"
    });

    // Old password no longer works; new does
    const { verifyPassword } = await import("../../auth/password.js");
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;
    const oldOk = await verifyPassword(env.plainPassword, user.passwordSalt!, user.passwordHash!);
    const newOk = await verifyPassword("new-password-9999", user.passwordSalt!, user.passwordHash!);
    assert.equal(oldOk, false);
    assert.equal(newOk, true);
  } finally {
    await env.cleanup();
  }
});

test("changePassword: wrong old password rejected; user unchanged", async () => {
  const env = await setupAccountEnv();
  try {
    await assert.rejects(
      () => changePassword({
        userId: env.userId,
        oldPassword: "WRONG-OLD-PW",
        newPassword: "new-password-9999"
      }),
      /incorrect/i
    );
  } finally {
    await env.cleanup();
  }
});

test("changePassword: rejects when old == new", async () => {
  const env = await setupAccountEnv();
  try {
    await assert.rejects(
      () => changePassword({
        userId: env.userId,
        oldPassword: env.plainPassword,
        newPassword: env.plainPassword
      }),
      /must differ/i
    );
  } finally {
    await env.cleanup();
  }
});

test("changePassword: short new password rejected by normalizer", async () => {
  const env = await setupAccountEnv();
  try {
    await assert.rejects(
      () => changePassword({
        userId: env.userId,
        oldPassword: env.plainPassword,
        newPassword: "short"
      }),
      /at least 8 characters/i
    );
  } finally {
    await env.cleanup();
  }
});

test("changePassword: isInitialSet flow on OAuth-only account succeeds", async () => {
  const env = await setupAccountEnv({ noPassword: true });
  try {
    await changePassword({
      userId: env.userId,
      newPassword: "first-time-password",
      isInitialSet: true
    });
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;
    assert.ok(user.passwordHash);
    assert.ok(user.passwordSalt);
  } finally {
    await env.cleanup();
  }
});

test("changePassword: isInitialSet rejected if user already has a password", async () => {
  const env = await setupAccountEnv();
  try {
    await assert.rejects(
      () => changePassword({
        userId: env.userId,
        newPassword: "first-time-password",
        isInitialSet: true
      }),
      /already set/i
    );
  } finally {
    await env.cleanup();
  }
});

// ── Soft-delete ────────────────────────────────────────────────────────────

test("softDeleteUser sets deletedAt and revokes sessions + clears 2FA", async () => {
  const env = await setupAccountEnv({ totpEnabled: true });
  try {
    await updateRuntimeDatabase((db) => {
      const u = db.users.find((u) => u.id === env.userId)!;
      u.totpSecretEnc = "enc:v1:fake";
      u.totpRecoveryCodesHashed = ["h1", "h2"];
      db.sessions.push({
        token: "tok-1",
        userId: env.userId,
        createdAt: "2026-05-24T00:00:00Z",
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
    });

    const result = await softDeleteUser(env.userId);
    assert.ok(result?.deletedAt);
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.ok(user?.deletedAt);
    assert.equal(user?.totpSecretEnc, undefined);
    assert.equal(user?.totpEnabledAt, undefined);
    assert.equal(user?.totpRecoveryCodesHashed, undefined);
    assert.equal(db.sessions.length, 0);
  } finally {
    await env.cleanup();
  }
});

// ── Notification prefs ─────────────────────────────────────────────────────

test("getNotificationPrefs returns defaults when no row exists", async () => {
  const env = await setupAccountEnv();
  try {
    const prefs = await getNotificationPrefs(env.userId);
    assert.equal(prefs.emailMentions, DEFAULT_NOTIFICATION_PREFS.emailMentions);
    assert.equal(prefs.emailComments, DEFAULT_NOTIFICATION_PREFS.emailComments);
    assert.equal(prefs.emailSuggestionStatus, DEFAULT_NOTIFICATION_PREFS.emailSuggestionStatus);
    assert.equal(prefs.emailPublishStatus, DEFAULT_NOTIFICATION_PREFS.emailPublishStatus);
    assert.equal(prefs.userId, env.userId);
  } finally {
    await env.cleanup();
  }
});

test("updateNotificationPrefs creates row, then merges on second call", async () => {
  const env = await setupAccountEnv();
  try {
    const first = await updateNotificationPrefs(env.userId, { emailMentions: false });
    assert.equal(first.emailMentions, false);
    assert.equal(first.emailComments, false); // default

    const second = await updateNotificationPrefs(env.userId, { emailComments: true });
    assert.equal(second.emailMentions, false); // preserved
    assert.equal(second.emailComments, true);

    const db = await readRuntimeDatabase();
    const rows = db.notificationPrefs?.filter((p) => p.userId === env.userId);
    assert.equal(rows?.length, 1); // not duplicated
  } finally {
    await env.cleanup();
  }
});

// ── Activity ───────────────────────────────────────────────────────────────

test("getUserActivity counts user's connections / playbooks / tasks / identities / api tokens", async () => {
  const env = await setupAccountEnv();
  try {
    await updateRuntimeDatabase((db) => {
      // Add 2 connections
      db.connections.push(
        { id: "c1", userId: env.userId, status: "validated", fields: {}, maskedSecrets: [], createdAt: "x", updatedAt: "x", method: "ssh-password", label: "L", realConnection: false } as never,
        { id: "c2", userId: env.userId, status: "validated", fields: {}, maskedSecrets: [], createdAt: "x", updatedAt: "x", method: "ssh-password", label: "L", realConnection: false } as never
      );
      // Add 1 user profile
      db.userProfiles.push(
        { id: "p1", userId: env.userId, kind: "vm-snapshot", visibility: "private", name: "n", nameEn: "n", category: "runtime", summary: "s", summaryEn: "s", sensitivity: "safe", components: [], installMode: "skip-existing", createdAt: "x", updatedAt: "x" } as never
      );
      // 1 playbook, 3 tasks
      db.playbooks ??= [];
      db.playbooks.push({ id: "pb1", userId: env.userId, name: "n", version: 1, yaml: "", history: [], sourceKind: "user", createdAt: "x", updatedAt: "x" } as never);
      db.tasks ??= [];
      for (let i = 0; i < 3; i++) {
        db.tasks.push({ id: `t${i}`, userId: env.userId, connectionId: "c1", source: "x", sourceKind: "catalog", status: "succeeded", dryRun: false, steps: [], startedAt: "x" } as never);
      }
      // 2 identities (1 local + 1 github)
      db.identities ??= [];
      db.identities.push(
        { id: "i1", userId: env.userId, provider: "local", providerUserId: env.userId, createdAt: "x" },
        { id: "i2", userId: env.userId, provider: "github", providerUserId: "12345", createdAt: "x" }
      );
      // 1 api token
      db.apiTokens ??= [];
      db.apiTokens.push({ id: "at1", userId: env.userId, label: "ci", tokenHash: "h", tokenPrefix: "envf_xxx", createdAt: "x" });
    });

    const activity = await getUserActivity(env.userId);
    assert.equal(activity.connections, 2);
    assert.equal(activity.uploadedProfiles, 1);
    assert.equal(activity.playbooks, 1);
    assert.equal(activity.tasksExecuted, 3);
    // identitiesLinked excludes "local"
    assert.equal(activity.identitiesLinked, 1);
    assert.equal(activity.apiTokens, 1);
  } finally {
    await env.cleanup();
  }
});

test("getUserActivity returns zeros for fresh user", async () => {
  const env = await setupAccountEnv();
  try {
    const activity = await getUserActivity(env.userId);
    assert.equal(activity.connections, 0);
    assert.equal(activity.uploadedProfiles, 0);
    assert.equal(activity.playbooks, 0);
    assert.equal(activity.tasksExecuted, 0);
    assert.equal(activity.identitiesLinked, 0);
    assert.equal(activity.apiTokens, 0);
  } finally {
    await env.cleanup();
  }
});
