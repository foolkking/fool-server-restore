/**
 * Tests for migrations.ts — specifically the one-shot fool→admin migration.
 *
 * Each test sets up a fresh runtime-db.json file in a temp dir. The runtime-store
 * module caches a singleton SafeJsonStore based on the env var at first use, so we
 * need to set the env var BEFORE first import. Using dynamic import with a
 * cache-buster query to get a fresh module per test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

async function runInTempDb(seed: unknown, work: (dbPath: string) => Promise<void>): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-mig-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");
  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  await fs.writeFile(dbPath, JSON.stringify(seed));

  // Cache-bust: import a fresh module instance.
  const modUrl = `../../migrations.js?ts=${Date.now()}_${Math.random()}`;
  const storeUrl = `../../runtime-store.js?ts=${Date.now()}_${Math.random()}`;
  // Reset the singleton inside runtime-store by reimporting it FIRST.
  await import(storeUrl);
  const { runMigrations } = await import(modUrl);
  await (runMigrations as () => Promise<void>)();

  try {
    await work(dbPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test("migrations: promotes existing fool user to admin (case-insensitive)", async () => {
  const seed = {
    schemaVersion: "0.3.0",
    users: [
      { id: "u1", name: "Fool", email: "fool@example.com", passwordHash: "x", passwordSalt: "y", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "u2", name: "alice", email: "alice@example.com", passwordHash: "x", passwordSalt: "y", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "u3", name: "fool", email: "fool2@example.com", passwordHash: "x", passwordSalt: "y", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "u4", name: "FoolBird", email: "foolbird@example.com", passwordHash: "x", passwordSalt: "y", role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await runInTempDb(seed, async (dbPath) => {
    const after = JSON.parse(await fs.readFile(dbPath, "utf8"));
    const byName = (n: string) => after.users.find((u: { name: string; role: string }) => u.name === n);

    assert.equal(byName("Fool").role, "admin", "Capitalized 'Fool' should be promoted (case-insensitive)");
    assert.equal(byName("fool").role, "admin", "Lowercase 'fool' should be promoted");
    assert.equal(byName("alice").role, "user", "alice should remain user");
    assert.equal(byName("FoolBird").role, "user", "Names that merely contain 'fool' should NOT be promoted");
  });
});

test("migrations: leaves already-admin fool alone (idempotent)", async () => {
  const seed = {
    schemaVersion: "0.3.0",
    users: [
      { id: "u1", name: "fool", email: "fool@example.com", passwordHash: "x", passwordSalt: "y", role: "admin", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await runInTempDb(seed, async (dbPath) => {
    const after = JSON.parse(await fs.readFile(dbPath, "utf8"));
    assert.equal(after.users[0].role, "admin");
    // updatedAt should NOT change because the user was already admin
    assert.equal(after.users[0].updatedAt, "2026-01-01T00:00:00Z");
  });
});
