import type { RedactionRecord, SyncPolicy } from "./types.js";

export interface RedactionResult {
  value: string;
  redactions: RedactionRecord[];
}

export function redactKeyValue(
  key: string,
  value: string,
  policy: SyncPolicy,
  locationPrefix = "env"
): RedactionResult {
  const upperKey = key.toUpperCase();
  const matched = policy.sensitiveKeyPatterns.find((pattern) => upperKey.includes(pattern));

  if (!matched) {
    return { value, redactions: [] };
  }

  return {
    value: "[REDACTED]",
    redactions: [
      {
        location: `${locationPrefix}.${key}`,
        reason: `Matched sensitive key pattern ${matched}`
      }
    ]
  };
}

export function isSensitivePath(path: string, policy: SyncPolicy): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return policy.sensitivePathPatterns.some((pattern) =>
    normalized.includes(pattern.toLowerCase())
  );
}
