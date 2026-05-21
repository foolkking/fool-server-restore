/**
 * remote-collector.ts — 全面的远程系统信息采集
 *
 * 采集范围（仅只读命令）：
 * - 系统信息：hostname、CPU、内存、磁盘、运行时间
 * - 系统包：dpkg / rpm / snap / flatpak（完整列表）
 * - 语言包：npm 全局、pip、gem、cargo
 * - 手工安装：/usr/local/bin、/opt、~/.local/bin
 * - 版本管理器：nvm、pyenv、rbenv、asdf
 * - 容器：docker images
 * - 服务：systemctl enabled / running
 *
 * 设计：用 ===SECTION:NAME=== 分隔符在一个 SSH exec 中收集所有信息，
 *      然后按 section 解析。这样比多个 exec 通道快，比一个超长命令好维护。
 */

import type { Client } from "ssh2";

const COLLECT_SCRIPT = String.raw`
echo "===SECTION:hostname==="
hostname 2>/dev/null

echo "===SECTION:uname==="
uname -s 2>/dev/null
uname -m 2>/dev/null
uname -r 2>/dev/null

echo "===SECTION:cpu==="
nproc 2>/dev/null
cat /proc/cpuinfo 2>/dev/null | grep -m1 'model name' | cut -d: -f2 | xargs

echo "===SECTION:memory==="
free -b 2>/dev/null | awk '/^Mem:/{print $2, $4}'

echo "===SECTION:disk==="
df -h / 2>/dev/null | tail -1 | awk '{print $2"|"$3"|"$4"|"$5}'

echo "===SECTION:uptime==="
uptime -p 2>/dev/null

echo "===SECTION:os-release==="
cat /etc/os-release 2>/dev/null | grep -E '^(PRETTY_NAME|ID|VERSION_ID)=' | head -3

echo "===SECTION:apt==="
# Collect all manually-marked apt packages (filtering done in TypeScript)
apt-mark showmanual 2>/dev/null | sort -u | while read pkg; do
  ver=$(dpkg-query -W -f='\${Version}' "$pkg" 2>/dev/null)
  [ -n "$ver" ] && echo "$pkg|$ver"
done

echo "===SECTION:apt-manual==="
apt-mark showmanual 2>/dev/null | sort -u

echo "===SECTION:rpm==="
rpm -qa --queryformat '%{NAME}|%{VERSION}\n' 2>/dev/null

echo "===SECTION:snap==="
snap list 2>/dev/null | tail -n +2 | awk '{print $1"|"$2}'

echo "===SECTION:flatpak==="
flatpak list --columns=application,version 2>/dev/null

echo "===SECTION:npm==="
npm list -g --depth=0 --parseable 2>/dev/null | tail -n +2 | awk -F'/' '{print $NF}'

echo "===SECTION:pip==="
pip3 list --format=freeze 2>/dev/null
pip list --format=freeze 2>/dev/null

echo "===SECTION:gem==="
gem list --local 2>/dev/null

echo "===SECTION:cargo==="
ls -1 ~/.cargo/bin 2>/dev/null
ls -1 /root/.cargo/bin 2>/dev/null

echo "===SECTION:local-bin==="
ls -1 /usr/local/bin 2>/dev/null

echo "===SECTION:local-sbin==="
ls -1 /usr/local/sbin 2>/dev/null

echo "===SECTION:local-apps==="
ls -1d /usr/local/*/ 2>/dev/null | xargs -n1 basename 2>/dev/null | grep -vE '^(bin|lib|lib64|share|include|etc|man|src|sbin|games|libexec)$'

echo "===SECTION:opt==="
ls -1 /opt 2>/dev/null

echo "===SECTION:srv==="
ls -1 /srv 2>/dev/null | head -20

echo "===SECTION:user-bin==="
ls -1 ~/.local/bin 2>/dev/null

echo "===SECTION:go-bin==="
ls -1 ~/go/bin 2>/dev/null
ls -1 /root/go/bin 2>/dev/null

echo "===SECTION:nvm==="
ls -1 ~/.nvm/versions/node 2>/dev/null

echo "===SECTION:pyenv==="
ls -1 ~/.pyenv/versions 2>/dev/null

echo "===SECTION:rbenv==="
ls -1 ~/.rbenv/versions 2>/dev/null

echo "===SECTION:asdf==="
ls -1 ~/.asdf/installs 2>/dev/null | head -20

echo "===SECTION:sdkman==="
ls -1 ~/.sdkman/candidates 2>/dev/null

echo "===SECTION:docker-images==="
docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null

echo "===SECTION:cron-jobs==="
ls -1 /etc/cron.d 2>/dev/null | grep -vE '^(\.placeholder|e2scrub)$'
crontab -l 2>/dev/null | grep -vE '^(#|$|SHELL|PATH|MAILTO)'

echo "===SECTION:systemd-timers==="
systemctl list-unit-files --state=enabled --type=timer --no-legend 2>/dev/null | awk '{print $1}' | grep -vE '^(apt-|systemd-|fstrim|logrotate|man-db|motd-news|e2scrub)'

echo "===SECTION:services-enabled==="
systemctl list-unit-files --state=enabled --type=service --no-legend 2>/dev/null | awk '{print $1}'

echo "===SECTION:services-running==="
systemctl list-units --state=running --type=service --no-legend 2>/dev/null | awk '{print $1}'

echo "===SECTION:custom-services==="
ls -1 /etc/systemd/system/*.service 2>/dev/null | xargs -n1 basename 2>/dev/null

echo "===SECTION:env-count==="
env 2>/dev/null | wc -l

echo "===SECTION:ssh-status==="
systemctl is-active sshd 2>/dev/null

echo "===SECTION:security-audit==="
# SSH hardening checks
grep -i "^PermitRootLogin" /etc/ssh/sshd_config 2>/dev/null | head -1 || echo "PermitRootLogin not-set"
grep -i "^PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null | head -1 || echo "PasswordAuthentication not-set"
grep -i "^MaxAuthTries" /etc/ssh/sshd_config 2>/dev/null | head -1 || echo "MaxAuthTries not-set"
# Firewall status
sudo ufw status 2>/dev/null | head -1 || echo "UFW not-installed"
# Fail2ban status
systemctl is-active fail2ban 2>/dev/null || echo "fail2ban-inactive"
# Unattended upgrades
dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii" && echo "auto-updates-enabled" || echo "auto-updates-disabled"
# Open ports (listening)
ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ',' || echo "none"

echo "===SECTION:end==="
`;

const COLLECT_TIMEOUT_MS = 30_000; // 30s — dpkg -l can be slow on busy systems

export interface SoftwareItem {
  name: string;
  version: string;
  source: string;
  status: string;
}

export interface ConfigItem {
  id: string;
  label: string;
  category: string;
  status: string;
  lastChanged: string;
}

export interface FullSystemSnapshot {
  agentId: string;
  collectedAt: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    release: string;
    uptime: number;
    osPretty?: string;
    cpu: { model: string; cores: number; speedMhz: number };
    memory: { totalBytes: number; freeBytes: number; usedBytes: number; totalGb: string; freeGb: string };
    disk?: { total: string; used: string; available: string; usePercent: string };
    uptimeText?: string;
  };
  software: SoftwareItem[];
  configChecklist: ConfigItem[];
  /** Counts per source for summary display */
  counts: {
    apt: number;
    rpm: number;
    snap: number;
    flatpak: number;
    npm: number;
    pip: number;
    gem: number;
    cargo: number;
    localBin: number;
    opt: number;
    userBin: number;
    nvm: number;
    pyenv: number;
    docker: number;
    enabledServices: number;
    runningServices: number;
    total: number;
  };
}

/** Collect a comprehensive snapshot via a single SSH exec */
export async function collectRemoteSnapshot(client: Client, host: string): Promise<FullSystemSnapshot> {
  const start = Date.now();
  const stdout = await new Promise<string>((resolve, reject) => {
    client.exec(COLLECT_SCRIPT, (err, stream) => {
      if (err) { reject(err); return; }
      let buf = "";
      const timer = setTimeout(() => {
        stream.destroy();
        // Don't reject — return what we have
        resolve(buf);
      }, COLLECT_TIMEOUT_MS);
      stream.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
      stream.stderr.on("data", () => { /* ignore stderr */ });
      stream.on("close", () => { clearTimeout(timer); resolve(buf); });
      stream.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });
  });

  return parseFullOutput(stdout, host, Date.now() - start);
}

function parseFullOutput(raw: string, host: string, _latencyMs: number): FullSystemSnapshot {
  const sections = parseSections(raw);

  // ── System info ──
  const hostname = (sections.hostname ?? "").split("\n")[0].trim() || host;
  const unameLines = (sections.uname ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const platform = (unameLines[0] ?? "linux").toLowerCase();
  const arch = unameLines[1] ?? "x64";
  const release = unameLines[2] ?? "";

  const cpuLines = (sections.cpu ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const cores = parseInt(cpuLines[0] ?? "1", 10) || 1;
  const cpuModel = cpuLines[1] ?? "unknown";

  const memLine = (sections.memory ?? "").trim();
  const memParts = memLine.split(/\s+/);
  const totalBytes = parseInt(memParts[0] ?? "0", 10) || 0;
  const freeBytes = parseInt(memParts[1] ?? "0", 10) || 0;

  const diskParts = (sections.disk ?? "").trim().split("|");
  const disk = diskParts.length === 4 ? {
    total: diskParts[0],
    used: diskParts[1],
    available: diskParts[2],
    usePercent: diskParts[3]
  } : undefined;

  const uptimeText = (sections.uptime ?? "").trim() || undefined;

  // OS pretty name
  const osLines = (sections["os-release"] ?? "").split("\n");
  const prettyMatch = osLines.find((l) => l.startsWith("PRETTY_NAME="));
  const osPretty = prettyMatch ? prettyMatch.split("=")[1].replace(/^"|"$/g, "") : undefined;

  // ── Software inventory ──
  const software: SoftwareItem[] = [];

  // 收集 apt-mark showmanual 列表（用户安装，排除系统预装）
  const aptManualSet = new Set(
    (sections["apt-manual"] ?? "").split("\n").map((l) => l.trim()).filter(Boolean)
  );

  // apt packages — filter out system/pre-installed packages in TypeScript
  const aptPackages = parseKeyValueLines(sections.apt, "|");
  for (const { key, value } of aptPackages) {
    if (isSystemAptPackage(key)) continue;
    software.push({
      name: key,
      version: value,
      source: "apt",
      status: "installed"
    });
  }

  // rpm packages
  const rpmPackages = parseKeyValueLines(sections.rpm, "|");
  for (const { key, value } of rpmPackages) {
    software.push({ name: key, version: value, source: "rpm", status: "installed" });
  }

  // snap (filter out system snaps)
  const snapPackages = parseKeyValueLines(sections.snap, "|");
  for (const { key, value } of snapPackages) {
    if (isSystemSnap(key)) continue;
    software.push({ name: key, version: value, source: "snap", status: "installed" });
  }

  // flatpak
  const flatpakPackages = parseFlatpakLines(sections.flatpak);
  for (const { key, value } of flatpakPackages) {
    software.push({ name: key, version: value, source: "flatpak", status: "installed" });
  }

  // npm globals
  for (const name of parseLines(sections.npm)) {
    if (!name || name === "npm") continue;
    software.push({ name, version: "global", source: "npm", status: "installed" });
  }

  // pip packages
  const pipLines = new Set([
    ...parseLines(sections.pip)
  ]);
  for (const line of pipLines) {
    const m = line.match(/^([^=]+)==(.+)$/);
    if (m) {
      software.push({ name: m[1].trim(), version: m[2].trim(), source: "pip", status: "installed" });
    }
  }

  // gem
  for (const line of parseLines(sections.gem)) {
    const m = line.match(/^(\S+)\s+\((.+)\)$/);
    if (m) {
      software.push({ name: m[1], version: m[2].split(",")[0].trim(), source: "gem", status: "installed" });
    }
  }

  // cargo
  const cargoBins = new Set([...parseLines(sections.cargo)]);
  for (const name of cargoBins) {
    if (name) software.push({ name, version: "cargo", source: "cargo", status: "installed" });
  }

  // /usr/local/bin
  for (const name of parseLines(sections["local-bin"])) {
    if (name) software.push({ name, version: "binary", source: "local-bin", status: "installed" });
  }

  // /usr/local/sbin
  for (const name of parseLines(sections["local-sbin"])) {
    if (name) software.push({ name, version: "binary", source: "local-bin", status: "installed" });
  }

  // /usr/local/<app>/ directories (script-installed apps like x-ui, go, etc.)
  for (const name of parseLines(sections["local-apps"])) {
    if (name) software.push({ name, version: "app", source: "local-app", status: "installed" });
  }

  // /opt
  for (const name of parseLines(sections.opt)) {
    if (name) software.push({ name, version: "directory", source: "opt", status: "installed" });
  }

  // /srv (server applications, web apps)
  for (const name of parseLines(sections.srv)) {
    if (name) software.push({ name, version: "directory", source: "srv", status: "installed" });
  }

  // ~/.local/bin
  for (const name of parseLines(sections["user-bin"])) {
    if (name) software.push({ name, version: "binary", source: "user-bin", status: "installed" });
  }

  // ~/go/bin (Go compiled binaries)
  for (const name of parseLines(sections["go-bin"])) {
    if (name) software.push({ name, version: "go-binary", source: "go-bin", status: "installed" });
  }

  // nvm versions
  for (const ver of parseLines(sections.nvm)) {
    if (ver) software.push({ name: "node", version: ver.replace(/^v/, ""), source: "nvm", status: "installed" });
  }

  // pyenv versions
  for (const ver of parseLines(sections.pyenv)) {
    if (ver) software.push({ name: "python", version: ver, source: "pyenv", status: "installed" });
  }

  // rbenv versions
  for (const ver of parseLines(sections.rbenv)) {
    if (ver) software.push({ name: "ruby", version: ver, source: "rbenv", status: "installed" });
  }

  // asdf
  for (const tool of parseLines(sections.asdf)) {
    if (tool) software.push({ name: tool, version: "asdf", source: "asdf", status: "installed" });
  }

  // sdkman
  for (const candidate of parseLines(sections.sdkman)) {
    if (candidate) software.push({ name: candidate, version: "sdkman", source: "sdkman", status: "installed" });
  }

  // docker images
  for (const image of parseLines(sections["docker-images"])) {
    if (!image || image === "<none>:<none>") continue;
    const colonIdx = image.lastIndexOf(":");
    if (colonIdx > 0) {
      software.push({
        name: image.slice(0, colonIdx),
        version: image.slice(colonIdx + 1),
        source: "docker",
        status: "installed"
      });
    } else {
      software.push({ name: image, version: "latest", source: "docker", status: "installed" });
    }
  }

  // cron jobs (user-defined scheduled tasks, filter system ones)
  for (const line of parseLines(sections["cron-jobs"])) {
    if (line && !isSystemCron(line)) {
      software.push({ name: line, version: "cron", source: "cron", status: "installed" });
    }
  }

  // systemd timers (user-defined, filter system ones)
  for (const timer of parseLines(sections["systemd-timers"])) {
    if (timer) {
      const name = timer.replace(/\.timer$/, "");
      if (isSystemTimer(name)) continue;
      software.push({ name, version: "timer", source: "systemd-timer", status: "installed" });
    }
  }

  // ── Counts ──
  const counts = {
    apt: software.filter((s) => s.source === "apt" || s.source === "apt-manual").length,
    rpm: software.filter((s) => s.source === "rpm").length,
    snap: software.filter((s) => s.source === "snap").length,
    flatpak: software.filter((s) => s.source === "flatpak").length,
    npm: software.filter((s) => s.source === "npm").length,
    pip: software.filter((s) => s.source === "pip").length,
    gem: software.filter((s) => s.source === "gem").length,
    cargo: software.filter((s) => s.source === "cargo").length,
    localBin: software.filter((s) => s.source === "local-bin").length,
    opt: software.filter((s) => s.source === "opt").length,
    userBin: software.filter((s) => s.source === "user-bin").length,
    nvm: software.filter((s) => s.source === "nvm").length,
    pyenv: software.filter((s) => s.source === "pyenv").length,
    docker: software.filter((s) => s.source === "docker").length,
    enabledServices: parseLines(sections["services-enabled"]).filter(Boolean).length,
    runningServices: parseLines(sections["services-running"]).filter(Boolean).length,
    total: software.length
  };

  // ── Custom systemd services (user-installed apps like x-ui, caddy, etc.) ──
  const customServices = parseLines(sections["custom-services"]).filter(Boolean);
  for (const svc of customServices) {
    const name = svc.replace(/\.service$/, "");
    if (isSystemService(name)) continue;
    // Skip if already in software list from another source
    if (!software.find((s) => s.name === name)) {
      software.push({ name, version: "service", source: "systemd", status: "installed" });
    }
  }

  // ── Config checklist ──
  const sshActive = (sections["ssh-status"] ?? "").trim() === "active";
  const envCount = parseInt((sections["env-count"] ?? "0").trim(), 10) || 0;

  // Parse security audit results
  const auditLines = (sections["security-audit"] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const rootLogin = auditLines.find((l) => l.includes("PermitRootLogin")) ?? "";
  const passwordAuth = auditLines.find((l) => l.includes("PasswordAuthentication")) ?? "";
  const maxAuthTries = auditLines.find((l) => l.includes("MaxAuthTries")) ?? "";
  const ufwStatus = auditLines.find((l) => l.includes("Status:") || l.includes("UFW")) ?? "";
  const fail2banStatus = auditLines.find((l) => l === "active" || l.includes("fail2ban")) ?? "";
  const autoUpdates = auditLines.find((l) => l.includes("auto-updates")) ?? "";
  const openPorts = auditLines[auditLines.length - 1] ?? "";

  const today = new Date().toISOString().slice(0, 10);
  const configChecklist: ConfigItem[] = [];

  // SSH hardening
  const rootDisabled = rootLogin.toLowerCase().includes("no");
  configChecklist.push({
    id: "ssh-root", label: rootDisabled ? "Root 登录已禁用" : "⚠ Root 登录未禁用",
    category: "security", status: rootDisabled ? "healthy" : "warning", lastChanged: today
  });

  const pwdDisabled = passwordAuth.toLowerCase().includes("no");
  configChecklist.push({
    id: "ssh-password", label: pwdDisabled ? "密码认证已禁用（仅密钥）" : "密码认证已启用",
    category: "security", status: pwdDisabled ? "healthy" : "warning", lastChanged: today
  });

  // Firewall
  const ufwActive = ufwStatus.toLowerCase().includes("active");
  configChecklist.push({
    id: "firewall", label: ufwActive ? "UFW 防火墙已启用" : "⚠ 防火墙未启用",
    category: "security", status: ufwActive ? "healthy" : "warning", lastChanged: today
  });

  // Fail2ban
  const f2bActive = fail2banStatus === "active";
  configChecklist.push({
    id: "fail2ban", label: f2bActive ? "Fail2Ban 入侵防护已启用" : "Fail2Ban 未运行",
    category: "security", status: f2bActive ? "healthy" : "warning", lastChanged: today
  });

  // Auto updates
  const autoEnabled = autoUpdates.includes("enabled");
  configChecklist.push({
    id: "auto-updates", label: autoEnabled ? "自动安全更新已启用" : "自动更新未配置",
    category: "security", status: autoEnabled ? "healthy" : "warning", lastChanged: today
  });

  // Open ports
  if (openPorts && openPorts !== "none") {
    configChecklist.push({
      id: "open-ports", label: `开放端口: ${openPorts.replace(/,$/, "")}`,
      category: "network", status: "healthy", lastChanged: today
    });
  }

  // Disk usage
  if (disk) {
    const diskPercent = parseInt(disk.usePercent, 10) || 0;
    configChecklist.push({
      id: "disk", label: `磁盘: ${disk.used} / ${disk.total} (${disk.usePercent})`,
      category: "service", status: diskPercent > 90 ? "warning" : diskPercent > 80 ? "warning" : "healthy", lastChanged: today
    });
  }

  // Uptime
  if (uptimeText) {
    configChecklist.push({ id: "uptime", label: `运行时间: ${uptimeText}`, category: "service", status: "healthy", lastChanged: today });
  }

  // Services summary
  configChecklist.push({
    id: "services", label: `服务: ${counts.runningServices} 运行中 / ${counts.enabledServices} 已启用`,
    category: "service", status: "healthy", lastChanged: today
  });

  return {
    agentId: `ssh:${host}`,
    collectedAt: new Date().toISOString(),
    system: {
      hostname,
      platform,
      arch,
      release,
      uptime: 0,
      osPretty,
      cpu: { model: cpuModel, cores, speedMhz: 0 },
      memory: {
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
        totalGb: (totalBytes / 1024 ** 3).toFixed(1),
        freeGb: (freeBytes / 1024 ** 3).toFixed(1)
      },
      disk,
      uptimeText
    },
    software,
    configChecklist,
    counts
  };
}

// ── Filters ──

/** Packages that are part of Ubuntu base system / cloud image — should not appear in user inventory */
const SYSTEM_APT_PREFIXES = [
  "lib", "linux-", "ubuntu-", "grub-", "base-", "python3-", "python-", "gir1.",
  "dbus", "systemd", "udev", "apt", "dpkg", "adduser", "passwd", "login",
  "coreutils", "debconf", "debianutils", "diffutils", "findutils", "iproute2",
  "iputils", "kmod", "lsb-", "mount", "ncurses", "net-tools", "netplan",
  "procps", "sensible-utils", "sysvinit", "util-linux", "bsdutils",
  "perl-base", "readline", "zlib", "e2fsprogs", "fdisk", "gpgv", "logsave",
  "cloud-init", "walinuxagent", "azure-", "snapd", "lxd", "landscape",
  "unattended", "update-manager", "update-notifier", "command-not-found",
  "friendly-recovery", "fwupd", "shim-", "secureboot", "sbsigntool", "tpm-",
  "efibootmgr", "mokutil", "os-prober", "plymouth", "policykit", "polkitd",
  "accountsservice", "apport", "bolt", "colord", "cups-", "dconf", "glib-",
  "gnome-", "gsettings", "networkmanager", "packagekit", "pulseaudio",
  "rsyslog", "thermald", "udisks", "upower", "usb-", "xdg-", "openssh-sftp",
  "openssh-server", "ssh-import-id", "debian-", "keyutils", "openssl",
  "ca-certificates", "apt-transport", "nftables", "lsscsi", "nvme-cli",
  "logrotate", "man-db", "manpages", "info", "install-info", "media-types",
  "mime-support", "shared-mime", "xkb-data", "console-setup", "kbd",
  "keyboard-", "locales", "language-pack", "tcl8", "bind9-", "hdparm",
  "parted", "mdadm", "lvm2", "dmsetup", "multipath", "open-iscsi",
  "sg3-utils", "smartmontools", "ethtool", "bridge-utils", "irqbalance",
  "numactl", "pciutils", "usbutils", "dmidecode",
];

const SYSTEM_APT_EXACT = new Set([
  "bash", "dash", "grep", "gzip", "hostname", "init", "login", "tar", "sed",
  "less", "sudo", "cron", "mawk", "unzip", "curl", "wget", "chrony",
  "cifs-utils", "eatmydata", "socat", "sysstat", "vim", "nano", "file",
  "patch", "bc", "dc", "time", "strace", "ltrace", "lsof", "rsync", "screen",
  "tmux", "at", "acl", "attr", "ftp", "telnet", "traceroute", "whois",
  "dnsutils", "vlan", "mcelog", "sosreport", "lshw", "hwinfo", "inxi",
  "tcl", "openssh-server",
]);

function isSystemAptPackage(name: string): boolean {
  if (SYSTEM_APT_EXACT.has(name)) return true;
  for (const prefix of SYSTEM_APT_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

const SYSTEM_SNAPS = new Set([
  "bare", "core", "core18", "core20", "core22", "core24",
  "snapd", "lxd", "gnome-3-38-2004", "gnome-42-2204",
  "gtk-common-themes", "snap-store",
]);

function isSystemSnap(name: string): boolean {
  if (SYSTEM_SNAPS.has(name)) return true;
  if (name.startsWith("core") && /^core\d+$/.test(name)) return true;
  if (name.startsWith("gnome-")) return true;
  if (name.startsWith("gtk-common")) return true;
  return false;
}

const SYSTEM_SERVICES = new Set([
  "dbus", "sshd", "sudo", "syslog", "rsyslog", "systemd-resolved",
  "systemd-networkd", "systemd-timesyncd", "systemd-logind",
  "networkmanager", "network-manager", "vmtoolsd", "open-vm-tools",
  "iscsi", "iscsid", "multipath-tools", "multipathd",
  "irqbalance", "lvm2-monitor", "dm-event", "mdmonitor",
  "polkit", "accounts-daemon", "udisks2", "upower",
  "thermald", "bolt", "colord", "avahi-daemon",
  "ModemManager", "wpa_supplicant",
]);

function isSystemService(name: string): boolean {
  if (SYSTEM_SERVICES.has(name)) return true;
  if (name.startsWith("dbus-")) return true;
  if (name.startsWith("snap.")) return true;
  if (name.startsWith("systemd-")) return true;
  if (name.startsWith("getty@")) return true;
  if (name.startsWith("user@")) return true;
  return false;
}

function isSystemCron(line: string): boolean {
  const systemCrons = ["e2scrub", "sysstat", "popularity-contest", "apt-compat", "dpkg", "logrotate", "man-db"];
  for (const s of systemCrons) {
    if (line.includes(s)) return true;
  }
  return false;
}

function isSystemTimer(name: string): boolean {
  const systemTimers = [
    "apt-daily", "apt-daily-upgrade", "dpkg-db-backup", "e2scrub",
    "fstrim", "logrotate", "man-db", "motd-news", "systemd-tmpfiles",
    "mdcheck", "mdmonitor", "snapd", "ua-timer", "update-notifier",
    "apport", "sysstat", "phpsessionclean",
  ];
  for (const s of systemTimers) {
    if (name.startsWith(s)) return true;
  }
  return false;
}

// ── Helpers ──

function parseSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = raw.split("\n");
  let currentSection = "";
  let buffer: string[] = [];

  for (const line of lines) {
    const m = line.match(/^===SECTION:([a-z-]+)===$/);
    if (m) {
      if (currentSection) sections[currentSection] = buffer.join("\n");
      currentSection = m[1];
      buffer = [];
    } else if (currentSection) {
      buffer.push(line);
    }
  }
  if (currentSection) sections[currentSection] = buffer.join("\n");

  return sections;
}

function parseLines(input: string | undefined): string[] {
  if (!input) return [];
  return input.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("==="));
}

function parseKeyValueLines(input: string | undefined, sep: string): Array<{ key: string; value: string }> {
  return parseLines(input).map((line) => {
    const idx = line.indexOf(sep);
    if (idx < 0) return { key: line, value: "" };
    return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
  }).filter((kv) => kv.key);
}

function parseFlatpakLines(input: string | undefined): Array<{ key: string; value: string }> {
  return parseLines(input).map((line) => {
    // flatpak list output: "Application Version" (tab or multiple spaces)
    const parts = line.split(/\s{2,}|\t/);
    return { key: parts[0]?.trim() ?? "", value: parts[1]?.trim() ?? "" };
  }).filter((kv) => kv.key);
}
