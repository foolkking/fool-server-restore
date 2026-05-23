/**
 * P1.10 — login flow with 2FA-pending session and enrollment-required.
 *
 * Coverage:
 *   - loginUser issues a regular session for users without 2FA
 *   - loginUser issues a 2fa-pending session for users with TOTP enabled
 *   - loginUser issues an enrollment-required session for admins without 2FA
 *   - login2FA upgrades the intermediate session into a regular one
 *   - login2FA accepts both TOTP codes and recovery codes
 *   - 2fa-pending session can NOT call business routes (resolveSession)
 *   - enrollment-required session CAN call /api/me/2fa/{status,enroll,confirm}
 *     but NOT business routes
 *   - HTTP integration: POST /api/auth/login → /api/auth/login/2fa flow
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify from "fastify";
import { TOTP, Secret } from "otpauth";

import { _resetStoreForTests, readRuntimeDatabase } from "../../runtime-store.js";
import { registerRoutes } from "../../routes.js";
import { loginUser } from "../../auth/local.js";
import {
  login2FA,
  Login2FAError,
  cleanupExpiredIntermediateSessions
} from "../../auth/login-2fa.js";
import {
  resolveSession,
  TWOFA_PENDING_TTL_MS,
  ENROLLMENT_REQUIRED_TTL_MS
} from "../../auth/session.js";
import { enroll as enrollTotp, confirm as confirmTotp } from "../../auth/totp.js";

interface LoginEnv {
  tmpDir: string;
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
  /** Plaintext password matching the seeded user. */
  plainPassword: string;
  /** Email of seeded user. */
  email: string;
  userId: string;
}

async function setupLoginEnv(opts: {
  role?: "user" | "admin";
  enable2FA?: boolean;
  adminEmails?: string[];
}): Promise<LoginEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-login-2fa-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");
  const userId = "u_login_2fa";
  const email = "login-tester@example.com";
  const plainPassword = "horse-battery-staple-1234";

  // Pre-compute scrypt hash so loginUser can verify the password.
  const { scrypt: scryptCb, randomBytes } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const scrypt = promisify(scryptCb) as (
    pw: string,
    salt: string,
    keylen: number
  ) => Promise<Buffer>;
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(plainPassword, passwordSalt, 64)).toString("hex");

  const seed = {
    schemaVersion: "0.4.0",
    users: [{
      id: userId,
      name: "Login Tester",
      email,
      username: "login_tester",
      role: opts.role ?? "user",
      passwordHash,
      passwordSalt,
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
  process.env.ENVFORGE_ADMIN_EMAILS = opts.adminEmails?.join(",") ?? "";
  if (!process.env.ENVFORGE_MASTER_KEY) {
    process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  }
  _resetStoreForTests();

  // Optionally enable 2FA on the user — we go through the real enroll/confirm
  // flow so the encrypted secret + recovery codes are persisted correctly.
  if (opts.enable2FA) {
    const enrolled = await enrollTotp(userId);
    const code = codeForSecret(enrolled.secret, email);
    await confirmTotp(userId, code);
  }

  const app = Fastify({ logger: false });
  await registerRoutes(app);

  return {
    tmpDir,
    app,
    plainPassword,
    email,
    userId,
    cleanup: async () => {
      await app.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
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

// ── loginUser branching ────────────────────────────────────────────────────

test("loginUser — no 2FA, regular user → returns full token", async () => {
  const env = await setupLoginEnv({ role: "user" });
  try {
    const result = await loginUser({ email: env.email, password: env.plainPassword });
    assert.equal("token" in result, true);
    if ("token" in result) {
      assert.ok(result.token);
      assert.equal(result.user.email, env.email);
    }
    assert.equal((result as { needs2FA?: boolean }).needs2FA, undefined);
    assert.equal((result as { needsEnrollment?: boolean }).needsEnrollment, undefined);
  } finally {
    await env.cleanup();
  }
});

test("loginUser — TOTP enabled → returns 2fa-pending intermediate token", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const result = await loginUser({ email: env.email, password: env.plainPassword });
    assert.equal((result as { needs2FA: boolean }).needs2FA, true);
    if ("intermediateToken" in result) {
      assert.ok(result.intermediateToken);
      // Verify the session row has twofaPending=true
      const db = await readRuntimeDatabase();
      const session = db.sessions.find((s) => s.token === result.intermediateToken);
      assert.ok(session);
      assert.equal(session?.twofaPending, true);
      // Within 5 min TTL
      const ttlMs = new Date(session!.expiresAt).getTime() - Date.now();
      assert.ok(ttlMs > 0 && ttlMs <= TWOFA_PENDING_TTL_MS + 1000);
    }
  } finally {
    await env.cleanup();
  }
});

test("loginUser — admin without 2FA → enrollment-required intermediate token", async () => {
  const env = await setupLoginEnv({
    role: "admin",
    enable2FA: false,
    adminEmails: ["login-tester@example.com"]
  });
  try {
    const result = await loginUser({ email: env.email, password: env.plainPassword });
    assert.equal((result as { needsEnrollment: boolean }).needsEnrollment, true);
    if ("intermediateToken" in result) {
      const db = await readRuntimeDatabase();
      const session = db.sessions.find((s) => s.token === result.intermediateToken);
      assert.ok(session);
      assert.equal(session?.enrollmentRequired, true);
      const ttlMs = new Date(session!.expiresAt).getTime() - Date.now();
      assert.ok(ttlMs > 0 && ttlMs <= ENROLLMENT_REQUIRED_TTL_MS + 1000);
    }
  } finally {
    await env.cleanup();
  }
});

test("loginUser — admin WITH 2FA → 2fa-pending (not enrollment)", async () => {
  // Promote-on-login path: user is in admin allow-list AND has 2FA already.
  // Should go through 2fa-pending, not enrollment.
  const env = await setupLoginEnv({
    role: "user", // starts as user
    enable2FA: true,
    adminEmails: ["login-tester@example.com"]
  });
  try {
    const result = await loginUser({ email: env.email, password: env.plainPassword });
    assert.equal((result as { needs2FA: boolean }).needs2FA, true);
    // Verify admin promotion still happened
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId);
    assert.equal(user?.role, "admin");
  } finally {
    await env.cleanup();
  }
});

test("loginUser — wrong password → throws (no intermediate session created)", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    await assert.rejects(
      () => loginUser({ email: env.email, password: "wrong-password-here" }),
      /incorrect/i
    );
    const db = await readRuntimeDatabase();
    assert.equal(db.sessions.length, 0);
  } finally {
    await env.cleanup();
  }
});

// ── login2FA (the upgrade step) ────────────────────────────────────────────

test("login2FA — happy path with TOTP code rotates session", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    assert.equal((loginResult as { needs2FA: boolean }).needs2FA, true);
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");

    // Find the user's TOTP secret to compute the code (for testing)
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;
    assert.ok(user.totpSecretEnc);
    const { decryptSecret } = await import("../../crypto.js");
    const secretPlain = decryptSecret(user.totpSecretEnc!);
    const code = codeForSecret(secretPlain, env.email);

    const result = await login2FA({
      intermediateToken: loginResult.intermediateToken,
      code
    });
    assert.ok(result.token);
    assert.notEqual(result.token, loginResult.intermediateToken); // rotated
    assert.equal(result.user.email, env.email);

    // Old intermediate token gone, new full-access session in place
    const dbAfter = await readRuntimeDatabase();
    const oldGone = !dbAfter.sessions.some((s) => s.token === loginResult.intermediateToken);
    const newPresent = dbAfter.sessions.some((s) => s.token === result.token);
    assert.equal(oldGone, true);
    assert.equal(newPresent, true);
    const newSession = dbAfter.sessions.find((s) => s.token === result.token);
    assert.equal(newSession?.twofaPending, undefined);
  } finally {
    await env.cleanup();
  }
});

test("login2FA — happy path with recovery code marks usedRecoveryCode + decrements count", async () => {
  const env = await setupLoginEnv({ role: "user" });
  try {
    // Enroll via the test helper to capture recovery codes
    const enrolled = await enrollTotp(env.userId);
    const enrollCode = codeForSecret(enrolled.secret, env.email);
    const { recoveryCodes } = await confirmTotp(env.userId, enrollCode);
    assert.equal(recoveryCodes.length, 8);

    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");

    const result = await login2FA({
      intermediateToken: loginResult.intermediateToken,
      code: recoveryCodes[0]
    });
    assert.equal(result.usedRecoveryCode, true);
    assert.equal(result.recoveryCodesRemaining, 7);

    // Replay same recovery → fail (different intermediate session needed too)
    const second = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in second)) throw new Error("expected intermediate");
    await assert.rejects(
      () => login2FA({ intermediateToken: second.intermediateToken, code: recoveryCodes[0] }),
      (err) => err instanceof Login2FAError && err.reason === "wrong-code"
    );
  } finally {
    await env.cleanup();
  }
});

test("login2FA — wrong code throws Login2FAError(wrong-code), keeps intermediate alive", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");

    await assert.rejects(
      () => login2FA({ intermediateToken: loginResult.intermediateToken, code: "000000" }),
      (err) => err instanceof Login2FAError && err.reason === "wrong-code"
    );

    // Intermediate session still exists for retry
    const db = await readRuntimeDatabase();
    const stillThere = db.sessions.some((s) => s.token === loginResult.intermediateToken);
    assert.equal(stillThere, true);
  } finally {
    await env.cleanup();
  }
});

test("login2FA — unknown intermediate token throws session-not-found", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    await assert.rejects(
      () => login2FA({ intermediateToken: "deadbeef", code: "123456" }),
      (err) => err instanceof Login2FAError && err.reason === "session-not-found"
    );
  } finally {
    await env.cleanup();
  }
});

test("login2FA — non-pending session (regular login session) throws not-pending", async () => {
  const env = await setupLoginEnv({ role: "user" });
  try {
    // Login w/o 2FA gives a regular full-access token
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("token" in loginResult)) throw new Error("expected regular");

    await assert.rejects(
      () => login2FA({ intermediateToken: loginResult.token, code: "123456" }),
      (err) => err instanceof Login2FAError && err.reason === "not-pending"
    );
  } finally {
    await env.cleanup();
  }
});

test("login2FA — empty / missing inputs throw appropriately", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    await assert.rejects(
      () => login2FA({ code: "123456" }),
      (err) => err instanceof Login2FAError && err.reason === "session-not-found"
    );
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");
    await assert.rejects(
      () => login2FA({ intermediateToken: loginResult.intermediateToken, code: "" }),
      (err) => err instanceof Login2FAError && err.reason === "wrong-code"
    );
  } finally {
    await env.cleanup();
  }
});

// ── resolveSession enforcement ─────────────────────────────────────────────

test("resolveSession — 2fa-pending session is rejected by default", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");

    // Default: rejects pending sessions
    const r1 = await resolveSession(loginResult.intermediateToken);
    assert.equal(r1, undefined);

    // Opt-in: surfaces it with restriction flag
    const r2 = await resolveSession(loginResult.intermediateToken, { allowTwofaPending: true });
    assert.ok(r2);
    assert.equal(r2?.restriction, "twofa-pending");
  } finally {
    await env.cleanup();
  }
});

test("resolveSession — enrollment-required session is rejected by default", async () => {
  const env = await setupLoginEnv({
    role: "admin",
    adminEmails: ["login-tester@example.com"]
  });
  try {
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");

    const r1 = await resolveSession(loginResult.intermediateToken);
    assert.equal(r1, undefined);

    const r2 = await resolveSession(loginResult.intermediateToken, {
      allowEnrollmentRequired: true
    });
    assert.ok(r2);
    assert.equal(r2?.restriction, "enrollment-required");
  } finally {
    await env.cleanup();
  }
});

test("cleanupExpiredIntermediateSessions — drops only expired pending/enrollment rows", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    // Create a fresh intermediate session
    const loginResult = await loginUser({ email: env.email, password: env.plainPassword });
    if (!("intermediateToken" in loginResult)) throw new Error("expected intermediate");

    // Force-expire it
    const { updateRuntimeDatabase } = await import("../../runtime-store.js");
    await updateRuntimeDatabase((db) => {
      const target = db.sessions.find((s) => s.token === loginResult.intermediateToken);
      if (target) target.expiresAt = new Date(Date.now() - 1000).toISOString();
    });

    const result = await cleanupExpiredIntermediateSessions();
    assert.equal(result.removed, 1);

    const db = await readRuntimeDatabase();
    assert.equal(db.sessions.length, 0);
  } finally {
    await env.cleanup();
  }
});

// ── HTTP integration: full /api/auth/login → /api/auth/login/2fa flow ──────

test("HTTP — POST /api/auth/login returns needs2FA + intermediateToken when TOTP on", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.needs2FA, true);
    assert.ok(body.intermediateToken);
    assert.equal(body.user.email, env.email);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — POST /api/auth/login/2fa upgrades intermediate session", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const login = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    const { intermediateToken } = login.json() as { intermediateToken: string };

    // Compute current code from the encrypted secret
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === env.userId)!;
    const { decryptSecret } = await import("../../crypto.js");
    const secretPlain = decryptSecret(user.totpSecretEnc!);
    const code = codeForSecret(secretPlain, env.email);

    const upgrade = await env.app.inject({
      method: "POST",
      url: "/api/auth/login/2fa",
      payload: { intermediateToken, code }
    });
    assert.equal(upgrade.statusCode, 200);
    const body = upgrade.json();
    assert.ok(body.token);
    assert.ok(body.expiresAt);
    assert.equal(body.user.email, env.email);

    // Ensure the new token resolves on a protected route (regular session)
    const me = await env.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${body.token}` }
    });
    assert.equal(me.statusCode, 200);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — POST /api/auth/login/2fa wrong code returns 401", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const login = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    const { intermediateToken } = login.json() as { intermediateToken: string };

    const upgrade = await env.app.inject({
      method: "POST",
      url: "/api/auth/login/2fa",
      payload: { intermediateToken, code: "000000" }
    });
    assert.equal(upgrade.statusCode, 401);
    assert.match(upgrade.json().error, /incorrect/i);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — POST /api/auth/login/2fa unknown token returns 401", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const upgrade = await env.app.inject({
      method: "POST",
      url: "/api/auth/login/2fa",
      payload: { intermediateToken: "deadbeef", code: "123456" }
    });
    assert.equal(upgrade.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — 2fa-pending intermediate token cannot call business routes", async () => {
  const env = await setupLoginEnv({ role: "user", enable2FA: true });
  try {
    const login = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    const { intermediateToken } = login.json() as { intermediateToken: string };

    // Try to use the intermediate token on /api/auth/session — should 401
    const session = await env.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    assert.equal(session.statusCode, 401);

    // Cannot list connections either
    const conns = await env.app.inject({
      method: "GET",
      url: "/api/connections",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    assert.equal(conns.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — admin first login lands on enrollment-required session", async () => {
  const env = await setupLoginEnv({
    role: "admin",
    adminEmails: ["login-tester@example.com"]
  });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.needsEnrollment, true);
    assert.ok(body.intermediateToken);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — enrollment-required session can call /api/me/2fa/enroll but not business routes", async () => {
  const env = await setupLoginEnv({
    role: "admin",
    adminEmails: ["login-tester@example.com"]
  });
  try {
    const login = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    const { intermediateToken } = login.json() as { intermediateToken: string };

    // Allowed: /api/me/2fa/status
    const status = await env.app.inject({
      method: "GET",
      url: "/api/me/2fa/status",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    assert.equal(status.statusCode, 200);

    // Allowed: /api/me/2fa/enroll
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    assert.equal(enroll.statusCode, 200);

    // NOT allowed: /api/connections
    const conns = await env.app.inject({
      method: "GET",
      url: "/api/connections",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    assert.equal(conns.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("HTTP — admin completes enrollment via confirm and gets rotated session token", async () => {
  const env = await setupLoginEnv({
    role: "admin",
    adminEmails: ["login-tester@example.com"]
  });
  try {
    const login = await env.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: env.email, password: env.plainPassword }
    });
    const { intermediateToken } = login.json() as { intermediateToken: string };

    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    const { secret } = enroll.json() as { secret: string };

    const code = codeForSecret(secret, env.email);
    const confirm = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: { authorization: `Bearer ${intermediateToken}` },
      payload: { code }
    });
    assert.equal(confirm.statusCode, 200);
    const body = confirm.json();
    assert.equal(body.recoveryCodes.length, 8);
    // P1.10 — confirm rotates the enrollment session into a regular one
    assert.ok(body.sessionToken, "expected rotated sessionToken in confirm response");
    assert.ok(body.sessionExpiresAt);
    assert.notEqual(body.sessionToken, intermediateToken);

    // The new session token works on protected routes
    const me = await env.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${body.sessionToken}` }
    });
    assert.equal(me.statusCode, 200);

    // The old intermediate token does NOT
    const oldUse = await env.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${intermediateToken}` }
    });
    assert.equal(oldUse.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});
