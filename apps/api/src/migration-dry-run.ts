import type { MigrationPlan, MigrationPlanAction, MigrationPlanItem } from "./migration-classifier.js";

export type DryRunStepStatus = "would-run" | "needs-review" | "blocked";

export interface MigrationDryRunStep {
  id: string;
  itemId: string;
  itemName: string;
  actionKind: MigrationPlanAction["kind"];
  label: string;
  status: DryRunStepStatus;
  command?: string;
  reason: string;
  requiresSudo: boolean;
  validationHook?: string;
}

export interface MigrationDryRunResult {
  sourceHost: string;
  generatedAt: string;
  dryRun: true;
  summary: Record<DryRunStepStatus | "total", number>;
  steps: MigrationDryRunStep[];
}

export function buildMigrationDryRun(plan: MigrationPlan): MigrationDryRunResult {
  const steps = plan.items.flatMap((item) => item.actions.map((action, index) => stepForAction(item, action, index)));
  const summary: MigrationDryRunResult["summary"] = { "would-run": 0, "needs-review": 0, blocked: 0, total: steps.length };
  for (const step of steps) summary[step.status]++;
  return {
    sourceHost: plan.sourceHost,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    summary,
    steps
  };
}

function stepForAction(item: MigrationPlanItem, action: MigrationPlanAction, index: number): MigrationDryRunStep {
  const base = {
    id: `${item.id}:step:${index}`,
    itemId: item.id,
    itemName: item.name,
    actionKind: action.kind,
    label: action.label,
    requiresSudo: action.requiresSudo ?? false
  };

  if (action.kind === "installPackage") {
    return {
      ...base,
      status: "would-run",
      command: installCommandForItem(item),
      reason: "Package installation can be generated deterministically from the migration candidate source."
    };
  }
  if (action.kind === "validate") {
    const command = commandAfterColon(action.label);
    return {
      ...base,
      status: command ? "would-run" : "needs-review",
      command,
      validationHook: command,
      reason: command ? "Catalog validation hook is available for post-apply verification." : "Validation label does not include an executable command."
    };
  }
  if (action.kind === "restart") {
    const service = commandAfterColon(action.label);
    return {
      ...base,
      status: service ? "would-run" : "needs-review",
      command: service ? `sudo systemctl reload-or-restart ${shellWord(service)}` : undefined,
      reason: service ? "Service reload/restart is represented as a reviewable systemd command." : "Service name needs review before execution."
    };
  }
  if (action.kind === "copyConfig") {
    return {
      ...base,
      status: "needs-review",
      reason: "Config copy requires reviewed source/target mapping, backup policy, secret scan, and diff approval before apply."
    };
  }
  if (action.kind === "review") {
    return {
      ...base,
      status: "needs-review",
      reason: "This item is intentionally queued for human review instead of automatic execution."
    };
  }
  return {
    ...base,
    status: "blocked",
    reason: "Exporter action is not directly executable by the SSH apply layer."
  };
}

function installCommandForItem(item: MigrationPlanItem): string {
  const [source, rawName] = item.id.includes(":") ? item.id.split(/:(.*)/s).filter(Boolean) : ["apt", item.name];
  const name = shellWord(rawName || item.name);
  if (source === "rpm") return `sudo dnf install -y ${name}`;
  if (source === "snap") return `sudo snap install ${name}`;
  if (source === "npm") return `sudo npm install -g ${name}`;
  if (source === "pip") return `pip3 install --user ${name}`;
  if (source === "gem") return `gem install ${name}`;
  if (source === "cargo") return `cargo install ${name}`;
  return `sudo apt-get install -y ${name}`;
}

function commandAfterColon(label: string): string | undefined {
  const command = label.split(":").slice(1).join(":").replace(/\.$/, "").trim();
  return command || undefined;
}

function shellWord(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:+@/-]/g, "");
}
