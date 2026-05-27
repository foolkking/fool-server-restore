import type { MigrationPlan, MigrationPlanAction, MigrationPlanItem } from "./migration-classifier.js";

export type VerificationCheckKind = "command" | "service" | "manual";
export type VerificationCheckSeverity = "required" | "recommended" | "manual";

export interface MigrationVerificationCheck {
  id: string;
  itemId: string;
  itemName: string;
  kind: VerificationCheckKind;
  severity: VerificationCheckSeverity;
  label: string;
  command?: string;
  expected: string;
  sourceAction: MigrationPlanAction["kind"];
}

export interface MigrationVerificationPreview {
  sourceHost: string;
  generatedAt: string;
  summary: Record<VerificationCheckSeverity | "total", number>;
  checks: MigrationVerificationCheck[];
}

export function buildMigrationVerificationPreview(plan: MigrationPlan): MigrationVerificationPreview {
  const checks = plan.items.flatMap(checksForItem);
  const summary: MigrationVerificationPreview["summary"] = { required: 0, recommended: 0, manual: 0, total: checks.length };
  for (const check of checks) summary[check.severity]++;
  return {
    sourceHost: plan.sourceHost,
    generatedAt: new Date().toISOString(),
    summary,
    checks
  };
}

function checksForItem(item: MigrationPlanItem): MigrationVerificationCheck[] {
  const checks: MigrationVerificationCheck[] = [];
  item.actions.forEach((action, index) => {
    if (action.kind === "validate") checks.push(validateCheck(item, action, index));
    if (action.kind === "restart") checks.push(serviceCheck(item, action, index));
  });
  if (!checks.some((check) => check.kind === "command")) {
    checks.push({
      id: `${item.id}:verify:manual`,
      itemId: item.id,
      itemName: item.name,
      kind: "manual",
      severity: item.type === "managed-software" ? "recommended" : "manual",
      label: `Review ${item.name} after migration.`,
      expected: "User confirms the migrated capability works in the target VM.",
      sourceAction: "review"
    });
  }
  return checks;
}

function validateCheck(item: MigrationPlanItem, action: MigrationPlanAction, index: number): MigrationVerificationCheck {
  const command = commandAfterColon(action.label) ?? action.command;
  return {
    id: `${item.id}:verify:${index}`,
    itemId: item.id,
    itemName: item.name,
    kind: command ? "command" : "manual",
    severity: command ? "required" : "manual",
    label: action.label,
    command,
    expected: command ? "Command exits with code 0." : "User supplies a concrete validation command before apply.",
    sourceAction: action.kind
  };
}

function serviceCheck(item: MigrationPlanItem, action: MigrationPlanAction, index: number): MigrationVerificationCheck {
  const service = commandAfterColon(action.label) ?? action.command;
  const command = service ? `systemctl is-active ${shellWord(service)}` : undefined;
  return {
    id: `${item.id}:verify-service:${index}`,
    itemId: item.id,
    itemName: item.name,
    kind: command ? "service" : "manual",
    severity: command ? "recommended" : "manual",
    label: service ? `Verify service is active: ${service}.` : action.label,
    command,
    expected: command ? "Service reports active after apply." : "User reviews service state manually.",
    sourceAction: action.kind
  };
}

function commandAfterColon(label: string): string | undefined {
  const command = label.split(":").slice(1).join(":").replace(/\.$/, "").trim();
  return command || undefined;
}

function shellWord(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:+@/-]/g, "");
}
