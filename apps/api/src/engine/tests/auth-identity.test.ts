/**
 * P1.7 — auth/identity.ts integration tests.
 *
 * Each test:
 *   1. Sets a fresh FOOL_RUNTIME_DB to a temp file
 *   2. Calls _resetStoreForTests() so the runtime-store singleton picks up
 *      the new path on next read/write
 *   3. Exercises findOrCreateFromOAuth / linkIdentityToUser / unlinkIdentity
 *      through their public API and asserts on the resulting DB state
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { _resetStoreForTests } from "../../runtime-store.js";
import {
  findOrCreateFromOAuth,
  linkIdentityToUser,
  unlinkIdentity,
  listIdentities,
  EmailConflictError,
  IdentityAlreadyLinkedError,
  LastLoginMethodError
} from "../../auth/identity.js";

interface TestEnv {
  dbPath: string;
  tmpDir: string;
  cleanup: () => Promise<void>;
}

async function setupTempDb(seedExtra?: Record<string, unknown>): Promise<TestEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-identity-"));
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
  delete process.env.ENVFORGE_ADMIN_EMAILS;
  _resetStoreForTests();
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

// ── findOrCreateFromOAuth ──────────────────────────────────────────────────

test("identity: brand-new oauth login creates user + identity (no email collision)", async () => {
  const env = await setupTempDb();
  try {
    const result = await findOrCreateFromOAuth({
      provider: "github",
      providerUserId: "12345",
      email: "alice@example.com",
      profile: {
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        displayName: "Alice Smith",
        login: "alicesmith"
      }
    });
    assert.equal(result.created, true);
    assert.equal(result.user.email, "alice@example.com");
    assert.equal(result.user.displayName, "Alice Smith");
    assert.equal(result.user.username, "alicesmith");
    assert.equal(result.user.role, "user");
    assert.ok(result.user.emailVerifiedAt, "OAuth-verified email gets timestamp");
    assert.equal(result.user.passwordHash, undefined, "OAuth-only user has no password");
    assert.equal(result.identity.provider, "github");
    assert.equal(result.identity.providerUserId, "12345");

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 1);
    assert.equal(after.identities.length, 1);
  } finally {
    await env.cleanup();
  }
});

test("identity: returning oauth user → returns existing user, no new row", async () => {
  const env = await setupTempDb();
  try {
    // First call creates
    const r1 = await findOrCreateFromOAuth({
      provider: "github",
      providerUserId: "12345",
      email: "bob@example.com",
      profile: { login: "bob" }
    });
    assert.equal(r1.created, true);

    // Second call (same providerUserId) returns existing
    const r2 = await findOrCreateFromOAuth({
      provider: "github",
      providerUserId: "12345",
      email: "bob@example.com",
      profile: { login: "bob", displayName: "Bob Updated" }
    });
    assert.equal(r2.created, false);
    assert.equal(r2.user.id, r1.user.id);

    // lastUsedAt + providerData get refreshed
    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 1, "no extra user");
    assert.equal(after.identities.length, 1, "no extra identity");
    assert.ok(after.identities[0].lastUsedAt);
    assert.equal(after.identities[0].providerData.displayName, "Bob Updated");
  } finally {
    await env.cleanup();
  }
});

test("identity: oauth login with email already used by local account → EmailConflictError", async () => {
  const env = await setupTempDb({
    users: [
      {
        id: "u_local",
        name: "Charlie",
        email: "charlie@example.com",
        username: "charlie",
        passwordHash: "h",
        passwordSalt: "s",
        role: "user",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      }
    ]
  });
  try {
    await assert.rejects(
      findOrCreateFromOAuth({
        provider: "github",
        providerUserId: "9999",
        email: "charlie@example.com",
        profile: { login: "charliedev" }
      }),
      EmailConflictError
    );

    // No user / identity should be created
    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.users.length, 1);
    assert.equal(after.identities.length, 0);
  } finally {
    await env.cleanup();
  }
});

test("identity: oauth without email → no collision check, creates user with placeholder email", async () => {
  const env = await setupTempDb();
  try {
    const result = await findOrCreateFromOAuth({
      provider: "github",
      providerUserId: "555",
      email: undefined, // user hides email
      profile: { login: "ghosted" }
    });
    assert.equal(result.created, true);
    assert.match(result.user.email, /@no-email\.envforge\.local$/);
    assert.equal(result.user.emailVerifiedAt, undefined, "no email = no verified timestamp");
  } finally {
    await env.cleanup();
  }
});

test("identity: oauth user matching admin allow-list email gets role=admin", async () => {
  const env = await setupTempDb();
  process.env.ENVFORGE_ADMIN_EMAILS = "ops@example.com";
  try {
    const result = await findOrCreateFromOAuth({
      provider: "github",
      providerUserId: "777",
      email: "ops@example.com",
      profile: { login: "opsbot" }
    });
    assert.equal(result.user.role, "admin");
  } finally {
    await env.cleanup();
  }
});

test("identity: avatarUrl with non-https scheme is dropped", async () => {
  const env = await setupTempDb();
  try {
    const result = await findOrCreateFromOAuth({
      provider: "github",
      providerUserId: "888",
      email: "dave@example.com",
      profile: {
        avatarUrl: "javascript:alert('xss')",
        login: "dave"
      }
    });
    assert.equal(result.user.avatarUrl, undefined);
  } finally {
    await env.cleanup();
  }
});

// ── linkIdentityToUser ─────────────────────────────────────────────────────

test("identity: link new provider to existing user", async () => {
  const env = await setupTempDb({
    users: [
      {
        id: "u_local",
        name: "Eve",
        email: "eve@example.com",
        username: "eve",
        passwordHash: "h",
        passwordSalt: "s",
        role: "user",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      }
    ],
    identities: [
      {
        id: "ident_local",
        userId: "u_local",
        provider: "local",
        providerUserId: "u_local",
        providerEmail: "eve@example.com",
        createdAt: "2026-01-01T00:00:00Z"
      }
    ]
  });
  try {
    const ident = await linkIdentityToUser("u_local", {
      provider: "github",
      providerUserId: "111",
      email: "eve@example.com",
      profile: { login: "evegithub" }
    });
    assert.equal(ident.userId, "u_local");
    assert.equal(ident.provider, "github");

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    const eveIdents = after.identities.filter((i: { userId: string }) => i.userId === "u_local");
    assert.equal(eveIdents.length, 2, "local + github now linked");
  } finally {
    await env.cleanup();
  }
});

test("identity: link rejects when same github account already linked to a different user", async () => {
  const env = await setupTempDb({
    users: [
      { id: "u1", name: "User One", email: "one@example.com", username: "one", passwordHash: "h", passwordSalt: "s", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "u2", name: "User Two", email: "two@example.com", username: "two", passwordHash: "h", passwordSalt: "s", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
    ],
    identities: [
      { id: "ident_u1_gh", userId: "u1", provider: "github", providerUserId: "shared-gh-id", createdAt: "2026-01-01T00:00:00Z" }
    ]
  });
  try {
    await assert.rejects(
      linkIdentityToUser("u2", {
        provider: "github",
        providerUserId: "shared-gh-id",
        profile: { login: "shared" }
      }),
      IdentityAlreadyLinkedError
    );
  } finally {
    await env.cleanup();
  }
});

test("identity: link is idempotent — same user calling twice refreshes profile only", async () => {
  const env = await setupTempDb({
    users: [{ id: "u1", name: "Frank", email: "frank@example.com", username: "frank", passwordHash: "h", passwordSalt: "s", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }]
  });
  try {
    const r1 = await linkIdentityToUser("u1", {
      provider: "github",
      providerUserId: "222",
      profile: { login: "frank-old" }
    });
    const r2 = await linkIdentityToUser("u1", {
      provider: "github",
      providerUserId: "222",
      profile: { login: "frank-renamed" }
    });
    assert.equal(r1.id, r2.id, "same identity row");

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.identities.length, 1);
    assert.equal(after.identities[0].providerData.login, "frank-renamed");
  } finally {
    await env.cleanup();
  }
});

// ── unlinkIdentity ─────────────────────────────────────────────────────────

test("identity: unlink github when local password is also set → ok", async () => {
  const env = await setupTempDb({
    users: [{ id: "u1", name: "Grace", email: "grace@example.com", username: "grace", passwordHash: "h", passwordSalt: "s", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    identities: [
      { id: "ident_local", userId: "u1", provider: "local", providerUserId: "u1", createdAt: "2026-01-01T00:00:00Z" },
      { id: "ident_gh", userId: "u1", provider: "github", providerUserId: "333", createdAt: "2026-01-02T00:00:00Z" }
    ]
  });
  try {
    await unlinkIdentity("u1", "github");
    const idents = await listIdentities("u1");
    assert.equal(idents.length, 1);
    assert.equal(idents[0].provider, "local");
  } finally {
    await env.cleanup();
  }
});

test("identity: unlink the LAST login method → LastLoginMethodError", async () => {
  // OAuth-only user (no passwordHash) with a single github identity
  const env = await setupTempDb({
    users: [{ id: "u1", name: "Henry", email: "henry@example.com", username: "henry", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    identities: [
      { id: "ident_gh", userId: "u1", provider: "github", providerUserId: "444", createdAt: "2026-01-01T00:00:00Z" }
    ]
  });
  try {
    await assert.rejects(unlinkIdentity("u1", "github"), LastLoginMethodError);
    const idents = await listIdentities("u1");
    assert.equal(idents.length, 1, "identity not removed");
  } finally {
    await env.cleanup();
  }
});

test("identity: unlink nonexistent provider is a no-op", async () => {
  const env = await setupTempDb({
    users: [{ id: "u1", name: "Iris", email: "iris@example.com", username: "iris", passwordHash: "h", passwordSalt: "s", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    identities: [{ id: "ident_local", userId: "u1", provider: "local", providerUserId: "u1", createdAt: "2026-01-01T00:00:00Z" }]
  });
  try {
    // No-op: user has no github identity
    await unlinkIdentity("u1", "github");
    const idents = await listIdentities("u1");
    assert.equal(idents.length, 1);
  } finally {
    await env.cleanup();
  }
});

test("identity: listIdentities returns only entries for the given user", async () => {
  const env = await setupTempDb({
    users: [
      { id: "u1", name: "X", email: "x@example.com", username: "x", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "u2", name: "Y", email: "y@example.com", username: "y", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
    ],
    identities: [
      { id: "i1", userId: "u1", provider: "github", providerUserId: "1", createdAt: "2026-01-01T00:00:00Z" },
      { id: "i2", userId: "u2", provider: "github", providerUserId: "2", createdAt: "2026-01-01T00:00:00Z" },
      { id: "i3", userId: "u1", provider: "google", providerUserId: "3", createdAt: "2026-01-01T00:00:00Z" }
    ]
  });
  try {
    const u1 = await listIdentities("u1");
    assert.equal(u1.length, 2);
    assert.deepEqual(new Set(u1.map((i) => i.provider)), new Set(["github", "google"]));
    const u2 = await listIdentities("u2");
    assert.equal(u2.length, 1);
  } finally {
    await env.cleanup();
  }
});

// ── P1.8 — virtual "local" entry when passwordHash is set ─────────────────
//
// The /api/me/identities route surfaces a virtual `local` entry when the user
// has a passwordHash but no explicit `provider="local"` row in identities[]
// (which can happen for users created BEFORE migration 0004 ran, or with
// the legacy single-step register before P1.5). Verify the behavior here:
// listIdentities returns only the persisted rows; the virtual injection lives
// in routes.ts but is small and well-scoped.

test("identity: user with passwordHash and no local row → listIdentities returns empty (route layer adds virtual)", async () => {
  const env = await setupTempDb({
    users: [{
      id: "u_legacy",
      name: "Legacy",
      email: "legacy@example.com",
      username: "legacy",
      passwordHash: "h",
      passwordSalt: "s",
      role: "user",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }]
    // No identities[] entries — represents a pre-migration legacy user
  });
  try {
    const idents = await listIdentities("u_legacy");
    // Persisted identities is empty; routes.ts /api/me/identities synthesizes
    // a virtual "local" entry from user.passwordHash for the UI. That synthesis
    // is in the route handler so we don't double-test it here.
    assert.equal(idents.length, 0, "raw store has no rows");
  } finally {
    await env.cleanup();
  }
});
