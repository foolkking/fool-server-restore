/**
 * impact.ts — 影响范围预估
 *
 * 在执行 Playbook 之前，分析将要发生的变更并给出预估：
 * - 将安装哪些软件包（及预估磁盘占用）
 * - 将启动/停止哪些服务
 * - 将写入哪些文件
 * - 是否需要 sudo 权限
 * - 预估执行时间
 */

import type { Playbook, Task } from "./types.js";

export interface ImpactItem {
  kind: "package" | "service" | "file" | "command" | "user" | "firewall";
  action: string;
  target: string;
  /** 预估磁盘变化（MB），正数=增加，负数=减少 */
  diskDeltaMb?: number;
  /** 是否需要 sudo */
  needsSudo: boolean;
  /** 风险级别 */
  risk: "low" | "medium" | "high";
  /** 人类可读描述（中文） */
  descZh: string;
  /** 人类可读描述（英文） */
  descEn: string;
}

export interface ImpactReport {
  items: ImpactItem[];
  totalDiskDeltaMb: number;
  needsSudo: boolean;
  maxRisk: "low" | "medium" | "high";
  estimatedSeconds: number;
  summaryZh: string;
  summaryEn: string;
}

/** 常见软件包的预估磁盘占用（MB） */
const PACKAGE_SIZE_ESTIMATES: Record<string, number> = {
  nginx: 5,
  apache2: 8,
  mysql: 180,
  "mysql-server": 180,
  postgresql: 50,
  redis: 3,
  "redis-server": 3,
  docker: 200,
  "docker.io": 200,
  nodejs: 30,
  npm: 5,
  python3: 20,
  "python3-pip": 5,
  git: 15,
  "git-lfs": 5,
  golang: 120,
  "golang-go": 120,
  "default-jdk": 200,
  maven: 50,
  certbot: 10,
  fail2ban: 5,
  prometheus: 80,
  grafana: 150,
  ufw: 2,
  "unattended-upgrades": 2,
  vim: 5,
  curl: 2,
  wget: 2,
  "build-essential": 30
};

const DEFAULT_PACKAGE_SIZE_MB = 10;

/** 预估每个 apt 包的安装时间（秒） */
const PACKAGE_TIME_ESTIMATES: Record<string, number> = {
  mysql: 30,
  "mysql-server": 30,
  postgresql: 20,
  docker: 60,
  "docker.io": 60,
  "default-jdk": 40,
  prometheus: 15,
  grafana: 20
};
const DEFAULT_PACKAGE_TIME_S = 8;

function riskForModule(module: string, args: Record<string, unknown>): "low" | "medium" | "high" {
  if (module === "user" && args.state === "absent") return "high";
  if (module === "file" && args.state === "absent") return "high";
  if (module === "ufw" && args.state === "reset") return "high";
  if (module === "service" && (args.state === "stopped" || args.enabled === false)) return "medium";
  if (module === "package" && args.state === "absent") return "medium";
  if (module === "shell" || module === "command") return "medium";
  return "low";
}

function needsSudoForModule(module: string, args: Record<string, unknown>): boolean {
  const alwaysSudo = ["package", "apt", "yum", "dnf", "service", "systemd", "ufw", "user"];
  if (alwaysSudo.includes(module)) return true;
  if (module === "file" && (args.owner || args.state === "absent")) return true;
  if (module === "shell" || module === "command") {
    const cmd = String(args.cmd ?? "");
    return cmd.startsWith("sudo") || cmd.includes("apt") || cmd.includes("systemctl");
  }
  return false;
}

function analyzeTask(task: Task): ImpactItem | null {
  const module = task.module;
  const args = task.args ?? {};

  switch (module) {
    case "package":
    case "apt":
    case "yum":
    case "dnf": {
      const names = Array.isArray(args.name) ? args.name as string[] : [String(args.name ?? "")];
      const state = String(args.state ?? "present");
      const action = state === "present" ? "install" : "remove";
      const totalDisk = names.reduce((sum, n) => sum + (PACKAGE_SIZE_ESTIMATES[n] ?? DEFAULT_PACKAGE_SIZE_MB), 0);
      const diskDelta = state === "present" ? totalDisk : -totalDisk;
      return {
        kind: "package",
        action,
        target: names.join(", "),
        diskDeltaMb: diskDelta,
        needsSudo: true,
        risk: state === "absent" ? "medium" : "low",
        descZh: state === "present"
          ? `安装软件包：${names.join(", ")}（预计 +${totalDisk} MB）`
          : `卸载软件包：${names.join(", ")}（预计 -${Math.abs(totalDisk)} MB）`,
        descEn: state === "present"
          ? `Install packages: ${names.join(", ")} (~+${totalDisk} MB)`
          : `Remove packages: ${names.join(", ")} (~-${Math.abs(totalDisk)} MB)`
      };
    }

    case "service":
    case "systemd": {
      const name = String(args.name ?? "");
      const state = String(args.state ?? "");
      const enabled = args.enabled;
      const parts: string[] = [];
      if (state) parts.push(state);
      if (enabled !== undefined) parts.push(enabled ? "enable" : "disable");
      return {
        kind: "service",
        action: parts.join("+"),
        target: name,
        needsSudo: true,
        risk: state === "stopped" || enabled === false ? "medium" : "low",
        descZh: `服务 ${name}：${parts.join("，")}`,
        descEn: `Service ${name}: ${parts.join(", ")}`
      };
    }

    case "lineinfile": {
      const path = String(args.path ?? "");
      const state = String(args.state ?? "present");
      return {
        kind: "file",
        action: state === "present" ? "edit" : "remove-line",
        target: path,
        needsSudo: path.startsWith("/etc/"),
        risk: path.startsWith("/etc/ssh") || path.startsWith("/etc/sudoers") ? "high" : "low",
        descZh: `编辑文件 ${path}（${state === "present" ? "添加/替换行" : "删除行"}）`,
        descEn: `Edit file ${path} (${state === "present" ? "add/replace line" : "remove line"})`
      };
    }

    case "copy":
    case "template": {
      const dest = String(args.dest ?? "");
      const size = typeof args.content === "string" ? Math.ceil(args.content.length / 1024) : 0;
      return {
        kind: "file",
        action: "write",
        target: dest,
        diskDeltaMb: size > 0 ? Math.max(1, Math.ceil(size / 1024)) : 0,
        needsSudo: dest.startsWith("/etc/") || dest.startsWith("/usr/"),
        risk: dest.startsWith("/etc/ssh") || dest.startsWith("/etc/sudoers") ? "high" : "low",
        descZh: `写入文件 ${dest}（${size} KB）`,
        descEn: `Write file ${dest} (${size} KB)`
      };
    }

    case "ufw": {
      const state = String(args.state ?? "");
      const rule = String(args.rule ?? "");
      const port = args.port ? String(args.port) : "";
      return {
        kind: "firewall",
        action: state || rule,
        target: port || state,
        needsSudo: true,
        risk: state === "reset" ? "high" : "medium",
        descZh: state === "enabled" ? "启用 UFW 防火墙"
          : state === "disabled" ? "禁用 UFW 防火墙"
          : state === "reset" ? "重置所有防火墙规则（高风险）"
          : `防火墙规则：${rule} port ${port}`,
        descEn: state === "enabled" ? "Enable UFW firewall"
          : state === "disabled" ? "Disable UFW firewall"
          : state === "reset" ? "Reset all firewall rules (HIGH RISK)"
          : `Firewall rule: ${rule} port ${port}`
      };
    }

    case "user": {
      const name = String(args.name ?? "");
      const state = String(args.state ?? "present");
      return {
        kind: "user",
        action: state,
        target: name,
        needsSudo: true,
        risk: state === "absent" ? "high" : "low",
        descZh: state === "present" ? `创建系统用户 ${name}` : `删除系统用户 ${name}（高风险）`,
        descEn: state === "present" ? `Create system user ${name}` : `Delete system user ${name} (HIGH RISK)`
      };
    }

    case "shell":
    case "command": {
      const cmd = String(args.cmd ?? "");
      return {
        kind: "command",
        action: "exec",
        target: cmd.slice(0, 60),
        needsSudo: cmd.startsWith("sudo"),
        risk: riskForModule(module, args),
        descZh: `执行命令：${cmd.slice(0, 80)}`,
        descEn: `Execute: ${cmd.slice(0, 80)}`
      };
    }

    default:
      return null;
  }
}

function estimateTime(items: ImpactItem[]): number {
  let seconds = 2; // base connection time
  for (const item of items) {
    if (item.kind === "package") {
      const names = item.target.split(", ");
      for (const n of names) {
        seconds += PACKAGE_TIME_ESTIMATES[n.trim()] ?? DEFAULT_PACKAGE_TIME_S;
      }
    } else if (item.kind === "service") {
      seconds += 3;
    } else if (item.kind === "file") {
      seconds += 1;
    } else if (item.kind === "command") {
      seconds += 5;
    } else {
      seconds += 2;
    }
  }
  return seconds;
}

export function estimateImpact(playbook: Playbook): ImpactReport {
  const items: ImpactItem[] = [];

  for (const task of playbook.tasks ?? []) {
    // Expand loops for impact estimation
    const loopItems = task.loop ?? [null];
    for (const loopItem of loopItems) {
      const resolvedArgs = loopItem != null
        ? JSON.parse(JSON.stringify(task.args ?? {}).replace(/\{\{\s*item\s*\}\}/g, String(loopItem)))
        : task.args ?? {};
      const impact = analyzeTask({ ...task, args: resolvedArgs });
      if (impact) items.push(impact);
    }
  }

  const totalDiskDeltaMb = items.reduce((sum, i) => sum + (i.diskDeltaMb ?? 0), 0);
  const needsSudo = items.some((i) => i.needsSudo);
  const risks = items.map((i) => i.risk);
  const maxRisk: "low" | "medium" | "high" = risks.includes("high") ? "high"
    : risks.includes("medium") ? "medium" : "low";
  const estimatedSeconds = estimateTime(items);

  const packageItems = items.filter((i) => i.kind === "package" && i.action === "install");
  const serviceItems = items.filter((i) => i.kind === "service");
  const fileItems = items.filter((i) => i.kind === "file");

  const summaryZh = [
    packageItems.length > 0 ? `安装 ${packageItems.length} 个软件包` : null,
    serviceItems.length > 0 ? `管理 ${serviceItems.length} 个服务` : null,
    fileItems.length > 0 ? `写入 ${fileItems.length} 个文件` : null,
    totalDiskDeltaMb > 0 ? `预计占用 ~${totalDiskDeltaMb} MB 磁盘` : null,
    needsSudo ? "需要 sudo 权限" : null,
    `预计耗时 ~${estimatedSeconds} 秒`
  ].filter(Boolean).join("，");

  const summaryEn = [
    packageItems.length > 0 ? `Install ${packageItems.length} package(s)` : null,
    serviceItems.length > 0 ? `Manage ${serviceItems.length} service(s)` : null,
    fileItems.length > 0 ? `Write ${fileItems.length} file(s)` : null,
    totalDiskDeltaMb > 0 ? `~${totalDiskDeltaMb} MB disk usage` : null,
    needsSudo ? "Requires sudo" : null,
    `~${estimatedSeconds}s estimated`
  ].filter(Boolean).join(", ");

  return { items, totalDiskDeltaMb, needsSudo, maxRisk, estimatedSeconds, summaryZh, summaryEn };
}
