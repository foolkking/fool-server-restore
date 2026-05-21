import path from "node:path";
import fs from "node:fs";
import { resolveFromRoot } from "./repo.js";

export interface AppConfig {
  host: string;
  port: number;
  nodeEnv: string;
  publicBaseUrl: string;
  dataDir: string;
  runtimeDatabasePath: string;
  snapshotDir: string;
  serveWeb: boolean;
  webDistDir: string;
  sessionTtlHours: number;
  /** Emails (lowercase) that should automatically receive admin role on registration */
  adminEmails: string[];
  /** Names (lowercase) that should automatically receive admin role on registration */
  adminNames: string[];
}

export function getConfig(): AppConfig {
  loadEnvFile();
  const dataDir = resolveConfiguredPath(process.env.FOOL_DATA_DIR, "data");

  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: toPort(process.env.PORT, 5173),
    nodeEnv: process.env.NODE_ENV ?? "development",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:5173",
    dataDir,
    runtimeDatabasePath: resolveConfiguredPath(process.env.FOOL_RUNTIME_DB, path.join(dataDir, "runtime-db.json")),
    snapshotDir: resolveConfiguredPath(process.env.FOOL_SNAPSHOT_DIR, path.join(dataDir, "snapshots")),
    serveWeb: isEnabled(process.env.SERVE_WEB),
    webDistDir: resolveConfiguredPath(process.env.WEB_DIST_DIR, "apps/web/dist"),
    sessionTtlHours: toPositiveNumber(process.env.SESSION_TTL_HOURS, 24),
    adminEmails: parseList(process.env.ENVFORGE_ADMIN_EMAILS),
    // Default: any user named "fool" (case-insensitive) is an admin.
    adminNames: parseList(process.env.ENVFORGE_ADMIN_NAMES ?? "fool")
  };
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function loadEnvFile(): void {
  const envPath = resolveFromRoot(".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function resolveConfiguredPath(value: string | undefined, fallback: string): string {
  const selected = value?.trim() || fallback;
  return path.isAbsolute(selected) ? selected : resolveFromRoot(selected);
}

function toPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}

function toPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}
