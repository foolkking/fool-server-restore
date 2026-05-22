/**
 * package — 幂等的 apt/yum/dnf 安装/卸载
 *
 * Args:
 *   name: string | string[]   要安装的包名（一个或多个）
 *   state: "present" | "absent"   present = 安装，absent = 卸载
 *   update_cache?: boolean    安装前是否 apt-get update（仅 apt）
 *
 * 行为：
 *   1. 先检测包管理器（apt / yum / dnf）
 *   2. 用 dpkg-query / rpm -q 检查包是否已安装
 *   3. 已经处于目标状态时返回 changed=false（幂等）
 *   4. 否则执行安装/卸载命令
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface PackageArgs {
  name: string | string[];
  state?: "present" | "absent";
  update_cache?: boolean;
}

const SAFE_PACKAGE_NAME = /^[a-zA-Z0-9._@/+:-]{1,100}$/;

/**
 * Cross-distro package name aliases.
 * Keys are Debian/Ubuntu names; values give per-distro alternatives.
 * When running on a non-apt system, we translate the name automatically
 * (and emit a friendly note in the result so the user knows what we did).
 */
const PACKAGE_ALIASES: Record<string, { rhel?: string; fedora?: string; alpine?: string; arch?: string }> = {
  // Debian → RHEL/Fedora
  "redis-server":            { rhel: "redis", fedora: "redis" },
  "mysql-server":            { rhel: "mysql-server", fedora: "mysql-server" },
  "mariadb-server":          { rhel: "mariadb-server", fedora: "mariadb-server" },
  "postgresql":              { rhel: "postgresql-server", fedora: "postgresql-server" },
  "postgresql-client":       { rhel: "postgresql", fedora: "postgresql" },
  "docker.io":               { rhel: "docker-ce", fedora: "docker-ce" },
  "docker-compose-plugin":   { rhel: "docker-compose-plugin", fedora: "docker-compose-plugin" },
  "git-lfs":                 { rhel: "git-lfs", fedora: "git-lfs" }, // available in EPEL
  "fd-find":                 { rhel: "fd-find", fedora: "fd-find" }, // EPEL
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

/** Translate a Debian package name for the active package manager. Returns the same name if no alias. */
function translatePackageName(pkg: string, pm: "apt" | "yum" | "dnf"): { name: string; skipped?: boolean } {
  if (pm === "apt") return { name: pkg };
  const alias = PACKAGE_ALIASES[pkg];
  if (!alias) return { name: pkg };
  const target = alias.rhel ?? alias.fedora ?? pkg;
  if (target === "(skip)") return { name: pkg, skipped: true };
  return { name: target };
}


async function detectPackageManager(executor: SshExecutor): Promise<"apt" | "yum" | "dnf" | null> {
  const { exitCode: hasApt } = await executor.exec("command -v apt-get >/dev/null 2>&1; echo $?");
  if (hasApt === 0) {
    const r = await executor.exec("command -v apt-get >/dev/null 2>&1");
    if (r.exitCode === 0) return "apt";
  }
  const r1 = await executor.exec("command -v dnf >/dev/null 2>&1");
  if (r1.exitCode === 0) return "dnf";
  const r2 = await executor.exec("command -v yum >/dev/null 2>&1");
  if (r2.exitCode === 0) return "yum";
  const r3 = await executor.exec("command -v apt-get >/dev/null 2>&1");
  if (r3.exitCode === 0) return "apt";
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

export const packageModule: AnsibleModule<PackageArgs> = {
  name: "package",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    const state = args.state ?? "present";
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

    // Cross-distro translation: Debian-style names → RHEL/Fedora equivalents
    const translations = rawNames.map((n) => ({ original: n, ...translatePackageName(n, pm) }));
    const skipped = translations.filter((t) => t.skipped).map((t) => t.original);
    const names = translations.filter((t) => !t.skipped).map((t) => t.name);
    // Preserve mapping for messages
    const renamedPairs = translations
      .filter((t) => !t.skipped && t.name !== t.original)
      .map((t) => `${t.original} → ${t.name}`);

    if (names.length === 0) {
      const msg = skipped.length > 0
        ? `All packages skipped on ${pm}: ${skipped.join(", ")}`
        : "No packages to install";
      return { changed: false, msg };
    }

    // Check current state
    const needAction: string[] = [];
    for (const pkg of names) {
      const installed = await isInstalled(executor, pm, pkg);
      if (state === "present" && !installed) needAction.push(pkg);
      if (state === "absent" && installed) needAction.push(pkg);
    }

    if (needAction.length === 0) {
      return { changed: false, msg: `All packages already in state: ${state}` };
    }

    if (dryRun) {
      return {
        changed: true,
        msg: `[dry-run] Would ${state === "present" ? "install" : "remove"} via ${pm}: ${needAction.join(", ")}`
      };
    }

    // Build command
    let cmd: string;
    const list = needAction.join(" ");
    if (pm === "apt") {
      const update = args.update_cache !== false ? "sudo apt-get update -qq && " : "";
      cmd = state === "present"
        ? `${update}sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${list}`
        : `sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y ${list}`;
    } else if (pm === "dnf") {
      cmd = state === "present"
        ? `sudo dnf install -y ${list}`
        : `sudo dnf remove -y ${list}`;
    } else {
      cmd = state === "present"
        ? `sudo yum install -y ${list}`
        : `sudo yum remove -y ${list}`;
    }

    const { stdout, stderr, exitCode } = await executor.exec(cmd);
    const noteParts: string[] = [];
    if (renamedPairs.length > 0) noteParts.push(`renamed for ${pm}: ${renamedPairs.join(", ")}`);
    if (skipped.length > 0) noteParts.push(`skipped (not applicable on ${pm}): ${skipped.join(", ")}`);
    const note = noteParts.length > 0 ? ` (${noteParts.join("; ")})` : "";
    if (exitCode !== 0) {
      return { changed: false, failed: true, msg: `Package ${state} failed (exit ${exitCode})${note}`, stdout, stderr };
    }
    return {
      changed: true,
      msg: `${state === "present" ? "Installed" : "Removed"} via ${pm}: ${list}${note}`,
      stdout,
      stderr
    };
  }
};
