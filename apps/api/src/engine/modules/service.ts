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

/** Capture systemd-side diagnostic info to surface the real failure reason to the user. */
async function captureSystemdDiagnostics(executor: SshExecutor, name: string): Promise<{ status: string; journal: string }> {
  // `systemctl status` shows the last few log lines plus the unit state. Always exits non-zero
  // when the service is failed, so we ignore the exit code.
  const status = await executor.exec(`systemctl status ${name} --no-pager -l 2>&1 | tail -n 25`);
  // journalctl gives the actual application stderr (nginx config errors, port-in-use, etc).
  const journal = await executor.exec(`sudo journalctl -u ${name} --no-pager -n 20 2>&1`);
  return {
    status: (status.stdout || status.stderr || "(no status output)").trim(),
    journal: (journal.stdout || journal.stderr || "(no journal output)").trim()
  };
}

/** Find which process is currently listening on a given TCP port. Returns a short one-line description. */
async function whoIsOnPort(executor: SshExecutor, port: string): Promise<string | undefined> {
  // Try ss first (modern), fallback to netstat. Use sudo so we can see the process name.
  const ss = await executor.exec(`sudo ss -tlnp 2>/dev/null | grep ':${port} ' | head -n 3`);
  let raw = ss.stdout.trim();
  if (!raw) {
    const ns = await executor.exec(`sudo netstat -tlnp 2>/dev/null | grep ':${port} ' | head -n 3`);
    raw = ns.stdout.trim();
  }
  if (!raw) return undefined;
  // ss output:  LISTEN 0  511  *:80  *:*  users:(("httpd",pid=1234,fd=4),...)
  const procMatch = raw.match(/users:\(\("([^"]+)",pid=(\d+)/) || raw.match(/(\d+)\/(\S+)/);
  if (procMatch) {
    // ss format: name + pid; netstat format: pid/name
    const procName = procMatch[1].match(/^\d+$/) ? procMatch[2] : procMatch[1];
    const procPid = procMatch[1].match(/^\d+$/) ? procMatch[1] : procMatch[2];
    return `${procName} (pid ${procPid})`;
  }
  return raw.split("\n")[0].slice(0, 200);
}

/**
 * Pattern-match common service-start failures to give the user an actionable hint.
 * Returns undefined when we can't identify a known cause.
 *
 * For port-in-use cases we also probe the system to identify the conflicting
 * process (apache2/httpd/caddy/another nginx) so the user knows what to stop.
 */
async function identifyRootCause(executor: SshExecutor, diag: { status: string; journal: string }): Promise<string | undefined> {
  const text = `${diag.status}\n${diag.journal}`.toLowerCase();

  // Port already in use (very common with nginx if Apache/Caddy/another nginx is running)
  if (text.includes("address already in use") || (text.includes("bind() to") && text.includes("failed"))) {
    const portMatch = text.match(/0\.0\.0\.0:(\d+)|:::(\d+)|\[::\]:(\d+)|port\s+(\d+)/);
    const port = portMatch?.[1] ?? portMatch?.[2] ?? portMatch?.[3] ?? portMatch?.[4];
    if (port) {
      const owner = await whoIsOnPort(executor, port);
      if (owner) {
        return `端口 ${port} 已被 ${owner} 占用。先停止它再重试：` +
               `'sudo systemctl stop ${owner.split(" ")[0]}' 或 'sudo kill ${owner.match(/pid (\d+)/)?.[1] ?? "<pid>"}'。` +
               `如果它和当前服务功能相同（例如 apache2/httpd 和 nginx 都是 web server），请决定保留哪一个。`;
      }
      return `端口 ${port} 已被占用。运行 'sudo ss -tlnp | grep :${port}' 查看占用进程，停止后再试。`;
    }
    return `端口已被其他进程占用。运行 'sudo ss -tlnp' 查看占用情况。`;
  }

  // nginx config syntax error
  if (text.includes("[emerg]") || text.includes("nginx: configuration file") || text.includes("invalid directive") || text.includes("unknown directive")) {
    const emergMatch = diag.journal.match(/\[emerg\][^\n]*/i);
    return emergMatch
      ? `nginx 配置文件语法错误：${emergMatch[0].slice(0, 200)}。运行 'sudo nginx -t' 查看详情。`
      : `nginx 配置文件语法错误。运行 'sudo nginx -t' 查看详情。`;
  }

  // SELinux denial (common on RHEL/Anolis)
  if (text.includes("permission denied") && (text.includes("selinux") || text.includes("avc"))) {
    return `SELinux 拒绝访问。运行 'sudo ausearch -m avc -ts recent' 查看详情，或临时关闭：'sudo setenforce 0' 后重试。`;
  }

  // Missing directory / file
  if (text.includes("no such file or directory") || text.includes("does not exist")) {
    const fileMatch = diag.journal.match(/(?:open|access|stat)\s*\(?["']?([\/a-zA-Z0-9._-]+)["']?\)?:\s*No such/i);
    return fileMatch
      ? `缺少文件或目录：${fileMatch[1]}。请检查包是否完整安装，或手动创建。`
      : `服务依赖的文件或目录不存在。查看上方 journalctl 输出定位具体路径。`;
  }

  // Permission denied (non-SELinux)
  if (text.includes("permission denied")) {
    return `权限被拒绝。可能是文件 owner / mode 不正确，检查 systemd 单元的 User= 配置和资源文件权限。`;
  }

  // Failed to bind / listen / socket
  if (text.includes("can't bind") || text.includes("could not bind")) {
    return `无法绑定监听地址。可能是端口被占用、IP 地址不正确，或 SELinux/AppArmor 拦截。`;
  }

  // Out of memory
  if (text.includes("out of memory") || text.includes("cannot allocate memory")) {
    return `内存不足。释放内存或增加 swap 后重试。`;
  }

  // Generic exit code from main process
  const exitMatch = diag.status.match(/main process exited.*?status=(\d+)/i);
  if (exitMatch) {
    return `服务主进程异常退出（退出码 ${exitMatch[1]}）。查看上方 journalctl 输出定位原因。`;
  }

  return undefined;
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
        // Capture systemd diagnostics so the user sees the real reason instead
        // of the unhelpful "Job for X failed because the control process exited".
        const diag = await captureSystemdDiagnostics(executor, serviceName);
        const cause = await identifyRootCause(executor, diag);
        const causeNote = cause ? `\n🔍 ${cause}` : "";
        return {
          changed: false,
          failed: true,
          msg: `🔧 Failed: ${cmd}${renameNote}${causeNote}\n\n--- systemctl status ---\n${diag.status}\n--- journalctl (last 20 lines) ---\n${diag.journal}`,
          stdout: allStdout,
          stderr: allStderr + "\n" + diag.status + "\n" + diag.journal
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
