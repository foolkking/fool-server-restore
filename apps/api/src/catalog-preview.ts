/**
 * catalog-preview.ts — Pre-apply preview for configurable Playbooks.
 *
 * 给定 catalogId + 用户填的 vars，返回 "如果点 Run 会发生什么" 的预览：
 *   - 替换后的完整 YAML（用户可以直接看到 {{ vars }} 都变成了什么）
 *   - 任务级摘要列表：每个任务的最终参数 + 是否会被 when: 条件跳过
 *   - 受影响的远端文件路径和写入预览（lineinfile / copy / template 模块的 dest）
 *   - 影响范围估算（沿用现有 estimateImpact，但用替换后的 playbook）
 *
 * 设计原则：纯本地计算，不连远端 SSH。所以不会去读目标机器上 /etc/nginx/conf.d/*.conf
 * 的现有内容做 diff（那是 Option B 的领域）。但我们已经能告诉用户：
 *   "你的设置会让我去写 /etc/nginx/conf.d/envforge-default.conf，里面这样写..."
 *
 * 真实跑的时候，引擎里 lineinfile/copy/template 模块会自动备份原文件到 .envforge.bak，
 * 所以即使没有 Option B 的 diff，回滚路径也是完整的。
 */

import yaml from "yaml";
import { parsePlaybook, substitute, evalWhen } from "./engine/index.js";
import { estimateImpact } from "./engine/impact.js";
import { resolvePlaybookYaml } from "./catalog-overrides.js";
import { loadVarsSchema, validateAndNormalise } from "./catalog-vars-schema.js";
import type { Playbook, Task } from "./engine/types.js";

/** 单个任务的预览信息 */
export interface PreviewTask {
  /** 任务名 */
  name: string;
  /** 模块名 (package / shell / template / ...) */
  module: string;
  /** 替换 vars 之后的最终参数（json-safe） */
  resolvedArgs: Record<string, unknown>;
  /** 是否会因为 when: 条件而跳过 */
  willSkip: boolean;
  /** 跳过原因（when 表达式的字面值） */
  skipReason?: string;
  /** 一行人类可读的描述 */
  summary: string;
  /** 标记此任务的副作用类型，UI 用来给图标着色 */
  effectKind: "install" | "config" | "service" | "command" | "filesystem" | "user" | "other";
}

/** 一个会被写入或修改的远端文件路径 */
export interface PreviewFile {
  path: string;
  /** 来源任务的 module 名 */
  via: string;
  /** 文件内容预览（template/copy 才有；lineinfile 没有完整内容） */
  contentPreview?: string;
  /** 内容预览的总行数（>= contentPreview 行数；超出后会被裁剪） */
  totalLines?: number;
  /** 操作类型 */
  action: "create-or-replace" | "edit-line" | "delete";
}

/** 整体预览结果 */
export interface PlaybookPreview {
  /** 渲染后的完整 YAML，用户可以一眼看到所有 {{ vars }} 都成了什么 */
  renderedYaml: string;
  /** 用户填的 vars（经过 schema 验证 + 默认值填充 + show_when 过滤） */
  effectiveVars: Record<string, unknown>;
  /** 因为 schema 的 show_when 而被过滤掉的字段名（让 UI 提示用户） */
  hiddenVars: string[];
  /** 每个任务的预览 */
  tasks: PreviewTask[];
  /** 会被写入或修改的远端文件 */
  files: PreviewFile[];
  /** 沿用 impact.ts 的影响范围估算（disk/time/sudo/risk） */
  impact: ReturnType<typeof estimateImpact>;
  /** verify: 块预览（如果 Playbook 声明了） */
  verifyChecks?: Array<{ name: string; cmd: string }>;
}

/**
 * 渲染 Playbook 预览。如果 catalogId 有 vars schema，submitted vars 会先经过验证；
 * 验证失败时抛出错误，让上层 API 返回 400 fieldErrors。
 */
export async function buildPlaybookPreview(
  catalogId: string,
  submittedVars: Record<string, unknown>
): Promise<PlaybookPreview> {
  const yamlText = await resolvePlaybookYaml(catalogId);
  const playbook = parsePlaybook(yamlText);

  // 解析用户 vars
  const schema = await loadVarsSchema(catalogId);
  let effectiveVars: Record<string, unknown>;
  let hiddenVars: string[] = [];
  if (schema) {
    const validated = validateAndNormalise(schema, submittedVars);
    if (!validated.ok) {
      // 把字段错误透出去，让 routes.ts 转成 400 + fieldErrors
      const err = new Error("Invalid vars") as Error & { fieldErrors?: Record<string, string> };
      err.fieldErrors = validated.errors;
      throw err;
    }
    effectiveVars = validated.values;
    // 哪些 schema 字段被 show_when 隐藏了（validateAndNormalise 会从 values 里删掉它们）
    hiddenVars = Object.keys(schema).filter((k) => !(k in effectiveVars));
  } else {
    effectiveVars = { ...submittedVars };
  }

  // 合并 playbook.vars + 用户 vars（用户 vars 覆盖默认）
  const mergedVars: Record<string, unknown> = { ...(playbook.vars ?? {}), ...effectiveVars };

  // 渲染 YAML：用 substitute 走一遍 playbook 对象，再 stringify 回 YAML
  const renderedPlaybook = substitute(playbook, mergedVars) as Playbook;
  const renderedYaml = yaml.stringify(renderedPlaybook, { lineWidth: 0 });

  // 任务预览
  const tasks: PreviewTask[] = [];
  const files: PreviewFile[] = [];
  for (const t of playbook.tasks ?? []) {
    const resolvedArgs = substitute(t.args ?? {}, mergedVars) as Record<string, unknown>;
    let willSkip = false;
    let skipReason: string | undefined;
    if (t.when) {
      const passes = evalWhen(t.when, mergedVars);
      if (!passes) {
        willSkip = true;
        skipReason = `when: ${t.when} → false`;
      }
    }
    tasks.push({
      name: t.name,
      module: t.module,
      resolvedArgs,
      willSkip,
      skipReason,
      summary: describeTask(t, resolvedArgs),
      effectKind: classifyEffect(t.module)
    });

    if (!willSkip) {
      collectFileTargets(t, resolvedArgs, files);
    }
  }

  // 影响范围（用渲染后的 playbook，所以会反映用户的实际选择，比如反代 vs 静态）
  const impact = estimateImpact(renderedPlaybook);

  // verify 块预览（同样替换 vars）
  const verifyChecks = playbook.verify?.map((v) => ({
    name: v.name,
    cmd: substitute(v.cmd, mergedVars) as string
  }));

  return { renderedYaml, effectiveVars, hiddenVars, tasks, files, impact, verifyChecks };
}

/** 一行人类可读的描述。和 generate-stub-guides.mjs 的 describeTask 类似但用替换后的 args。 */
function describeTask(t: Task, args: Record<string, unknown>): string {
  const m = t.module;
  switch (m) {
    case "package": {
      const names = Array.isArray(args.name) ? (args.name as string[]).join(", ") : args.name;
      const state = args.state ?? "present";
      return state === "absent" ? `卸载 ${names}` : `安装 ${names}`;
    }
    case "service": {
      const state = args.state ?? "started";
      const enabled = args.enabled === true ? "（开机自启）" : args.enabled === false ? "（禁用自启）" : "";
      return `服务 ${args.name}: ${state}${enabled}`;
    }
    case "shell":
      return `执行命令: ${String(args.cmd ?? "").split("\n")[0].slice(0, 80)}`;
    case "lineinfile":
      return `修改文件 ${args.path}（行级编辑）`;
    case "copy":
      return `上传文件到 ${args.dest}`;
    case "template":
      return `渲染模板到 ${args.dest}`;
    case "user":
      return `用户管理: ${args.name}`;
    case "file": {
      const state = args.state ?? "file";
      return `文件 ${args.path} → ${state}`;
    }
    case "ufw":
      return `防火墙: ${args.rule ?? "?"} ${args.port ?? ""}`;
    case "systemd_unit":
      return `创建 systemd 单元 ${args.name}`;
    case "cron":
      return `Cron 任务 ${args.name}`;
    case "sysctl":
      return `内核参数 ${args.name} = ${args.value}`;
    case "acme":
      return `签发证书: ${args.domain}`;
    default:
      return `${m} 任务`;
  }
}

function classifyEffect(module: string): PreviewTask["effectKind"] {
  if (module === "package") return "install";
  if (["lineinfile", "copy", "template", "sysctl"].includes(module)) return "config";
  if (["service", "systemd_unit", "cron"].includes(module)) return "service";
  if (module === "shell") return "command";
  if (module === "file") return "filesystem";
  if (module === "user") return "user";
  return "other";
}

/** 收集会被写入或修改的远端文件，给 UI 一个明确的 "这些文件会变" 列表。 */
function collectFileTargets(t: Task, args: Record<string, unknown>, files: PreviewFile[]) {
  const m = t.module;
  if (m === "template" || m === "copy") {
    const dest = args.dest as string | undefined;
    if (!dest) return;
    let contentPreview: string | undefined;
    let totalLines: number | undefined;
    const content = args.content as string | undefined;
    if (typeof content === "string") {
      const lines = content.split("\n");
      totalLines = lines.length;
      // 文件预览限制 60 行，避免巨大 nginx config / json 把 UI 撑爆
      contentPreview = lines.slice(0, 60).join("\n");
      if (totalLines > 60) contentPreview += `\n... (${totalLines - 60} more lines)`;
    }
    files.push({ path: dest, via: m, contentPreview, totalLines, action: "create-or-replace" });
  } else if (m === "lineinfile") {
    const p = args.path as string | undefined;
    if (!p) return;
    const line = args.line as string | undefined;
    files.push({
      path: p,
      via: m,
      contentPreview: line ? `(行级编辑) ${line}` : "(行级编辑)",
      action: "edit-line"
    });
  } else if (m === "file") {
    const p = args.path as string | undefined;
    if (!p) return;
    const state = args.state as string | undefined;
    if (state === "absent") {
      files.push({ path: p, via: m, action: "delete" });
    }
  }
}
