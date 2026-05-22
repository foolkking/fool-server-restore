/**
 * runner — Playbook 执行器
 *
 * 负责：
 *  1. 加载 Playbook YAML
 *  2. 解析变量（支持 {{ var }} 替换）
 *  3. 处理循环、条件、register
 *  4. 把每个 Task dispatch 到对应的 Module
 *  5. 通过回调把执行进度推给上层（用于 SSE）
 */

import yaml from "yaml";
import type { Playbook, Task, ModuleResult, SshExecutor, AnsibleModule, TaskExecutionLog } from "./types.js";
import { packageModule } from "./modules/package.js";
import { serviceModule } from "./modules/service.js";
import { lineinfileModule } from "./modules/lineinfile.js";
import { copyModule } from "./modules/copy.js";
import { shellModule } from "./modules/shell.js";
import { ufwModule } from "./modules/ufw.js";
import { userModule } from "./modules/user.js";
import { fileModule } from "./modules/file.js";
import { templateModule } from "./modules/template.js";
import { cronModule } from "./modules/cron.js";
import { systemdUnitModule } from "./modules/systemd_unit.js";
import { sysctlModule } from "./modules/sysctl.js";
import { acmeModule } from "./modules/acme.js";
import { classifyError } from "./errors.js";

const REGISTRY: Record<string, AnsibleModule<any>> = {
  package: packageModule,
  apt: packageModule,
  yum: packageModule,
  service: serviceModule,
  systemd: serviceModule,
  lineinfile: lineinfileModule,
  copy: copyModule,
  shell: shellModule,
  command: shellModule,
  ufw: ufwModule,
  user: userModule,
  file: fileModule,
  template: templateModule,
  cron: cronModule,
  systemd_unit: systemdUnitModule,
  sysctl: sysctlModule,
  acme: acmeModule
};

export interface RunOptions {
  dryRun: boolean;
  /** 进度回调：每个 task 开始/结束时触发 */
  onProgress?: (log: TaskExecutionLog) => void;
  /**
   * User-supplied vars (e.g. from the configurable Playbook form).
   * Merged on top of `playbook.vars` so users can override defaults
   * declared in the YAML without editing the YAML.
   */
  userVars?: Record<string, unknown>;
}

export interface RunResult {
  ok: boolean;
  totalTasks: number;
  changed: number;
  ok_count: number;
  failed: number;
  skipped: number;
  logs: TaskExecutionLog[];
  error?: string;
}

/** 解析 YAML 字符串为 Playbook（支持单 play 或 play 列表） */
export function parsePlaybook(text: string): Playbook {
  const parsed = yaml.parse(text);
  // 支持两种格式：
  // 1. 单 play 对象（简化）：{ name, tasks: [...] }
  // 2. play 列表（标准 Ansible）：[{ name, hosts, tasks }]
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error("Empty playbook");
    return parsed[0] as Playbook;
  }
  return parsed as Playbook;
}

/** 简单的变量替换：{{ var_name }} → vars[var_name] */
function substitute(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, (_, expr: string) => {
      const parts = expr.split(".");
      let v: any = vars;
      for (const p of parts) {
        if (v == null) return "";
        v = v[p];
      }
      return v == null ? "" : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitute(v, vars);
    return out;
  }
  return value;
}

/** 求值 when 表达式（支持简单形式：var.changed, !var.changed） */
function evalWhen(expr: string, vars: Record<string, unknown>): boolean {
  const negated = expr.trim().startsWith("not ") || expr.trim().startsWith("!");
  const cleanExpr = expr.trim().replace(/^(not |!)/, "").trim();
  const result = substitute(`{{ ${cleanExpr} }}`, vars);
  const truthy = result !== "" && result !== "false" && result !== "0" && result != null;
  return negated ? !truthy : truthy;
}

export async function runPlaybook(
  playbook: Playbook,
  executor: SshExecutor,
  options: RunOptions
): Promise<RunResult> {
  const vars: Record<string, unknown> = { ...(playbook.vars ?? {}), ...(options.userVars ?? {}) };
  const logs: TaskExecutionLog[] = [];
  let changed = 0;
  let ok_count = 0;
  let failed = 0;
  let skipped = 0;

  for (const rawTask of playbook.tasks ?? []) {
    // Resolve loop
    const items = rawTask.loop ? rawTask.loop : [null];

    for (const item of items) {
      const loopVars = item != null ? { ...vars, item } : vars;

      // Evaluate when
      if (rawTask.when && !evalWhen(rawTask.when, loopVars)) {
        const log: TaskExecutionLog = {
          taskName: rawTask.name + (item != null ? ` [${JSON.stringify(item).slice(0, 30)}]` : ""),
          moduleName: rawTask.module,
          status: "skipped",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0
        };
        logs.push(log);
        skipped++;
        options.onProgress?.(log);
        continue;
      }

      const resolvedArgs = substitute(rawTask.args ?? {}, loopVars) as Record<string, unknown>;
      const module = REGISTRY[rawTask.module];

      // Extract human-readable command from args
      const cmdDisplay = rawTask.module === "shell" ? (resolvedArgs.cmd as string ?? rawTask.module)
        : rawTask.module === "package" ? `${rawTask.module}: ${Array.isArray(resolvedArgs.name) ? (resolvedArgs.name as string[]).join(", ") : resolvedArgs.name}`
        : rawTask.module === "service" ? `${rawTask.module}: ${resolvedArgs.name} (${resolvedArgs.state ?? "started"})`
        : rawTask.module === "lineinfile" ? `${rawTask.module}: ${resolvedArgs.path}`
        : rawTask.module === "copy" || rawTask.module === "template" ? `${rawTask.module}: → ${resolvedArgs.dest}`
        : rawTask.module === "file" ? `${rawTask.module}: ${resolvedArgs.path} (${resolvedArgs.state})`
        : rawTask.module;

      const log: TaskExecutionLog = {
        taskName: rawTask.name + (item != null ? ` [${typeof item === "string" ? item : JSON.stringify(item).slice(0, 30)}]` : ""),
        moduleName: rawTask.module,
        command: cmdDisplay,
        status: "running",
        startedAt: new Date().toISOString()
      };
      logs.push(log);
      options.onProgress?.(log);

      if (!module) {
        log.status = "failed";
        log.completedAt = new Date().toISOString();
        log.durationMs = Date.now() - new Date(log.startedAt!).getTime();
        log.result = { changed: false, failed: true, msg: `Unknown module: ${rawTask.module}` };
        failed++;
        options.onProgress?.(log);
        if (!rawTask.ignore_errors) {
          return { ok: false, totalTasks: logs.length, changed, ok_count, failed, skipped, logs, error: log.result.msg };
        }
        continue;
      }

      const startMs = Date.now();
      let result: ModuleResult;
      try {
        result = await module.run(executor, resolvedArgs, options.dryRun);
      } catch (err) {
        result = {
          changed: false,
          failed: true,
          msg: err instanceof Error ? err.message : "Module threw an error"
        };
      }

      log.completedAt = new Date().toISOString();
      log.durationMs = Date.now() - startMs;
      log.result = result;

      if (result.failed) {
        log.status = "failed";
        // Enrich error message with classification — but PRESERVE the module's
        // detailed msg if it already gave a structured report (📦/🔧 prefix).
        // The classifier produces a one-line user hint that can be confusing
        // when the module already explained per-package failures.
        if (result.stderr || result.stdout) {
          const classified = classifyError(
            result.stderr ?? "",
            result.stdout ?? "",
            result.data?.exitCode as number ?? 1,
            resolvedArgs.cmd as string ?? resolvedArgs.name as string ?? rawTask.module
          );
          const moduleAlreadyDetailed = typeof result.msg === "string"
            && (result.msg.startsWith("📦") || result.msg.startsWith("🔧") || result.msg.includes("preflight:"));
          if (moduleAlreadyDetailed) {
            // Append the hint as a tail line so user gets both detail + suggestion
            const hint = classified.fixHintZh ? `\n💡 ${classified.fixHintZh}` : "";
            result.msg = `${result.msg}${hint}`;
          } else {
            result.msg = classified.messageZh + (classified.fixHintZh ? `\n💡 ${classified.fixHintZh}` : "");
          }
        }
        failed++;
        if (!rawTask.ignore_errors) {
          options.onProgress?.(log);
          return { ok: false, totalTasks: logs.length, changed, ok_count, failed, skipped, logs, error: result.msg };
        }
      } else if (result.changed) {
        log.status = "changed";
        changed++;
      } else {
        log.status = "ok";
        ok_count++;
      }

      // Register output
      if (rawTask.register) {
        vars[rawTask.register] = { changed: result.changed, msg: result.msg, stdout: result.stdout, ...(result.data ?? {}) };
      }

      options.onProgress?.(log);
    }
  }

  return { ok: true, totalTasks: logs.length, changed, ok_count, failed, skipped, logs };
}
