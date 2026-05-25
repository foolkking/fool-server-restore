import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface TestEnv {
  tmpDir: string;
  dbPath: string;
  cleanup: () => Promise<void>;
}

async function setupEnv(): Promise<TestEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-subsystems-test-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");
  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  process.env.NODE_ENV = "development";

  const initial = {
    schemaVersion: "0.4.0",
    users: [
      {
        id: "u_active_1",
        name: "Alice Smith",
        email: "alice@example.com",
        username: "alice",
        displayName: "Alice Smith",
        role: "user",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z"
      },
      {
        id: "u_admin",
        name: "Admin User",
        email: "admin@example.com",
        username: "admin",
        role: "admin",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z"
      }
    ],
    sessions: [],
    connections: [],
    userProfiles: []
  };

  await fs.writeFile(dbPath, JSON.stringify(initial));

  const { _resetStoreForTests } = await import("../../runtime-store.js");
  const { _resetSqliteDbForTests } = await import("../../db-sqlite.js");
  _resetStoreForTests();
  await _resetSqliteDbForTests();

  return {
    tmpDir,
    dbPath,
    cleanup: async () => {
      await _resetSqliteDbForTests();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
}

test("subsystems: SQLiteQueueProvider guarantees at-least-once delivery with exponential backoff & DLQ", async () => {
  const env = await setupEnv();
  try {
    const { SQLiteQueueProvider } = await import("../../runtime-store.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    const queue = new SQLiteQueueProvider();
    
    // 1. Successful enqueuing and processing
    const id1 = await queue.enqueue("u_active_1", "email", { subject: "Hello" });
    assert.ok(id1);

    const db = await getSqliteDb();
    let row = await db.get("SELECT * FROM notification_queue WHERE id = ?", id1);
    assert.equal(row.status, "pending");
    assert.equal(row.attempts, 0);

    let processed1 = false;
    await queue.processNextBatch(10, async (item) => {
      assert.equal(item.id, id1);
      assert.equal(item.userId, "u_active_1");
      processed1 = true;
    });

    assert.ok(processed1);
    row = await db.get("SELECT * FROM notification_queue WHERE id = ?", id1);
    assert.equal(row.status, "sent");

    // 2. Errant delivery triggers retry state-machine and exponential backoff
    const id2 = await queue.enqueue("u_active_1", "email", { fail_me: true });
    
    await queue.processNextBatch(10, async (item) => {
      if (item.payload.includes("fail_me")) {
        throw new Error("SMTP server is offline (simulated)");
      }
    });

    row = await db.get("SELECT * FROM notification_queue WHERE id = ?", id2);
    assert.equal(row.status, "retry");
    assert.equal(row.attempts, 1);
    assert.ok(row.last_error.includes("simulated"));

    // 3. Sequential failures escalate to Dead-Letter Queue (DLQ)
    for (let i = 2; i <= 5; i++) {
      await db.run("UPDATE notification_queue SET next_retry_at = ? WHERE id = ?", new Date(0).toISOString(), id2);
      await queue.processNextBatch(10, async (item) => {
        if (item.payload.includes("fail_me")) {
          throw new Error("SMTP server is offline (simulated)");
        }
      });
    }

    row = await db.get("SELECT * FROM notification_queue WHERE id = ?", id2);
    assert.equal(row.status, "dead_letter");
    assert.equal(row.attempts, 5);
  } finally {
    await env.cleanup();
  }
});

test("subsystems: SQLiteInboxRepository stores, lists, reads, and deletes paginated in-app inbox messages", async () => {
  const env = await setupEnv();
  try {
    const { addInboxMessage, getInboxMessages, markInboxMessageAsRead, deleteInboxMessage } = await import("../../runtime-store.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    // 1. Add and get paginated
    const m1 = await addInboxMessage("u_active_1", "Welcome", "Welcome to EnvForge!");
    const m2 = await addInboxMessage("u_active_1", "System Alert", "Disk space is low");
    
    assert.ok(m1.id);
    assert.equal(m1.isRead, false);

    let list = await getInboxMessages("u_active_1", 1);
    assert.equal(list.messages.length, 1);
    assert.equal(list.messages[0].title, "System Alert"); // LIFO (newest first)
    assert.ok(list.nextCursor);

    // Keyset pagination next page (because LIFO and exactly 2 messages exist, limit=1 fetches the remaining message)
    list = await getInboxMessages("u_active_1", 1, list.nextCursor.createdAt, list.nextCursor.id);
    assert.equal(list.messages.length, 1);
    assert.equal(list.messages[0].title, "Welcome");
    assert.ok(list.nextCursor);

    // Keyset pagination page 3 (should be empty since no more items remain)
    list = await getInboxMessages("u_active_1", 1, list.nextCursor.createdAt, list.nextCursor.id);
    assert.equal(list.messages.length, 0);
    assert.equal(list.nextCursor, undefined);

    // 2. Mark as read
    await markInboxMessageAsRead(m1.id, "u_active_1");
    list = await getInboxMessages("u_active_1");
    const WelcomeMsg = list.messages.find((m) => m.id === m1.id);
    assert.ok(WelcomeMsg);
    assert.equal(WelcomeMsg.isRead, true);

    // 3. Delete inbox message
    await deleteInboxMessage(m1.id, "u_active_1");
    list = await getInboxMessages("u_active_1");
    assert.equal(list.messages.length, 1);
    assert.equal(list.messages.some((m) => m.id === m1.id), false);
  } finally {
    await env.cleanup();
  }
});

test("subsystems: admin_audit_logs write log and enforces strict immutability trigger constraints", async () => {
  const env = await setupEnv();
  try {
    const { writeAdminAuditLog } = await import("../../runtime-store.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    await writeAdminAuditLog("u_admin", "playbook_execute", "pb_1", null, "success", "Fired scheduled");

    const db = await getSqliteDb();
    const row = await db.get("SELECT * FROM admin_audit_logs");
    assert.ok(row);
    assert.equal(row.admin_id, "u_admin");
    assert.equal(row.action, "playbook_execute");

    // Immutability Check: UPDATE triggers reject modification
    await assert.rejects(
      async () => {
        await db.run("UPDATE admin_audit_logs SET action = 'tampered' WHERE id = ?", row.id);
      },
      (err: Error) => err.message.includes("immutable append-only log")
    );

    // Immutability Check: DELETE triggers reject deletion
    await assert.rejects(
      async () => {
        await db.run("DELETE FROM admin_audit_logs WHERE id = ?", row.id);
      },
      (err: Error) => err.message.includes("immutable append-only log")
    );
  } finally {
    await env.cleanup();
  }
});

test("subsystems: BackgroundTaskScheduler executes WorkersTick and records telemetries in background_tasks table", async () => {
  const env = await setupEnv();
  try {
    const { runWorkersTick } = await import("../../scheduler.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    // Deterministically execute the workers tick and await its completion to avoid background setInterval race conditions and unlinking EBUSY file locks
    await runWorkersTick();

    const db = await getSqliteDb();
    
    // Verify FTS and notifications workers executed and logged telemetries
    const ftsTask = await db.get("SELECT * FROM background_tasks WHERE name = 'fts_sync'");
    assert.ok(ftsTask);
    assert.equal(ftsTask.status, "success");
    assert.ok(ftsTask.duration_ms >= 0);
    assert.ok(ftsTask.last_run_at);

    const notifTask = await db.get("SELECT * FROM background_tasks WHERE name = 'notifications_worker'");
    assert.ok(notifTask);
    assert.equal(notifTask.status, "success");
    assert.ok(notifTask.duration_ms >= 0);
    assert.ok(notifTask.last_run_at);
  } finally {
    await env.cleanup();
  }
});
