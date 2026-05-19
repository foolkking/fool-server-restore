import type { CollectorOutput, MachineIdentity, SnapshotManifest } from "./types.js";

export const schemaVersion = "0.1.0";

export function createSnapshotManifest(input: {
  user: string;
  machine: MachineIdentity;
  collectors: CollectorOutput[];
  redactions?: SnapshotManifest["redactions"];
  files?: SnapshotManifest["files"];
  restoreHints?: SnapshotManifest["restoreHints"];
}): SnapshotManifest {
  return {
    schemaVersion,
    createdAt: new Date().toISOString(),
    user: input.user,
    machine: input.machine,
    collectors: Object.fromEntries(input.collectors.map((collector) => [collector.id, collector])),
    files: input.files ?? [],
    redactions: input.redactions ?? [],
    restoreHints: input.restoreHints ?? []
  };
}

export function getMachineSnapshotPath(manifest: SnapshotManifest): string {
  const safeUser = sanitizePathSegment(manifest.user);
  const safeMachine = sanitizePathSegment(manifest.machine.id);
  const safeTime = manifest.createdAt.replace(/[:.]/g, "-");
  return `configs/snapshots/users/${safeUser}/machines/${safeMachine}/${safeTime}.json`;
}

export function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}
