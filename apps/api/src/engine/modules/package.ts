/**
 * package — 幂等的 apt/yum/dnf 安装/卸载（含跨发行版兼容）
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
 *   4. 【新】对 dnf/yum 系统执行 PREFLIGHT 阶段（主动而非被动）：
 *        - 解析 /etc/os-release 获取 distro family + major version
 *        - 探测 /etc/dnf/dnf.conf 中是否有 exclude= 配置（Aliyun Anolis 等定制镜像常见）
 *        - 如果待装包有需要 EPEL 的，主动安装 epel-release（按主版本号选 URL）
 *        - 如果待装包有需要 dnf module 的（nginx/redis/php/postgresql/mariadb），主动 enable
 *   5. 一次尝试批量安装；如有 exclude 配置则始终带上 --disableexcludes=all
 *   6. 批量失败后逐个安装，收集详细失败原因（每个包都给出可读信息）
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
  "tldr":                    { rhel: "tealdeer", fedora: "tealdeer" },
  // ── Common -dev/-devel libraries (Debian → RHEL) ──
  // Toolchain playbooks (rust/ruby/python build deps) reference Debian names; map them
  // to their EL equivalents so a single PACKAGE_ALIASES table fixes all toolchains at once.
  "libssl-dev":              { rhel: "openssl-devel", fedora: "openssl-devel" },
  "zlib1g-dev":              { rhel: "zlib-devel", fedora: "zlib-devel" },
  "libbz2-dev":              { rhel: "bzip2-devel", fedora: "bzip2-devel" },
  "libreadline-dev":         { rhel: "readline-devel", fedora: "readline-devel" },
  "libsqlite3-dev":          { rhel: "sqlite-devel", fedora: "sqlite-devel" },
  "libffi-dev":              { rhel: "libffi-devel", fedora: "libffi-devel" },
  "liblzma-dev":             { rhel: "xz-devel", fedora: "xz-devel" },
  "libxml2-dev":             { rhel: "libxml2-devel", fedora: "libxml2-devel" },
  "libxmlsec1-dev":          { rhel: "xmlsec1-devel", fedora: "xmlsec1-devel" },
  "libncursesw5-dev":        { rhel: "ncurses-devel", fedora: "ncurses-devel" },
  "libncurses5-dev":         { rhel: "ncurses-devel", fedora: "ncurses-devel" },
  "libcurl4-openssl-dev":    { rhel: "libcurl-devel", fedora: "libcurl-devel" },
  "libpq-dev":               { rhel: "libpq-devel", fedora: "libpq-devel" },
  "libmysqlclient-dev":      { rhel: "mariadb-connector-c-devel", fedora: "mariadb-connector-c-devel" },
  "libjpeg-dev":             { rhel: "libjpeg-turbo-devel", fedora: "libjpeg-turbo-devel" },
  "libpng-dev":              { rhel: "libpng-devel", fedora: "libpng-devel" },
  "libtool":                 { rhel: "libtool", fedora: "libtool" },
  "pkg-config":              { rhel: "pkgconfig", fedora: "pkgconfig" },
  "xz-utils":                { rhel: "xz", fedora: "xz" },
  "tk-dev":                  { rhel: "tk-devel", fedora: "tk-devel" },
  // Ruby
  "ruby-dev":                { rhel: "ruby-devel", fedora: "ruby-devel" },
  // Python alt names
  "python3-setuptools":      { rhel: "python3-setuptools", fedora: "python3-setuptools" },
  // Misc
  "lsb-release":             { rhel: "redhat-lsb-core", fedora: "redhat-lsb-core" },
  "gnupg":                   { rhel: "gnupg2", fedora: "gnupg2" },
  // SQLite naming (libsqlite3-dev already mapped above; keep client name here)
  "sqlite3":                 { rhel: "sqlite", fedora: "sqlite" },
  // Certbot plugin packages — naming differs between distros
  "python3-certbot-nginx":   { rhel: "python3-certbot-nginx", fedora: "python3-certbot-nginx" },
  "python3-certbot-apache":  { rhel: "python3-certbot-apache", fedora: "python3-certbot-apache" },
};

/**
 * Packages on RHEL/CentOS that commonly need EPEL repository enabled.
 * If our package list contains any of these, we proactively install EPEL during preflight.
 */
const NEEDS_EPEL = new Set([
  "bat", "btop", "fd-find", "ripgrep", "zoxide", "git-lfs",
  "fish", "neofetch", "ncdu", "fzf", "tldr", "tealdeer", "micro",
  "neovim", "htop", "iotop", "iftop", "nethogs", "ranger", "tmux",
  "vnstat", "rclone", "borgbackup", "restic",
  "caddy", "cockpit", "fail2ban", "certbot",
  "python-certbot-nginx", "certbot-nginx",
  "python3-certbot-nginx", "python3-certbot-apache",
]);

/**
 * Packages that come from RHEL/Anolis AppStream module streams (dnf module enable required).
 * On EL8/EL9, these names map 1:1 to module names.
 */
const NEEDS_DNF_MODULE = new Set(["nginx", "postgresql", "postgresql-server", "redis", "mariadb", "mariadb-server", "php"]);

/** Information collected during the PREFLIGHT phase, included in the final user-facing msg. */
interface PreflightInfo {
  /** distro family parsed from /etc/os-release ID/ID_LIKE */
  family: "rhel" | "anolis" | "rocky" | "alma" | "centos" | "fedora" | "unknown";
  /** major version (e.g. 8, 9, 10) */
  major: number;
  /** Whether `/etc/dnf/dnf.conf` (or yum.conf) has an `exclude=` line that filters out our packages */
  excludeDetected: boolean;
  /** Status messages from preflight (EPEL install, module enables, etc.) */
  log: string[];
}

function translatePackageName(pkg: string, pm: "apt" | "yum" | "dnf"): { name: string; skipped?: boolean } {
  if (pm === "apt") return { name: pkg };
  const alias = PACKAGE_ALIASES[pkg];
  if (!alias) return { name: pkg };
  const target = alias.rhel ?? alias.fedora ?? pkg;
  if (target === "(skip)") return { name: pkg, skipped: true };
  return { name: target };
}

async function detectPackageManager(executor: SshExecutor): Promise<"apt" | "yum" | "dnf" | null> {
  // Apt is preferred when present (Debian/Ubuntu).
  const apt = await executor.exec("command -v apt-get >/dev/null 2>&1");
  if (apt.exitCode === 0) return "apt";
  const dnf = await executor.exec("command -v dnf >/dev/null 2>&1");
  if (dnf.exitCode === 0) return "dnf";
  const yum = await executor.exec("command -v yum >/dev/null 2>&1");
  if (yum.exitCode === 0) return "yum";
  return null;
}

/** Parse /etc/os-release to identify distro family and major version. */
async function detectDistro(executor: SshExecutor): Promise<{ family: PreflightInfo["family"]; major: number }> {
  const r = await executor.exec("cat /etc/os-release 2>/dev/null");
  if (r.exitCode !== 0) return { family: "unknown", major: 0 };
  const text = r.stdout;
  const idMatch = text.match(/^ID=("?)([a-z]+)\1/m);
  const verMatch = text.match(/^VERSION_ID=("?)([\d.]+)\1/m);
  const idLikeMatch = text.match(/^ID_LIKE=("?)([^"\n]+)\1/m);
  const id = idMatch?.[2]?.toLowerCase() ?? "";
  const idLike = idLikeMatch?.[2]?.toLowerCase() ?? "";
  const major = verMatch?.[2] ? parseInt(verMatch[2].split(".")[0], 10) : 0;

  let family: PreflightInfo["family"] = "unknown";
  if (id === "anolis") family = "anolis";
  else if (id === "rocky") family = "rocky";
  else if (id === "almalinux" || id === "alma") family = "alma";
  else if (id === "centos") family = "centos";
  else if (id === "fedora") family = "fedora";
  else if (id === "rhel" || id === "redhat") family = "rhel";
  else if (idLike.includes("rhel") || idLike.includes("centos") || idLike.includes("fedora")) family = "rhel";

  return { family, major };
}

/**
 * Detect whether dnf/yum has an `exclude=` config that may filter out our packages.
 * Aliyun Anolis custom images are well-known for shipping `exclude=nginx*` to
 * push their custom-built version. Returns true if we should pass --disableexcludes=all.
 */
async function detectDnfExclude(executor: SshExecutor): Promise<boolean> {
  const r = await executor.exec(
    "grep -hE '^[[:space:]]*exclude[[:space:]]*=' /etc/dnf/dnf.conf /etc/yum.conf 2>/dev/null | grep -v '^[[:space:]]*#'"
  );
  return r.exitCode === 0 && r.stdout.trim().length > 0;
}

async function isInstalled(executor: SshExecutor, pm: "apt" | "yum" | "dnf", pkg: string): Promise<boolean> {
  if (pm === "apt") {
    const r = await executor.exec(`dpkg-query -W -f='\${Status}' ${pkg} 2>/dev/null | grep -q "install ok installed"`);
    return r.exitCode === 0;
  }
  const r = await executor.exec(`rpm -q ${pkg} >/dev/null 2>&1`);
  return r.exitCode === 0;
}

/**
 * Try to install a single package on the given pm; returns ok=true on success.
 * `disableExcludes` adds --disableexcludes=all to bypass /etc/dnf/dnf.conf exclude lists.
 */
async function installOne(
  executor: SshExecutor,
  pm: "apt" | "yum" | "dnf",
  pkg: string,
  disableExcludes = false
): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  let cmd: string;
  if (pm === "apt") {
    cmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkg}`;
  } else if (pm === "dnf") {
    cmd = `sudo dnf install -y${disableExcludes ? " --disableexcludes=all" : ""} ${pkg}`;
  } else {
    cmd = `sudo yum install -y${disableExcludes ? " --disableexcludes=all" : ""} ${pkg}`;
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

function looksLikeMissingRepo(stderr: string, stdout: string): boolean {
  const msg = `${stderr}\n${stdout}`.toLowerCase();
  return msg.includes("no match for argument") ||
         msg.includes("unable to find a match") ||
         msg.includes("no package") ||
         msg.includes("all matches were filtered out") ||
         msg.includes("excluded by exclude filtering");
}

function looksLikeExcludeFilter(stderr: string, stdout: string): boolean {
  const msg = `${stderr}\n${stdout}`.toLowerCase();
  return msg.includes("all matches were filtered out") ||
         msg.includes("excluded by exclude filtering");
}

/**
 * Best-effort: enable EPEL on RHEL/CentOS/Anolis.
 * Picks the URL matching the OS major version when known, plus a few fallbacks.
 * Idempotent: returns true if already installed or if newly installed.
 */
async function tryEnableEpel(executor: SshExecutor, pm: "apt" | "yum" | "dnf", major: number): Promise<{ ok: boolean; note: string }> {
  if (pm === "apt") return { ok: false, note: "skipped (apt-based)" };
  // Already installed?
  const check = await executor.exec("rpm -q epel-release >/dev/null 2>&1");
  if (check.exitCode === 0) return { ok: true, note: "already installed" };

  // Build strategy list, putting the version-matched URL first when known.
  const strategies: string[] = ["sudo dnf install -y epel-release", "sudo yum install -y epel-release"];
  if (major === 9) {
    strategies.unshift("sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm");
  } else if (major === 8) {
    strategies.unshift("sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm");
  } else if (major === 10) {
    strategies.unshift("sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-10.noarch.rpm");
  } else {
    // Unknown major — try both 8 and 9 in order
    strategies.push(
      "sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm",
      "sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm"
    );
  }

  for (const cmd of strategies) {
    const r = await executor.exec(cmd);
    if (r.exitCode === 0) return { ok: true, note: `installed via ${cmd.includes("http") ? "fedoraproject.org" : "default repo"}` };
  }
  return { ok: false, note: "all install strategies failed" };
}

/**
 * Best-effort: enable a dnf module stream (e.g. nginx, php, postgresql).
 * On RHEL/Anolis 8+, these come from "module streams" that must be enabled first.
 */
async function tryEnableDnfModule(executor: SshExecutor, pm: "apt" | "yum" | "dnf", moduleName: string): Promise<boolean> {
  if (pm !== "dnf") return false;
  const supports = await executor.exec("sudo dnf module list >/dev/null 2>&1");
  if (supports.exitCode !== 0) return false;
  const r = await executor.exec(`sudo dnf module enable -y ${moduleName} 2>&1`);
  return r.exitCode === 0;
}

/**
 * PROACTIVE preflight phase for dnf/yum systems.
 * Runs BEFORE the install attempt: detects distro, installs EPEL upfront if needed,
 * enables any required dnf module streams, and detects exclude config.
 */
async function runPreflight(
  executor: SshExecutor,
  pm: "apt" | "yum" | "dnf",
  packagesToInstall: string[]
): Promise<PreflightInfo> {
  const log: string[] = [];

  if (pm === "apt") {
    return { family: "unknown", major: 0, excludeDetected: false, log };
  }

  const distro = await detectDistro(executor);
  log.push(`distro: ${distro.family}${distro.major ? ` ${distro.major}` : ""}`);

  // Detect exclude config that may filter out our packages
  const excludeDetected = await detectDnfExclude(executor);
  if (excludeDetected) log.push("dnf exclude= detected → will use --disableexcludes=all");

  // Pre-install EPEL if any package in our list lives there
  const needsEpel = packagesToInstall.some((p) => NEEDS_EPEL.has(p));
  if (needsEpel) {
    const epel = await tryEnableEpel(executor, pm, distro.major);
    log.push(`EPEL: ${epel.note}`);
  }

  // Pre-enable any dnf module streams our packages need
  const modules = packagesToInstall.filter((p) => NEEDS_DNF_MODULE.has(p));
  if (modules.length > 0 && pm === "dnf") {
    for (const m of modules) {
      const ok = await tryEnableDnfModule(executor, pm, m);
      log.push(`module ${m}: ${ok ? "enabled" : "skip (already enabled or unavailable)"}`);
    }
  }

  // Refresh metadata once so newly-enabled repos/modules are visible
  if (needsEpel || modules.length > 0 || excludeDetected) {
    await executor.exec(`sudo ${pm} makecache --refresh -y >/dev/null 2>&1 || sudo ${pm} makecache >/dev/null 2>&1`);
    log.push("metadata: refreshed");
  }

  return { family: distro.family, major: distro.major, excludeDetected, log };
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

    // ── PREFLIGHT (only relevant for present + dnf/yum) ──
    let preflight: PreflightInfo | null = null;
    if (state === "present" && pm !== "apt") {
      preflight = await runPreflight(executor, pm, needAction.map((t) => t.name));
    }

    // For apt, refresh the cache once before installing
    if (state === "present" && pm === "apt" && args.update_cache !== false) {
      await executor.exec("sudo apt-get update -qq");
    }

    // Try batch install/remove (with --disableexcludes=all if exclude config was detected)
    const targets = needAction.map((t) => t.name);
    const disableExcludes = preflight?.excludeDetected ?? false;
    const succeeded: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];

    const batchCmd = state === "present"
      ? (pm === "apt" ? `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${targets.join(" ")}` :
         pm === "dnf" ? `sudo dnf install -y${disableExcludes ? " --disableexcludes=all" : ""} ${targets.join(" ")}` :
                        `sudo yum install -y${disableExcludes ? " --disableexcludes=all" : ""} ${targets.join(" ")}`)
      : (pm === "apt" ? `sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y ${targets.join(" ")}` :
         pm === "dnf" ? `sudo dnf remove -y ${targets.join(" ")}` :
                        `sudo yum remove -y ${targets.join(" ")}`);

    const batch = await executor.exec(batchCmd);
    const op = state === "present" ? installOne : removeOne;

    if (batch.exitCode === 0) {
      succeeded.push(...targets);
    } else {
      // Batch failed — try one-by-one. Each package gets up to 3 recovery attempts:
      //   (a) plain retry (transient failure)
      //   (b) bypass dnf exclude filter (if not already passing --disableexcludes=all)
      //   (c) install EPEL or enable dnf module on demand (if preflight didn't already)
      let lateEpelTried = false;
      const lateModulesTried = new Set<string>();
      for (const t of needAction) {
        // First attempt with the same exclude flag the batch used.
        let result = state === "present"
          ? await installOne(executor, pm, t.name, disableExcludes)
          : await op(executor, pm, t.name);

        if (!result.ok && state === "present" && pm !== "apt" && looksLikeMissingRepo(result.stderr, result.stdout)) {
          // (b) If we weren't bypassing excludes yet, try with bypass.
          if (!disableExcludes && looksLikeExcludeFilter(result.stderr, result.stdout)) {
            result = await installOne(executor, pm, t.name, true);
          }
          // (c) Late-stage EPEL install (only if preflight didn't already, or if it failed).
          if (!result.ok && !lateEpelTried && (NEEDS_EPEL.has(t.name) || NEEDS_EPEL.has(t.original))) {
            lateEpelTried = true;
            const epel = await tryEnableEpel(executor, pm, preflight?.major ?? 0);
            if (epel.ok) {
              result = await installOne(executor, pm, t.name, disableExcludes);
              if (!result.ok && !disableExcludes && looksLikeExcludeFilter(result.stderr, result.stdout)) {
                result = await installOne(executor, pm, t.name, true);
              }
            }
          }
          // (c) Late-stage module enable (only if preflight didn't already)
          if (!result.ok && NEEDS_DNF_MODULE.has(t.name) && !lateModulesTried.has(t.name)) {
            lateModulesTried.add(t.name);
            const moduleEnabled = await tryEnableDnfModule(executor, pm, t.name);
            if (moduleEnabled) {
              result = await installOne(executor, pm, t.name, disableExcludes);
              if (!result.ok && !disableExcludes && looksLikeExcludeFilter(result.stderr, result.stdout)) {
                result = await installOne(executor, pm, t.name, true);
              }
            }
          }
        }

        if (result.ok) {
          succeeded.push(t.name);
        } else {
          const reason = looksLikeExcludeFilter(result.stderr, result.stdout)
            ? "excluded by dnf config (use --disableexcludes=all manually if intentional)"
            : looksLikeMissingRepo(result.stderr, result.stdout)
            ? "not in any enabled repo (try EPEL or check distro compatibility)"
            : (result.stderr || result.stdout || "exit non-zero").split("\n").filter((l) => l.trim()).slice(-1)[0]?.slice(0, 200) || "failed";
          failed.push({ name: t.name, reason });
        }
      }
    }

    // Build the user-facing message. We use 📦 as a marker so runner.ts can preserve it.
    const noteParts: string[] = [];
    if (preflight && preflight.log.length > 0) {
      noteParts.push(`preflight: ${preflight.log.join("; ")}`);
    }
    if (renamedPairs.length > 0) noteParts.push(`renamed for ${pm}: ${renamedPairs.join(", ")}`);
    if (skippedByDistro.length > 0) noteParts.push(`skipped on ${pm}: ${skippedByDistro.join(", ")}`);
    if (alreadyOk.length > 0) noteParts.push(`already ${state}: ${alreadyOk.join(", ")}`);
    if (failed.length > 0) noteParts.push(`failed: ${failed.map((f) => `${f.name} (${f.reason})`).join("; ")}`);
    const note = noteParts.length > 0 ? ` [${noteParts.join("; ")}]` : "";

    if (succeeded.length === 0 && failed.length > 0) {
      // Total failure — include detailed per-package reasons + preflight log
      return {
        changed: false,
        failed: true,
        msg: `📦 Package ${state} failed for all ${failed.length} packages${note}`,
        stdout: batch.stdout,
        stderr: batch.stderr
      };
    }

    if (failed.length > 0 && !ignoreMissing) {
      return {
        changed: succeeded.length > 0,
        failed: true,
        msg: `📦 Partial: ${succeeded.length} succeeded, ${failed.length} failed${note}`,
        stdout: batch.stdout,
        stderr: batch.stderr
      };
    }

    // Default (ignore_missing=true): partial success is treated as success
    const action = state === "present" ? "Installed" : "Removed";
    return {
      changed: succeeded.length > 0,
      msg: failed.length > 0
        ? `📦 ${action} ${succeeded.length}/${succeeded.length + failed.length} via ${pm}: ${succeeded.join(", ") || "(none)"}${note}`
        : `📦 ${action} via ${pm}: ${succeeded.join(", ")}${note}`,
      stdout: batch.stdout,
      stderr: batch.stderr
    };
  }
};
