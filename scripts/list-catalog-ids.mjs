#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const text = await fs.readFile(path.join(ROOT, "apps/api/src/catalog.ts"), "utf8");
const fnStart = text.indexOf("export function listCatalogItems");
const fnEnd = text.indexOf("export function listCurrentUser", fnStart);
const scope = text.slice(fnStart, fnEnd);

const itemRegex = /\{\s*id:\s*["']([a-z0-9-]+)["']/g;
const positions = [];
let m;
while ((m = itemRegex.exec(scope))) positions.push({ id: m[1], start: m.index });

const items = [];
for (let i = 0; i < positions.length; i++) {
  const { id, start } = positions[i];
  const end = i + 1 < positions.length ? positions[i + 1].start : scope.length;
  const block = scope.slice(start, end);
  const name = block.match(/name:\s*["'`]([^"'`\n]+)["'`]/)?.[1] ?? "";
  const kind = block.match(/kind:\s*["'`]([^"'`\n]+)["'`]/)?.[1] ?? "";
  const category = block.match(/category:\s*["'`]([^"'`\n]+)["'`]/)?.[1] ?? "";
  const sensitivity = block.match(/sensitivity:\s*["'`]([^"'`\n]+)["'`]/)?.[1] ?? "";
  // schema?
  let hasSchema = false;
  try {
    await fs.access(path.join(ROOT, `configs/catalog/playbooks/${id}.vars.json`));
    hasSchema = true;
  } catch {}
  items.push({ id, name, kind, category, sensitivity, hasSchema });
}

// group by category
const byCategory = {};
for (const it of items) {
  if (!byCategory[it.category]) byCategory[it.category] = [];
  byCategory[it.category].push(it);
}
const categoryOrder = ["service", "database", "container", "security", "network", "runtime", "developer"];
console.log(`Total: ${items.length} items, ${items.filter((i) => i.hasSchema).length} with schema\n`);
for (const cat of [...categoryOrder, ...Object.keys(byCategory).filter((c) => !categoryOrder.includes(c))]) {
  const list = byCategory[cat];
  if (!list) continue;
  console.log(`### ${cat} (${list.length})`);
  for (const it of list) {
    const flag = it.hasSchema ? "[SCHEMA]" : "        ";
    console.log(`  ${flag} ${it.id.padEnd(28)} (${it.kind}) ${it.name}`);
  }
  console.log();
}
