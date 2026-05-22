/**
 * package — 幂等的 apt/yum/dnf 安装/卸载
 *
 * Args:
 *   name: string | string[]      要安装的包名（一个或多个）
 *   state: "present" | "absent"  present = 安装, absent = 卸载
 *   update_cache?: boolean       安装前是否 apt-get update（仅 apt）
 *   ignore_missing?: boolean     默认 true: 单个包安装失败不影响其它包
 *
 * 行为：
 *   1. 检测包管理器（apt / yum / dnf）
 *   2. 跨发行版名称翻译（redis-server → redis 等）
 *   3. 已安装的跳过（幂等）
 *   4. 一次尝试批量安装；如果失败，逐个安装并收集每个的成败
 *   5. RHEL/CentOS 系统：nginx/redis 等失败时自动尝试启用 EPEL 后重试
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface PackageArgs {
  name: string | string[];
  state?: "present" | "absent";
  update_cache?: boolean;
  ignore_missing?: boolean;
}

const SAFE_PACKAGE_NAME = /^[a-zA-Z0-9._@/+:-]{1,100}$/;

/**
 * Cross-distro package name aliases (Debian/Ubuntu name → other distros).
 * "(skip)" means the package isn't applicable on that distro and should be silently skipped.
 */
const PACKAGE_ALIASES: Record<string, { rhel?: string; fedora?: string }> = {
  "redis-server":            { rhel: "redis", fedora: "redis" },
  "mysql-server":            { rhel: "mysql-server", fedora: "mysql-server" },
  "mariadb-server":          { rhel: "mariadb-server", fedora: "mariadb-server" },
  "postgresql":              { rhel: "postgresql-server", fedora: "postgresql-server" },
  "postgresql-client":       { rhel: "postgresql", fedora: "postgresql" },
  "docker.io":               { rhel: "docker-ce", fedora: "docker-ce" },
  "docker-compose-plugin":   { rhel: "docker-compose-plugin", fedora: "docker-compose-plugin" },
  "git-lfs":                 { rhel: "git-lfs", fedora: "git-lfs" },
  "fd-find":                 { rhel: "fd-find", fedora: "fd-find" },
  "build-essential":         { rhel: "@development-tools", fedora: "@development-tools" },
  "default-jdk":             { rhel: "java-17-openjdk-devel", fedora: "java-17-openjdk-devel" },
  "default-jre":             { rhel: "java-17-openjdk", fedora: "java-17-openjdk" },
  "openssh-server":          { rhel: "openssh-server", fedora: "openssh-server" },
  "ufw":                     { rhel: "firewalld", fedora: "firewalld" },
  "apt-transport-https":     { rhel: "(skip)", fedora: "(skip)" },
  "ca-certificates":         { rhel: "ca-certificates", fedora: "ca-certificates" },
  "software-properties-common": { rhel: "(skip)", fedora: "(skip)" },
  "netcat-openbsd":          { rhel: "nmap-ncat", fedora: "nmap-ncat" },
  "iproute2":                { rhel: "iproute", fedora: "iproute" },
  "dnsutils":                { rhel: "bind-utils", fedora: "bind-utils" },
  "iputils-ping":            { rhel: "iputils", fedora: "iputils" },
  "python-is-python3":       { rhel: "python3", fedora: "python3" },
  "python3-venv":            { rhel: "python3", fedora: "python3" },
  "python3-dev":             { rhel: "python3-devel", fedora: "python3-devel" },
  "python3-pip":             { rhel: "python3-pip", fedora: "python3-pip" },
};

/**
 * Packages on RHEL/CentOS that commonly need EPEL repository enabled.
 * If install fails for one of these, we attempt to enable EPEL and retry.
 */
const NEEDS_EPEL = new Set([
  "bat", "btop", "fd-find", "ripgrep", "zoxide", "git-lfs",
  "fish", "neofetch", "ncdu", "fzf", "tldr",
  "caddy", "cockpit"
]);

/**
 * Packages that come from RHEL/Anolis AppStream module streams (dnf module enable required).
 * Format: pkg → module name (defaults to pkg name).
 */
const NEEDS_DNF_MODULE = new Set(["nginx", "postgresql", "postgresql-server", "redis", "mariadb", "mariadb-server", "php"]);

function translatePackageName(pkg: string, pm: "apt" | "yum" | "dnf"): { name: string; skipped?: boolean } {
  if (pm === "apt") return { name: pkg };
  const alias = PACKAGE_ALIASES[pkg];
  if (!alias) return { name: pkg };
  const target = alias.rhel ?? alias.fedora ?? pkg;
  if (target === "(skip)") return { name: pkg, skipped: true };
  return { name: target };
}

async function detectPackageManager(executor: SshExecutor): Promise<"apt" | "yum" | "dnf" | null> {
  // Apt is preferred when present (Debian/Ubuntu where apt+dnf both exist is rare,
  // but if so, apt is the right choice for a Debian-rooted system).
  const apt = await executor.exec("command -v apt-get >/dev/null 2>&1");
  if (apt.exitCode === 0) return "apt";
  const dnf = await executor.exec("command -v dnf >/dev/null 2>&1");
  if (dnf.exitCode === 0) return "dnf";
  const yum = await executor.exec("command -v yum >/dev/null 2>&1");
  if (yum.exitCode === 0) return "yum";
  return null;
}

async function isInstalled(executor: SshExecutor, pm: "apt" | "yum" | "dnf", pkg: string): Promise<boolean> {
  if (pm === "apt") {
    const r = await executor.exec(`dpkg-query -W -f='\${Status}' ${pkg} 2>/dev/null | grep -q "install ok installed"`);
    return r.exitCode === 0;
  }
  const r = await executor.exec(`rpm -q ${pkg} >/dev/null 2>&1`);
  return r.exitCode === 0;
}

/** Try to install a single package on the given pm; returns ok=true on success. */
async function installOne(executor: SshExecutor, pm: "apt" | "yum" | "dnf", pkg: string): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  let cmd: string;
  if (pm === "apt") {
    cmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkg}`;
  } else if (pm === "dnf") {
    cmd = `sudo dnf install -y ${pkg}`;
  } else {
    cmd = `sudo yum install -y ${pkg}`;
  }
  const { stdout, stderr, exitCode } = await executor.exec(cmd);
  return { ok: exitCode === 0, stdout, stderr };
}

async function removeOne(executor: SshExecutor, pm: "apt" | "yum" | "dnf", pkg: string): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  let cmd: string;
  if (pm === "apt") {
    cmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y ${pkg}`;
  } else if (pm === "dnf") {
    cmd = `sudo dnf remove -y ${pkg}`;
  } else {
    cmd = `sudo yum remove -y ${pkg}`;
  }
  const { stdout, stderr, exitCode } = await executor.exec(cmd);
  return { ok: exitCode === 0, stdout, stderr };
}

/** Detect whether the failure mode looks like "package not in any enabled repo" (EPEL might fix). */
function looksLikeMissingRepo(stderr: string, stdout: string): boolean {
  const msg = `${stderr}\n${stdout}`.toLowerCase();
  return msg.includes("no match for argument") ||
         msg.includes("unable to find a match") ||
         msg.includes("no package") ||
         msg.includes("all matches were filtered out") ||
         msg.includes("excluded by exclude filtering");
}

/** Best-effort: enable EPEL on RHEL/CentOS/Anolis. Idempotent. Returns true if newly enabled. */
async function tryEnableEpel(executor: SshExecutor, pm: "apt" | "yum" | "dnf"): Promise<boolean> {
  if (pm === "apt") return false;
  // Already installed?
  const check = await executor.exec("rpm -q epel-release >/dev/null 2>&1");
  if (check.exitCode === 0) return false;
  // Try multiple strategies: dnf install epel-release (works on RHEL 8/9, Rocky, Alma, Anolis)
  const strategies = [
    "sudo dnf install -y epel-release",
    "sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm",
    "sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm",
    "sudo yum install -y epel-release"
  ];
  for (const cmd of strategies) {
    const r = await executor.exec(cmd);
    if (r.exitCode === 0) return true;
  }
  return false;
}

/**
 * Best-effort: enable a dnf module stream (e.g. nginx, php, postgresql).
 * On RHEL/Anolis 8+, packages like nginx come from a "module stream" that must be
 * enabled before the package becomes installable. Idempotent.
 */
async function tryEnableDnfModule(executor: SshExecutor, pm: "apt" | "yum" | "dnf", moduleName: string): Promise<boolean> {
  if (pm !== "dnf") return false;
  // Check if dnf supports modules at all (dnf >= 4)
  const supports = await executor.exec("sudo dnf module list >/dev/null 2>&1");
  if (supports.exitCode !== 0) return false;
  const r = await executor.exec(`sudo dnf module enable -y ${moduleName} 2>&1`);
  return r.exitCode === 0;
}

export const packageModule: AnsibleModule<PackageArgs> = {
  name: "package",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    const state = args.state ?? "present";
    const ignoreMissing = args.ignore_missing !== false; // default true
    const rawNames = Array.isArray(args.name) ? args.name : [args.name];

    for (const n of rawNames) {
      if (!SAFE_PACKAGE_NAME.test(n)) {
        return { changed: false, failed: true, msg: `Unsafe package name: ${n}` };
      }
    }

    const pm = await detectPackageManager(executor);
    if (!pm) {
      return { changed: false, failed: true, msg: "No supported package manager found (apt/yum/dnf)." };
    }

    // Cross-distro translation
    const translations = rawNames.map((n) => ({ original: n, ...translatePackageName(n, pm) }));
    const skippedByDistro = translations.filter((t) => t.skipped).map((t) => t.original);
    const todo = translations.filter((t) => !t.skipped);
    const renamedPairs = todo
      .filter((t) => t.name !== t.original)
      .map((t) => `${t.original} → ${t.name}`);

    if (todo.length === 0) {
      return {
        changed: false,
        msg: skippedByDistro.length > 0
          ? `All packages skipped on ${pm}: ${skippedByDistro.join(", ")}`
          : "No packages to install"
      };
    }

    // Filter out already-installed (for present) or already-absent (for absent)
    const needAction: typeof todo = [];
    const alreadyOk: string[] = [];
    for (const t of todo) {
      const installed = await isInstalled(executor, pm, t.name);
      if (state === "present") {
        if (installed) alreadyOk.push(t.name);
        else needAction.push(t);
      } else {
        if (!installed) alreadyOk.push(t.name);
        else needAction.push(t);
      }
    }

    if (needAction.length === 0) {
      const msg = `All packages already in state: ${state}` +
        (alreadyOk.length > 0 ? ` (${alreadyOk.join(", ")})` : "");
      return { changed: false, msg };
    }

    if (dryRun) {
      return {
        changed: true,
        msg: `[dry-run] Would ${state === "present" ? "install" : "remove"} via ${pm}: ${needAction.map((t) => t.name).join(", ")}`
      };
    }

    // For apt, refresh the cache once before installing
    if (state === "present" && pm === "apt" && args.update_cache !== false) {
      await executor.exec("sudo apt-get update -qq");
    }

    // Try batch install/remove first (fast path). Fall through to per-package on failure.
    const targets = needAction.map((t) => t.name);
    const succeeded: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];

    const op = state === "present" ? installOne : removeOne;
    const batchCmd = state === "present"
      ? (pm === "apt" ? `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${targets.join(" ")}` :
         pm === "dnf" ? `sudo dnf install -y ${targets.join(" ")}` :
                        `sudo yum install -y ${targets.join(" ")}`)
      : (pm === "apt" ? `sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y ${targets.join(" ")}` :
         pm === "dnf" ? `sudo dnf remove -y ${targets.join(" ")}` :
                        `sudo yum remove -y ${targets.join(" ")}`);

    const batch = await executor.exec(batchCmd);
    if (batch.exitCode === 0) {
      // Batch worked
      succeeded.push(...targets);
    } else {
      // Batch failed — try one-by-one, optionally enabling EPEL on RHEL for known-EPEL packages
      let epelTried = false;
      const dnfModulesTried = new Set<string>();
      for (const t of needAction) {
        let result = await op(executor, pm, t.name);
        if (!result.ok && state === "present" && pm !== "apt" && looksLikeMissingRepo(result.stderr, result.stdout)) {
          // Strategy 1: enable a dnf module stream if applicable (nginx, php, postgresql, redis, mariadb)
          if (NEEDS_DNF_MODULE.has(t.name) && !dnfModulesTried.has(t.name)) {
            dnfModulesTried.add(t.name);
            const moduleEnabled = await tryEnableDnfModule(executor, pm, t.name);
            if (moduleEnabled) {
              result = await op(executor, pm, t.name);
            }
          }
          // Strategy 2: enable EPEL once if any failing package commonly lives there
          if (!result.ok && !epelTried && (NEEDS_EPEL.has(t.name) || NEEDS_EPEL.has(t.original))) {
            epelTried = true;
            const enabled = await tryEnableEpel(executor, pm);
            if (enabled) {
              result = await op(executor, pm, t.name);
            }
          }
        }
        if (result.ok) {
          succeeded.push(t.name);
        } else {
          // Extract the most informative line
          const reason = looksLikeMissingRepo(result.stderr, result.stdout)
            ? "not in any enabled repo"
            : (result.stderr || result.stdout || "exit non-zero").split("\n").filter((l) => l.trim()).slice(-1)[0]?.slice(0, 200) || "failed";
          failed.push({ name: t.name, reason });
        }
      }
    }

    const noteParts: string[] = [];
    if (renamedPairs.length > 0) noteParts.push(`renamed for ${pm}: ${renamedPairs.join(", ")}`);
    if (skippedByDistro.length > 0) noteParts.push(`skipped on ${pm}: ${skippedByDistro.join(", ")}`);
    if (alreadyOk.length > 0) noteParts.push(`already ${state}: ${alreadyOk.join(", ")}`);
    if (failed.length > 0) noteParts.push(`failed: ${failed.map((f) => `${f.name} (${f.reason})`).join("; ")}`);
    const note = noteParts.length > 0 ? ` [${noteParts.join("; ")}]` : "";

    if (succeeded.length === 0 && failed.length > 0) {
      // Total failure
      return {
        changed: false,
        failed: true,
        msg: `Package ${state} failed for all ${failed.length} packages${note}`,
        stdout: batch.stdout,
        stderr: batch.stderr
      };
    }

    if (failed.length > 0 && !ignoreMissing) {
      // Some succeeded, some failed, and user requires all-or-nothing
      return {
        changed: succeeded.length > 0,
        failed: true,
        msg: `Partial: ${succeeded.length} succeeded, ${failed.length} failed${note}`,
        stdout: batch.stdout,
        stderr: batch.stderr
      };
    }

    // Default (ignore_missing=true): partial success is treated as success
    const action = state === "present" ? "Installed" : "Removed";
    return {
      changed: succeeded.length > 0,
      // failed only if completely failed; partial = success with note
      msg: failed.length > 0
        ? `${action} ${succeeded.length}/${succeeded.length + failed.length} via ${pm}: ${succeeded.join(", ") || "(none)"}${note}`
        : `${action} via ${pm}: ${succeeded.join(", ")}${note}`,
      stdout: batch.stdout,
      stderr: batch.stderr
    };
  }
};
