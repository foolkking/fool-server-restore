/**
 * service — 幂等的 systemd 服务管理
 *
 * Args:
 *   name: string                 服务名
 *   state?: "started" | "stopped" | "restarted" | "reloaded"
 *   enabled?: boolean            是否设置开机自启
 *
 * 行为：
 *   1. systemctl is-active 查询当前是否运行
 *   2. systemctl is-enabled 查询是否自启
 *   3. 已经处于目标状态时不执行（幂等），但 restarted/reloaded 总是执行
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface ServiceArgs {
  name: string;
  state?: "started" | "stopped" | "restarted" | "reloaded";
  enabled?: boolean;
}

const SAFE_SERVICE_NAME = /^[a-zA-Z0-9._@-]{1,80}$/;

async function isActive(executor: SshExecutor, name: string): Promise<boolean> {
  const r = await executor.exec(`systemctl is-active --quiet ${name}`);
  return r.exitCode === 0;
}

async function isEnabled(executor: SshExecutor, name: string): Promise<boolean> {
  const r = await executor.exec(`systemctl is-enabled --quiet ${name}`);
  return r.exitCode === 0;
}

export const serviceModule: AnsibleModule<ServiceArgs> = {
  name: "service",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!SAFE_SERVICE_NAME.test(args.name)) {
      return { changed: false, failed: true, msg: `Unsafe service name: ${args.name}` };
    }

    const actions: string[] = [];
    let changed = false;

    // Handle state
    if (args.state === "started") {
      const active = await isActive(executor, args.name);
      if (!active) actions.push(`sudo systemctl start ${args.name}`);
    } else if (args.state === "stopped") {
      const active = await isActive(executor, args.name);
      if (active) actions.push(`sudo systemctl stop ${args.name}`);
    } else if (args.state === "restarted") {
      actions.push(`sudo systemctl restart ${args.name}`);
    } else if (args.state === "reloaded") {
      actions.push(`sudo systemctl reload ${args.name}`);
    }

    // Handle enabled
    if (args.enabled === true) {
      const enabled = await isEnabled(executor, args.name);
      if (!enabled) actions.push(`sudo systemctl enable ${args.name}`);
    } else if (args.enabled === false) {
      const enabled = await isEnabled(executor, args.name);
      if (enabled) actions.push(`sudo systemctl disable ${args.name}`);
    }

    if (actions.length === 0) {
      return { changed: false, msg: `Service ${args.name} already in target state` };
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would run: ${actions.join("; ")}` };
    }

    let allStdout = "";
    let allStderr = "";
    for (const cmd of actions) {
      const { stdout, stderr, exitCode } = await executor.exec(cmd);
      allStdout += stdout;
      allStderr += stderr;
      if (exitCode !== 0) {
        return { changed: false, failed: true, msg: `Failed: ${cmd}`, stdout: allStdout, stderr: allStderr };
      }
      changed = true;
    }
    return {
      changed,
      msg: `Service ${args.name}: ${actions.length} action(s) applied`,
      stdout: allStdout,
      stderr: allStderr
    };
  }
};
