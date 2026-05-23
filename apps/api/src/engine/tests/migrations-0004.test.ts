/**
 * Tests for migration 0004 (multi-identity backfill).
 *
 * Tests exercise the pure `applyMigration0004` function against plain DB objects,
 * avoiding the runtime-store singleton trap (which pins to the first env-var path
 * on first read and ignores subsequent FOOL_RUNTIME_DB changes within a process).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  generateUniqueUsername,
  applyMigration0004
} from "../../migrations/0004-multi-identity.js";
import type { RuntimeDatabase } from "../../runtime-store.js";

/** Build a minimally valid RuntimeDatabase with the given users. */
function makeDb(partial: Partial<RuntimeDatabase> & { schemaVersion: string }): RuntimeDatabase {
  return {
    schemaVersion: partial.schemaVersion,
    users: partial.users ?? [],
    identities: partial.identities,
    sessions: partial.sessions ?? [],
    connections: partial.connections ?? [],
    userProfiles: partial.userProfiles ?? [],
    tasks: partial.tasks ?? [],
    playbooks: partial.playbooks ?? []
  };
}

// ── username generator unit tests ──────────────────────────────────────────

test("generateUniqueUsername: simple email local-part", () => {
  assert.equal(generateUniqueUsername("alice@example.com", new Set()), "alice");
});

test("generateUniqueUsername: lowercases input", () => {
  // Alice.B → "alice_b" because '.' is not in [a-z0-9_-]
  assert.equal(generateUniqueUsername("Alice.B@example.com", new Set()), "alice_b");
});

test("generateUniqueUsername: strips non-alphanumeric, collapses underscores", () => {
  assert.equal(generateUniqueUsername("john!!doe@example.com", new Set()), "john_doe");
});

test("generateUniqueUsername: collision gets _2 suffix", () => {
  const taken = new Set(["bob"]);
  assert.equal(generateUniqueUsername("bob@example.com", taken), "bob_2");
});

test("generateUniqueUsername: multiple collisions get _3, _4", () => {
  const taken = new Set(["bob", "bob_2", "bob_3"]);
  assert.equal(generateUniqueUsername("bob@example.com", taken), "bob_4");
});

test("generateUniqueUsername: empty local part falls back to user_<random>", () => {
  const u = generateUniqueUsername("@x.com", new Set());
  assert.match(u, /^user_[a-f0-9]{8}$/);
});

test("generateUniqueUsername: truncates very long local part to 32 chars", () => {
  const long = "a".repeat(50);
  const u = generateUniqueUsername(`${long}@example.com`, new Set());
  assert.equal(u.length, 32);
  assert.equal(u, "a".repeat(32));
});

// ── pure migration function tests ──────────────────────────────────────────

test("0004: legacy user gets local identity + username + displayName + schemaVersion bumps", () => {
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        passwordHash: "hash1",
        passwordSalt: "salt1",
        role: "user",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      }
    ]
  });

  const r = applyMigration0004(db);

  assert.equal(db.schemaVersion, "0.4.0");
  assert.equal(r.schemaVersionBumped, true);
  assert.equal(db.users[0].username, "alice");
  assert.equal(db.users[0].displayName, "Alice");
  assert.equal(db.identities!.length, 1);
  const ident = db.identities![0];
  assert.equal(ident.provider, "local");
  assert.equal(ident.userId, "u1");
  assert.equal(ident.providerUserId, "u1");
  assert.equal(ident.providerEmail, "alice@example.com");
  assert.equal(ident.createdAt, "2026-01-01T00:00:00Z");
});

test("0004: username collision when two users share email local-part", () => {
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u1", name: "Alice One", email: "alice@example.com",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
      },
      {
        id: "u2", name: "Alice Two", email: "alice@another.com",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z"
      },
      {
        id: "u3", name: "Alice Three", email: "alice@third.com",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z"
      }
    ]
  });

  applyMigration0004(db);
  const usernames = db.users.map((u) => u.username).sort();
  assert.deepEqual(usernames, ["alice", "alice_2", "alice_3"]);
});

test("0004: oauth-only user (no passwordHash) gets username but NO local identity", () => {
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u_oauth", name: "Charlie", email: "charlie@example.com",
        // passwordHash deliberately missing — represents an OAuth-only user
        role: "user",
        createdAt: "2026-05-22T00:00:00Z", updatedAt: "2026-05-22T00:00:00Z"
      }
    ],
    identities: [
      {
        id: "ident_existing",
        userId: "u_oauth",
        provider: "github",
        providerUserId: "9999",
        createdAt: "2026-05-22T00:00:00Z"
      }
    ]
  });

  applyMigration0004(db);

  assert.equal(db.users[0].username, "charlie");
  assert.equal(db.users[0].displayName, "Charlie");
  // identities still just the original github one — no local added
  assert.equal(db.identities!.length, 1);
  assert.equal(db.identities![0].provider, "github");
});

test("0004: idempotent — re-running on already-migrated 0.4.0 db is a no-op", () => {
  const db = makeDb({
    schemaVersion: "0.4.0",
    users: [
      {
        id: "u1", name: "Alice", email: "alice@example.com",
        username: "alice", displayName: "Alice",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
      }
    ],
    identities: [
      {
        id: "ident_pre",
        userId: "u1",
        provider: "local",
        providerUserId: "u1",
        providerEmail: "alice@example.com",
        createdAt: "2026-01-01T00:00:00Z"
      }
    ]
  });

  const r = applyMigration0004(db);

  assert.equal(r.identitiesCreated, 0);
  assert.equal(r.usernamesAssigned, 0);
  assert.equal(r.displayNamesAssigned, 0);
  assert.equal(r.schemaVersionBumped, false);
  assert.equal(db.identities!.length, 1);
  assert.equal(db.identities![0].id, "ident_pre");
  assert.equal(db.users[0].username, "alice");
  assert.equal(db.schemaVersion, "0.4.0");
});

test("0004: idempotent — running twice on 0.3.0 db gives same result as running once", () => {
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u1", name: "Alice", email: "alice@example.com",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
      }
    ]
  });

  const r1 = applyMigration0004(db);
  const r2 = applyMigration0004(db);

  // First run did the work
  assert.equal(r1.identitiesCreated, 1);
  assert.equal(r1.usernamesAssigned, 1);
  assert.equal(r1.schemaVersionBumped, true);

  // Second run is a no-op (version gate trips)
  assert.equal(r2.identitiesCreated, 0);
  assert.equal(r2.usernamesAssigned, 0);
  assert.equal(r2.schemaVersionBumped, false);

  // Final state has exactly one identity
  assert.equal(db.identities!.length, 1);
});

test("0004: respects already-set username (does not overwrite)", () => {
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u1", name: "Alice", email: "alice@example.com",
        username: "ali_custom",
        displayName: "Alice Custom",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
      }
    ]
  });

  applyMigration0004(db);

  assert.equal(db.users[0].username, "ali_custom", "pre-set username preserved");
  assert.equal(db.users[0].displayName, "Alice Custom", "pre-set displayName preserved");
  assert.equal(db.identities!.length, 1, "local identity still created");
});

test("0004: empty users[] still bumps schemaVersion to 0.4.0", () => {
  const db = makeDb({ schemaVersion: "0.3.0" });

  const r = applyMigration0004(db);

  assert.equal(db.schemaVersion, "0.4.0");
  assert.equal(r.schemaVersionBumped, true);
  assert.deepEqual(db.identities, []);
});

test("0004: user without name and without displayName gets no displayName but does get username", () => {
  // Edge case: legacy user with empty `name` field. Should still pick up a username
  // from their email but skip displayName backfill.
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u1", name: "", email: "blank@example.com",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
      }
    ]
  });

  applyMigration0004(db);

  assert.equal(db.users[0].username, "blank");
  assert.equal(db.users[0].displayName, undefined);
});

test("0004: collision against pre-existing username (not from this migration run)", () => {
  // User u1 already had username "bob" set manually; user u2 has email bob@x.com.
  // u2 should land on "bob_2".
  const db = makeDb({
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u1", name: "Bob One", email: "different@x.com", username: "bob",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
      },
      {
        id: "u2", name: "Bob Two", email: "bob@example.com",
        passwordHash: "h", passwordSalt: "s", role: "user",
        createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z"
      }
    ]
  });

  applyMigration0004(db);

  assert.equal(db.users[0].username, "bob"); // unchanged
  assert.equal(db.users[1].username, "bob_2"); // collision avoided
});
