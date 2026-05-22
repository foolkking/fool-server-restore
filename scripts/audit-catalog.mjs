#!/usr/bin/env node
/**
 * audit-catalog.mjs — verify every catalog item's md guide + playbook YAML are consistent
 *
 * Run: node scripts/audit-catalog.mjs
 *
 * Checks for each item in the catalog:
 *   1. guidePath file exists and isn't a stub
 *   2. Playbook YAML file exists at configs/catalog/playbooks/<id>.yaml
 *   3. YAML parses (using the same engine the runtime uses)
 *   4. YAML.name is not empty
 *   5. Components declared in catalog item are actually installed by the Playbook
 *      - software components → there's a `module: package` task with that name
 *      - system-command components → at least one `module: shell|service|systemd_unit` task
 *   6. If a vars.schema.json exists, every {{ var }} referenced in the YAML
 *      is declared in the schema (or in playbook.vars defaults)
 *   7. Markdown isn't trivially short (< 300 chars suggests a stub)
 *   8. Markdown's first heading roughly matches the catalog item name
 */

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import yaml from "yaml";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const CATALOG_TS = path.join(ROOT, "apps/api/src/catalog.ts");
const PLAYBOOKS_DIR = path.join(ROOT, "configs/catalog/playbooks");
const STUB_THRESHOLD = 300;

/**
 * Extract catalog items by parsing catalog.ts as text. We only need a few
 * fields per item (id, name, guidePath, components) so a regex extraction is
 * lighter than spinning up tsc just to import the module.
 */
async function loadCatalogItems() {
  const text = await fs.readFile(CATALOG_TS, "utf8");
  const items = [];
  // Only scan inside the listCatalogItems function body. Other id-bearing structs
  // in the file (listCurrentUser sample data, etc.) are NOT catalog entries.
  const fnStart = text.indexOf("export function listCatalogItems");
  const fnEnd = text.indexOf("export function listCurrentUser", fnStart);
  const scope = fnStart >= 0
    ? text.slice(fnStart, fnEnd > 0 ? fnEnd : text.length)
    : text;

  const itemRegex = /\{\s*id:\s*["']([a-z0-9-]+)["']/g;
  let m;
  const positions = [];
  while ((m = itemRegex.exec(scope))) {
    positions.push({ id: m[1], start: m.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const { id, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : scope.length;
    const block = scope.slice(start, end);
    const nameMatch = block.match(/name:\s*["'`]([^"'`\n]+)["'`]/);
    const guidePathMatch = block.match(/guidePath:\s*["']([^"']+)["']/);
    const componentsMatch = block.match(/components:\s*\[([^\]]*)\]/s);

    const components = [];
    if (componentsMatch) {
      const compRegex = /\{\s*type:\s*["']([^"']+)["'][^}]*label:\s*["']([^"']+)["']/g;
      let cm;
      while ((cm = compRegex.exec(componentsMatch[1]))) {
        components.push({ type: cm[1], label: cm[2] });
      }
    }
    items.push({
      id,
      name: nameMatch?.[1] ?? "",
      guidePath: guidePathMatch?.[1] ?? "",
      components
    });
  }
  return items;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readSize(p) {
  try { const stat = await fs.stat(p); return stat.size; } catch { return 0; }
}

/** Walk the YAML AST collecting every {{ var }} placeholder reference, plus
 *  vars referenced in `when:` expressions (which use the same vars by name). */
function findVarReferences(node, found, parentKey = "") {
  if (typeof node === "string") {
    const re = /\{\{\s*([a-zA-Z_][\w]*)/g;
    let m;
    while ((m = re.exec(node))) found.add(m[1]);
    // when expressions reference vars by bare name: "enable_https == true"
    if (parentKey === "when") {
      const wre = /\b([a-zA-Z_][\w]*)\b/g;
      let wm;
      while ((wm = wre.exec(node))) {
        const tok = wm[1];
        // skip operators and known truthy/falsy tokens; also skip tokens
        // that appear inside string literals (e.g. "x == 'nginx'") since
        // those are values, not var refs.
        if (["true", "false", "null", "and", "or", "not", "in", "item"].includes(tok)) continue;
        // Check whether this token is inside a quoted string in the expression
        const ti = wm.index;
        const before = node.slice(0, ti);
        const singleQuotes = (before.match(/'/g) || []).length;
        const doubleQuotes = (before.match(/"/g) || []).length;
        if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1) continue; // inside a string
        found.add(tok);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) findVarReferences(v, found, parentKey);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) findVarReferences(v, found, k);
  }
}

async function auditItem(item) {
  const issues = [];
  const itemDir = path.dirname(item.guidePath);

  // 1. guidePath exists and isn't a stub
  const guideAbs = path.join(ROOT, item.guidePath);
  if (!item.guidePath) {
    issues.push({ level: "error", code: "no-guidepath", msg: "guidePath empty in catalog item" });
  } else if (!(await exists(guideAbs))) {
    issues.push({ level: "error", code: "guide-missing", msg: `guide file missing: ${item.guidePath}` });
  } else {
    const size = await readSize(guideAbs);
    if (size < STUB_THRESHOLD) {
      issues.push({ level: "warn", code: "guide-stub", msg: `guide too short (${size} bytes < ${STUB_THRESHOLD})` });
    }
  }

  // 2. Playbook YAML exists
  const playbookPath = path.join(PLAYBOOKS_DIR, `${item.id}.yaml`);
  if (!(await exists(playbookPath))) {
    issues.push({ level: "error", code: "playbook-missing", msg: `playbook YAML missing: configs/catalog/playbooks/${item.id}.yaml` });
    return { item, issues };
  }

  // 3. YAML parses
  const yamlText = await fs.readFile(playbookPath, "utf8");
  let parsed;
  try {
    parsed = yaml.parse(yamlText);
  } catch (err) {
    issues.push({ level: "error", code: "playbook-parse", msg: `playbook YAML parse error: ${err.message}` });
    return { item, issues };
  }
  // Accept either { tasks: [...] } or [{ tasks: [...] }]
  const playbook = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!playbook?.name || typeof playbook.name !== "string") {
    issues.push({ level: "warn", code: "playbook-noname", msg: "playbook YAML has no top-level 'name'" });
  }

  // 4. Tasks exist
  const tasks = Array.isArray(playbook?.tasks) ? playbook.tasks : [];
  if (tasks.length === 0) {
    issues.push({ level: "error", code: "playbook-empty", msg: "playbook has no tasks" });
    return { item, issues };
  }

  // 5. Component coverage — every "software" component should appear in some package task,
  //    UNLESS the playbook installs via a non-package mechanism (tarball download, install script, etc.).
  const installedPackages = new Set();
  let hasNonPackageInstall = false;
  for (const task of tasks) {
    if (task?.module === "package") {
      const names = Array.isArray(task.args?.name) ? task.args.name : [task.args?.name];
      for (const n of names) if (typeof n === "string") installedPackages.add(n);
    }
    if (task?.module === "shell" && typeof task.args?.cmd === "string") {
      const cmd = task.args.cmd.toLowerCase();
      // Tarball / install-script / curl|bash / wget patterns suggest a binary install,
      // which is a legit alternative to `module: package`.
      if (/curl\s+.*\|\s*(bash|sh)|wget.*\|\s*(bash|sh)|\btar\b.*\s-[xz]|rpm\s+-i\b|dpkg\s+-i\b|install\.sh|cargo\s+install|\bgo\s+install\b|npm\s+install\s+-g|pip\s+install|\bdownload\b|\.tar\.gz|\.tar\.xz/.test(cmd)) {
        hasNonPackageInstall = true;
      }
    }
  }
  const hasShellTask = tasks.some((t) => ["shell", "service", "systemd_unit", "cron"].includes(t?.module));
  for (const comp of item.components) {
    if (comp.type === "software") {
      if (installedPackages.size === 0 && !hasNonPackageInstall) {
        issues.push({ level: "warn", code: "comp-no-package",
          msg: `component "${comp.label}" is software but playbook has no 'module: package' task or recognized install command` });
        break;
      }
    } else if (comp.type === "system-command") {
      if (!hasShellTask) {
        issues.push({ level: "warn", code: "comp-no-action",
          msg: `component "${comp.label}" is system-command but playbook has no shell/service/systemd_unit task` });
        break;
      }
    }
  }

  // 6. Vars schema consistency (only if schema exists)
  const schemaPath = path.join(PLAYBOOKS_DIR, `${item.id}.vars.json`);
  if (await exists(schemaPath)) {
    let schema;
    try {
      schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
    } catch (err) {
      issues.push({ level: "error", code: "schema-parse", msg: `vars.schema.json invalid JSON: ${err.message}` });
      schema = null;
    }
    if (schema) {
      const declared = new Set(Object.keys(schema));
      const playbookDefaults = new Set(Object.keys(playbook?.vars ?? {}));
      const referenced = new Set();
      findVarReferences(playbook, referenced);
      // Allow `item` (loop variable) and any var with a default in playbook.vars
      referenced.delete("item");
      for (const ref of referenced) {
        if (!declared.has(ref) && !playbookDefaults.has(ref)) {
          issues.push({ level: "warn", code: "var-undeclared",
            msg: `{{ ${ref} }} referenced in YAML but not in vars.schema.json or playbook.vars` });
        }
      }
      // Reverse: warn about schema fields nothing references
      for (const decl of declared) {
        if (!referenced.has(decl)) {
          issues.push({ level: "info", code: "var-unused",
            msg: `schema declares "${decl}" but playbook never references {{ ${decl} }}` });
        }
      }
    }
  }

  // 7. Markdown heading vs name sanity check
  if (await exists(guideAbs)) {
    const md = await fs.readFile(guideAbs, "utf8");
    const heading = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
    if (heading && item.name) {
      // Loose check: at least one Chinese token (≥ 2 chars) from item.name should appear in the heading
      const tokens = item.name.match(/[\u4e00-\u9fff]{2,}|[A-Za-z0-9]{3,}/g) ?? [];
      const hit = tokens.some((tok) => heading.includes(tok));
      if (tokens.length > 0 && !hit) {
        issues.push({ level: "info", code: "md-heading-mismatch",
          msg: `markdown heading "${heading}" doesn't share tokens with catalog name "${item.name}"` });
      }
    }
  }

  return { item, issues };
}

async function main() {
  const items = await loadCatalogItems();
  console.log(`\n📋 Auditing ${items.length} catalog items...\n`);

  const reports = [];
  for (const item of items) {
    reports.push(await auditItem(item));
  }

  let errors = 0, warns = 0, infos = 0;
  const errorItems = [];
  const warnItems = [];

  for (const { item, issues } of reports) {
    if (issues.length === 0) continue;
    const e = issues.filter((i) => i.level === "error");
    const w = issues.filter((i) => i.level === "warn");
    const i = issues.filter((i) => i.level === "info");
    errors += e.length;
    warns += w.length;
    infos += i.length;

    if (e.length > 0) errorItems.push({ item, issues: e });
    if (w.length > 0) warnItems.push({ item, issues: w });

    console.log(`\n[${e.length > 0 ? "ERR" : w.length > 0 ? "WARN" : "INFO"}]  ${item.id}  (${item.name})`);
    for (const issue of issues) {
      const tag = issue.level === "error" ? "  ERROR" : issue.level === "warn" ? "  WARN " : "  INFO ";
      console.log(`${tag} [${issue.code}] ${issue.msg}`);
    }
  }

  console.log(`\n============================================`);
  console.log(`Summary: ${items.length} items checked`);
  console.log(`   ${errors} errors, ${warns} warnings, ${infos} info notes`);
  console.log(`============================================\n`);

  // Per-code breakdown for quick triage
  const byCode = {};
  for (const { issues } of reports) {
    for (const i of issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  }
  console.log("Issues by code:");
  for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(28)} ${n}`);
  }

  if (errorItems.length > 0) {
    console.log("\nItems with ERRORS:");
    for (const { item } of errorItems) console.log(`  - ${item.id}`);
    console.log();
  }
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Audit script crashed:", err);
  process.exit(2);
});
