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
  /** SMTP transport configuration. When `host` is empty, email sending is disabled
   * (verification codes are logged to stdout — fine for local dev, NOT for production). */
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    /** Default From: header. Falls back to "EnvForge <noreply@<publicBaseUrl-host>>" when empty. */
    from: string;
    /** Whether to use TLS. Auto-derived: port 465 → true, others → false (STARTTLS). */
    secure: boolean;
  };
  /** Per-user email rate limit. Defaults to 30/h. */
  emailRatePerUserPerHour: number;
  /**
   * GitHub OAuth configuration. When `clientId` is empty, the GitHub login
   * button is hidden in the UI and the routes return 404 — i.e. OAuth is
   * effectively disabled. This lets self-hosters skip OAuth entirely.
   */
  github: {
    clientId: string;
    clientSecret: string;
    /** Must match the Authorization callback URL configured in the GitHub OAuth App. */
    redirectUri: string;
  };
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
    smtp: {
      host: (process.env.SMTP_HOST ?? "").trim(),
      port: toPort(process.env.SMTP_PORT, 587),
      user: (process.env.SMTP_USER ?? "").trim(),
      pass: process.env.SMTP_PASS ?? "",
      from: (process.env.SMTP_FROM ?? "").trim(),
      // Auto: port 465 implies implicit TLS; everything else uses STARTTLS.
      secure: toPort(process.env.SMTP_PORT, 587) === 465
    },
    emailRatePerUserPerHour: toPositiveNumber(process.env.EMAIL_RATE_PER_USER_PER_HOUR, 30),
    github: {
      clientId: (process.env.GITHUB_CLIENT_ID ?? "").trim(),
      clientSecret: (process.env.GITHUB_CLIENT_SECRET ?? "").trim(),
      redirectUri: (process.env.GITHUB_REDIRECT_URI ?? "").trim()
    }
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
