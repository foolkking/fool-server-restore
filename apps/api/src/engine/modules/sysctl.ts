/**
 * sysctl — Idempotent management of kernel parameters
 *
 * Writes a one-key file under /etc/sysctl.d/ AND applies via `sysctl -w` so the change
 * takes effect immediately without reboot.
 *
 * Args:
 *   name: string         e.g. "net.ipv4.ip_forward"
 *   value: string|number Required when state=present
 *   state?: "present" | "absent"
 *   reload?: boolean     Default true (run `sysctl --system`)
 */

import type { AnsibleModule, ModuleResult } from "../types.js";

interface SysctlArgs {
  name?: string;
  value?: string | number;
  state?: "present" | "absent";
  reload?: boolean;
}

const SAFE_NAME = /^[a-zA-Z0-9._-]{1,100}$/;
const SAFE_VALUE = /^[a-zA-Z0-9._:\/ -]{1,200}$/;

function fileFor(name: string): string {
  // Convert dots to dashes for filename safety
  return `/etc/sysctl.d/99-envforge-${name.replace(/\./g, "-")}.conf`;
}

export const sysctlModule: AnsibleModule<SysctlArgs> = {
  name: "sysctl",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!args.name || !SAFE_NAME.test(args.name)) {
      return { changed: false, failed: true, msg: "name is required (e.g. net.ipv4.ip_forward)" };
    }
    const state = args.state ?? "present";
    const path = fileFor(args.name);
    const reload = args.reload !== false;

    if (state === "absent") {
      const { exitCode: existsCode } = await executor.exec(`sudo test -f ${path} && echo yes`);
      if (existsCode !== 0) return { changed: false, msg: `${path} does not exist` };
      if (dryRun) return { changed: true, msg: `[dry-run] Would remove ${path}` };
      const { exitCode } = await executor.exec(`sudo rm -f ${path}`);
      if (exitCode !== 0) return { changed: false, failed: true, msg: "rm failed" };
      if (reload) await executor.exec("sudo sysctl --system >/dev/null 2>&1");
      return { changed: true, msg: `Removed ${path}` };
    }

    // present
    if (args.value === undefined || args.value === null) {
      return { changed: false, failed: true, msg: "value is required when state=present" };
    }
    const valStr = String(args.value);
    if (!SAFE_VALUE.test(valStr)) {
      return { changed: false, failed: true, msg: `Unsafe value: ${valStr}` };
    }

    const desired = `${args.name} = ${valStr}\n`;
    const { exitCode: existsCode } = await executor.exec(`sudo test -f ${path} && echo yes`);
    if (existsCode === 0) {
      const { stdout } = await executor.exec(`sudo cat ${path}`);
      if (stdout === desired) {
        // also confirm runtime matches
        const { stdout: live } = await executor.exec(`sysctl -n ${args.name} 2>/dev/null`);
        if (live.trim() === valStr) {
          return { changed: false, msg: `${args.name} already = ${valStr}` };
        }
      }
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would set ${args.name}=${valStr} in ${path}` };
    }

    const b64 = Buffer.from(desired, "utf8").toString("base64");
    const { exitCode: writeCode, stderr } = await executor.exec(`echo '${b64}' | base64 -d | sudo tee ${path} > /dev/null`);
    if (writeCode !== 0) return { changed: false, failed: true, msg: `Write failed: ${stderr}` };

    // Apply at runtime
    await executor.exec(`sudo sysctl -w ${args.name}=${valStr} >/dev/null 2>&1`);
    if (reload) await executor.exec("sudo sysctl --system >/dev/null 2>&1");

    return { changed: true, msg: `Set ${args.name}=${valStr}` };
  }
};
