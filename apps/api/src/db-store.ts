/**
 * db-store.ts — 改进的数据库存储层
 *
 * 替代原来的 runtime-store.ts 中的简单 JSON 读写，提供：
 * 1. 写锁（防止并发写入导致数据损坏）
 * 2. 原子写入（先写临时文件，再 rename，防止写入中断导致数据丢失）
 * 3. 自动备份（每次写入前保留 .bak 文件）
 * 4. 读缓存（减少磁盘 I/O）
 *
 * 注意：SQLite 迁移因 Windows 环境下 native 模块编译失败而暂缓。
 * 本模块提供等效的安全保证，适合单机自托管场景。
 * 生产多实例部署时应切换到 SQLite 或 PostgreSQL。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class SafeJsonStore<T extends object> {
  private readonly filePath: string;
  private readonly backupPath: string;
  private writeLock: Promise<void> = Promise.resolve();
  private cache: T | null = null;
  private cacheTime = 0;
  private readonly cacheTtlMs: number;

  constructor(filePath: string, cacheTtlMs = 1000) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.bak`;
    this.cacheTtlMs = cacheTtlMs;
  }

  async read(): Promise<T | null> {
    // Return cache if fresh
    if (this.cache && Date.now() - this.cacheTime < this.cacheTtlMs) {
      return this.cache;
    }

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.cache = JSON.parse(raw) as T;
      this.cacheTime = Date.now();
      return this.cache;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      // Try backup
      try {
        const raw = await fs.readFile(this.backupPath, "utf8");
        this.cache = JSON.parse(raw) as T;
        this.cacheTime = Date.now();
        return this.cache;
      } catch {
        return null;
      }
    }
  }

  async write(data: T): Promise<void> {
    // Serialize writes to prevent concurrent corruption
    this.writeLock = this.writeLock.then(() => this._doWrite(data));
    return this.writeLock;
  }

  private async _doWrite(data: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.${randomUUID().slice(0, 8)}.tmp`;
    const serialized = `${JSON.stringify(data, null, 2)}\n`;

    try {
      // Write to temp file first
      await fs.writeFile(tmpPath, serialized, { encoding: "utf8", mode: 0o600 });

      // Backup existing file
      try {
        await fs.copyFile(this.filePath, this.backupPath);
      } catch { /* no existing file, skip */ }

      // Atomic rename
      await fs.rename(tmpPath, this.filePath);

      // Update cache
      this.cache = data;
      this.cacheTime = Date.now();
    } catch (err) {
      // Clean up temp file on failure
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw err;
    }
  }

  /** Invalidate cache (call after external modifications) */
  invalidate(): void {
    this.cache = null;
    this.cacheTime = 0;
  }
}

/**
 * 数据库健康检查：验证 JSON 文件可读且格式正确
 */
export async function checkDatabaseHealth(filePath: string): Promise<{
  ok: boolean;
  size: number;
  hasBackup: boolean;
  error?: string;
}> {
  try {
    const stat = await fs.stat(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    JSON.parse(raw); // validate JSON
    const hasBackup = await fs.access(`${filePath}.bak`).then(() => true).catch(() => false);
    return { ok: true, size: stat.size, hasBackup };
  } catch (err) {
    return { ok: false, size: 0, hasBackup: false, error: err instanceof Error ? err.message : String(err) };
  }
}
