import type { FullSystemSnapshot, SoftwareItem } from "./collectors/remote-collector.js";
import { findRuleForPackage, type CatalogDetectionRule } from "./catalog-rules.js";

export type MigrationClass =
  | "managed-software"
  | "system-baseline"
  | "user-dotfile"
  | "service-config"
  | "language-global-package"
  | "container-workload"
  | "manual-install"
  | "unknown-review"
  | "do-not-migrate";

export type ConfidenceBand = "high" | "medium" | "low" | "ignore";

export interface MigrationCandidate {
  id: string;
  name: string;
  source: string;
  version: string;
  migrationClass: MigrationClass;
  confidence: number;
  band: ConfidenceBand;
  catalogRuleId?: string;
  catalogRuleName?: string;
  reasons: string[];
  risks: string[];
  recommendedActions: string[];
}

export interface MigrationCandidateReport {
  sourceHost: string;
  generatedAt: string;
  summary: Record<ConfidenceBand | "total", number>;
  candidates: MigrationCandidate[];
}

export interface MigrationPlanAction {
  kind: "installPackage" | "copyConfig" | "validate" | "restart" | "review" | "export";
  label: string;
  command?: string;
  requiresSudo?: boolean;
  backup?: boolean;
}

export interface MigrationPlanItem {
  id: string;
  name: string;
  type: MigrationClass;
  confidence: number;
  actions: MigrationPlanAction[];
  risks: string[];
  userDecision: "pending" | "approved" | "skipped";
}

export interface MigrationPlan {
  sourceHost: string;
  generatedAt: string;
  items: MigrationPlanItem[];
}

export type MigrationDecisionMap = Record<string, MigrationPlanItem["userDecision"]>;

type SnapshotForMigration = Pick<FullSystemSnapshot, "software"> & {
  system?: Partial<FullSystemSnapshot["system"]>;
};

const languageSources = new Set(["npm", "pip", "gem", "cargo", "go-bin", "nvm", "pyenv", "rbenv", "asdf", "sdkman"]);
const manualSources = new Set(["local-bin", "local-app", "opt", "srv", "user-bin"]);
const serviceSources = new Set(["systemd", "systemd-timer", "cron"]);

export function buildMigrationCandidateReport(
  snapshot: SnapshotForMigration,
  options: { host?: string } = {}
): MigrationCandidateReport {
  const candidates = snapshot.software.map(classifySoftwareItem).sort(sortCandidates);
  const summary: MigrationCandidateReport["summary"] = { high: 0, medium: 0, low: 0, ignore: 0, total: candidates.length };
  for (const candidate of candidates) summary[candidate.band]++;
  return {
    sourceHost: options.host ?? snapshot.system?.hostname ?? "unknown-host",
    generatedAt: new Date().toISOString(),
    summary,
    candidates
  };
}

export function buildMigrationPlanFromCandidates(report: MigrationCandidateReport, decisions: MigrationDecisionMap = {}): MigrationPlan {
  const items = report.candidates
    .filter((candidate) => candidate.band !== "ignore")
    .filter((candidate) => candidate.migrationClass !== "do-not-migrate")
    .filter((candidate) => decisions[candidate.id] !== "skipped")
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      type: candidate.migrationClass,
      confidence: candidate.confidence,
      actions: actionsForCandidate(candidate),
      risks: candidate.risks,
      userDecision: decisions[candidate.id] ?? "pending" as const
    }));
  return { sourceHost: report.sourceHost, generatedAt: new Date().toISOString(), items };
}

export function classifySoftwareItem(item: SoftwareItem): MigrationCandidate {
  const rule = findRuleForPackage(item.name, item.source);
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0.1;
  let migrationClass: MigrationClass = "unknown-review";

  if ((item.source === "apt" || item.source === "rpm") && isLowValueSystemPackage(item.name)) {
    return finalizeCandidate(item, "do-not-migrate", 0.05, undefined, [
      "Looks like a base image, kernel, firmware, library, or cloud-init package.",
      "EnvForge should not treat this as user migration intent."
    ], ["Usually restored by the target OS image or package dependencies."]);
  }

  if (rule) {
    score += 0.45;
    migrationClass = "managed-software";
    reasons.push(`Matched catalog capability: ${rule.displayName}.`);
  }
  if (item.trust === "user") {
    score += 0.18;
    reasons.push("Inventory marks this package as likely user-relevant.");
  } else if (item.trust === "uncertain") {
    score += 0.08;
    reasons.push("Package manager reports this as installed, but user intent is uncertain.");
  }
  if (languageSources.has(item.source)) {
    score += 0.18;
    migrationClass = rule ? "managed-software" : "language-global-package";
    reasons.push("Detected as a global language runtime/package artifact.");
  }
  if (item.source === "docker") {
    score += 0.14;
    migrationClass = "container-workload";
    reasons.push("Detected from Docker image inventory.");
    risks.push("Docker images are weak migration evidence; prefer compose files or service definitions.");
  }
  if (serviceSources.has(item.source)) {
    score += 0.22;
    migrationClass = rule ? "managed-software" : "service-config";
    reasons.push("Detected as an enabled or custom service/timer/cron workload.");
  }
  if (manualSources.has(item.source)) {
    score += 0.22;
    migrationClass = rule ? "managed-software" : "manual-install";
    reasons.push("Found in a user/manual install location such as /opt, /srv, /usr/local, or ~/.local/bin.");
  }
  if (item.source === "apt" || item.source === "rpm" || item.source === "snap" || item.source === "flatpak") {
    score += item.trust === "user" ? 0.12 : 0.04;
    reasons.push(`${item.source} reports the package as installed.`);
  }

  addRuleGuidance(rule, reasons, risks);
  if (reasons.length === 0) reasons.push("Detected in host inventory, but no strong intent signal matched.");

  return finalizeCandidate(item, migrationClass, score, rule, reasons, risks);
}

function finalizeCandidate(
  item: SoftwareItem,
  migrationClass: MigrationClass,
  rawScore: number,
  rule: CatalogDetectionRule | undefined,
  reasons: string[],
  risks: string[]
): MigrationCandidate {
  const confidence = Math.max(0, Math.min(0.99, Number(rawScore.toFixed(2))));
  return {
    id: `${item.source}:${item.name}`,
    name: item.name,
    source: item.source,
    version: item.version,
    migrationClass,
    confidence,
    band: confidence >= 0.75 ? "high" : confidence >= 0.45 ? "medium" : migrationClass === "do-not-migrate" ? "ignore" : "low",
    catalogRuleId: rule?.id,
    catalogRuleName: rule?.displayName,
    reasons,
    risks,
    recommendedActions: recommendedActions(rule, migrationClass)
  };
}

function addRuleGuidance(rule: CatalogDetectionRule | undefined, reasons: string[], risks: string[]): void {
  if (!rule) return;
  if (rule.config?.files?.length || rule.config?.globs?.length) reasons.push("Catalog rule defines concrete config files/globs for governed migration.");
  if (rule.migrate.validate?.length) reasons.push(`Validation available: ${rule.migrate.validate.join("; ")}.`);
  if (rule.migrate.data !== "none") risks.push(`${rule.displayName} has data paths; data migration should be reviewed separately.`);
  if (rule.config?.secretPatterns?.length) risks.push("Config may contain secrets and requires content-level scan/review.");
}

function recommendedActions(rule: CatalogDetectionRule | undefined, migrationClass: MigrationClass): string[] {
  if (!rule) {
    if (migrationClass === "language-global-package") return ["Generate language-specific reinstall command.", "Review version and lockfile compatibility."];
    if (migrationClass === "container-workload") return ["Search for compose files before migrating images.", "Review container inspect data if compose is missing."];
    if (migrationClass === "manual-install") return ["Add to review queue and ask user for config/data paths."];
    return ["Review manually before adding to a migration plan."];
  }
  const actions: string[] = [];
  if (rule.migrate.package) actions.push(`Install package/capability ${rule.displayName}.`);
  if (rule.migrate.config) actions.push("Copy catalog-owned config files with backup and diff.");
  if (rule.migrate.data !== "none") actions.push(`Review ${rule.migrate.data} data directories before copy.`);
  for (const validate of rule.migrate.validate ?? []) actions.push(`Validate with: ${validate}.`);
  for (const service of rule.migrate.restartServices ?? []) actions.push(`Reload/restart service: ${service}.`);
  return actions;
}

function actionsForCandidate(candidate: MigrationCandidate): MigrationPlanAction[] {
  const actions: MigrationPlanAction[] = candidate.recommendedActions.map((label) => ({
    kind: label.startsWith("Validate") ? "validate" : label.startsWith("Reload") ? "restart" : label.startsWith("Copy") ? "copyConfig" : label.startsWith("Install") ? "installPackage" : "review",
    label,
    requiresSudo: candidate.migrationClass !== "language-global-package",
    backup: label.startsWith("Copy")
  }));
  if (actions.length === 0) actions.push({ kind: "review", label: "Review this item before execution." });
  return actions;
}

function isLowValueSystemPackage(name: string): boolean {
  return /^(linux-|lib|firmware|cloud-init|ubuntu-|base-files|systemd|initramfs|grub|tzdata|ca-certificates|gcc-|g\+\+-|python3-minimal)/i.test(name);
}

function sortCandidates(a: MigrationCandidate, b: MigrationCandidate): number {
  return b.confidence - a.confidence || a.name.localeCompare(b.name);
}
