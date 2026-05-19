import type { CollectorIssue, CollectorOutput } from "@fool/core";
import { runCommand } from "./command.js";

export interface NodeEnvData {
  node: string | null;
  npm: string | null;
  pnpm: string | null;
  yarn: string | null;
  globalPackages: string[];
}

export async function collectNodeEnv(): Promise<CollectorOutput<NodeEnvData>> {
  const issues: CollectorIssue[] = [];
  const [node, npm, pnpm, yarn, npmGlobals] = await Promise.all([
    runCommand("node", ["--version"]),
    runCommand("npm", ["--version"]),
    runCommand("pnpm", ["--version"]),
    runCommand("yarn", ["--version"]),
    runCommand("npm", ["list", "-g", "--depth=0", "--json"])
  ]);

  for (const [name, result] of Object.entries({ node, npm, pnpm, yarn })) {
    if (!result.ok) {
      issues.push({
        code: `${name.toUpperCase()}_UNAVAILABLE`,
        message: `${name} is not available: ${result.stderr}`
      });
    }
  }

  const globalPackages = parseNpmGlobalPackages(npmGlobals.stdout, issues);

  return {
    id: "node-env",
    label: "Node.js environment",
    status: issues.some((issue) => issue.code === "NODE_UNAVAILABLE") ? "partial" : "available",
    data: {
      node: node.ok ? node.stdout : null,
      npm: npm.ok ? npm.stdout : null,
      pnpm: pnpm.ok ? pnpm.stdout : null,
      yarn: yarn.ok ? yarn.stdout : null,
      globalPackages
    },
    issues
  };
}

function parseNpmGlobalPackages(raw: string, issues: CollectorIssue[]): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { dependencies?: Record<string, { version?: string }> };
    return Object.entries(parsed.dependencies ?? {}).map(([name, meta]) =>
      meta.version ? `${name}@${meta.version}` : name
    );
  } catch {
    issues.push({
      code: "NPM_GLOBAL_PARSE_FAILED",
      message: "Could not parse npm global package list."
    });
    return [];
  }
}
