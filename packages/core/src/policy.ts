import type { SyncPolicy } from "./types.js";

export const defaultPolicy: SyncPolicy = {
  schemaVersion: "0.1.0",
  enabledCollectors: [
    "system-info",
    "node-env",
    "git-config",
    "env-vars"
  ],
  allowPathGlobs: [
    "~/.gitconfig",
    "~/Documents/PowerShell/*.ps1",
    "~/.config/fool-server-restore/**"
  ],
  denyPathGlobs: [
    "**/.env",
    "**/.env.*",
    "**/.ssh/id_*",
    "**/.aws/credentials",
    "**/Cookies",
    "**/Login Data"
  ],
  sensitiveKeyPatterns: [
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "PRIVATE_KEY",
    "ACCESS_KEY",
    "CREDENTIAL"
  ],
  sensitivePathPatterns: [
    ".env",
    ".ssh",
    "credentials",
    "Cookies",
    "Login Data"
  ],
  allowEncryptedSecrets: false,
  github: {
    commitMode: "branch"
  }
};

export function isCollectorEnabled(policy: SyncPolicy, collectorId: string): boolean {
  return policy.enabledCollectors.includes(collectorId);
}
