/**
 * service — 幂等的 systemd 服务管理
 *
 * Args:
 *   name: string                 服务名
 *   state?: "started" | "stopped" | "restarted" | "reloaded"
 *   enabled?: boolean            是否设置开机自启
 *   ignore_missing?: boolean     默认 true: 服务不存在时跳过而不是报错
 *
 * 行为：
 *   1. 跨发行版翻译（apparmor → 跳过 RHEL，ufw → firewalld 等）
 *   2. systemctl is-active / is-enabled 查询当前状态
 *   3. 已经处于目标状态时不执行（幂等），但 restarted/reloaded 总是执行
 *   4. 服务单元不存在时优雅跳过（默认行为）
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface ServiceArgs {
  name: string;
  state?: "started" | "stopped" | "restarted" | "reloaded";
  enabled?: boolean;
  ignore_missing?: boolean;
}

const SAFE_SERVICE_NAME = /^[a-zA-Z0-9._@-]{1,80}$/;

/**
 * Cross-distro service name aliases.
 * Keys are Debian/Ubuntu service names; values give per-distro alternatives.
 * "(skip)" means the service doesn't exist on that distro (e.g. apparmor on RHEL).
 */
const SERVICE_ALIASES: Record<string, { rhel?: string; fedora?: string }> = {
  // Ubuntu-only services that don't exist on RHEL/Fedora
  "apparmor":       { rhel: "(skip)", fedora: "(skip)" },
  "ufw":            { rhel: "firewalld", fedora: "firewalld" },
  "snapd":          { rhel: "(skip)", fedora: "(skip)" },
  "snap.lxd":       { rhel: "(skip)", fedora: "(skip)" },
  "lxd":            { rhel: "(skip)", fedora: "(skip)" },
  "systemd-resolved": { rhel: "systemd-resolved", fedora: "systemd-resolved" }, // exists on both
  "unattended-upgrades": { rhel: "dnf-automatic", fedora: "dnf-automatic" },
  "rsyslog":        { rhel: "rsyslog", fedora: "rsyslog" },
  // Service name differences
  "ssh":            { rhel: "sshd", fedora: "sshd" },
  "redis-server":   { rhel: "redis", fedora: "redis" },
  "mysql":          { rhel: "mysqld", fedora: "mysqld" },
  "mariadb":        { rhel: "mariadb", fedora: "mariadb" },
  "apache2":        { rhel: "httpd", fedora: "httpd" },
  "cron":           { rhel: "crond", fedora: "crond" },
  "fail2ban":       { rhel: "fail2ban", fedora: "fail2ban" },
};

/** Detect whether the host is RPM-based (RHEL/CentOS/Rocky/Alma/Fedora/Anolis). */
async function isRpmBased(executor: SshExecutor): Promise<boolean> {
  // Check apt first; if apt is present, treat as Debian-based even if rpm is also installed.
  const apt = await executor.exec("command -v apt-get >/dev/null 2>&1");
  if (apt.exitCode === 0) return false;
  const rpm = await executor.exec("command -v rpm >/dev/null 2>&1");
  return rpm.exitCode === 0;
}

function translateServiceName(name: string, rpm: boolean): { name: string; skipped?: boolean } {
  if (!rpm) return { name };
  const alias = SERVICE_ALIASES[name];
  if (!alias) return { name };
  const target = alias.rhel ?? alias.fedora ?? name;
  if (target === "(skip)") return { name, skipped: true };
  return { name: target };
}

/** Check whether a systemd unit file exists at all (avoids the "Unit not found" error). */
async function unitExists(executor: SshExecutor, name: string): Promise<boolean> {
  // `systemctl cat` exits 0 only if the unit is loadable.
  const r = await executor.exec(`systemctl cat ${name} >/dev/null 2>&1`);
  return r.exitCode === 0;
}

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
    const ignoreMissing = args.ignore_missing !== false; // default true

    // Cross-distro translation
    const rpm = await isRpmBased(executor);
    const translated = translateServiceName(args.name, rpm);

    if (translated.skipped) {
      return {
        changed: false,
        msg: `Service ${args.name} skipped on RHEL/Fedora (not applicable to this distro)`
      };
    }

    const serviceName = translated.name;
    const renameNote = serviceName !== args.name ? ` (renamed: ${args.name} → ${serviceName})` : "";

    // Check whether the unit file exists at all. If not, treat as "skip with a note"
    // when ignore_missing=true; otherwise return failed.
    const exists = await unitExists(executor, serviceName);
    if (!exists) {
      if (ignoreMissing) {
        return {
          changed: false,
          msg: `Service ${serviceName} not installed on this host; skipped${renameNote}`
        };
      }
      return {
        changed: false,
        failed: true,
        msg: `Service ${serviceName} not installed on this host${renameNote}`
      };
    }

    const actions: string[] = [];

    // Handle state
    if (args.state === "started") {
      const active = await isActive(executor, serviceName);
      if (!active) actions.push(`sudo systemctl start ${serviceName}`);
    } else if (args.state === "stopped") {
      const active = await isActive(executor, serviceName);
      if (active) actions.push(`sudo systemctl stop ${serviceName}`);
    } else if (args.state === "restarted") {
      actions.push(`sudo systemctl restart ${serviceName}`);
    } else if (args.state === "reloaded") {
      actions.push(`sudo systemctl reload ${serviceName}`);
    }

    // Handle enabled
    if (args.enabled === true) {
      const enabled = await isEnabled(executor, serviceName);
      if (!enabled) actions.push(`sudo systemctl enable ${serviceName}`);
    } else if (args.enabled === false) {
      const enabled = await isEnabled(executor, serviceName);
      if (enabled) actions.push(`sudo systemctl disable ${serviceName}`);
    }

    if (actions.length === 0) {
      return { changed: false, msg: `Service ${serviceName} already in target state${renameNote}` };
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would run: ${actions.join("; ")}${renameNote}` };
    }

    let allStdout = "";
    let allStderr = "";
    let changed = false;
    for (const cmd of actions) {
      const { stdout, stderr, exitCode } = await executor.exec(cmd);
      allStdout += stdout;
      allStderr += stderr;
      if (exitCode !== 0) {
        return {
          changed: false,
          failed: true,
          msg: `Failed: ${cmd}${renameNote}`,
          stdout: allStdout,
          stderr: allStderr
        };
      }
      changed = true;
    }
    return {
      changed,
      msg: `Service ${serviceName}: ${actions.length} action(s) applied${renameNote}`,
      stdout: allStdout,
      stderr: allStderr
    };
  }
};
