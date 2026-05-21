/**
 * capture.ts — 从已连接 VM 反向生成 Ansible-Compatible Playbook
 *
 * 采集内容（只读，不修改目标系统）：
 * 1. 已安装的 apt/dpkg 包（非系统基础包）
 * 2. 启用的 systemctl 服务
 * 3. ~/.bashrc 中的非默认行（alias、export）
 * 4. 已安装的 npm 全局包
 * 5. 已安装的 pip 全局包
 * 6. Docker 容器（如果有 Docker）
 *
 * 输出：标准 Ansible Playbook YAML，可直接被 EnvForge 或 ansible-playbook 执行
 */

import type { SshExecutor } from "./engine/types.js";

export interface CaptureResult {
  playbookYaml: string;
  summary: {
    aptPackages: string[];
    enabledServices: string[];
    bashrcLines: string[];
    npmGlobals: string[];
    pipGlobals: string[];
    dockerContainers: string[];
    configFiles: string[];
    diskInfo?: string;
    uptimeInfo?: string;
  };
}

/** 系统基础包黑名单（不需要还原的包） */
const SYSTEM_PACKAGES_BLACKLIST = new Set([
  "adduser", "apt", "apt-utils", "base-files", "base-passwd", "bash", "bsdutils",
  "coreutils", "dash", "debconf", "debianutils", "diffutils", "dpkg", "e2fsprogs",
  "findutils", "gcc-12-base", "gpgv", "grep", "gzip", "hostname", "init-system-helpers",
  "libacl1", "libapt-pkg6.0", "libattr1", "libaudit1", "libblkid1", "libbz2-1.0",
  "libc-bin", "libc6", "libcap-ng0", "libcom-err2", "libcrypt1", "libdb5.3",
  "libdebconfclient0", "libext2fs2", "libffi8", "libgcc-s1", "libgcrypt20",
  "libgmp10", "libgnutls30", "libgpg-error0", "libhogweed6", "libidn2-0",
  "liblz4-1", "liblzma5", "libmount1", "libnettle8", "libnsl2", "libp11-kit0",
  "libpam-modules", "libpam-modules-bin", "libpam-runtime", "libpam0g",
  "libpcre2-8-0", "libpcre3", "libseccomp2", "libselinux1", "libsemanage-common",
  "libsemanage2", "libsepol2", "libsmartcols1", "libss2", "libssl3", "libstdc++6",
  "libsystemd0", "libtasn1-6", "libtinfo6", "libtirpc3", "libudev1", "libunistring2",
  "libuuid1", "libxxhash0", "libzstd1", "login", "logsave", "lsb-base", "mawk",
  "mount", "ncurses-base", "ncurses-bin", "passwd", "perl-base", "procps",
  "sed", "sensible-utils", "sysvinit-utils", "tar", "tzdata", "ubuntu-keyring",
  "util-linux", "util-linux-extra", "zlib1g"
]);

/** 系统服务黑名单（不需要还原的服务） */
const SYSTEM_SERVICES_BLACKLIST = new Set([
  "dbus", "getty@tty1", "keyboard-setup", "kmod-static-nodes", "ldconfig",
  "multipathd", "networkd-dispatcher", "polkit", "rsyslog", "setvtrgb",
  "snapd", "ssh", "sshd", "systemd-binfmt", "systemd-fsck-root",
  "systemd-journal-flush", "systemd-logind", "systemd-modules-load",
  "systemd-networkd", "systemd-random-seed", "systemd-remount-fs",
  "systemd-resolved", "systemd-sysctl", "systemd-sysusers", "systemd-timesyncd",
  "systemd-tmpfiles-setup", "systemd-tmpfiles-setup-dev", "systemd-udev-settle",
  "systemd-udev-trigger", "systemd-udevd", "systemd-update-utmp",
  "systemd-user-sessions", "ufw", "unattended-upgrades", "user@1000"
]);

export async function captureEnvironment(executor: SshExecutor): Promise<CaptureResult> {
  const summary: CaptureResult["summary"] = {
    aptPackages: [],
    enabledServices: [],
    bashrcLines: [],
    npmGlobals: [],
    pipGlobals: [],
    dockerContainers: [],
    configFiles: [],
    diskInfo: undefined,
    uptimeInfo: undefined
  };

  // 1. 已安装的 apt 包（过滤系统包）
  try {
    const { stdout } = await executor.exec(
      "dpkg-query -W -f='${Package}\\n' 2>/dev/null | sort"
    );
    summary.aptPackages = stdout.trim().split("\n")
      .map((p) => p.trim())
      .filter((p) => p && !SYSTEM_PACKAGES_BLACKLIST.has(p));
  } catch { /* ignore */ }

  // 2. 启用的 systemctl 服务
  try {
    const { stdout } = await executor.exec(
      "systemctl list-unit-files --state=enabled --type=service --no-legend 2>/dev/null | awk '{print $1}' | sed 's/\\.service$//'"
    );
    summary.enabledServices = stdout.trim().split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !SYSTEM_SERVICES_BLACKLIST.has(s));
  } catch { /* ignore */ }

  // 3. ~/.bashrc 中的非默认行
  try {
    const { stdout } = await executor.exec(
      "grep -E '^(export |alias |source )' ~/.bashrc 2>/dev/null || true"
    );
    summary.bashrcLines = stdout.trim().split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch { /* ignore */ }

  // 4. npm 全局包
  try {
    const { stdout } = await executor.exec(
      "npm list -g --depth=0 --json 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));Object.keys(d.dependencies||{}).filter(k=>k!=='npm').forEach(k=>console.log(k))\" 2>/dev/null || true"
    );
    summary.npmGlobals = stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  } catch { /* ignore */ }

  // 5. pip 全局包（非系统包）
  try {
    const { stdout } = await executor.exec(
      "pip3 list --format=columns 2>/dev/null | tail -n +3 | awk '{print $1}' | head -50 || true"
    );
    summary.pipGlobals = stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  } catch { /* ignore */ }

  // 6. Docker 容器（如果有 Docker）
  try {
    const { stdout } = await executor.exec(
      "docker ps --format '{{.Image}}' 2>/dev/null || true"
    );
    summary.dockerContainers = stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  } catch { /* ignore */ }

  // 7. 关键配置文件（修改过的）
  const configPaths = [
    "/etc/nginx/nginx.conf", "/etc/nginx/sites-enabled/default",
    "/etc/redis/redis.conf", "/etc/ssh/sshd_config",
    "/etc/docker/daemon.json", "/etc/caddy/Caddyfile",
    "/etc/fail2ban/jail.local", "/etc/sysctl.conf",
    "/etc/hosts", "/etc/environment",
    "~/.bashrc", "~/.profile", "~/.gitconfig", "~/.tmux.conf", "~/.npmrc", "~/.ssh/config"
  ];
  const configContents: Array<{ path: string; content: string }> = [];
  for (const cfgPath of configPaths) {
    try {
      const cmd = cfgPath.startsWith("~")
        ? `cat ${cfgPath} 2>/dev/null`
        : `sudo cat ${cfgPath} 2>/dev/null`;
      const { stdout, exitCode } = await executor.exec(cmd);
      if (exitCode === 0 && stdout.trim().length > 0 && stdout.length < 50000) {
        configContents.push({ path: cfgPath, content: stdout });
        summary.configFiles.push(cfgPath);
      }
    } catch { /* ignore */ }
  }

  // 8. 磁盘使用情况
  try {
    const { stdout } = await executor.exec(
      "df -h --output=source,size,used,avail,pcent,target 2>/dev/null | grep -v tmpfs | head -6 || true"
    );
    summary.diskInfo = stdout.trim() || undefined;
  } catch { /* ignore */ }

  // 9. 系统运行时间
  try {
    const { stdout } = await executor.exec("uptime -p 2>/dev/null || uptime || true");
    summary.uptimeInfo = stdout.trim() || undefined;
  } catch { /* ignore */ }

  const playbookYaml = generatePlaybook(summary, configContents);
  return { playbookYaml, summary };
}

function generatePlaybook(summary: CaptureResult["summary"], configContents: Array<{ path: string; content: string }>): string {
  const tasks: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  // apt packages
  if (summary.aptPackages.length > 0) {
    const pkgList = summary.aptPackages.map((p) => `        - ${p}`).join("\n");
    tasks.push(`  - name: Install captured apt packages
    module: package
    args:
      name:
${pkgList}
      state: present`);
  }

  // enabled services
  if (summary.enabledServices.length > 0) {
    const svcList = summary.enabledServices.map((s) => `        - ${s}`).join("\n");
    tasks.push(`  - name: Enable captured services
    module: service
    args:
      name: "{{ item }}"
      enabled: true
      state: started
    loop:
${svcList}`);
  }

  // bashrc lines
  for (const line of summary.bashrcLines) {
    const escaped = line.replace(/"/g, '\\"');
    tasks.push(`  - name: Restore bashrc line
    module: lineinfile
    args:
      path: ~/.bashrc
      line: "${escaped}"
      create: true`);
  }

  // npm globals
  if (summary.npmGlobals.length > 0) {
    const pkgList = summary.npmGlobals.map((p) => `        - ${p}`).join("\n");
    tasks.push(`  - name: Install captured npm global packages
    module: shell
    args:
      cmd: "sudo npm install -g {{ item }}"
    loop:
${pkgList}`);
  }

  // config files (copy tasks)
  for (const cfg of configContents) {
    // Escape content for YAML (use base64 for safety)
    const b64 = Buffer.from(cfg.content, "utf8").toString("base64");
    const displayPath = cfg.path.startsWith("~") ? cfg.path : cfg.path;
    tasks.push(`  - name: Restore config ${displayPath}
    module: shell
    args:
      cmd: "echo '${b64}' | base64 -d | sudo tee ${displayPath} > /dev/null"`);
  }

  if (tasks.length === 0) {
    tasks.push(`  - name: No custom packages or services detected
    module: shell
    args:
      cmd: "echo 'Nothing to restore'"
      creates: /dev/null`);
  }

  return `# Playbook captured from VM on ${now}
# Generated by EnvForge — compatible with ansible-playbook
name: Captured environment restore
hosts: all

tasks:
${tasks.join("\n\n")}
`;
}
