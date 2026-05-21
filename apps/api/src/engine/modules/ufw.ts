/**
 * ufw — 幂等地管理 UFW 防火墙规则
 *
 * Args:
 *   rule: "allow" | "deny" | "reject" | "limit"
 *   port?: number | string        端口号或服务名
 *   proto?: "tcp" | "udp" | "any"
 *   from_ip?: string              来源 IP（默认 any）
 *   to_ip?: string                目标 IP（默认 any）
 *   state?: "enabled" | "disabled" | "reset"  UFW 整体状态
 *   direction?: "in" | "out"
 *   comment?: string              规则注释
 *
 * 行为：
 *   - 先检查 UFW 是否已安装
 *   - 检查规则是否已存在（通过 ufw status 解析）
 *   - 已存在则不重复添加（幂等）
 *   - state=enabled 时启用 UFW（--force 避免交互）
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface UfwArgs {
  rule?: "allow" | "deny" | "reject" | "limit";
  port?: number | string;
  proto?: "tcp" | "udp" | "any";
  from_ip?: string;
  to_ip?: string;
  state?: "enabled" | "disabled" | "reset";
  direction?: "in" | "out";
  comment?: string;
}

const SAFE_PORT = /^[0-9]{1,5}(:[0-9]{1,5})?$|^[a-zA-Z][a-zA-Z0-9-]{0,20}$/;
const SAFE_IP = /^(any|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(\/[0-9]{1,2})?)$/;

async function isUfwInstalled(executor: SshExecutor): Promise<boolean> {
  const { exitCode } = await executor.exec("command -v ufw >/dev/null 2>&1");
  return exitCode === 0;
}

async function ruleExists(executor: SshExecutor, ruleStr: string): Promise<boolean> {
  const { stdout } = await executor.exec("sudo ufw status 2>/dev/null");
  return stdout.toLowerCase().includes(ruleStr.toLowerCase());
}

export const ufwModule: AnsibleModule<UfwArgs> = {
  name: "ufw",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    // Validate inputs
    if (args.port !== undefined && !SAFE_PORT.test(String(args.port))) {
      return { changed: false, failed: true, msg: `Unsafe port: ${args.port}` };
    }
    if (args.from_ip && !SAFE_IP.test(args.from_ip)) {
      return { changed: false, failed: true, msg: `Unsafe from_ip: ${args.from_ip}` };
    }
    if (args.to_ip && !SAFE_IP.test(args.to_ip)) {
      return { changed: false, failed: true, msg: `Unsafe to_ip: ${args.to_ip}` };
    }

    const installed = await isUfwInstalled(executor);
    if (!installed) {
      return { changed: false, failed: true, msg: "UFW is not installed. Install it first with the package module." };
    }

    // Handle state changes (enable/disable/reset)
    if (args.state) {
      if (args.state === "enabled") {
        const { stdout } = await executor.exec("sudo ufw status 2>/dev/null");
        if (stdout.includes("Status: active")) {
          return { changed: false, msg: "UFW is already enabled" };
        }
        if (dryRun) return { changed: true, msg: "[dry-run] Would enable UFW" };
        const { exitCode, stderr } = await executor.exec("sudo ufw --force enable");
        if (exitCode !== 0) return { changed: false, failed: true, msg: "Failed to enable UFW", stderr };
        return { changed: true, msg: "UFW enabled" };
      }
      if (args.state === "disabled") {
        const { stdout } = await executor.exec("sudo ufw status 2>/dev/null");
        if (stdout.includes("Status: inactive")) {
          return { changed: false, msg: "UFW is already disabled" };
        }
        if (dryRun) return { changed: true, msg: "[dry-run] Would disable UFW" };
        const { exitCode, stderr } = await executor.exec("sudo ufw disable");
        if (exitCode !== 0) return { changed: false, failed: true, msg: "Failed to disable UFW", stderr };
        return { changed: true, msg: "UFW disabled" };
      }
      if (args.state === "reset") {
        if (dryRun) return { changed: true, msg: "[dry-run] Would reset UFW rules" };
        const { exitCode, stderr } = await executor.exec("sudo ufw --force reset");
        if (exitCode !== 0) return { changed: false, failed: true, msg: "Failed to reset UFW", stderr };
        return { changed: true, msg: "UFW rules reset" };
      }
    }

    // Handle rule addition
    if (!args.rule) {
      return { changed: false, failed: true, msg: "Either 'rule' or 'state' is required" };
    }

    // Build rule string
    const parts = ["sudo ufw"];
    if (args.direction) parts.push(args.direction);
    parts.push(args.rule);

    if (args.from_ip && args.from_ip !== "any") {
      parts.push(`from ${args.from_ip}`);
    }
    if (args.to_ip && args.to_ip !== "any") {
      parts.push(`to ${args.to_ip}`);
    }
    if (args.port !== undefined) {
      parts.push(`port ${args.port}`);
    }
    if (args.proto && args.proto !== "any") {
      parts.push(`proto ${args.proto}`);
    }
    if (args.comment) {
      parts.push(`comment "${args.comment.replace(/"/g, "")}"`);
    }

    const cmd = parts.join(" ");

    // Check if rule already exists (simple heuristic)
    const portStr = args.port ? String(args.port) : "";
    const alreadyExists = portStr ? await ruleExists(executor, portStr) : false;
    if (alreadyExists) {
      return { changed: false, msg: `UFW rule for port ${portStr} already exists` };
    }

    if (dryRun) return { changed: true, msg: `[dry-run] Would run: ${cmd}` };

    const { exitCode, stderr, stdout } = await executor.exec(cmd);
    if (exitCode !== 0) return { changed: false, failed: true, msg: `UFW rule failed`, stderr };
    return { changed: true, msg: `UFW rule added: ${stdout.trim() || cmd}` };
  }
};
