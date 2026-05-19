export type OperatingSystem = "windows" | "linux" | "macos" | "unknown";

export type CollectorStatus = "available" | "partial" | "unavailable";

export type RiskLevel = "low" | "medium" | "high";

export type DiffKind = "missing" | "changed" | "extra";

export interface MachineIdentity {
  id: string;
  hostname: string;
  os: OperatingSystem;
  platform: string;
  arch: string;
}

export interface CollectorIssue {
  code: string;
  message: string;
  needsPrivilege?: boolean;
}

export interface CollectorOutput<TData = unknown> {
  id: string;
  label: string;
  status: CollectorStatus;
  data: TData;
  issues: CollectorIssue[];
}

export interface SnapshotManifest {
  schemaVersion: string;
  createdAt: string;
  user: string;
  machine: MachineIdentity;
  collectors: Record<string, CollectorOutput>;
  files: SyncedFileRef[];
  redactions: RedactionRecord[];
  restoreHints: RestoreHint[];
}

export interface SyncedFileRef {
  sourcePath: string;
  storedPath: string;
  sha256?: string;
  encrypted: boolean;
  requiresApproval: boolean;
}

export interface RedactionRecord {
  location: string;
  reason: string;
}

export interface RestoreHint {
  collectorId: string;
  message: string;
  requiresPrivilege?: boolean;
}

export interface SyncPolicy {
  schemaVersion: string;
  enabledCollectors: string[];
  allowPathGlobs: string[];
  denyPathGlobs: string[];
  sensitiveKeyPatterns: string[];
  sensitivePathPatterns: string[];
  allowEncryptedSecrets: boolean;
  github: {
    commitMode: "direct" | "branch" | "pull-request";
  };
}

export interface DiffItem {
  kind: DiffKind;
  path: string;
  summary: string;
  risk: RiskLevel;
  requiresPrivilege: boolean;
  canAutoRestore: boolean;
  overwritesExisting: boolean;
}

export interface RestorePlan {
  id: string;
  createdAt: string;
  targetSnapshot: string;
  stages: RestoreStage[];
}

export interface RestoreStage {
  id: string;
  label: string;
  actions: RestoreAction[];
}

export interface RestoreAction {
  id: string;
  label: string;
  command?: string;
  risk: RiskLevel;
  requiresPrivilege: boolean;
  dryRunOnly?: boolean;
}
