/**
 * P1.5 — two-step registration flow integration test.
 *
 * Each test:
 *   1. Creates a temp data dir and sets FOOL_RUNTIME_DB / FOOL_DATA_DIR
 *   2. Calls _resetStoreForTests() to drop the runtime-store singleton so it
 *      picks up the new env on next read
 *   3. Exercises startRegistration / verifyRegistration via the canonical
 *      module imports (no cache-busting — that breaks because local.ts's bare
 *      `import "./runtime-store.js"` resolves to a *different* URL than a
 *      cache-busted query-string import would)
 *   4. Cleans up env vars + temp dir
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { _resetStoreForTests } from "../../runtime-store.js";
import { startRegistration, verifyRegistration } from "../../auth/local.js";
import { resetEmailTransportForTests, resetEmailQueueForTests, waitForEmailQueueDrain } from "../../email/index.js";

interface TestEnv {
  dbPath: string;
  tmpDir: string;
  cleanup: () => Promise<void>;
}

async function setupTempDb(seedExtra?: Record<string, unknown>): Promise<TestEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-auth-reg-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");

  const seed = {
    schemaVersion: "0.4.0",
    users: [],
    identities: [],
    sessions: [],
    connections: [],
    userProfiles: [],
    ...(seedExtra ?? {})
  };
  await fs.writeFile(dbPath, JSON.stringify(seed));

  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  process.env.NODE_ENV = "development"; // expose devCode in API response
  process.env.PUBLIC_BASE_URL = "https://envforge.test";
  // Force SMTP off — even if .env has Gmail credentials configured for prod use,
  // the test must NOT make real SMTP calls. Set to empty string (not delete)
  // because loadEnvFile() in config.ts reloads from disk when process.env[key]
  // is undefined; empty string blocks that.
  process.env.SMTP_HOST = "";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.SMTP_FROM = "";
  delete process.env.ENVFORGE_ADMIN_EMAILS;

  // Re-init singletons against the new env.
  _resetStoreForTests();
  resetEmailTransportForTests();
  resetEmailQueueForTests();

  return {
    dbPath,
    tmpDir,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
      delete process.env.FOOL_RUNTIME_DB;
      delete process.env.FOOL_DATA_DIR;
      delete process.env.ENVFORGE_ADMIN_EMAILS;
    }
  };
}

// Suppress stdout-fallback noise from the email queue
const origLog = console.log;
const origWarn = console.warn;
function silence(): void {
  console.log = () => {};
  console.warn = () => {};
}
function restore(): void {
  console.log = origLog;
  console.warn = origWarn;
}

/**
 * Helper to call startRegistration and wait for the email queue's
 * fire-and-forget writes (emailLog entries) to drain. Without this, a
 * subsequent verifyRegistration call may read a stale runtime-store cache
 * mid-write and not find the pending registration row.
 */
async function startAndDrain(input: { name: string; email: string; password: string }): Promise<{ pendingId: string; devCode: string }> {
  const r = await startRegistration(input);
  await waitForEmailQueueDrain(2000);
  return { pendingId: r.pendingId, devCode: r.devCode! };
}

test("register: happy path — start returns pendingId+devCode, verify creates user", async () => {
  const env = await setupTempDb();
  silence();
  try {
    const start = await startAndDrain({
      name: "Alice",
      email: "alice@example.com",
      password: "secure-pass-1"
    });
    assert.ok(start.pendingId);
    assert.match(start.pendingId, /^pendreg_/);
    assert.ok(start.devCode, "devCode should be exposed in non-production");
    assert.match(start.devCode, /^\d{6}$/);

    const verified = await verifyRegistration({
      pendingId: start.pendingId,
      code: start.devCode
    });
    assert.ok(verified.token, "verify should return a session token");
    assert.equal(verified.user.email, "alice@example.com");
    assert.equal(verified.user.name, "Alice");
    assert.equal(verified.user.role, "user");

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 1);
    assert.equal(after.users[0].email, "alice@example.com");
    assert.ok(after.users[0].emailVerifiedAt, "emailVerifiedAt set on registration");
    assert.equal(after.sessions.length, 1);
    assert.equal(after.sessions[0].userId, after.users[0].id);
    assert.equal((after.pendingRegistrations ?? []).length, 0);
    assert.equal(after.emailVerifCodes.length, 1);
    assert.ok(after.emailVerifCodes[0].usedAt);
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: wrong code → error, no user created", async () => {
  const env = await setupTempDb();
  silence();
  try {
    const start = await startAndDrain({
      name: "Bob",
      email: "bob@example.com",
      password: "secure-pass-2"
    });

    await assert.rejects(
      verifyRegistration({ pendingId: start.pendingId, code: "000000" }),
      /incorrect/i
    );

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 0);
    assert.equal(after.sessions.length, 0);
    assert.equal(after.pendingRegistrations.length, 1, "pending row preserved for retry");
    assert.equal(after.emailVerifCodes[0].attempts, 1);
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: 5 wrong attempts locks the code", async () => {
  const env = await setupTempDb();
  silence();
  try {
    const start = await startAndDrain({
      name: "Carol",
      email: "carol@example.com",
      password: "secure-pass-3"
    });

    // 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      await assert.rejects(
        verifyRegistration({ pendingId: start.pendingId, code: "000000" }),
        /incorrect|too many/i,
        `attempt ${i + 1} should reject`
      );
    }
    // 5th wrong attempt locks the code
    await assert.rejects(
      verifyRegistration({ pendingId: start.pendingId, code: "000000" }),
      /too many/i
    );

    // Even the correct code now fails
    await assert.rejects(
      verifyRegistration({ pendingId: start.pendingId, code: start.devCode }),
      /too many|already used|not found/i
    );

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 0);
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: replay → 'not found' on second verify with same pendingId", async () => {
  const env = await setupTempDb();
  silence();
  try {
    const start = await startAndDrain({
      name: "Dave",
      email: "dave@example.com",
      password: "secure-pass-4"
    });

    const r1 = await verifyRegistration({
      pendingId: start.pendingId,
      code: start.devCode
    });
    assert.ok(r1.token);

    // Second verify with same pendingId fails — pending row is gone
    await assert.rejects(
      verifyRegistration({ pendingId: start.pendingId, code: start.devCode }),
      /not found|completed/i
    );

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 1);
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: missing pendingId or non-numeric code → validation error", async () => {
  const env = await setupTempDb();
  silence();
  try {
    await assert.rejects(
      verifyRegistration({ pendingId: "", code: "123456" }),
      /pendingId is required/i
    );
    await assert.rejects(
      verifyRegistration({ pendingId: "pendreg_x", code: "abcdef" }),
      /must be 6 digits/i
    );
    await assert.rejects(
      verifyRegistration({ pendingId: "pendreg_x", code: "12345" }),
      /must be 6 digits/i
    );
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: duplicate email rejected at start (not verify)", async () => {
  const env = await setupTempDb({
    users: [
      {
        id: "u_existing",
        name: "Existing",
        email: "taken@example.com",
        passwordHash: "x",
        passwordSalt: "y",
        role: "user",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      }
    ]
  });
  silence();
  try {
    await assert.rejects(
      startRegistration({
        name: "Other",
        email: "taken@example.com",
        password: "anything-goes-1"
      }),
      /already registered/i
    );
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: starting twice with same email replaces old pending row", async () => {
  const env = await setupTempDb();
  silence();
  try {
    const r1 = await startAndDrain({
      name: "Eve",
      email: "eve@example.com",
      password: "secure-pass-5"
    });
    const r2 = await startAndDrain({
      name: "Eve Renamed",
      email: "eve@example.com",
      password: "secure-pass-6"
    });
    assert.notEqual(r1.pendingId, r2.pendingId);

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.pendingRegistrations.length, 1);
    assert.equal(after.pendingRegistrations[0].id, r2.pendingId);
    assert.equal(after.pendingRegistrations[0].name, "Eve Renamed");

    // r1 cannot be used (pending row gone)
    await assert.rejects(
      verifyRegistration({ pendingId: r1.pendingId, code: r1.devCode }),
      /not found|completed/i
    );

    // r2 happy path still works
    const verified = await verifyRegistration({
      pendingId: r2.pendingId,
      code: r2.devCode
    });
    assert.equal(verified.user.email, "eve@example.com");
    assert.equal(verified.user.name, "Eve Renamed");
  } finally {
    restore();
    await env.cleanup();
  }
});

test("register: admin-allow-list email gets role=admin on verify", async () => {
  const env = await setupTempDb();
  process.env.ENVFORGE_ADMIN_EMAILS = "ops@example.com";
  silence();
  try {
    const start = await startAndDrain({
      name: "Ops",
      email: "ops@example.com",
      password: "secure-pass-7"
    });
    const verified = await verifyRegistration({
      pendingId: start.pendingId,
      code: start.devCode
    });
    assert.equal(verified.user.role, "admin");
    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users[0].role, "admin");
  } finally {
    restore();
    await env.cleanup();
  }
});
