#!/usr/bin/env node
/**
 * backup-runtime-db.mjs — snapshot the EnvForge runtime database to a timestamped file.
 *
 * 用法：
 *   node scripts/backup-runtime-db.mjs
 *   node scripts/backup-runtime-db.mjs --db /custom/path/to/runtime-db.json
 *   node scripts/backup-runtime-db.mjs --out /custom/backup/dir
 *
 * 默认行为：
 *   - 读 FOOL_RUNTIME_DB 环境变量，未设时用 ./data/runtime-db.json
 *   - 写到 <dataDir>/backups/runtime-db-<ISO时间>.json
 *   - 保留最近 30 个备份，超过的自动清理
 *
 * 何时跑：
 *   - 任何 schema 迁移前（spec auth-and-ecosystem 的 P1.2 / P2.1 / P3.1）
 *   - 升级 EnvForge 镜像到含 schema 变更的版本前
 *   - 定期（cron 每天 3 点）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync, copyFileSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import process from "node:process";

const KEEP = 30;

function parseArgs(argv) {
  const args = { db: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--db" && argv[i + 1]) { args.db = argv[++i]; }
    else if (argv[i] === "--out" && argv[i + 1]) { args.out = argv[++i]; }
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: node scripts/backup-runtime-db.mjs [--db PATH] [--out DIR]");
      process.exit(0);
    }
  }
  return args;
}

function timestamp() {
  // 2026-05-23T18-42-07Z (filesystem-safe, sortable)
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/-(\d+)Z$/, "Z");
}

function pruneOld(dir) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((f) => /^runtime-db-.*\.json$/.test(f))
    .map((f) => ({ name: f, full: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const toDelete = files.slice(KEEP);
  for (const f of toDelete) {
    unlinkSync(f.full);
    console.log(`[backup] pruned old: ${f.name}`);
  }
}

function main() {
  const args = parseArgs(process.argv);

  const dbPath = resolve(args.db ?? process.env.FOOL_RUNTIME_DB ?? "data/runtime-db.json");
  if (!existsSync(dbPath)) {
    console.error(`[backup] runtime db not found: ${dbPath}`);
    console.error(`[backup]   set FOOL_RUNTIME_DB or pass --db PATH`);
    process.exit(1);
  }

  const outDir = resolve(args.out ?? join(dirname(dbPath), "backups"));
  mkdirSync(outDir, { recursive: true });

  const ts = timestamp();
  const outFile = join(outDir, `runtime-db-${ts}.json`);

  // copyFileSync preserves binary identity better than read+write for large files.
  copyFileSync(dbPath, outFile);

  // Sanity check that the backup parses as JSON (not corrupted mid-write).
  try {
    JSON.parse(readFileSync(outFile, "utf8"));
  } catch (err) {
    console.error(`[backup] WARNING: backup file is not valid JSON. Source DB may be mid-write. Re-run shortly.`);
    console.error(`[backup]   ${err.message}`);
    unlinkSync(outFile);
    process.exit(2);
  }

  const sizeKb = (statSync(outFile).size / 1024).toFixed(1);
  console.log(`[backup] ✅ ${basename(outFile)}  (${sizeKb} KB)`);
  console.log(`[backup]    location: ${outDir}`);

  pruneOld(outDir);
}

main();
