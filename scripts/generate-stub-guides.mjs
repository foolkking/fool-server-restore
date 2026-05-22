#!/usr/bin/env node
/**
 * generate-stub-guides.mjs — auto-generate catalog markdown guides from
 * catalog metadata + the Playbook YAML for items that don't have one yet.
 *
 * Run: node scripts/generate-stub-guides.mjs
 *
 * The generated content is intentionally a "good first draft" — substantive
 * enough to pass the audit (>= 300 chars) and useful enough to be informative,
 * but each one should still be reviewed and tightened by a human author. We
 * surface the catalog summary, list every component, document every Playbook
 * task, and add boilerplate for usage / safety / verification. That gives
 * authors a real starting point rather than a one-liner stub.
 */

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import yaml from "yaml";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const CATALOG_TS = path.join(ROOT, "apps/api/src/catalog.ts");
const PLAYBOOKS_DIR = path.join(ROOT, "configs/catalog/playbooks");
const GUIDES_DIR_SOFTWARE = path.join(ROOT, "configs/catalog/software");
const GUIDES_DIR_COMBOS = path.join(ROOT, "configs/catalog/combos");

/** Same scope-aware extraction as audit-catalog.mjs — only items in listCatalogItems(). */
async function loadCatalogItems() {
  const text = await fs.readFile(CATALOG_TS, "utf8");
  const fnStart = text.indexOf("export function listCatalogItems");
  const fnEnd = text.indexOf("export function listCurrentUser", fnStart);
  const scope = fnStart >= 0
    ? text.slice(fnStart, fnEnd > 0 ? fnEnd : text.length)
    : text;

  const items = [];
  const itemRegex = /\{\s*id:\s*["']([a-z0-9-]+)["']/g;
  let m;
  const positions = [];
  while ((m = itemRegex.exec(scope))) positions.push({ id: m[1], start: m.index });
  for (let i = 0; i < positions.length; i++) {
    const { id, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : scope.length;
    const block = scope.slice(start, end);
    const pick = (key) => {
      const re = new RegExp(`${key}:\\s*["'\`]([^"'\`\\n]+)["'\`]`);
      return block.match(re)?.[1] ?? "";
    };
    const summary = pick("summary");
    const summaryEn = pick("summaryEn");
    const name = pick("name");
    const nameEn = pick("nameEn");
    const guidePath = pick("guidePath");
    const sensitivity = pick("sensitivity");
    const installMode = pick("installMode");
    const kind = pick("kind");
    const category = pick("category");

    const componentsMatch = block.match(/components:\s*\[([\s\S]*?)\]\s*}/);
    const components = [];
    if (componentsMatch) {
      const compRe = /\{\s*type:\s*["']([^"']+)["']\s*,\s*label:\s*["']([^"']+)["']\s*,\s*labelEn:\s*["']([^"']+)["']\s*,\s*detail:\s*["']([^"']*)["']/g;
      let cm;
      while ((cm = compRe.exec(componentsMatch[1]))) {
        components.push({ type: cm[1], label: cm[2], labelEn: cm[3], detail: cm[4] });
      }
    }
    items.push({ id, name, nameEn, summary, summaryEn, guidePath, sensitivity, installMode, kind, category, components });
  }
  return items;
}

async function loadPlaybook(id) {
  const p = path.join(PLAYBOOKS_DIR, `${id}.yaml`);
  try {
    const text = await fs.readFile(p, "utf8");
    const parsed = yaml.parse(text);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return null;
  }
}

/** Render a single Playbook task as a one-liner human description. */
function describeTask(task) {
  const m = task?.module ?? "?";
  const a = task?.args ?? {};
  const action = task?.name ?? "";
  switch (m) {
    case "package": {
      const names = Array.isArray(a.name) ? a.name.join(", ") : a.name;
      return action ? action : `安装软件包 \`${names}\``;
    }
    case "service":
      return action ? action : `服务管理 \`${a.name}\` (${a.state ?? "started"})`;
    case "shell":
      return action ? action : `执行 shell 命令`;
    case "lineinfile":
      return action ? action : `编辑文件 \`${a.path}\``;
    case "copy":
    case "template":
      return action ? action : `写入文件 \`${a.dest}\``;
    case "user":
      return action ? action : `用户管理 \`${a.name}\``;
    case "ufw":
    case "firewalld":
      return action ? action : `防火墙规则`;
    case "systemd_unit":
      return action ? action : `创建 systemd 单元 \`${a.name}\``;
    case "cron":
      return action ? action : `Cron 任务 \`${a.name}\``;
    case "sysctl":
      return action ? action : `内核参数 \`${a.name}\``;
    case "acme":
      return action ? action : `Let's Encrypt 证书签发`;
    case "file":
      return action ? action : `文件 \`${a.path}\` (${a.state})`;
    default:
      return action || `${m} 任务`;
  }
}

/**
 * Cheap heuristic: detect the dominant package being installed.
 *
 * Strategy: prefer a package name that overlaps with the catalog item id, then
 * fall back to the LAST `module: package` task (typically the main install
 * after prerequisites), then to the first package found. This avoids picking
 * a prerequisite like "gnupg" or "curl" that's installed before the real one.
 */
function detectMainPackage(playbook, itemId = "") {
  const tasks = playbook?.tasks ?? [];
  const allPackages = [];
  for (const t of tasks) {
    if (t?.module === "package" && t.args?.name) {
      const names = Array.isArray(t.args.name) ? t.args.name : [t.args.name];
      for (const n of names) if (typeof n === "string") allPackages.push(n);
    }
  }
  if (allPackages.length === 0) return null;

  // 1. Prefer a package whose name overlaps with the item id
  const idTokens = itemId.split(/[-_]/).filter((tok) => tok.length >= 3);
  for (const pkg of allPackages) {
    for (const tok of idTokens) {
      if (pkg.toLowerCase().includes(tok.toLowerCase())) return pkg;
    }
  }

  // 2. Last package — typically the real install, after prerequisites like curl/gnupg
  return allPackages[allPackages.length - 1];
}

function generateGuide(item, playbook) {
  const lines = [];
  const cnName = item.name || item.id;
  const enName = item.nameEn || item.id;
  const mainPkg = detectMainPackage(playbook, item.id);
  const summary = item.summary || `${cnName} 一键部署。`;

  // Title + summary
  lines.push(`# ${cnName}`);
  lines.push("");
  lines.push(summary);
  if (item.summaryEn && item.summaryEn !== item.summary) {
    lines.push("");
    lines.push(`*${item.summaryEn}*`);
  }
  lines.push("");

  // Quick facts
  lines.push("## 你将得到什么");
  lines.push("");
  if (item.components.length > 0) {
    for (const c of item.components) {
      const tag = c.type === "software" ? "📦" : c.type === "system-command" ? "▶" : "⚙";
      lines.push(`- ${tag} **${c.label}** _(${c.labelEn})_ — 通过 ${c.detail || c.type}`);
    }
  } else {
    lines.push(`- 一键完成 ${cnName} 的安装和启动配置。`);
  }
  lines.push("");

  // What the Playbook does, step by step (this is most of the value of the auto-gen)
  if (playbook?.tasks?.length) {
    lines.push("## 自动化步骤");
    lines.push("");
    lines.push("EnvForge 在目标机器上依次执行以下任务：");
    lines.push("");
    let n = 1;
    for (const t of playbook.tasks) {
      lines.push(`${n}. ${describeTask(t)}`);
      n++;
    }
    lines.push("");
  }

  // Sensitivity warning (privileged/review get a more visible callout)
  if (item.sensitivity === "privileged") {
    lines.push("## ⚠️ 敏感性");
    lines.push("");
    lines.push(`此 Playbook 标记为 **privileged**：会修改系统级配置（用户、防火墙、systemd 服务、内核参数等）。建议先用 dry-run 模式预览影响，再执行真实安装。`);
    lines.push("");
  } else if (item.sensitivity === "review") {
    lines.push("## ⚠️ 敏感性");
    lines.push("");
    lines.push(`此 Playbook 标记为 **review**：会安装系统服务并改动配置文件。如果对该机器有现有依赖，请先确认不会冲突。`);
    lines.push("");
  }

  // Verify section pointing at the right command for the main package
  lines.push("## 验证安装");
  lines.push("");
  lines.push("```bash");
  if (mainPkg) {
    lines.push(`# 检查包是否已安装`);
    lines.push(`dpkg -l | grep ${mainPkg}      # Ubuntu/Debian`);
    lines.push(`rpm -q ${mainPkg}                # RHEL/CentOS/Anolis`);
    lines.push("");
    lines.push(`# 检查服务是否运行（如果有 systemd 单元）`);
    lines.push(`systemctl status ${mainPkg} --no-pager`);
  } else {
    lines.push(`# 根据安装内容运行对应的健康检查命令`);
    lines.push(`# 例如查看进程: ps aux | grep <name>`);
    lines.push(`# 例如查看端口: ss -tlnp`);
  }
  lines.push("```");
  lines.push("");

  // Common troubleshooting boilerplate (RHEL cross-distro hint comes from real-world support pain)
  lines.push("## 排错");
  lines.push("");
  lines.push("- **包找不到（RHEL/CentOS/Anolis）**：可能需要启用 EPEL 仓库或某个 dnf module stream。EnvForge 在安装时已经主动尝试这两步，看任务日志的 `preflight:` 段落确认结果。");
  lines.push("- **服务启动失败**：日志会自动包含 `systemctl status` 和 `journalctl` 摘要；按 🔍 标记的根因提示处理（端口冲突、配置语法错误、SELinux 等）。");
  lines.push("- **跨发行版兼容**：从 Ubuntu 捕获的 Playbook 在 RHEL 系统上跑时，部分包名/服务名会自动翻译（如 `apache2 → httpd`），看任务日志末尾的 `[renamed for dnf: ...]` 段落确认。");
  lines.push("");

  // Install mode note
  if (item.installMode === "skip-existing") {
    lines.push("## 多次运行");
    lines.push("");
    lines.push("Playbook 是幂等的：重复运行不会产生重复安装，已经安装的包/服务/配置会被跳过。`installMode: skip-existing`。");
    lines.push("");
  } else if (item.installMode === "replace-existing") {
    lines.push("## 多次运行");
    lines.push("");
    lines.push("`installMode: replace-existing` — 重复运行时会覆盖现有配置（适合『统一基线』场景）。如果已对该机器做过手动调整，先备份再运行。");
    lines.push("");
  }

  // Privacy / sensitivity boilerplate
  lines.push("## 隐私说明");
  lines.push("");
  lines.push("此 Playbook 不上传任何凭据或私钥。如果安装内容会生成本地 secret（数据库密码、API token 等），请在目标机器上单独处理，不要提交回市场。");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const items = await loadCatalogItems();
  const force = process.argv.includes("--force");
  let generated = 0, skipped = 0, errors = 0;

  for (const item of items) {
    if (!item.guidePath) continue;
    const dest = path.join(ROOT, item.guidePath);
    if (!force) {
      try { await fs.access(dest); skipped++; continue; } catch { /* missing → generate */ }
    }

    try {
      const playbook = await loadPlaybook(item.id);
      const md = generateGuide(item, playbook);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, md, "utf8");
      console.log(`  + ${item.guidePath}  (${item.id})`);
      generated++;
    } catch (err) {
      console.error(`  x ${item.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nGenerated ${generated} new guides, skipped ${skipped} existing, ${errors} errors.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
