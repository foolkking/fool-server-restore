import type { CollectorOutput, RedactionRecord, SyncPolicy } from "@fool/core";
import { redactKeyValue } from "@fool/core";

export interface EnvVarsData {
  variables: Record<string, string>;
}

export function collectEnvVars(policy: SyncPolicy): CollectorOutput<EnvVarsData> & {
  redactions: RedactionRecord[];
} {
  const variables: Record<string, string> = {};
  const redactions: RedactionRecord[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const result = redactKeyValue(key, value, policy);
    variables[key] = result.value;
    redactions.push(...result.redactions);
  }

  return {
    id: "env-vars",
    label: "Environment variables",
    status: "available",
    data: { variables },
    issues: [],
    redactions
  };
}
