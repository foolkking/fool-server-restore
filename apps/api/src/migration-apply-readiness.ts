import type { MigrationPlan, MigrationPlanItem } from "./migration-classifier.js";

export interface MigrationApplyReadiness {
  ready: boolean;
  generatedAt: string;
  blockers: string[];
  warnings: string[];
  items: Array<{
    id: string;
    name: string;
    ready: boolean;
    blockers: string[];
    warnings: string[];
  }>;
}

export function assessMigrationApplyReadiness(plan: MigrationPlan): MigrationApplyReadiness {
  const items = plan.items.map(assessItem);
  const blockers = items.flatMap((item) => item.blockers.map((blocker) => `${item.name}: ${blocker}`));
  const warnings = items.flatMap((item) => item.warnings.map((warning) => `${item.name}: ${warning}`));
  return {
    ready: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    blockers,
    warnings,
    items
  };
}

function assessItem(item: MigrationPlanItem): MigrationApplyReadiness["items"][number] {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (item.userDecision !== "approved") blockers.push("User has not approved this candidate.");
  if (item.type === "manual-install" || item.type === "unknown-review") blockers.push("Unknown/manual install requires reviewed source, config, and data paths.");
  if (item.actions.some((action) => action.kind === "copyConfig")) blockers.push("Config copy requires diff approval, secret scan review, target backup, and rollback checkpoint.");
  if (item.actions.some((action) => action.kind === "restart")) warnings.push("Service restart/reload must be explicitly enabled at apply time.");
  if (item.risks.length) warnings.push(...item.risks);
  return { id: item.id, name: item.name, ready: blockers.length === 0, blockers, warnings };
}
