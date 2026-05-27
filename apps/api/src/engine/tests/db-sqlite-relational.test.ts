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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-relational-test-"));
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
        id: "u_active_2",
        name: "Bob Jones",
        email: "bob@example.com",
        username: "bob",
        displayName: "Bob Jones",
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

test("relational-comments: addComment HTML escapes content and adds FTS sync task", async () => {
  const env = await setupEnv();
  try {
    const { addComment, getComments } = await import("../../runtime-store.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    const content = "Hello! <script>alert('xss')</script> & enjoy.";
    const comment = await addComment("cat_1", "u_active_1", content);

    assert.ok(comment.id);
    assert.equal(comment.catalogId, "cat_1");
    assert.equal(comment.userId, "u_active_1");
    assert.equal(comment.username, "alice");
    assert.equal(comment.displayName, "Alice Smith");
    // Standard HTML entities are escaped securely
    assert.equal(comment.content, "Hello! &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt; &amp; enjoy.");

    const db = await getSqliteDb();
    
    // Verify SQLite relational table records
    const row = await db.get("SELECT * FROM catalog_comments WHERE id = ?", comment.id);
    assert.ok(row);
    assert.equal(row.catalog_id, "cat_1");
    assert.equal(row.content, comment.content);

    // Verify FTS Queue record is created as 'pending'
    const queueRow = await db.get("SELECT * FROM fts_sync_queue WHERE comment_id = ?", comment.id);
    assert.ok(queueRow);
    assert.equal(queueRow.status, "pending");
    assert.equal(queueRow.attempts, 0);
  } finally {
    await env.cleanup();
  }
});

test("relational-comments: toggleCommentLike tracks counts and personal liked status", async () => {
  const env = await setupEnv();
  try {
    const { addComment, toggleCommentLike, getComments } = await import("../../runtime-store.js");

    const comment = await addComment("cat_1", "u_active_1", "Comment to like");

    // Bob likes it
    let res = await toggleCommentLike(comment.id, "u_active_2");
    assert.equal(res.liked, true);
    assert.equal(res.likesCount, 1);

    // Read list back as Bob
    let list = await getComments("cat_1", "u_active_2");
    assert.equal(list.comments[0].likesCount, 1);
    assert.equal(list.comments[0].likedByMe, true);

    // Read list back as Alice
    list = await getComments("cat_1", "u_active_1");
    assert.equal(list.comments[0].likesCount, 1);
    assert.equal(list.comments[0].likedByMe, false);

    // Bob un-likes it
    res = await toggleCommentLike(comment.id, "u_active_2");
    assert.equal(res.liked, false);
    assert.equal(res.likesCount, 0);

    // Read list back as Bob
    list = await getComments("cat_1", "u_active_2");
    assert.equal(list.comments[0].likesCount, 0);
    assert.equal(list.comments[0].likedByMe, false);
  } finally {
    await env.cleanup();
  }
});

test("relational-comments: reportComment threshold escalates comment visibility", async () => {
  const env = await setupEnv();
  try {
    const { addComment, reportComment, getComments, getAdminReports } = await import("../../runtime-store.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    const comment = await addComment("cat_1", "u_active_1", "Spam comment");

    // Report less than 5 times
    for (let i = 1; i <= 5; i++) {
      await reportComment(comment.id, `u_user_${i}`, `Spam reason ${i}`);
    }

    // Comment is still public
    let list = await getComments("cat_1");
    assert.equal(list.comments.length, 1);

    // The 6th report triggers auto-moderation escalation
    await reportComment(comment.id, "u_user_6", "Severe spam!");

    // Comment visibility is escalated to hidden_pending_review
    list = await getComments("cat_1");
    assert.equal(list.comments.length, 0, "Flagged comments above threshold should be hidden from public");

    const db = await getSqliteDb();
    const commentRow = await db.get("SELECT * FROM catalog_comments WHERE id = ?", comment.id);
    assert.equal(commentRow.visibility, "hidden_pending_review");
    assert.equal(commentRow.status, "flagged");

    // Admin pulls reported comments
    const adminReports = await getAdminReports();
    assert.ok(adminReports.length >= 6);
    assert.equal(adminReports[0].commentId, comment.id);
    assert.equal(adminReports[0].commentContent, comment.content);

    const inboxRow = await db.get("SELECT * FROM inbox_messages WHERE user_id = ?", "u_admin");
    assert.ok(inboxRow, "Auto-escalation should create an admin inbox notification");
    assert.equal(inboxRow.title, "Comment flagged for review");
  } finally {
    await env.cleanup();
  }
});

test("relational-comments: resolveReport keep or delete comment", async () => {
  const env = await setupEnv();
  try {
    const { addComment, reportComment, getAdminReports, resolveReport, getComments } = await import("../../runtime-store.js");

    const comment = await addComment("cat_1", "u_active_1", "Reported comment");
    await reportComment(comment.id, "u_active_2", "Spam");

    const adminReports = await getAdminReports();
    const reportId = adminReports[0].id;

    // Resolve as 'keep'
    await resolveReport(reportId, "keep", "u_admin");

    let list = await getComments("cat_1");
    assert.equal(list.comments.length, 1);
    assert.equal(list.comments[0].visibility, "public");

    // Re-report and resolve as 'delete'
    await reportComment(comment.id, "u_active_2", "Spam again");
    const updatedReports = await getAdminReports();
    const newReportId = updatedReports[0].id;

    await resolveReport(newReportId, "delete", "u_admin");

    list = await getComments("cat_1");
    assert.equal(list.comments.length, 0); // Completely removed from public
  } finally {
    await env.cleanup();
  }
});

test("relational-comments: keyset cursor-based pagination works correctly", async () => {
  const env = await setupEnv();
  try {
    const { addComment, getComments } = await import("../../runtime-store.js");

    // Add 5 comments sequentially
    const commentIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const c = await addComment("cat_1", "u_active_1", `Comment ${i}`);
      commentIds.push(c.id);
      // Brief sleep to ensure distinct ISO timestamps in tests
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Page 1: Limit 2
    let page = await getComments("cat_1", undefined, 2);
    assert.equal(page.comments.length, 2);
    assert.equal(page.comments[0].content, "Comment 5");
    assert.equal(page.comments[1].content, "Comment 4");
    assert.ok(page.nextCursor);

    // Page 2: Limit 2 using cursor
    page = await getComments("cat_1", undefined, 2, page.nextCursor.createdAt, page.nextCursor.id);
    assert.equal(page.comments.length, 2);
    assert.equal(page.comments[0].content, "Comment 3");
    assert.equal(page.comments[1].content, "Comment 2");
    assert.ok(page.nextCursor);

    // Page 3: Limit 2 using cursor
    page = await getComments("cat_1", undefined, 2, page.nextCursor.createdAt, page.nextCursor.id);
    assert.equal(page.comments.length, 1);
    assert.equal(page.comments[0].content, "Comment 1");
    assert.equal(page.nextCursor, undefined);
  } finally {
    await env.cleanup();
  }
});

test("relational-comments: syncCommentsFts worker processes tasks & implements retry / DLQ", async () => {
  const env = await setupEnv();
  try {
    const { addComment, syncCommentsFts } = await import("../../runtime-store.js");
    const { getSqliteDb } = await import("../../db-sqlite.js");

    const comment = await addComment("cat_1", "u_active_1", "Searchable content here");

    const db = await getSqliteDb();

    // 1. Run sync worker - should index the comment successfully
    await syncCommentsFts();

    const queueRow = await db.get("SELECT * FROM fts_sync_queue WHERE comment_id = ?", comment.id);
    assert.equal(queueRow.status, "synced");

    // Verify FTS table search results
    const ftsRow = await db.get("SELECT * FROM catalog_comments_fts WHERE comment_id = ?", comment.id);
    assert.ok(ftsRow);
    assert.equal(ftsRow.content, comment.content);

    // 2. Test Error / Retry / DLQ path.
    // Drop the FTS table so indexing fails with SQL errors
    await db.exec("DROP TABLE catalog_comments_fts;");

    // Add a new comment that will fail to index
    const comment2 = await addComment("cat_1", "u_active_1", "Fails indexing");

    // Attempt 1: Should fail and set status to 'retry' with attempts = 1
    await syncCommentsFts();
    let queueRow2 = await db.get("SELECT * FROM fts_sync_queue WHERE comment_id = ?", comment2.id);
    assert.equal(queueRow2.status, "retry");
    assert.equal(queueRow2.attempts, 1);
    assert.ok(queueRow2.last_error.includes("no such table"));

    // Artificially reset next_retry_at to past to force retries, and run attempts 2, 3, 4, 5
    for (let attempts = 2; attempts <= 5; attempts++) {
      await db.run("UPDATE fts_sync_queue SET next_retry_at = ? WHERE comment_id = ?", new Date(0).toISOString(), comment2.id);
      await syncCommentsFts();
    }

    // Attempt 5: Should exceed threshold and transition to 'dead_letter' (DLQ)
    queueRow2 = await db.get("SELECT * FROM fts_sync_queue WHERE comment_id = ?", comment2.id);
    assert.equal(queueRow2.status, "dead_letter");
    assert.equal(queueRow2.attempts, 5);
  } finally {
    await env.cleanup();
  }
});
