#!/usr/bin/env node
/**
 * copy-email-templates.mjs — runs after tsc to mirror src/email/templates/
 * (and any future non-.ts assets) into dist/.
 *
 * Why: tsc only emits compiled .ts → .js. Email templates are .txt/.html
 * and need to ride along to the dist directory so production runtime can
 * find them at the relative path `apps/api/dist/email/templates/`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const srcDir = path.join(repoRoot, "apps/api/src/email/templates");
const distDir = path.join(repoRoot, "apps/api/dist/email/templates");

async function main() {
  // Source dir might not exist yet (no templates added) — that's OK.
  try {
    await fs.access(srcDir);
  } catch {
    return;
  }

  await fs.mkdir(distDir, { recursive: true });

  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let copied = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(txt|html|md)$/i.test(e.name)) continue;
    await fs.copyFile(path.join(srcDir, e.name), path.join(distDir, e.name));
    copied++;
  }
  if (copied > 0) {
    console.log(`[copy-email-templates] copied ${copied} files → apps/api/dist/email/templates/`);
  }
}

main().catch((err) => {
  console.error("[copy-email-templates] failed:", err);
  process.exit(1);
});
