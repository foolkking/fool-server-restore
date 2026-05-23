/**
 * P1.11 — HTTP integration tests for /api/me/* (profile, email change,
 * password change, soft-delete, notification prefs, activity).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify from "fastify";
import { TOTP, Secret } from "otpauth";

import { _resetStoreForTests, readRuntimeDatabase, updateRuntimeDatabase } from "../../runtime-store.js";
import { registerRoutes } from "../../routes.js";
import { enroll as enrollTotp, confirm as confirmTotp } from "../../auth/totp.js";
import { waitForEmailQueueDrain } from "../../email/index.js";

interface MeEnv {
  tmpDir: string;
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
  sessionToken: string;
  userId: string;
  email: string;
  plainPassword: string;
}

function codeForSecret(secretBase32: string, accountLabel: string): string {
  const totp = new TOTP({
    issuer: "EnvForge",
    label: accountLabel,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32)
  });
  return totp.generate();
}

async function setupMeApp(opts?: {
  noPassword?: boolean;
  enableTotp?: boolean;
  role?: "user" | "admin";
}): Promise<MeEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-routes-me-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");

  const userId = "u_me_test";
  const email = "me-tester@example.com";
  const sessionToken = "test-me-session-abcdef";
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
      name: "Me Tester",
      email,
      username: "me_tester",
      displayName: "Me Tester",
      role: opts?.role ?? "user",
      passwordHash,
      passwordSalt,
      createdAt: "2026-05-24T00:00:00Z",
      updatedAt: "2026-05-24T00:00:00Z"
    }],
    identities: [],
    sessions: [{
      token: sessionToken,
      userId,
      createdAt: "2026-05-24T00:00:00Z",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    }],
    connections: [],
    userProfiles: []
  };
  await fs.writeFile(dbPath, JSON.stringify(seed));

  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  process.env.PUBLIC_BASE_URL = "https://envforge.test";
  process.env.NODE_ENV = "development";
  // Disable SMTP — fall back to stdout (avoids real-email retry hangs).
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

  if (opts?.enableTotp) {
    const enrolled = await enrollTotp(userId);
    const code = codeForSecret(enrolled.secret, email);
    await confirmTotp(userId, code);
  }

  const app = Fastify({ logger: false });
  await registerRoutes(app);

  return {
    tmpDir,
    app,
    sessionToken,
    userId,
    email,
    plainPassword,
    cleanup: async () => {
      await app.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
      const { resetEmailQueueForTests } = await import("../../email/index.js");
      resetEmailQueueForTests();
    }
  };
}

function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

// ── GET /api/me ────────────────────────────────────────────────────────────

test("GET /api/me — anonymous returns legacy guest shape", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({ method: "GET", url: "/api/me" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.id, "guest");
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me — authenticated returns full account snapshot", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.user.email, env.email);
    assert.equal(body.user.authenticated, true);
    assert.equal(body.user.totpEnabled, false);
    assert.ok(Array.isArray(body.identities));
    // Has virtual local entry
    const local = body.identities.find((i: { provider: string }) => i.provider === "local");
    assert.ok(local);
    assert.ok(body.twoFactor);
    assert.ok(body.notificationPrefs);
    assert.ok(body.activity);
  } finally {
    await env.cleanup();
  }
});

// ── PATCH /api/me ──────────────────────────────────────────────────────────

test("PATCH /api/me — happy path updates fields", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: {
        displayName: "Renamed",
        bio: "I love 🌮",
        avatarUrl: "https://example.com/a.png",
        timezone: "Asia/Shanghai",
        locale: "zh-CN"
      }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.user.displayName, "Renamed");
    assert.equal(body.user.bio, "I love 🌮");
    assert.equal(body.user.timezone, "Asia/Shanghai");
  } finally {
    await env.cleanup();
  }
});

test("PATCH /api/me — invalid avatar URL → 400", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: { avatarUrl: "javascript:alert(1)" }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

test("PATCH /api/me — requires auth", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "PATCH",
      url: "/api/me",
      payload: { displayName: "anonymous" }
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

// ── Email change ───────────────────────────────────────────────────────────

test("POST /api/me/email-change/request → returns pendingId + devCode (test env)", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/email-change/request",
      headers: bearer(env.sessionToken),
      payload: { newEmail: "new@example.com" }
    });
    await waitForEmailQueueDrain(2000);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.pendingId);
    assert.ok(body.devCode);
    assert.match(body.devCode, /^\d{6}$/);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/email-change/request → 400 when same email", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/email-change/request",
      headers: bearer(env.sessionToken),
      payload: { newEmail: env.email }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/email-change/confirm → updates email when code correct", async () => {
  const env = await setupMeApp();
  try {
    const startRes = await env.app.inject({
      method: "POST",
      url: "/api/me/email-change/request",
      headers: bearer(env.sessionToken),
      payload: { newEmail: "new@example.com" }
    });
    await waitForEmailQueueDrain(2000);
    const { pendingId, devCode } = startRes.json();

    const confirmRes = await env.app.inject({
      method: "POST",
      url: "/api/me/email-change/confirm",
      headers: bearer(env.sessionToken),
      payload: { pendingId, code: devCode }
    });
    assert.equal(confirmRes.statusCode, 200);
    const body = confirmRes.json();
    assert.equal(body.email, "new@example.com");

    // Side check via /api/me
    const me = await env.app.inject({
      method: "GET",
      url: "/api/me",
      headers: bearer(env.sessionToken)
    });
    assert.equal(me.json().user.email, "new@example.com");
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/email-change/confirm → wrong code 400", async () => {
  const env = await setupMeApp();
  try {
    const startRes = await env.app.inject({
      method: "POST",
      url: "/api/me/email-change/request",
      headers: bearer(env.sessionToken),
      payload: { newEmail: "new@example.com" }
    });
    await waitForEmailQueueDrain(2000);
    const { pendingId } = startRes.json();
    const confirmRes = await env.app.inject({
      method: "POST",
      url: "/api/me/email-change/confirm",
      headers: bearer(env.sessionToken),
      payload: { pendingId, code: "000000" }
    });
    assert.equal(confirmRes.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

// ── Password change ───────────────────────────────────────────────────────

test("POST /api/me/password — happy path with correct old password", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: bearer(env.sessionToken),
      payload: { oldPassword: env.plainPassword, newPassword: "new-password-9999" }
    });
    assert.equal(res.statusCode, 200);
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;
    const { verifyPassword } = await import("../../auth/password.js");
    const ok = await verifyPassword("new-password-9999", user.passwordSalt!, user.passwordHash!);
    assert.equal(ok, true);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/password — wrong old password 401", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: bearer(env.sessionToken),
      payload: { oldPassword: "WRONG-OLD", newPassword: "new-password-9999" }
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/password — missing newPassword 400", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: bearer(env.sessionToken),
      payload: { oldPassword: env.plainPassword }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/password — initial-set on OAuth-only without 2FA → 400", async () => {
  const env = await setupMeApp({ noPassword: true });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: bearer(env.sessionToken),
      payload: { newPassword: "first-time-pw-12345" }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /2FA/);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/password — initial-set on OAuth + 2FA succeeds with current code", async () => {
  const env = await setupMeApp({ noPassword: true, enableTotp: true });
  try {
    // Get current TOTP
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;
    const { decryptSecret } = await import("../../crypto.js");
    const secretPlain = decryptSecret(user.totpSecretEnc!);
    const totpCode = codeForSecret(secretPlain, env.email);

    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: bearer(env.sessionToken),
      payload: {
        newPassword: "first-time-pw-12345",
        currentTotpCode: totpCode
      }
    });
    assert.equal(res.statusCode, 200);
  } finally {
    await env.cleanup();
  }
});

// ── DELETE /api/me ─────────────────────────────────────────────────────────

test("DELETE /api/me — happy path with password re-auth", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: { password: env.plainPassword }
    });
    assert.equal(res.statusCode, 200);
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.ok(user?.deletedAt);
    // Sessions purged
    assert.equal(db.sessions.length, 0);

    // Subsequent calls with the old token → 401
    const followup = await env.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: bearer(env.sessionToken)
    });
    assert.equal(followup.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me — wrong password 401", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: { password: "WRONG-PW" }
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me — missing re-auth 400", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: {}
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me — last admin cannot delete themselves (409)", async () => {
  const env = await setupMeApp({ role: "admin" });
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: { password: env.plainPassword }
    });
    assert.equal(res.statusCode, 409);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me — admin can delete when another admin exists", async () => {
  const env = await setupMeApp({ role: "admin" });
  try {
    // Add a second admin
    await updateRuntimeDatabase((db) => {
      db.users.push({
        id: "u_admin2",
        name: "Admin Two",
        email: "admin2@example.com",
        role: "admin",
        passwordHash: "h",
        passwordSalt: "s",
        createdAt: "2026-05-24T00:00:00Z",
        updatedAt: "2026-05-24T00:00:00Z"
      });
    });
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: bearer(env.sessionToken),
      payload: { password: env.plainPassword }
    });
    assert.equal(res.statusCode, 200);
  } finally {
    await env.cleanup();
  }
});

// ── Notification prefs ─────────────────────────────────────────────────────

test("GET /api/me/notification-prefs returns defaults for fresh user", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/notification-prefs",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.emailMentions, true);
    assert.equal(body.emailComments, false);
  } finally {
    await env.cleanup();
  }
});

test("PUT /api/me/notification-prefs persists patch + ignores unknown fields", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "PUT",
      url: "/api/me/notification-prefs",
      headers: bearer(env.sessionToken),
      payload: {
        emailMentions: false,
        emailComments: true,
        unknownField: "ignored",
        emailMentions_typo: false
      }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.emailMentions, false);
    assert.equal(body.emailComments, true);
  } finally {
    await env.cleanup();
  }
});

// ── Activity ───────────────────────────────────────────────────────────────

test("GET /api/me/activity returns counts", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/activity",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(typeof body.connections, "number");
    assert.equal(typeof body.tasksExecuted, "number");
    assert.equal(typeof body.identitiesLinked, "number");
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me/activity requires auth", async () => {
  const env = await setupMeApp();
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/activity"
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});
