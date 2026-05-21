/**
 * acme — Let's Encrypt certificate via certbot (idempotent)
 *
 * Args:
 *   domain: string                  Required. Single domain or comma-separated list.
 *   email: string                   Required for first issuance.
 *   webroot?: string                Default /var/www/html (HTTP-01 webroot mode)
 *   plugin?: "webroot" | "nginx" | "standalone"  Default "webroot"
 *   staging?: boolean               Use Let's Encrypt staging API (no real cert) — default false
 *
 * Idempotency: skip if /etc/letsencrypt/live/<primary-domain>/fullchain.pem exists.
 *   (certbot itself is idempotent but we save an SSH round-trip.)
 *
 * Requires certbot installed on target. We don't try to install it — use a separate
 * package task before this.
 */

import type { AnsibleModule, ModuleResult } from "../types.js";

interface AcmeArgs {
  domain?: string;
  email?: string;
  webroot?: string;
  plugin?: "webroot" | "nginx" | "standalone";
  staging?: boolean;
}

const SAFE_DOMAIN = /^[a-zA-Z0-9.,*-]{1,300}$/;
const SAFE_EMAIL = /^[a-zA-Z0-9._@+-]{3,200}$/;
const SAFE_PATH = /^\/?[a-zA-Z0-9._/-]{1,200}$/;

export const acmeModule: AnsibleModule<AcmeArgs> = {
  name: "acme",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!args.domain || !SAFE_DOMAIN.test(args.domain)) {
      return { changed: false, failed: true, msg: "domain is required and must contain only [a-zA-Z0-9.,*-]" };
    }
    if (!args.email || !SAFE_EMAIL.test(args.email)) {
      return { changed: false, failed: true, msg: "email is required" };
    }
    const webroot = args.webroot ?? "/var/www/html";
    if (!SAFE_PATH.test(webroot)) {
      return { changed: false, failed: true, msg: `Unsafe webroot: ${webroot}` };
    }
    const plugin = args.plugin ?? "webroot";
    const staging = args.staging === true;

    // Idempotency check: cert already exists for primary domain?
    const primaryDomain = args.domain.split(",")[0].replace(/^\*\./, "");
    const certPath = `/etc/letsencrypt/live/${primaryDomain}/fullchain.pem`;
    const { exitCode: existsCode } = await executor.exec(`sudo test -f ${certPath} && echo yes`);
    if (existsCode === 0) {
      return { changed: false, msg: `Certificate already exists at ${certPath}` };
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would request Let's Encrypt cert for ${args.domain} via ${plugin}` };
    }

    // certbot must be installed
    const { exitCode: certbotMissing } = await executor.exec("command -v certbot >/dev/null 2>&1 && echo yes");
    if (certbotMissing !== 0) {
      return { changed: false, failed: true, msg: "certbot not installed — install it via package module first" };
    }

    // Build the certbot command
    const domains = args.domain.split(",").map((d) => `-d ${d.trim()}`).join(" ");
    let cmd = `sudo certbot certonly --non-interactive --agree-tos --email ${args.email} ${domains}`;
    if (plugin === "webroot") {
      cmd += ` --webroot -w ${webroot}`;
    } else if (plugin === "nginx") {
      cmd += " --nginx";
    } else if (plugin === "standalone") {
      cmd += " --standalone";
    }
    if (staging) cmd += " --staging";

    const { exitCode, stdout, stderr } = await executor.exec(cmd);
    if (exitCode !== 0) {
      return {
        changed: false,
        failed: true,
        msg: `certbot failed (exit ${exitCode}): ${stderr || stdout}`.slice(0, 500)
      };
    }
    return { changed: true, msg: `Certificate issued for ${args.domain}`, stdout: stdout.slice(0, 500) };
  }
};
