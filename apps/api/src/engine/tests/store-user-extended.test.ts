/**
 * P1.1 — verify the extended StoredUser schema and new UserIdentity / identities[]
 * collection survive normalization without losing data.
 *
 * Specifically guarantees:
 *   - Reading a legacy 0.3.0 db (no identities, no profile fields) does not throw
 *     and fills `identities = []` so callers can rely on Array methods.
 *   - All new optional fields round-trip through write → read → re-read.
 *   - OAuth-only accounts (no passwordHash) are a valid shape after the type change.
 *   - Soft-delete marker (deletedAt) survives round-trip.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * Same trick as migrations.test.ts: each test sets FOOL_RUNTIME_DB to a fresh
 * temp file BEFORE importing runtime-store, then cache-busts the import so the
 * singleton SafeJsonStore picks up the new path.
 */
async function runWithFreshStore<T>(
  seed: unknown,
  work: (mod: typeof import("../../runtime-store.js"), dbPath: string) => Promise<T>
): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-store-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");
  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  await fs.writeFile(dbPath, JSON.stringify(seed));

  const storeUrl = `../../runtime-store.js?ts=${Date.now()}_${Math.random()}`;
  const mod = await import(storeUrl) as typeof import("../../runtime-store.js");

  try {
    return await work(mod, dbPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test("store-user: legacy 0.3.0 db reads without identities[] and normalizer fills empty array", async () => {
  const legacy = {
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u_legacy",
        name: "alice",
        email: "alice@example.com",
        passwordHash: "h",
        passwordSalt: "s",
        role: "user",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z"
      }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
    // NOTE: no `identities` field — pre-spec shape
  };

  await runWithFreshStore(legacy, async (mod) => {
    const db = await mod.readRuntimeDatabase();
    assert.equal(db.schemaVersion, "0.3.0");
    assert.equal(db.users.length, 1);
    assert.deepEqual(db.identities, [], "normalizer should default missing identities to []");
    assert.equal(db.users[0].name, "alice");
    // Legacy users won't have profile fields yet; that's fine, they're optional.
    assert.equal(db.users[0].username, undefined);
    assert.equal(db.users[0].displayName, undefined);
  });
});

test("store-user: extended user fields round-trip through write+read", async () => {
  const extended = {
    schemaVersion: "0.4.0",
    users: [
      {
        id: "u_ext",
        name: "bob",
        email: "bob@example.com",
        username: "bob_handle",
        displayName: "Bob the Builder",
        bio: "I build things.",
        avatarUrl: "https://example.com/bob.png",
        timezone: "Europe/Berlin",
        locale: "en-US",
        emailVerifiedAt: "2026-05-15T12:00:00Z",
        passwordHash: "h",
        passwordSalt: "s",
        role: "admin",
        totpEnabledAt: "2026-05-20T08:00:00Z",
        totpSecretEnc: "ciphertext-blob",
        totpRecoveryCodesHashed: ["sha256-1", "sha256-2"],
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-20T08:00:00Z"
      }
    ],
    identities: [
      {
        id: "ident_1",
        userId: "u_ext",
        provider: "local",
        providerUserId: "u_ext",
        providerEmail: "bob@example.com",
        createdAt: "2026-05-01T00:00:00Z"
      },
      {
        id: "ident_2",
        userId: "u_ext",
        provider: "github",
        providerUserId: "12345678",
        providerEmail: "bob@example.com",
        providerData: {
          avatarUrl: "https://avatars.githubusercontent.com/u/12345678",
          login: "bobthebuilder",
          displayName: "Bob the Builder"
        },
        createdAt: "2026-05-10T00:00:00Z",
        lastUsedAt: "2026-05-20T07:55:00Z"
      }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await runWithFreshStore(extended, async (mod) => {
    const db = await mod.readRuntimeDatabase();
    const user = db.users[0];
    assert.equal(user.username, "bob_handle");
    assert.equal(user.displayName, "Bob the Builder");
    assert.equal(user.bio, "I build things.");
    assert.equal(user.avatarUrl, "https://example.com/bob.png");
    assert.equal(user.timezone, "Europe/Berlin");
    assert.equal(user.locale, "en-US");
    assert.equal(user.emailVerifiedAt, "2026-05-15T12:00:00Z");
    assert.equal(user.totpEnabledAt, "2026-05-20T08:00:00Z");
    assert.equal(user.totpSecretEnc, "ciphertext-blob");
    assert.deepEqual(user.totpRecoveryCodesHashed, ["sha256-1", "sha256-2"]);
    assert.equal(user.role, "admin");

    assert.equal(db.identities!.length, 2);
    const githubIdent = db.identities!.find((i) => i.provider === "github");
    assert.ok(githubIdent);
    assert.equal(githubIdent!.providerUserId, "12345678");
    assert.equal(githubIdent!.providerData?.login, "bobthebuilder");
    assert.equal(githubIdent!.lastUsedAt, "2026-05-20T07:55:00Z");

    // Now mutate something and write back, then re-read to confirm round-trip.
    await mod.updateRuntimeDatabase((d) => {
      d.users[0].bio = "Updated bio";
      d.identities!.push({
        id: "ident_3",
        userId: "u_ext",
        provider: "google",
        providerUserId: "google-sub-abc",
        createdAt: "2026-05-23T00:00:00Z"
      });
    });
    const db2 = await mod.readRuntimeDatabase();
    assert.equal(db2.users[0].bio, "Updated bio");
    assert.equal(db2.identities!.length, 3);
    assert.ok(db2.identities!.some((i) => i.provider === "google"));
  });
});

test("store-user: oauth-only user (no passwordHash) survives normalization", async () => {
  const oauthOnly = {
    schemaVersion: "0.4.0",
    users: [
      {
        id: "u_oauth",
        name: "charlie",
        email: "charlie@example.com",
        username: "charlie",
        displayName: "Charlie Chaplin",
        // passwordHash + passwordSalt deliberately absent
        role: "user",
        createdAt: "2026-05-22T00:00:00Z",
        updatedAt: "2026-05-22T00:00:00Z"
      }
    ],
    identities: [
      {
        id: "ident_oauth",
        userId: "u_oauth",
        provider: "github",
        providerUserId: "999",
        createdAt: "2026-05-22T00:00:00Z"
      }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await runWithFreshStore(oauthOnly, async (mod) => {
    const db = await mod.readRuntimeDatabase();
    const u = db.users[0];
    assert.equal(u.passwordHash, undefined, "OAuth-only user has no password hash");
    assert.equal(u.passwordSalt, undefined);
    assert.equal(db.identities!.length, 1);
    assert.equal(db.identities![0].provider, "github");
  });
});

test("store-user: soft-deleted user keeps deletedAt timestamp through round-trip", async () => {
  const soft = {
    schemaVersion: "0.4.0",
    users: [
      {
        id: "u_dead",
        name: "dave",
        email: "dave@example.com",
        username: "dave_old",
        displayName: "Dave",
        passwordHash: "h",
        passwordSalt: "s",
        role: "user",
        deletedAt: "2026-05-21T10:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-05-21T10:00:00Z"
      }
    ],
    identities: [],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await runWithFreshStore(soft, async (mod) => {
    const db = await mod.readRuntimeDatabase();
    assert.equal(db.users[0].deletedAt, "2026-05-21T10:00:00Z");
  });
});
