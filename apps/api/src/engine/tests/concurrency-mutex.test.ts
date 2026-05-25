import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

async function runWithFreshStore<T>(
  seed: unknown,
  work: (mod: typeof import("../../runtime-store.js"), dbPath: string) => Promise<T>
): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-mutex-test-"));
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

test("db-mutex: concurrent updates are serialized and no updates are lost", async () => {
  const initial = {
    schemaVersion: "0.3.0",
    users: [
      {
        id: "u_1",
        name: "test-user",
        email: "test@example.com",
        role: "user",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z"
      }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await runWithFreshStore(initial, async (mod) => {
    // We launch 5 parallel updates to connections (adding elements to the array).
    // Each update will asynchronously sleep for 30ms before finishing, simulating network/DB latency.
    // If there is no Mutex lock, the parallel reads will overlap, and some writes will overwrite others,
    // resulting in fewer than 5 connections.
    // If the Mutex lock is working, they will execute strictly sequentially, resulting in exactly 5 connections.
    const promises = Array.from({ length: 5 }).map((_, index) => {
      return mod.updateRuntimeDatabase(async (db) => {
        // Sleep to ensure overlap if lock is absent
        await new Promise((resolve) => setTimeout(resolve, 30));
        db.connections.push({
          id: `conn_${index}`,
          userId: "u_1",
          method: "ssh-password",
          label: `Connection ${index}`,
          status: "validated",
          fields: {},
          maskedSecrets: [],
          realConnection: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
    });

    await Promise.all(promises);

    const finalDb = await mod.readRuntimeDatabase();
    assert.equal(finalDb.connections.length, 5, "All 5 concurrent updates must succeed without any loss");
    const ids = finalDb.connections.map((c) => c.id).sort();
    assert.deepEqual(ids, ["conn_0", "conn_1", "conn_2", "conn_3", "conn_4"]);
  });
});
