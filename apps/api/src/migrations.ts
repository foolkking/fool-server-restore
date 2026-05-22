/**
 * migrations.ts — one-shot data migrations run at startup.
 *
 * Each migration is idempotent: re-running them on an already-migrated database does nothing.
 *
 * Migrations run in order. Failures are logged but do not crash the server.
 */

import { readRuntimeDatabase, updateRuntimeDatabase } from "./runtime-store.js";

interface Migration {
  id: string;
  description: string;
  run: () => Promise<{ touched: number } | void>;
}

const MIGRATIONS: Migration[] = [
  {
    id: "2026-05-22-promote-fool-to-admin",
    description:
      "One-time: any existing user whose name (case-insensitive) is exactly 'fool' is promoted to admin. " +
      "This replaces the previous rule that auto-promoted *new* users named 'fool'.",
    async run() {
      let touched = 0;
      await updateRuntimeDatabase((db) => {
        for (const u of db.users) {
          if (u.name.trim().toLowerCase() === "fool" && u.role !== "admin") {
            u.role = "admin";
            u.updatedAt = new Date().toISOString();
            touched += 1;
          }
        }
      });
      return { touched };
    }
  }
];

/** Apply all migrations once on startup. Safe to call multiple times. */
export async function runMigrations(logger?: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  // Sanity-check the DB is readable
  try {
    await readRuntimeDatabase();
  } catch (err) {
    logger?.warn(`[migrations] cannot read database, skipping: ${err instanceof Error ? err.message : err}`);
    return;
  }

  for (const m of MIGRATIONS) {
    try {
      const result = await m.run();
      const touched = result && typeof result === "object" && "touched" in result ? result.touched : 0;
      if (touched > 0) {
        logger?.info(`[migrations] ${m.id}: touched ${touched} record(s)`);
      } else {
        logger?.info(`[migrations] ${m.id}: nothing to do`);
      }
    } catch (err) {
      logger?.warn(`[migrations] ${m.id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
