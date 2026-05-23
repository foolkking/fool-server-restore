#!/usr/bin/env node
/**
 * audit-catalog-packages.mjs
 *
 * 检查所有 catalog playbook 里 `package: name:` 任务引用的包名，
 * 对照 §7.5.6（CATALOG_AUTHORING.md）的"已知陷阱表" + PACKAGE_ALIASES + NEEDS_EPEL，
 * 报出可能在某发行版上失败的包。
 *
 * 用法：
 *   node scripts/audit-catalog-packages.mjs            # 输出审计报告
 *   node scripts/audit-catalog-packages.mjs --strict   # 有任何风险时退出码 1（CI 用）
 *
 * 这不能 100% 保证包能装上（最终只有 sandbox 实跑能保证），但能拦截：
 *   - 已知废弃包（exa, etc.）
 *   - apt 风格包名没在 PACKAGE_ALIASES 里映射的（lib*-dev 等）
 *   - 需要 EPEL 但没在 NEEDS_EPEL 集合里的（Playbook 在 RHEL 上会失败）
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const playbooksDir = resolve(repoRoot, "configs/catalog/playbooks");
const packageModulePath = resolve(repoRoot, "apps/api/src/engine/modules/package.ts");

// ── 1) Load PACKAGE_ALIASES + NEEDS_EPEL by parsing the TS source ────────────
// We don't import the TS file directly (avoid build step); we extract via regex.
const pkgSrc = readFileSync(packageModulePath, "utf8");

function extractStringSet(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\)`, "m");
  const m = pkgSrc.match(re);
  if (!m) return new Set();
  return new Set(
    [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  );
}

function extractAliases() {
  const re = /const\s+PACKAGE_ALIASES[\s\S]*?=\s*\{([\s\S]*?)\n\};/m;
  const m = pkgSrc.match(re);
  if (!m) return new Set();
  return new Set(
    [...m[1].matchAll(/"([^"]+)":\s*\{/g)].map((x) => x[1])
  );
}

const NEEDS_EPEL = extractStringSet("NEEDS_EPEL");
const ALIASES = extractAliases();

// ── 2) Known traps (mirror of §7.5.6 in CATALOG_AUTHORING.md) ─────────────────
const KNOWN_BAD = new Map([
  ["exa", "Deprecated since 2021. Use 'lsd' or upstream tarball."],
]);

// Packages that are Debian/Ubuntu-only and already have a (skip) alias.
// We only flag a missing alias, not their use.
const APT_ONLY_OK_TO_SKIP = new Set([
  "apt-transport-https",
  "software-properties-common",
]);

// Packages that look like `*-dev` / `lib*-dev` / `*1g-*` etc — Debian naming.
// If they're not in PACKAGE_ALIASES, the playbook will fail on RHEL.
function looksDebianOnly(pkg) {
  return (
    /^lib.*-dev$/.test(pkg) ||
    /-dev$/.test(pkg) ||
    /^python3?-(?!certbot|pip)/.test(pkg) === false && /^python\d?-/.test(pkg) ||
    /1g(-|$)/.test(pkg)
  );
}

// Packages that are very likely RHEL-via-EPEL only (Rust CLI tools etc.)
function likelyNeedsEpel(pkg) {
  return /^(bat|btop|fd-find|ripgrep|zoxide|fzf|tldr|tealdeer|micro|fish|neofetch|ncdu|caddy|cockpit|fail2ban|certbot|neovim|htop|iotop|iftop|nethogs|vnstat|ranger|tmux|rclone|borgbackup|restic)$/.test(pkg);
}

// ── 3) Walk each playbook ────────────────────────────────────────────────────
const playbooks = readdirSync(playbooksDir)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

const findings = [];

for (const f of playbooks) {
  const fullPath = join(playbooksDir, f);
  const content = readFileSync(fullPath, "utf8");

  let parsed;
  try {
    parsed = parseYaml(content);
  } catch (e) {
    findings.push({ playbook: f, level: "error", msg: `YAML parse error: ${e.message}` });
    continue;
  }
  if (!parsed || !Array.isArray(parsed.tasks)) continue;

  for (const task of parsed.tasks) {
    if (!task || task.module !== "package") continue;
    const args = task.args || {};
    const names = Array.isArray(args.name) ? args.name : args.name ? [args.name] : [];

    for (const pkg of names) {
      if (typeof pkg !== "string") continue;

      // 3a) Hard-deprecated packages
      if (KNOWN_BAD.has(pkg)) {
        findings.push({
          playbook: f,
          task: task.name,
          pkg,
          level: "error",
          msg: KNOWN_BAD.get(pkg),
        });
        continue;
      }

      // 3b) Debian-style names without an alias → will fail on RHEL
      if (looksDebianOnly(pkg) && !ALIASES.has(pkg) && !APT_ONLY_OK_TO_SKIP.has(pkg)) {
        findings.push({
          playbook: f,
          task: task.name,
          pkg,
          level: "warn",
          msg: `Looks Debian-only (e.g. *-dev). Add to PACKAGE_ALIASES in apps/api/src/engine/modules/package.ts or branch by distro.`,
        });
      }

      // 3c) EPEL-only packages not in NEEDS_EPEL → RHEL preflight will not enable EPEL
      if (likelyNeedsEpel(pkg) && !NEEDS_EPEL.has(pkg)) {
        findings.push({
          playbook: f,
          task: task.name,
          pkg,
          level: "warn",
          msg: `Likely needs EPEL on RHEL but not in NEEDS_EPEL set. Add to NEEDS_EPEL in package.ts so preflight enables EPEL.`,
        });
      }

      // 3d) Suspicious empty default
      if (pkg.trim() === "") {
        findings.push({ playbook: f, task: task.name, pkg, level: "error", msg: "Empty package name." });
      }
    }
  }
}

// ── 4) Output ────────────────────────────────────────────────────────────────
const errors = findings.filter((x) => x.level === "error");
const warns = findings.filter((x) => x.level === "warn");

if (findings.length === 0) {
  console.log("✅ No catalog package issues found.");
  process.exit(0);
}

console.log("\n📋 Catalog package audit report\n");
for (const x of findings) {
  const tag = x.level === "error" ? "❌ ERROR" : "⚠️  WARN ";
  console.log(`${tag} ${x.playbook}`);
  if (x.task) console.log(`         task: ${x.task}`);
  if (x.pkg) console.log(`         pkg:  ${x.pkg}`);
  console.log(`         ${x.msg}\n`);
}

console.log(`Summary: ${errors.length} error(s), ${warns.length} warning(s) across ${playbooks.length} playbook(s).`);

if (process.argv.includes("--strict") && (errors.length > 0 || warns.length > 0)) {
  process.exit(1);
}
process.exit(errors.length > 0 ? 1 : 0);
