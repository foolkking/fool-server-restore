/**
 * email/smtp.ts — nodemailer transport singleton.
 *
 * Reads SMTP config from `getConfig().smtp`. When `host` is empty, returns null
 * and email-sending callers fall back to logging to stdout (acceptable for
 * local dev; production deployments must configure SMTP — `docs/DEPLOY.md`
 * has the recipe for Gmail app-specific passwords).
 *
 * The transport is lazily constructed on first call so tests / scripts that
 * don't actually send mail don't fail when SMTP env vars are missing.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { getConfig } from "../config.js";

let _transport: Transporter | null | undefined; // undefined = not yet probed

/**
 * Returns the active transporter or null if SMTP is not configured.
 * Callers must handle the null case (typically: log + skip + warn user).
 */
export function getEmailTransport(): Transporter | null {
  if (_transport !== undefined) return _transport;

  const cfg = getConfig().smtp;
  if (!cfg.host) {
    _transport = null;
    return null;
  }

  _transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user || cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  return _transport;
}

/**
 * Build a default From header when SMTP_FROM is not set.
 * "EnvForge <noreply@<base-host>>" — falls back to localhost.
 */
export function getDefaultFromHeader(): string {
  const cfg = getConfig();
  if (cfg.smtp.from) return cfg.smtp.from;
  let host = "localhost";
  try {
    host = new URL(cfg.publicBaseUrl).hostname || "localhost";
  } catch {
    // ignore — keep localhost
  }
  return `EnvForge <noreply@${host}>`;
}

/**
 * Reset the singleton — used by tests that want to re-probe with new env vars.
 * Production code never calls this.
 */
export function resetEmailTransportForTests(): void {
  _transport = undefined;
}
