/**
 * capture.ts — 从已连接 VM 反向生成 Ansible-Compatible Playbook
 *
 * 采集策略（与 remote-collector.ts 保持一致）：
 * 1. apt 包：apt-mark showmanual 减去 /var/log/installer/initial-status.gz 的基线
 *    （来自 AskUbuntu 社区最佳实践：comm -23 manual base）
 *    + TypeScript 端 isSystemAptPackage() 二次过滤防止漏网
 * 2. 启用的 systemctl 服务（过滤系统服务）
 * 3. ~/.bashrc 中的非默认行（alias、export）
 * 4. 已安装的 npm 全局包
 * 5. 已安装的 pip 全局包
 * 6. Docker 容器（如果有 Docker）
 * 7. 关键配置文件
 *
 * 输出：标准 Ansible Playbook YAML，可直接被 EnvForge 或 ansible-playbook 执行
 */

import type { SshExecutor } from "./engine/types.js";
import { isSystemAptPackage, isSystemService } from "./collectors/remote-collector.js";
import { scanAndRedact, isPathBlacklisted, type RedactionHit } from "./sensitive-scan.js";
import yaml from "yaml";

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
  /** Redaction hits across all captured config files */
  redactions: RedactionHit[];
  /** Paths skipped due to absolute blacklist (e.g. private keys, /etc/shadow) */
  skippedPaths: string[];
}

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
  const allRedactions: RedactionHit[] = [];
  const skippedPaths: string[] = [];

  // 1. 已安装的 apt 包：用户手动安装减去 Ubuntu 基线（initial-status.gz）
  //    fallback：没有 initial-status.gz 时用 apt-mark showmanual + TS 过滤
  try {
    const captureScript = String.raw`
TMPD=$(mktemp -d 2>/dev/null || mktemp -d -t envforge.XXXXXX 2>/dev/null || echo /tmp/envforge.$$)
mkdir -p "$TMPD" 2>/dev/null
apt-mark showmanual 2>/dev/null | sort -u > "$TMPD/manual.txt"
if [ -f /var/log/installer/initial-status.gz ]; then
  gzip -dc /var/log/installer/initial-status.gz 2>/dev/null | sed -n 's/^Package: //p' | sort -u > "$TMPD/base.txt"
  comm -23 "$TMPD/manual.txt" "$TMPD/base.txt"
else
  cat "$TMPD/manual.txt"
fi
rm -rf "$TMPD" 2>/dev/null
`;
    const { stdout } = await executor.exec(captureScript);
    summary.aptPackages = stdout.trim().split("\n")
      .map((p) => p.trim())
      .filter((p) => p && !isSystemAptPackage(p));
  } catch { /* ignore */ }

  // 2. 启用的 systemctl 服务（用 collector 同款过滤）
  try {
    const { stdout } = await executor.exec(
      "systemctl list-unit-files --state=enabled --type=service --no-legend 2>/dev/null | awk '{print $1}' | sed 's/\\.service$//'"
    );
    summary.enabledServices = stdout.trim().split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !isSystemService(s));
  } catch { /* ignore */ }

  // 3. ~/.bashrc 中的非默认行（也跑敏感扫描，防止 export TOKEN=... 进 Playbook）
  try {
    const { stdout } = await executor.exec(
      "grep -E '^(export |alias |source )' ~/.bashrc 2>/dev/null || true"
    );
    const rawLines = stdout.trim().split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    // Scan each line individually
    const cleaned: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const { redactedContent, hits } = scanAndRedact("~/.bashrc", rawLines[i]);
      cleaned.push(redactedContent);
      // Adjust line numbers (each hit is on virtual line 1; remap to source index+1)
      for (const h of hits) {
        allRedactions.push({ ...h, line: i + 1 });
      }
    }
    summary.bashrcLines = cleaned;
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
    // Hard-block dangerous paths even if they appear in the list
    if (isPathBlacklisted(cfgPath)) {
      skippedPaths.push(cfgPath);
      continue;
    }
    try {
      const cmd = cfgPath.startsWith("~")
        ? `cat ${cfgPath} 2>/dev/null`
        : `sudo cat ${cfgPath} 2>/dev/null`;
      const { stdout, exitCode } = await executor.exec(cmd);
      if (exitCode === 0 && stdout.trim().length > 0 && stdout.length < 50000) {
        // Run sensitive-field scanner; never push raw content with detected secrets
        const { redactedContent, hits } = scanAndRedact(cfgPath, stdout);
        configContents.push({ path: cfgPath, content: redactedContent });
        summary.configFiles.push(cfgPath);
        allRedactions.push(...hits);
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
  return { playbookYaml, summary, redactions: allRedactions, skippedPaths };
}

function generatePlaybook(
  summary: CaptureResult["summary"],
  configContents: Array<{ path: string; content: string }>
): string {
  const tasks: Array<Record<string, unknown>> = [];

  // apt packages
  if (summary.aptPackages.length > 0) {
    tasks.push({
      name: "Install captured apt packages",
      module: "package",
      args: {
        name: summary.aptPackages,
        state: "present"
      }
    });
  }

  // enabled services
  if (summary.enabledServices.length > 0) {
    tasks.push({
      name: "Enable captured services",
      module: "service",
      args: {
        name: "{{ item }}",
        enabled: true,
        state: "started"
      },
      loop: summary.enabledServices
    });
  }

  // bashrc lines — let yaml lib handle quoting/escaping
  for (const line of summary.bashrcLines) {
    tasks.push({
      name: "Restore bashrc line",
      module: "lineinfile",
      args: {
        path: "~/.bashrc",
        line,
        create: true
      }
    });
  }

  // npm globals
  if (summary.npmGlobals.length > 0) {
    tasks.push({
      name: "Install captured npm global packages",
      module: "shell",
      args: {
        cmd: "sudo npm install -g {{ item }}"
      },
      loop: summary.npmGlobals
    });
  }

  // config files — use base64 encoding to keep content safe regardless of contents
  for (const cfg of configContents) {
    const b64 = Buffer.from(cfg.content, "utf8").toString("base64");
    tasks.push({
      name: `Restore config ${cfg.path}`,
      module: "shell",
      args: {
        cmd: `echo '${b64}' | base64 -d | sudo tee ${cfg.path} > /dev/null`
      }
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      name: "No custom packages or services detected",
      module: "shell",
      args: {
        cmd: "echo 'Nothing to restore'",
        creates: "/dev/null"
      }
    });
  }

  const playbook = {
    name: "Captured environment restore",
    hosts: "all",
    tasks
  };

  const now = new Date().toISOString().slice(0, 10);
  const body = yaml.stringify(playbook, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE"
  });

  return `# Playbook captured from VM on ${now}\n# Generated by EnvForge — compatible with ansible-playbook\n${body}`;
}
