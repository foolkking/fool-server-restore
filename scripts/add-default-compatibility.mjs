#!/usr/bin/env node
/**
 * add-default-compatibility.mjs — 给所有未声明 compatibility 的 catalog item
 * 加上一个安全的默认值。
 *
 * 默认策略：所有项目都声明 families: ["debian-family", "rhel-family"]
 *   （这是 EnvForge 当前实际支持的两大主流家族）。
 *
 * 之后管理员可以在 admin UI 里给特定项目调整（比如某些 Playbook 用 apt-only 命令，
 * 就把 "rhel-family" 移除）。
 *
 * 这个脚本只跑一次，是给现有 catalog.ts 一键打上初始默认值。
 */

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const CATALOG_TS = path.join(ROOT, "apps/api/src/catalog.ts");

const DEFAULT_FAMILIES = '["debian-family", "rhel-family"]';

let text = await fs.readFile(CATALOG_TS, "utf8");
const lines = text.split(/\r?\n/);

// 我们要在每个 catalog item 的 components: [...] 之后加一行：
//   compatibility: { families: ["debian-family", "rhel-family"] },
// 但只在 listCatalogItems / getNewSoftwareCatalog / getNewComboCatalog 函数里。
// 简单识别：找形如 "components: [...]" 的行（含可能多行），如果它后面没紧跟
// "compatibility:" 才插入。

let modified = 0;
const out = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  out.push(line);
  // 检测 "components: [" 块
  if (/components:\s*\[/.test(line)) {
    // 找匹配的 "]" 行
    let depth = 0;
    let j = i;
    do {
      depth += (lines[j].match(/\[/g) ?? []).length;
      depth -= (lines[j].match(/\]/g) ?? []).length;
      j++;
    } while (j < lines.length && depth > 0);
    // j 指向 components 块结束行的下一行
    // 把 components 块的剩余行都压进 out（i+1 已经在循环中会写）
    while (i + 1 < j) {
      i++;
      out.push(lines[i]);
    }
    // 现在 out 末尾是 components: [...] 的最后一行
    // 检查后面紧接的非空行是不是 compatibility:
    let look = j;
    while (look < lines.length && lines[look].trim() === "") look++;
    if (look < lines.length && /compatibility:/.test(lines[look])) {
      // 已经声明过，不重复加
    } else {
      // 拿当前 components 行的缩进
      const lastCompLine = out[out.length - 1];
      // 同级缩进 = "components:" 那行的缩进（找回去）
      let componentsLineIdx = out.length - 1;
      while (componentsLineIdx >= 0 && !/components:\s*\[/.test(out[componentsLineIdx])) {
        componentsLineIdx--;
      }
      const indent = out[componentsLineIdx].match(/^(\s*)/)?.[1] ?? "      ";
      // 如果 components 块是单行 "components: [{...}]" 而 last line 末尾有 } 收尾
      // 我们要看 last line 是不是 "]" 或 "]," 或 末尾 ]+
      const trimmed = lastCompLine.trimEnd();
      // 如果 trimmed 以 "],",结束就好；否则补一个逗号
      // 简单做法：永远把 compatibility 行加在新行
      // 逗号问题：如果 components 块的最后一行没逗号（] 后），catalog item 还可能有别的字段在后面，那加个逗号可能形成 ]],,
      // 安全做法：检查 last line 是 "]" 或 "]," — 后者直接插入；前者改成 "],"
      if (trimmed.endsWith("]")) {
        out[out.length - 1] = lastCompLine.replace(/\]\s*$/, "],");
      } else if (trimmed.endsWith(",")) {
        // 已经有逗号
      }
      out.push(`${indent}compatibility: { families: ${DEFAULT_FAMILIES} }`);
      modified++;
    }
  }
  i++;
}

const newText = out.join("\n");
if (newText === text) {
  console.log("No catalog items modified (already have compatibility or no components blocks).");
} else {
  await fs.writeFile(CATALOG_TS, newText, "utf8");
  console.log(`Updated ${modified} catalog items with default compatibility.`);
}
