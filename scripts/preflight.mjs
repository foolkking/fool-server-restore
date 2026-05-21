/*
 * @Author: fool
 * @Date: 2026-05-19 21:02:08
 * @LastEditors: fool
 * @LastEditTime: 2026-05-21 13:06:38
 * @FilePath: \EnvForge\scripts\preflight.mjs
 * @Description:  
 * @Note:  
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "package.json",
  "package-lock.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "configs/database/seed.json"
];

const checks = [];

checkCommand("node", ["--version"], (value) => /^v(2[0-9]|[3-9][0-9])\./.test(value.trim()));
checkCommand("npm", ["--version"], (value) => {
  const major = Number(value.trim().split(".")[0]);
  return Number.isFinite(major) && major >= 10;
});
await checkFiles();
await checkWritableDirectory(process.env.FOOL_DATA_DIR || "data");
await checkEnvExample();

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const marker = check.ok ? "ok" : "fail";
  console.log(`[${marker}] ${check.name}: ${check.detail}`);
}

if (failed.length) {
  console.error(`Preflight failed with ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("Preflight passed.");

function checkCommand(name, args, validate) {
  const result = spawnSync(name, args, { encoding: "utf8", shell: process.platform === "win32" });
  const value = result.stdout || result.stderr || "";
  checks.push({
    name,
    ok: result.status === 0 && validate(value),
    detail: value.trim() || `exit ${result.status}`
  });
}

async function checkFiles() {
  for (const file of requiredFiles) {
    try {
      await fs.access(path.join(root, file));
      checks.push({ name: `file:${file}`, ok: true, detail: "present" });
    } catch {
      checks.push({ name: `file:${file}`, ok: false, detail: "missing" });
    }
  }
}

async function checkWritableDirectory(directory) {
  const absolute = path.isAbsolute(directory) ? directory : path.join(root, directory);
  const probe = path.join(absolute, `.write-test-${Date.now()}`);
  try {
    await fs.mkdir(absolute, { recursive: true });
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    checks.push({ name: "data directory", ok: true, detail: absolute });
  } catch (error) {
    checks.push({ name: "data directory", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function checkEnvExample() {
  const env = await fs.readFile(path.join(root, ".env.example"), "utf8");
  const required = ["HOST=", "PORT=", "FOOL_DATA_DIR=", "SERVE_WEB="];
  const missing = required.filter((key) => !env.includes(key));
  checks.push({
    name: ".env.example",
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(", ")}` : "complete"
  });
}
