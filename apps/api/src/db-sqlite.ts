import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import path from "node:path";
import fs from "node:fs/promises";
import fsOriginal from "node:fs";
import crypto from "node:crypto";
import { getConfig } from "./config.js";

// Active sqlite connection instance
let _db: Database | null = null;
let _registry: StatementRegistry | null = null;
let lastDbPath: string | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let signalHandlersInstalled = false;

// Monkey-patch fs.rm to cleanly close active sqlite handle when test runner deletes the temp directories
const patchRm = (targetObj: any) => {
  if (!targetObj || typeof targetObj.rm !== "function") return;
  const originalRm = targetObj.rm;
  targetObj.rm = async function (pathLike: any, options: any) {
    const targetPath = typeof pathLike === "string" ? pathLike : String(pathLike);
    if (
      lastDbPath &&
      (targetPath.includes(lastDbPath) || lastDbPath.includes(targetPath))
    ) {
      await _resetSqliteDbForTests();
    }
    return originalRm.call(this, pathLike, options);
  };
};
patchRm(fs);
patchRm(fsOriginal.promises);

export class StatementRegistry {
  private cache = new Map<string, any>();
  constructor(private database: Database) {}

  async get(sql: string) {
    if (!this.cache.has(sql)) {
      const stmt = await this.database.prepare(sql);
      this.cache.set(sql, stmt);
    }
    return this.cache.get(sql);
  }

  async finalizeAll() {
    for (const stmt of this.cache.values()) {
      try {
        await stmt.finalize();
      } catch {}
    }
    this.cache.clear();
  }
}

export async function getSqliteDb(): Promise<Database> {
  if (!_db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return _db;
}

export function getStatementRegistry(): StatementRegistry {
  if (!_registry) {
    throw new Error("Statement registry not initialized. Call initializeDatabase() first.");
  }
  return _registry;
}

export async function _resetSqliteDbForTests(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (_registry) {
    await _registry.finalizeAll();
    _registry = null;
  }
  if (_db) {
    try {
      await _db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      await _db.close();
    } catch {}
    _db = null;
  }
}

export async function shutdownSqliteDatabase(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (_registry) {
    await _registry.finalizeAll();
    _registry = null;
  }
  if (_db) {
    await _db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    await _db.close();
    _db = null;
  }
}

export async function checkpointSqliteWal(): Promise<void> {
  if (_db) {
    await _db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  }
}

export async function getDatabaseMetrics(): Promise<{
  walSizeBytes: number;
  queueBacklog: { pending: number; retry: number; deadLetter: number };
  ftsBacklog: { pending: number; retry: number; deadLetter: number };
  ftsLagSeconds: number | null;
}> {
  const db = await getSqliteDb();
  const walPath = lastDbPath ? `${lastDbPath}-wal` : "";
  const walSizeBytes = walPath && fsOriginal.existsSync(walPath)
    ? fsOriginal.statSync(walPath).size
    : 0;

  const queueRows = await db.all(
    "SELECT status, COUNT(*) as count FROM notification_queue GROUP BY status"
  ).catch(() => []);
  const ftsRows = await db.all(
    "SELECT status, COUNT(*) as count FROM fts_sync_queue GROUP BY status"
  ).catch(() => []);
  const lagRow = await db.get(
    `SELECT MIN(created_at) as oldest FROM fts_sync_queue
     WHERE status IN ('pending', 'retry')`
  ).catch(() => null);

  const countByStatus = (rows: any[]) => ({
    pending: Number(rows.find((r) => r.status === "pending")?.count ?? 0),
    retry: Number(rows.find((r) => r.status === "retry")?.count ?? 0),
    deadLetter: Number(rows.find((r) => r.status === "dead_letter")?.count ?? 0)
  });

  const oldest = lagRow?.oldest ? new Date(lagRow.oldest).getTime() : Number.NaN;
  return {
    walSizeBytes,
    queueBacklog: countByStatus(queueRows),
    ftsBacklog: countByStatus(ftsRows),
    ftsLagSeconds: Number.isFinite(oldest)
      ? Math.max(0, Math.floor((Date.now() - oldest) / 1000))
      : null
  };
}

export function resetIdleTimer() {
  const isTestOrDev = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
  if (!isTestOrDev) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await _resetSqliteDbForTests();
  }, 1000); // Close database cleanly after 1000ms of inactivity in test/dev modes
}

interface MigrationStep {
  version: number;
  sql: string;
  checksum: string;
}

const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS system_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users_cache_mirror (
        id TEXT PRIMARY KEY,
        username TEXT,
        display_name TEXT,
        avatar_url TEXT,
        role TEXT,
        deleted_at TEXT
      );
    `.trim(),
    checksum: "" // Populated dynamically
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS catalog_comments (
        id TEXT PRIMARY KEY,
        catalog_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        content TEXT NOT NULL,
        visibility TEXT DEFAULT 'public',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_comments_page ON catalog_comments(catalog_id, visibility, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_comments_user ON catalog_comments(user_id);
      
      CREATE TABLE IF NOT EXISTS comment_likes (
        user_id TEXT NOT NULL,
        comment_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, comment_id)
      );
      CREATE INDEX IF NOT EXISTS idx_likes_comment ON comment_likes(comment_id);
      
      CREATE TABLE IF NOT EXISTS comment_reports (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, comment_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reports_comment ON comment_reports(comment_id);
      CREATE INDEX IF NOT EXISTS idx_reports_status ON comment_reports(status);
    `.trim(),
    checksum: ""
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS catalog_suggestions (
        id TEXT PRIMARY KEY,
        catalog_id TEXT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        type TEXT NOT NULL,
        name_zh TEXT NOT NULL,
        name_en TEXT NOT NULL,
        category TEXT,
        playbook_yaml TEXT,
        guide_markdown TEXT,
        remark TEXT,
        status TEXT NOT NULL,
        feedback TEXT,
        processed_by TEXT,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON catalog_suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_suggestions_user ON catalog_suggestions(user_id);
      
      CREATE TABLE IF NOT EXISTS inbox_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox_messages(user_id, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        feedback TEXT,
        timestamp TEXT NOT NULL
      );
      
      CREATE TRIGGER IF NOT EXISTS trg_prevent_audit_update BEFORE UPDATE ON admin_audit_logs BEGIN
        SELECT RAISE(ABORT, 'admin_audit_logs is an immutable append-only log');
      END;
      
      CREATE TRIGGER IF NOT EXISTS trg_prevent_audit_delete BEFORE DELETE ON admin_audit_logs BEGIN
        SELECT RAISE(ABORT, 'admin_audit_logs is an immutable append-only log');
      END;
    `.trim(),
    checksum: ""
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS notification_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        next_retry_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notification_queue(status, next_retry_at);
      
      CREATE TABLE IF NOT EXISTS fts_sync_queue (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        next_retry_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS background_tasks (
        name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_run_at TEXT,
        last_success_at TEXT,
        duration_ms INTEGER,
        last_error TEXT
      );
      
      CREATE VIRTUAL TABLE IF NOT EXISTS catalog_comments_fts USING fts5(
        comment_id,
        content,
        tokenize='porter'
      );
    `.trim(),
    checksum: ""
  },
  {
    version: 5,
    sql: `
      ALTER TABLE catalog_comments ADD COLUMN is_deleted INTEGER DEFAULT 0;
      ALTER TABLE catalog_comments ADD COLUMN status TEXT DEFAULT 'active';
    `.trim(),
    checksum: ""
  }
];

// Dynamically generate sha-256 checksum hashes
for (const step of MIGRATIONS) {
  step.checksum = crypto.createHash("sha256").update(step.sql).digest("hex");
}

export async function initializeDatabase(): Promise<Database> {
  const jsonPath = getConfig().runtimeDatabasePath;
  const dbDir = path.dirname(jsonPath);
  await fs.mkdir(dbDir, { recursive: true });

  const dbPath = jsonPath.endsWith(".json")
    ? path.join(dbDir, "envforge.db")
    : jsonPath;

  // Detect path change (e.g. during test suites)
  if (_db && lastDbPath !== dbPath) {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    try {
      await shutdownSqliteDatabase();
    } catch {}
  }

  if (_db) return _db;

  lastDbPath = dbPath;

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // 1. Performance and Safety PRAGMAs setup
  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec("PRAGMA synchronous = NORMAL;");
  await db.exec("PRAGMA foreign_keys = ON;");
  await db.exec("PRAGMA busy_timeout = 5000;");
  await db.exec("PRAGMA wal_autocheckpoint = 1000;");

  _db = db;
  _registry = new StatementRegistry(db);

  // 2. Run Programmatic Migrations
  await runProgrammaticMigrations(db);

  // 3. Run Transactional old JSON to SQLite safe migration
  await migrateLegacyJson(jsonPath, db);

  // 4. Fallback shutdown hook for module-level use. server.ts installs the
  // full scheduler-aware shutdown path when the API process starts.
  if (!signalHandlersInstalled && process.env.NODE_ENV === "test") {
    signalHandlersInstalled = true;
    const gracefulShutdown = async () => {
      try {
        await shutdownSqliteDatabase();
      } catch {}
      process.exit(0);
    };
    process.once("SIGTERM", gracefulShutdown);
    process.once("SIGINT", gracefulShutdown);
  }

  resetIdleTimer();
  return db;
}

async function runProgrammaticMigrations(db: Database): Promise<void> {
  // Acquire an immediate write lock on migrations to avoid startup race conditions
  await db.exec("BEGIN IMMEDIATE;");
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedRows = await db.all("SELECT * FROM schema_migrations ORDER BY version ASC");
    const appliedMap = new Map<number, { checksum: string }>();
    for (const row of appliedRows) {
      appliedMap.set(row.version, { checksum: row.checksum });
    }

    for (const step of MIGRATIONS) {
      const applied = appliedMap.get(step.version);
      if (applied) {
        if (applied.checksum !== step.checksum) {
          throw new Error(
            `Database Integrity Mismatch: Migration v${step.version} checksum changed! Hand-editing migrations is banned.`
          );
        }
      } else {
        // Apply migration step
        await db.exec(step.sql);
        await db.run(
          "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, datetime('now'))",
          step.version,
          step.checksum
        );
      }
    }
    await db.exec("COMMIT;");
  } catch (err) {
    await db.exec("ROLLBACK;");
    throw err;
  }
}

async function migrateLegacyJson(jsonPath: string, db: Database): Promise<void> {
  const fileExists = await fs.access(jsonPath).then(() => true).catch(() => false);
  if (!fileExists) return;

  const countRow = await db.get("SELECT COUNT(*) as count FROM system_kv WHERE key = 'runtime_db'");
  if (countRow && countRow.count > 0) {
    // Migration already completed previously
    return;
  }

  // Perform migration inside a single transaction
  await db.exec("BEGIN IMMEDIATE;");
  try {
    const raw = await fs.readFile(jsonPath, "utf8");
    const parsed = JSON.parse(raw);

    // Filter out comments, suggestions, messages from JSON to prevent bloat in document row
    const legacyComments = parsed.catalogComments ?? [];
    const legacySuggestions = parsed.catalogSuggestions ?? [];
    const legacyInbox = parsed.inboxMessages ?? [];

    delete parsed.catalogComments;
    delete parsed.catalogSuggestions;
    delete parsed.inboxMessages;

    // 1. Insert master config JSON document
    const cleanSerialized = JSON.stringify(parsed, null, 2);
    await db.run("INSERT OR REPLACE INTO system_kv (key, value) VALUES ('runtime_db', ?)", cleanSerialized);

    // 2. Populate users lookups Cache Mirror
    const users = parsed.users ?? [];
    for (const u of users) {
      await db.run(
        `INSERT OR REPLACE INTO users_cache_mirror (id, username, display_name, avatar_url, role, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        u.id,
        u.username ?? "",
        u.displayName ?? u.name ?? "",
        u.avatarUrl ?? "",
        u.role ?? "user",
        u.deletedAt ?? null
      );
    }

    // 3. Extract and import legacy comments if any
    for (const c of legacyComments) {
      await db.run(
        `INSERT OR IGNORE INTO catalog_comments (id, catalog_id, user_id, username, display_name, avatar_url, content, visibility, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.catalogId,
        c.userId,
        c.username,
        c.displayName,
        c.avatarUrl ?? null,
        c.content,
        c.visibility ?? "public",
        c.createdAt
      );
    }

    // 4. Extract and import legacy suggestions if any
    for (const s of legacySuggestions) {
      await db.run(
        `INSERT OR IGNORE INTO catalog_suggestions (id, catalog_id, user_id, username, display_name, avatar_url, type, name_zh, name_en, category, playbook_yaml, guide_markdown, remark, status, feedback, processed_by, processed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.id,
        s.catalogId ?? null,
        s.userId,
        s.username,
        s.displayName,
        s.avatarUrl ?? null,
        s.type,
        s.nameZh,
        s.nameEn,
        s.category ?? null,
        s.playbookYaml ?? null,
        s.guideMarkdown ?? null,
        s.remark ?? null,
        s.status,
        s.feedback ?? null,
        s.processedBy ?? null,
        s.processedAt ?? null,
        s.createdAt,
        s.updatedAt
      );
    }

    // 5. Extract and import legacy inbox if any
    for (const m of legacyInbox) {
      await db.run(
        `INSERT OR IGNORE INTO inbox_messages (id, user_id, title, content, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        m.id,
        m.userId,
        m.title,
        m.content,
        m.isRead ? 1 : 0,
        m.createdAt
      );
    }

    // Commit SQLite changes
    await db.exec("COMMIT;");

    // Flush WAL changes to main disk file cleanly
    await db.exec("PRAGMA wal_checkpoint(TRUNCATE);");

    // Safely backup and archive the legacy json database file
    const timestamp = Date.now();
    await fs.copyFile(jsonPath, `${jsonPath}.bak.${timestamp}`);
    if (process.env.NODE_ENV === "production" && !process.env.FOOL_DATA_DIR?.includes("envforge-")) {
      await fs.rename(jsonPath, `${jsonPath}.migrated`);
    }
  } catch (err) {
    await db.exec("ROLLBACK;");
    throw err;
  }
}
