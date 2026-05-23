/**
 * P1.9 — HTTP integration tests for /api/me/2fa/* routes.
 *
 * Uses Fastify's `app.inject()` to exercise the full request → handler → DB
 * stack without binding to a real port. Mirrors the pattern in
 * routes-identities.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify from "fastify";
import { TOTP, Secret } from "otpauth";

import { _resetStoreForTests } from "../../runtime-store.js";
import { registerRoutes } from "../../routes.js";

interface TwoFAEnv {
  tmpDir: string;
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
  sessionToken: string;
  userId: string;
  /** Plaintext password seeded into the user (so disable tests can re-auth). */
  plainPassword: string;
}

/** Generate a current code from the same parameters the server uses. */
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

async function setup2faApp(): Promise<TwoFAEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-routes-2fa-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");
  const userId = "u_test_2fa";
  const sessionToken = "test-2fa-session-abcdef";
  const plainPassword = "correct horse battery";

  // Pre-compute scrypt hash so a /disable test can re-auth.
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
      name: "2FA Tester",
      email: "twofa-tester@example.com",
      username: "twofa_tester",
      role: "user",
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
  delete process.env.ENVFORGE_ADMIN_EMAILS;
  if (!process.env.ENVFORGE_MASTER_KEY) {
    process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  }
  _resetStoreForTests();

  const app = Fastify({ logger: false });
  await registerRoutes(app);

  return {
    tmpDir,
    app,
    sessionToken,
    userId,
    plainPassword,
    cleanup: async () => {
      await app.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
}

function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

// ── GET /api/me/2fa/status ─────────────────────────────────────────────────

test("GET /api/me/2fa/status — requires auth", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({ method: "GET", url: "/api/me/2fa/status" });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me/2fa/status — returns disabled state for fresh user", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/2fa/status",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.enabled, false);
    assert.equal(body.hasPendingEnrollment, false);
    assert.equal(body.recoveryCodesRemaining, 0);
  } finally {
    await env.cleanup();
  }
});

// ── POST /api/me/2fa/enroll ────────────────────────────────────────────────

test("POST /api/me/2fa/enroll — issues secret + qr + uri", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.match(body.secret, /^[A-Z2-7]+=*$/);
    assert.ok(body.otpauthUri.startsWith("otpauth://totp/"));
    assert.ok(body.qrDataUrl.startsWith("data:image/png;base64,"));

    // Status reports pending
    const statusRes = await env.app.inject({
      method: "GET",
      url: "/api/me/2fa/status",
      headers: bearer(env.sessionToken)
    });
    const status = statusRes.json();
    assert.equal(status.enabled, false);
    assert.equal(status.hasPendingEnrollment, true);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/enroll — refuses to re-enroll when already enabled", async () => {
  const env = await setup2faApp();
  try {
    // First, enable 2FA via the full flow
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");
    const confirm = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });
    assert.equal(confirm.statusCode, 200);

    // Now try to enroll again → 409
    const reenroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    assert.equal(reenroll.statusCode, 409);
  } finally {
    await env.cleanup();
  }
});

// ── POST /api/me/2fa/confirm ───────────────────────────────────────────────

test("POST /api/me/2fa/confirm — happy path returns 8 recovery codes", async () => {
  const env = await setup2faApp();
  try {
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");

    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.recoveryCodes.length, 8);
    for (const c of body.recoveryCodes) {
      assert.match(c, /^[A-Z2-7]{8}-[A-Z2-7]{8}$/);
    }
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/confirm — wrong code → 400", async () => {
  const env = await setup2faApp();
  try {
    await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code: "000000" }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /incorrect/i);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/confirm — non-6-digit input → 400 with format message", async () => {
  const env = await setup2faApp();
  try {
    await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code: "abc" }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /6 digits/i);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/confirm — no pending enrollment → 404", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code: "123456" }
    });
    assert.equal(res.statusCode, 404);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/confirm — requires auth", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      payload: { code: "123456" }
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

// ── POST /api/me/2fa/disable ───────────────────────────────────────────────

test("POST /api/me/2fa/disable — happy path with password re-auth", async () => {
  const env = await setup2faApp();
  try {
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");
    await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });

    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/disable",
      headers: bearer(env.sessionToken),
      payload: { password: env.plainPassword }
    });
    assert.equal(res.statusCode, 200);

    const status = (await env.app.inject({
      method: "GET",
      url: "/api/me/2fa/status",
      headers: bearer(env.sessionToken)
    })).json();
    assert.equal(status.enabled, false);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/disable — happy path with current TOTP code re-auth", async () => {
  const env = await setup2faApp();
  try {
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");
    await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });

    // Re-auth with a fresh code (could be the same one if we're still in the same step)
    const reauthCode = codeForSecret(secret, "twofa-tester@example.com");
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/disable",
      headers: bearer(env.sessionToken),
      payload: { code: reauthCode }
    });
    assert.equal(res.statusCode, 200);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/disable — wrong password → 401", async () => {
  const env = await setup2faApp();
  try {
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");
    await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });

    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/disable",
      headers: bearer(env.sessionToken),
      payload: { password: "WRONG" }
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/disable — no re-auth provided → 400", async () => {
  const env = await setup2faApp();
  try {
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");
    await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });

    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/disable",
      headers: bearer(env.sessionToken),
      payload: {}
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /Re-authentication required/);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/disable — when 2FA is not enabled → 409", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/disable",
      headers: bearer(env.sessionToken),
      payload: { password: env.plainPassword }
    });
    assert.equal(res.statusCode, 409);
  } finally {
    await env.cleanup();
  }
});

// ── POST /api/me/2fa/regenerate-recovery ───────────────────────────────────

test("POST /api/me/2fa/regenerate-recovery — fresh codes, old set invalidated", async () => {
  const env = await setup2faApp();
  try {
    const enroll = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/enroll",
      headers: bearer(env.sessionToken)
    });
    const { secret } = enroll.json() as { secret: string };
    const code = codeForSecret(secret, "twofa-tester@example.com");
    const confirm = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/confirm",
      headers: bearer(env.sessionToken),
      payload: { code }
    });
    const originalCodes = (confirm.json() as { recoveryCodes: string[] }).recoveryCodes;

    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/regenerate-recovery",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const fresh = (res.json() as { recoveryCodes: string[] }).recoveryCodes;
    assert.equal(fresh.length, 8);

    // Old and new sets disjoint
    const orig = new Set(originalCodes);
    for (const c of fresh) assert.equal(orig.has(c), false);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/regenerate-recovery — when 2FA not enabled → 409", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/regenerate-recovery",
      headers: bearer(env.sessionToken)
    });
    assert.equal(res.statusCode, 409);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/2fa/regenerate-recovery — requires auth", async () => {
  const env = await setup2faApp();
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/2fa/regenerate-recovery"
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});
