import type { CollectorOutput, RedactionRecord, SyncPolicy } from "@fool/core";
import { defaultPolicy } from "@fool/core";
import { collectEnvVars } from "./env-vars.js";
import { collectGitConfig } from "./git-config.js";
import { collectNodeEnv } from "./node-env.js";
import { collectSystemInfo, getMachineIdentity } from "./system-info.js";

export * from "./env-vars.js";
export * from "./git-config.js";
export * from "./node-env.js";
export * from "./system-info.js";

export async function collectSnapshotInputs(policy: SyncPolicy = defaultPolicy): Promise<{
  machine: ReturnType<typeof getMachineIdentity>;
  collectors: CollectorOutput[];
  redactions: RedactionRecord[];
}> {
  const collectors: CollectorOutput[] = [];
  const redactions: RedactionRecord[] = [];

  collectors.push(collectSystemInfo());
  collectors.push(await collectNodeEnv());
  collectors.push(await collectGitConfig());

  const envVars = collectEnvVars(policy);
  collectors.push(envVars);
  redactions.push(...envVars.redactions);

  return {
    machine: getMachineIdentity(),
    collectors,
    redactions
  };
}
