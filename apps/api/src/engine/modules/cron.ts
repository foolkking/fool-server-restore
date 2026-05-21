/**
 * cron — Manage user crontab entries (idempotent)
 *
 * Args:
 *   name: string         An identifier comment line; the entry is matched by `# Ansible: <name>`
 *   minute / hour / day / month / weekday: string (default "*")
 *   job: string          Command to schedule (required for state=present)
 *   user?: string        Run crontab for a specific user (default: current SSH user)
 *   state?: "present" | "absent"  default "present"
 *
 * Implementation: read `crontab -l`, parse, replace/insert/remove the line marked with
 * `# Ansible: <name>`, write back via `crontab -`. Same approach Ansible's cron module uses.
 */

import type { AnsibleModule, ModuleResult } from "../types.js";

interface CronArgs {
  name?: string;
  minute?: string;
  hour?: string;
  day?: string;
  month?: string;
  weekday?: string;
  job?: string;
  user?: string;
  state?: "present" | "absent";
}

const SAFE_NAME = /^[a-zA-Z0-9 ._-]{1,80}$/;

export const cronModule: AnsibleModule<CronArgs> = {
  name: "cron",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    const state = args.state ?? "present";
    if (!args.name) {
      return { changed: false, failed: true, msg: "name is required" };
    }
    if (!SAFE_NAME.test(args.name)) {
      return { changed: false, failed: true, msg: `Unsafe cron name: ${args.name}` };
    }
    if (state === "present" && !args.job) {
      return { changed: false, failed: true, msg: "job is required when state=present" };
    }

    const userArg = args.user ? `-u ${args.user.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
    const sudo = args.user ? "sudo " : "";

    // Read current crontab
    const { stdout, exitCode } = await executor.exec(`${sudo}crontab ${userArg} -l 2>/dev/null || true`);
    const currentLines = exitCode === 0 || stdout.length > 0 ? stdout.split("\n") : [];

    const marker = `# Ansible: ${args.name}`;
    const filtered = currentLines.filter((l) => l.trim() !== marker);
    // Drop the line that immediately followed the marker (the actual cron entry)
    const cleaned: string[] = [];
    for (let i = 0; i < currentLines.length; i++) {
      if (currentLines[i].trim() === marker) {
        // Skip marker AND the line right after it
        i += 1;
        continue;
      }
      cleaned.push(currentLines[i]);
    }

    let updated = [...cleaned];
    let changed = false;

    if (state === "present") {
      const m = args.minute ?? "*";
      const h = args.hour ?? "*";
      const d = args.day ?? "*";
      const mo = args.month ?? "*";
      const wd = args.weekday ?? "*";
      const cronLine = `${m} ${h} ${d} ${mo} ${wd} ${args.job}`;
      // Sanity: reject newlines in the job
      if (cronLine.includes("\n")) {
        return { changed: false, failed: true, msg: "cron line cannot contain newlines" };
      }
      updated.push(marker, cronLine);
      // Compare to original
      const origText = currentLines.join("\n").trim();
      const newText = updated.join("\n").trim();
      changed = origText !== newText;
    } else {
      // absent
      changed = cleaned.length !== currentLines.length;
    }

    if (!changed) {
      return { changed: false, msg: `crontab already in desired state` };
    }
    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would update crontab for ${args.user ?? "current user"}` };
    }

    // Write back: use base64 to safely transfer
    const newCron = updated.join("\n").replace(/\n+$/, "") + "\n";
    const b64 = Buffer.from(newCron, "utf8").toString("base64");
    const writeCmd = `echo '${b64}' | base64 -d | ${sudo}crontab ${userArg} -`;
    const { exitCode: writeCode, stderr } = await executor.exec(writeCmd);
    if (writeCode !== 0) {
      return { changed: false, failed: true, msg: `crontab write failed: ${stderr}` };
    }
    return { changed: true, msg: `Updated crontab entry: ${args.name}` };
  }
};
