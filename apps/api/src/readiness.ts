import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runReadinessChecks(config: AppConfig): Promise<{
  ok: boolean;
  checks: ReadinessCheck[];
}> {
  const checks = await Promise.all([
    checkDirectory("dataDir", config.dataDir),
    checkDirectory("snapshotDir", config.snapshotDir),
    checkParentDirectory("runtimeDatabase", config.runtimeDatabasePath),
    config.serveWeb ? checkFile("webIndex", path.join(config.webDistDir, "index.html")) : skipped("webIndex", "SERVE_WEB is disabled.")
  ]);

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

async function checkDirectory(name: string, directory: string): Promise<ReadinessCheck> {
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.access(directory);
    return { name, ok: true, detail: directory };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkParentDirectory(name: string, filePath: string): Promise<ReadinessCheck> {
  return checkDirectory(name, path.dirname(filePath));
}

async function checkFile(name: string, filePath: string): Promise<ReadinessCheck> {
  try {
    await fs.access(filePath);
    return { name, ok: true, detail: filePath };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function skipped(name: string, detail: string): Promise<ReadinessCheck> {
  return Promise.resolve({ name, ok: true, detail });
}
