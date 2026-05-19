import type { CollectorIssue, CollectorOutput } from "@fool/core";
import { runCommand } from "./command.js";

export interface GitConfigData {
  version: string | null;
  globalConfig: Record<string, string>;
  credentialHelper: string | null;
}

export async function collectGitConfig(): Promise<CollectorOutput<GitConfigData>> {
  const issues: CollectorIssue[] = [];
  const [version, config] = await Promise.all([
    runCommand("git", ["--version"]),
    runCommand("git", ["config", "--global", "--list"])
  ]);

  if (!version.ok) {
    issues.push({ code: "GIT_UNAVAILABLE", message: `git is not available: ${version.stderr}` });
  }

  const globalConfig = config.ok ? parseGitConfig(config.stdout) : {};
  if (!config.ok) {
    issues.push({
      code: "GIT_GLOBAL_CONFIG_UNAVAILABLE",
      message: `Could not read global git config: ${config.stderr}`
    });
  }

  return {
    id: "git-config",
    label: "Git config",
    status: version.ok ? "available" : "partial",
    data: {
      version: version.ok ? version.stdout : null,
      globalConfig,
      credentialHelper: globalConfig["credential.helper"] ?? null
    },
    issues
  };
}

function parseGitConfig(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) return [line, ""];
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}
