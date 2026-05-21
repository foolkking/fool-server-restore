/**
 * snapshot-deploy.ts — vm-snapshot 四阶段部署
 *
 * 把一个 vm-snapshot profile（含 envSnapshot）拆分成四个独立的 Playbook，
 * 让前端可以按阶段：dry-run → 用户确认 → apply。
 *
 * 阶段：
 *   1. software   — 安装包（apt / npm / pip）
 *   2. configs    — 写入采集到的配置文件（lineinfile / copy）
 *   3. env        — 环境变量（写入 ~/.bashrc）
 *   4. services   — 启用并启动服务
 */

import yaml from "yaml";
import type { StoredUserProfile } from "./runtime-store.js";

export type DeployStage = "software" | "configs" | "env" | "services";

export interface StagedPlaybooks {
  software: string;
  configs: string;
  env: string;
  services: string;
  /** Counts per stage to display in UI */
  counts: Record<DeployStage, number>;
}

interface AnyTask {
  name: string;
  module: string;
  args: Record<string, unknown>;
}

function pkgsFromComponents(profile: StoredUserProfile): string[] {
  return profile.components
    .filter((c) => c.type === "software")
    .map((c) => c.label.split(/\s+/)[0])
    .filter(Boolean);
}

function envVarsFromSnapshot(profile: StoredUserProfile): Record<string, string> {
  return profile.envSnapshot?.envVars ?? {};
}

function configFilesFromSnapshot(profile: StoredUserProfile): Array<{ path: string; content: string }> {
  return profile.envSnapshot?.configFiles ?? [];
}

function servicesFromSnapshot(profile: StoredUserProfile): string[] {
  // Reuse software list for service names if any are also services (rough heuristic).
  // A future improvement: collect real enabled service names alongside vm-snapshot.
  const sw = pkgsFromComponents(profile);
  const serviceLikely = ["nginx", "redis-server", "redis", "postgresql", "mysql", "docker", "ssh", "fail2ban", "caddy"];
  return sw.filter((s) => serviceLikely.includes(s));
}

function buildSoftwareTasks(profile: StoredUserProfile): AnyTask[] {
  const pkgs = pkgsFromComponents(profile);
  if (pkgs.length === 0) return [];
  return [
    {
      name: `Install ${pkgs.length} packages from snapshot`,
      module: "package",
      args: { name: pkgs, state: "present" }
    }
  ];
}

function buildConfigTasks(profile: StoredUserProfile): AnyTask[] {
  const files = configFilesFromSnapshot(profile);
  return files.map((f) => ({
    name: `Restore config: ${f.path}`,
    module: "copy",
    args: {
      content: f.content,
      dest: f.path,
      backup: true
    }
  }));
}

function buildEnvTasks(profile: StoredUserProfile): AnyTask[] {
  const vars = envVarsFromSnapshot(profile);
  return Object.entries(vars).map(([key, value]) => ({
    name: `Set env var ${key}`,
    module: "lineinfile",
    args: {
      path: "~/.bashrc",
      regexp: `^export ${key}=`,
      line: `export ${key}=${JSON.stringify(value)}`,
      create: true,
      backup: true
    }
  }));
}

function buildServiceTasks(profile: StoredUserProfile): AnyTask[] {
  const services = servicesFromSnapshot(profile);
  return services.map((s) => ({
    name: `Enable and start ${s}`,
    module: "service",
    args: { name: s, enabled: true, state: "started" }
  }));
}

function tasksToPlaybook(name: string, tasks: AnyTask[]): string {
  if (tasks.length === 0) {
    return yaml.stringify({
      name,
      hosts: "all",
      tasks: [
        { name: "Nothing to do for this stage", module: "shell", args: { cmd: "true" } }
      ]
    });
  }
  return yaml.stringify({ name, hosts: "all", tasks });
}

/** Build all four staged Playbooks from a vm-snapshot profile. */
export function buildStagedPlaybooks(profile: StoredUserProfile): StagedPlaybooks {
  const swTasks = buildSoftwareTasks(profile);
  const cfgTasks = buildConfigTasks(profile);
  const envTasks = buildEnvTasks(profile);
  const svcTasks = buildServiceTasks(profile);

  return {
    software: tasksToPlaybook(`${profile.name} · software`, swTasks),
    configs: tasksToPlaybook(`${profile.name} · configs`, cfgTasks),
    env: tasksToPlaybook(`${profile.name} · env`, envTasks),
    services: tasksToPlaybook(`${profile.name} · services`, svcTasks),
    counts: {
      software: swTasks.length,
      configs: cfgTasks.length,
      env: envTasks.length,
      services: svcTasks.length
    }
  };
}
