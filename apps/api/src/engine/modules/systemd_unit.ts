/**
 * systemd_unit — Create or remove a systemd .service unit file (idempotent)
 *
 * Args:
 *   name: string                 Service name (no .service extension)
 *   description?: string         Unit Description=
 *   exec_start: string           Required when state=present
 *   exec_start_pre?: string
 *   exec_stop?: string
 *   user?: string                Unit User=
 *   working_directory?: string
 *   environment?: Record<string, string>
 *   restart?: "always" | "on-failure" | "no"
 *   wanted_by?: string           Default "multi-user.target"
 *   state?: "present" | "absent"
 *   daemon_reload?: boolean      Default true — runs systemctl daemon-reload after change
 *
 * Writes to /etc/systemd/system/<name>.service via sudo tee.
 */

import type { AnsibleModule, ModuleResult } from "../types.js";

interface SystemdUnitArgs {
  name: string;
  description?: string;
  exec_start?: string;
  exec_start_pre?: string;
  exec_stop?: string;
  user?: string;
  working_directory?: string;
  environment?: Record<string, string>;
  restart?: "always" | "on-failure" | "no";
  wanted_by?: string;
  state?: "present" | "absent";
  daemon_reload?: boolean;
}

const SAFE_NAME = /^[a-zA-Z0-9._-]{1,64}$/;

export const systemdUnitModule: AnsibleModule<SystemdUnitArgs> = {
  name: "systemd_unit",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!args.name) return { changed: false, failed: true, msg: "name is required" };
    if (!SAFE_NAME.test(args.name)) return { changed: false, failed: true, msg: `Unsafe unit name: ${args.name}` };
    const state = args.state ?? "present";
    const path = `/etc/systemd/system/${args.name}.service`;
    const reload = args.daemon_reload !== false;

    if (state === "absent") {
      const { exitCode: existsCode } = await executor.exec(`sudo test -f ${path} && echo yes`);
      if (existsCode !== 0) return { changed: false, msg: `${path} does not exist` };
      if (dryRun) return { changed: true, msg: `[dry-run] Would remove ${path}` };
      await executor.exec(`sudo systemctl disable ${args.name} 2>/dev/null || true`);
      await executor.exec(`sudo systemctl stop ${args.name} 2>/dev/null || true`);
      const { exitCode: rmCode, stderr } = await executor.exec(`sudo rm -f ${path}`);
      if (rmCode !== 0) return { changed: false, failed: true, msg: `Failed to remove unit: ${stderr}` };
      if (reload) await executor.exec("sudo systemctl daemon-reload");
      return { changed: true, msg: `Removed ${path}` };
    }

    // state=present
    if (!args.exec_start) return { changed: false, failed: true, msg: "exec_start is required when state=present" };

    const lines: string[] = [];
    lines.push("[Unit]");
    lines.push(`Description=${args.description ?? args.name}`);
    lines.push("After=network.target");
    lines.push("");
    lines.push("[Service]");
    lines.push("Type=simple");
    if (args.user) lines.push(`User=${args.user}`);
    if (args.working_directory) lines.push(`WorkingDirectory=${args.working_directory}`);
    if (args.environment) {
      for (const [k, v] of Object.entries(args.environment)) {
        // Escape backslashes and double quotes
        const escaped = String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        lines.push(`Environment="${k}=${escaped}"`);
      }
    }
    if (args.exec_start_pre) lines.push(`ExecStartPre=${args.exec_start_pre}`);
    lines.push(`ExecStart=${args.exec_start}`);
    if (args.exec_stop) lines.push(`ExecStop=${args.exec_stop}`);
    lines.push(`Restart=${args.restart ?? "on-failure"}`);
    lines.push("RestartSec=3");
    lines.push("");
    lines.push("[Install]");
    lines.push(`WantedBy=${args.wanted_by ?? "multi-user.target"}`);
    const desiredContent = lines.join("\n") + "\n";

    // Compare to existing
    const { exitCode: existsCode } = await executor.exec(`sudo test -f ${path} && echo yes`);
    let existing = "";
    if (existsCode === 0) {
      const { stdout } = await executor.exec(`sudo cat ${path}`);
      existing = stdout;
    }
    if (existing === desiredContent) {
      return { changed: false, msg: `${path} already in desired state` };
    }
    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would write ${desiredContent.length} bytes to ${path}` };
    }

    // Backup once
    if (existsCode === 0) {
      const bak = `${path}.envforge.bak`;
      const { exitCode: bakExists } = await executor.exec(`sudo test -f ${bak} && echo yes`);
      if (bakExists !== 0) await executor.exec(`sudo cp -p ${path} ${bak}`);
    }

    const b64 = Buffer.from(desiredContent, "utf8").toString("base64");
    const { exitCode: writeCode, stderr } = await executor.exec(`echo '${b64}' | base64 -d | sudo tee ${path} > /dev/null`);
    if (writeCode !== 0) return { changed: false, failed: true, msg: `Write failed: ${stderr}` };
    if (reload) await executor.exec("sudo systemctl daemon-reload");
    return { changed: true, msg: `Wrote ${path}` };
  }
};
