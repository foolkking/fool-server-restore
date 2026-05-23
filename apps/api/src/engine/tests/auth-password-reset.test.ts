/**
 * P1.12 — password reset (request → email → confirm) + email templates.
 *
 * Pure-token tests: signing, verifying, tampering, malformed inputs.
 * DB-backed flow tests: request, confirm, expired, replay, missing user.
 * HTTP integration: anti-enumeration on request, status code mapping on confirm.
 * Template tests: verify-email-change + email-change-notice + password-reset
 * all render successfully.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify from "fastify";

import { _resetStoreForTests, readRuntimeDatabase, updateRuntimeDatabase } from "../../runtime-store.js";
import { registerRoutes } from "../../routes.js";
import {
  requestPasswordReset,
  confirmPasswordReset,
  cleanupExpiredResetRequests,
  signToken,
  verifyToken,
  PasswordResetError
} from "../../auth/password-reset.js";
import { renderTemplate } from "../../email/render.js";
import { waitForEmailQueueDrain } from "../../email/index.js";

interface ResetEnv {
  tmpDir: string;
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
  userId: string;
  email: string;
  plainPassword: string;
}

async function setupResetEnv(opts?: {
  noPassword?: boolean;
  deleted?: boolean;
}): Promise<ResetEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-pw-reset-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");

  const userId = "u_pwr_test";
  const email = "pwr-tester@example.com";
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
      name: "PWR Tester",
      email,
      username: "pwr_tester",
      displayName: "PWR Tester",
      role: "user",
      passwordHash,
      passwordSalt,
      deletedAt: opts?.deleted ? new Date().toISOString() : undefined,
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
  process.env.SMTP_HOST = "";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  delete process.env.ENVFORGE_ADMIN_EMAILS;
  if (!process.env.ENVFORGE_MASTER_KEY) {
    process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  }
  _resetStoreForTests();
  const { resetEmailTransportForTests, resetEmailQueueForTests } = await import("../../email/index.js");
  resetEmailTransportForTests();
  resetEmailQueueForTests();

  const app = Fastify({ logger: false });
  await registerRoutes(app);

  return {
    tmpDir,
    app,
    userId,
    email,
    plainPassword,
    cleanup: async () => {
      await app.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
      const { resetEmailQueueForTests: r } = await import("../../email/index.js");
      r();
    }
  };
}

// ── Token signing / verifying (pure) ───────────────────────────────────────

test("token round-trip preserves id + ts", () => {
  const token = signToken("pwreset_abc123", 1234567890);
  const result = verifyToken(token);
  assert.equal(result.kind, "ok");
  if (result.kind === "ok") {
    assert.equal(result.payload.id, "pwreset_abc123");
    assert.equal(result.payload.ts, 1234567890);
  }
});

test("token tampered payload → bad-signature", () => {
  const token = signToken("pwreset_abc", Date.now());
  const [_payload, sig] = token.split(".");
  // Replace payload with a different one but keep the original sig
  const evilPayloadB64 = Buffer.from(JSON.stringify({ id: "pwreset_evil", ts: Date.now() }), "utf8")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tampered = `${evilPayloadB64}.${sig}`;
  const result = verifyToken(tampered);
  assert.equal(result.kind, "bad-signature");
});

test("token tampered signature → bad-signature", () => {
  const token = signToken("pwreset_abc", Date.now());
  const tampered = token.slice(0, -4) + "AAAA";
  const result = verifyToken(tampered);
  assert.equal(result.kind, "bad-signature");
});

test("token without dot → malformed", () => {
  assert.equal(verifyToken("nodot").kind, "malformed");
  assert.equal(verifyToken("").kind, "malformed");
  assert.equal(verifyToken("." ).kind, "malformed");
  assert.equal(verifyToken("a.b.c").kind, "malformed");
});

test("token with non-base64url chars → malformed", () => {
  assert.equal(verifyToken("!!!.???").kind, "malformed");
});

// ── DB-backed flow ─────────────────────────────────────────────────────────

test("requestPasswordReset — happy path: row + dev URL", async () => {
  const env = await setupResetEnv();
  try {
    const result = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    assert.match(result.message, /password reset link/i);
    assert.ok(result.devResetUrl);
    assert.match(result.devResetUrl!, /\/auth\/password-reset\?token=/);

    const db = await readRuntimeDatabase();
    const reqs = db.passwordResetRequests ?? [];
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].userId, env.userId);
    assert.equal(reqs[0].email, env.email);
    assert.equal(reqs[0].usedAt, undefined);
  } finally {
    await env.cleanup();
  }
});

test("requestPasswordReset — unknown email returns same message, NO row, NO email sent", async () => {
  const env = await setupResetEnv();
  try {
    const result = await requestPasswordReset("ghost@example.com");
    await waitForEmailQueueDrain(2000);
    assert.match(result.message, /password reset link/i);
    assert.equal(result.devResetUrl, undefined);

    const db = await readRuntimeDatabase();
    assert.equal((db.passwordResetRequests ?? []).length, 0);
    // No email log entry because the queue wasn't given anything
    assert.equal((db.emailLog ?? []).length, 0);
  } finally {
    await env.cleanup();
  }
});

test("requestPasswordReset — OAuth-only account treated like unknown", async () => {
  const env = await setupResetEnv({ noPassword: true });
  try {
    const result = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    assert.match(result.message, /password reset link/i);
    assert.equal(result.devResetUrl, undefined);

    const db = await readRuntimeDatabase();
    assert.equal((db.passwordResetRequests ?? []).length, 0);
  } finally {
    await env.cleanup();
  }
});

test("requestPasswordReset — soft-deleted account treated like unknown", async () => {
  const env = await setupResetEnv({ deleted: true });
  try {
    const result = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    assert.equal(result.devResetUrl, undefined);
    const db = await readRuntimeDatabase();
    assert.equal((db.passwordResetRequests ?? []).length, 0);
  } finally {
    await env.cleanup();
  }
});

test("requestPasswordReset — malformed email returns same message, NO row", async () => {
  const env = await setupResetEnv();
  try {
    const result = await requestPasswordReset("not-an-email");
    await waitForEmailQueueDrain(2000);
    assert.match(result.message, /password reset link/i);
    assert.equal(result.devResetUrl, undefined);
    const db = await readRuntimeDatabase();
    assert.equal((db.passwordResetRequests ?? []).length, 0);
  } finally {
    await env.cleanup();
  }
});

test("requestPasswordReset — second request for same user replaces first", async () => {
  const env = await setupResetEnv();
  try {
    const r1 = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    const r2 = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    assert.notEqual(r1.devResetUrl, r2.devResetUrl);

    const db = await readRuntimeDatabase();
    const rows = db.passwordResetRequests ?? [];
    assert.equal(rows.length, 1);
  } finally {
    await env.cleanup();
  }
});

test("confirmPasswordReset — happy path: writes new password + revokes sessions", async () => {
  const env = await setupResetEnv();
  try {
    // Seed an active session for the user that should be revoked
    await updateRuntimeDatabase((db) => {
      db.sessions.push({
        token: "session-to-be-revoked",
        userId: env.userId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
    });

    const reqResult = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqResult.devResetUrl!);
    const token = url.searchParams.get("token")!;

    const confirm = await confirmPasswordReset({ token, newPassword: "new-pw-9999" });
    assert.equal(confirm.email, env.email);
    assert.equal(confirm.sessionsRevoked, 1);

    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;

    // New password verifies
    const { verifyPassword } = await import("../../auth/password.js");
    assert.equal(await verifyPassword("new-pw-9999", user.passwordSalt!, user.passwordHash!), true);
    // Old password no longer
    assert.equal(await verifyPassword(env.plainPassword, user.passwordSalt!, user.passwordHash!), false);

    // Reset row still present but marked usedAt (single-use)
    const row = db.passwordResetRequests!.find((r) => true)!;
    assert.ok(row.usedAt);
    // Session gone
    assert.equal(db.sessions.length, 0);
  } finally {
    await env.cleanup();
  }
});

test("confirmPasswordReset — token replay → already-used", async () => {
  const env = await setupResetEnv();
  try {
    const reqResult = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqResult.devResetUrl!);
    const token = url.searchParams.get("token")!;

    await confirmPasswordReset({ token, newPassword: "new-pw-9999" });
    await assert.rejects(
      () => confirmPasswordReset({ token, newPassword: "new-pw-different" }),
      (err) => err instanceof PasswordResetError && err.reason === "already-used"
    );
  } finally {
    await env.cleanup();
  }
});

test("confirmPasswordReset — expired row → expired", async () => {
  const env = await setupResetEnv();
  try {
    const reqResult = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqResult.devResetUrl!);
    const token = url.searchParams.get("token")!;

    // Force-expire the row
    await updateRuntimeDatabase((db) => {
      const row = db.passwordResetRequests?.[0];
      if (row) row.expiresAt = new Date(Date.now() - 1000).toISOString();
    });

    await assert.rejects(
      () => confirmPasswordReset({ token, newPassword: "new-pw-9999" }),
      (err) => err instanceof PasswordResetError && err.reason === "expired"
    );
  } finally {
    await env.cleanup();
  }
});

test("confirmPasswordReset — short new password → throws normalize error", async () => {
  const env = await setupResetEnv();
  try {
    const reqResult = await requestPasswordReset(env.email);
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqResult.devResetUrl!);
    const token = url.searchParams.get("token")!;

    await assert.rejects(
      () => confirmPasswordReset({ token, newPassword: "short" }),
      /at least 8 characters/i
    );
  } finally {
    await env.cleanup();
  }
});

test("confirmPasswordReset — bad signature throws", async () => {
  const env = await setupResetEnv();
  try {
    await assert.rejects(
      () => confirmPasswordReset({ token: "fake.signature", newPassword: "valid-pw-12345" }),
      (err) =>
        err instanceof PasswordResetError &&
        (err.reason === "bad-signature" || err.reason === "malformed-token")
    );
  } finally {
    await env.cleanup();
  }
});

test("cleanupExpiredResetRequests drops expired (non-used) and old-used rows", async () => {
  const env = await setupResetEnv();
  try {
    await updateRuntimeDatabase((db) => {
      if (!db.passwordResetRequests) db.passwordResetRequests = [];
      const now = Date.now();
      // 1 expired (no usedAt) — should drop
      db.passwordResetRequests.push({
        id: "pwreset_expired_unused",
        userId: env.userId,
        email: env.email,
        expiresAt: new Date(now - 1000).toISOString(),
        createdAt: new Date(now - 30 * 60 * 1000).toISOString()
      });
      // 1 fresh (no usedAt) — should keep
      db.passwordResetRequests.push({
        id: "pwreset_fresh",
        userId: env.userId,
        email: env.email,
        expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
        createdAt: new Date(now).toISOString()
      });
      // 1 used 2 hours ago — should keep (within 24h retention)
      db.passwordResetRequests.push({
        id: "pwreset_recently_used",
        userId: env.userId,
        email: env.email,
        expiresAt: new Date(now - 1000).toISOString(),
        usedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString()
      });
      // 1 used 48h ago — should drop
      db.passwordResetRequests.push({
        id: "pwreset_old_used",
        userId: env.userId,
        email: env.email,
        expiresAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        usedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 50 * 60 * 60 * 1000).toISOString()
      });
    });

    const result = await cleanupExpiredResetRequests();
    assert.equal(result.removed, 2);
    const db = await readRuntimeDatabase();
    const ids = (db.passwordResetRequests ?? []).map((r) => r.id).sort();
    assert.deepEqual(ids, ["pwreset_fresh", "pwreset_recently_used"]);
  } finally {
    await env.cleanup();
  }
});

// ── HTTP integration ───────────────────────────────────────────────────────

test("HTTP POST /api/auth/password-reset/request always returns 200 + generic message", async () => {
  const env = await setupResetEnv();
  try {
    // Real account
    const r1 = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: env.email }
    });
    await waitForEmailQueueDrain(2000);
    assert.equal(r1.statusCode, 200);
    const b1 = r1.json();
    assert.match(b1.message, /password reset link/i);
    assert.ok(b1.devResetUrl);

    // Unknown email
    const r2 = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: "ghost@example.com" }
    });
    await waitForEmailQueueDrain(2000);
    assert.equal(r2.statusCode, 200);
    const b2 = r2.json();
    assert.equal(b1.message, b2.message);  // SAME message
    assert.equal(b2.devResetUrl, undefined);
  } finally {
    await env.cleanup();
  }
});

test("HTTP POST /api/auth/password-reset/confirm — happy path 200", async () => {
  const env = await setupResetEnv();
  try {
    const reqRes = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: env.email }
    });
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqRes.json().devResetUrl);
    const token = url.searchParams.get("token")!;

    const confirmRes = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      payload: { token, newPassword: "fresh-password-9999" }
    });
    assert.equal(confirmRes.statusCode, 200);
    assert.equal(confirmRes.json().email, env.email);

    // Login with new password
    const loginRes = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: "fresh-password-9999" }
    });
    assert.equal(loginRes.statusCode, 200);
  } finally {
    await env.cleanup();
  }
});

test("HTTP POST /api/auth/password-reset/confirm — bad token → 400", async () => {
  const env = await setupResetEnv();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      payload: { token: "garbage.token", newPassword: "valid-password-12345" }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

test("HTTP POST /api/auth/password-reset/confirm — replayed token → 410", async () => {
  const env = await setupResetEnv();
  try {
    const reqRes = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: env.email }
    });
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqRes.json().devResetUrl);
    const token = url.searchParams.get("token")!;

    await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      payload: { token, newPassword: "fresh-password-9999" }
    });
    const second = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      payload: { token, newPassword: "another-pw-12345" }
    });
    assert.equal(second.statusCode, 410);
    assert.match(second.json().error, /already been used/i);
  } finally {
    await env.cleanup();
  }
});

test("HTTP POST /api/auth/password-reset/confirm — short new pw → 400", async () => {
  const env = await setupResetEnv();
  try {
    const reqRes = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/request",
      payload: { email: env.email }
    });
    await waitForEmailQueueDrain(2000);
    const url = new URL(reqRes.json().devResetUrl);
    const token = url.searchParams.get("token")!;

    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/password-reset/confirm",
      payload: { token, newPassword: "short" }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

// ── Email templates ────────────────────────────────────────────────────────

test("renderTemplate verify-email-change includes new email + code", async () => {
  const out = await renderTemplate("verify-email-change", {
    displayName: "Alice",
    newEmail: "alice@new.example",
    code: "123456",
    publicBaseUrl: "https://envforge.test"
  });
  assert.match(out.subject, /Confirm your new EnvForge email/);
  assert.match(out.text, /alice@new.example/);
  assert.match(out.text, /123456/);
  assert.match(out.html, /alice@new\.example/);
  assert.match(out.html, /123456/);
});

test("renderTemplate email-change-notice includes both old + new emails", async () => {
  const out = await renderTemplate("email-change-notice", {
    displayName: "Alice",
    oldEmail: "alice@old.example",
    newEmail: "alice@new.example",
    publicBaseUrl: "https://envforge.test"
  });
  assert.match(out.text, /alice@old\.example/);
  assert.match(out.text, /alice@new\.example/);
  assert.match(out.html, /alice@old\.example/);
  assert.match(out.html, /alice@new\.example/);
});

test("renderTemplate password-reset includes the reset URL", async () => {
  const url = "https://envforge.test/auth/password-reset?token=abc.def";
  const out = await renderTemplate("password-reset", {
    displayName: "Alice",
    resetUrl: url,
    publicBaseUrl: "https://envforge.test"
  });
  assert.match(out.subject, /Reset your EnvForge password/);
  assert.match(out.text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(out.html, /href="https:\/\/envforge\.test\/auth\/password-reset/);
});

test("renderTemplate XSS sanitization on user-controlled fields", async () => {
  const out = await renderTemplate("password-reset", {
    displayName: "<script>alert(1)</script>",
    resetUrl: "https://envforge.test/auth/password-reset?token=ok",
    publicBaseUrl: "https://envforge.test"
  });
  // HTML output must escape the script
  assert.match(out.html, /&lt;script&gt;/);
  assert.equal(out.html.includes("<script>alert(1)</script>"), false);
});
