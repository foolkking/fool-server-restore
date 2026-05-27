import type { MigrationPlan, MigrationPlanAction } from "./migration-classifier.js";

export type MigrationExportFormat = "json" | "markdown" | "bash" | "ansible";

export function exportMigrationPlan(plan: MigrationPlan, format: MigrationExportFormat): string {
  if (format === "json") return JSON.stringify(plan, null, 2);
  if (format === "bash") return exportBash(plan);
  if (format === "ansible") return exportAnsible(plan);
  return exportMarkdown(plan);
}

function exportMarkdown(plan: MigrationPlan): string {
  const lines = [
    `# EnvForge Migration Plan`,
    "",
    `- Source host: ${plan.sourceHost}`,
    `- Generated at: ${plan.generatedAt}`,
    `- Items: ${plan.items.length}`,
    ""
  ];
  for (const item of plan.items) {
    lines.push(`## ${item.name}`);
    lines.push("");
    lines.push(`- Type: ${item.type}`);
    lines.push(`- Confidence: ${(item.confidence * 100).toFixed(0)}%`);
    lines.push(`- Decision: ${item.userDecision}`);
    if (item.risks.length) {
      lines.push(`- Risks:`);
      for (const risk of item.risks) lines.push(`  - ${risk}`);
    }
    lines.push("");
    lines.push(`Actions:`);
    item.actions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action.label}`);
      if (action.command) lines.push(`   \`${action.command}\``);
    });
    lines.push("");
  }
  return lines.join("\n");
}

function exportBash(plan: MigrationPlan): string {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `# EnvForge migration plan for ${shellComment(plan.sourceHost)}`,
    `# Generated at ${shellComment(plan.generatedAt)}`,
    "# Review every command before running. Destructive actions are intentionally not emitted.",
    ""
  ];
  for (const item of plan.items) {
    lines.push("");
    lines.push(`# --- ${shellComment(item.name)} (${item.type}, confidence ${(item.confidence * 100).toFixed(0)}%) ---`);
    for (const action of item.actions) lines.push(...bashLinesForAction(action));
    if (item.risks.length) {
      lines.push("# Risks:");
      for (const risk of item.risks) lines.push(`# - ${shellComment(risk)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function exportAnsible(plan: MigrationPlan): string {
  const lines = [
    "---",
    "- name: EnvForge migration plan",
    "  hosts: all",
    "  become: true",
    "  vars:",
    `    envforge_source_host: ${yamlString(plan.sourceHost)}`,
    `    envforge_generated_at: ${yamlString(plan.generatedAt)}`,
    "  tasks:"
  ];
  if (plan.items.length === 0) {
    lines.push("    - name: No migration items selected");
    lines.push("      ansible.builtin.debug:");
    lines.push("        msg: No migration items selected");
    return `${lines.join("\n")}\n`;
  }
  for (const item of plan.items) {
    lines.push(`    - name: Review ${yamlString(item.name)} migration intent`);
    lines.push("      ansible.builtin.debug:");
    lines.push(`        msg: ${yamlString(`${item.name} (${item.type}) confidence ${Math.round(item.confidence * 100)}%, decision ${item.userDecision}`)}`);
    for (const action of item.actions) lines.push(...ansibleLinesForAction(action));
  }
  return `${lines.join("\n")}\n`;
}

function ansibleLinesForAction(action: MigrationPlanAction): string[] {
  if (action.kind === "installPackage") {
    const name = action.label.replace(/^Install package\/capability\s+/i, "").replace(/\.$/, "");
    return [
      `    - name: ${yamlString(action.label)}`,
      "      ansible.builtin.package:",
      `        name: ${yamlString(shellWord(name))}`,
      "        state: present"
    ];
  }
  if (action.kind === "validate") {
    const command = action.label.split(":").slice(1).join(":").replace(/\.$/, "").trim();
    return [
      `    - name: ${yamlString(action.label)}`,
      "      ansible.builtin.command:",
      `        cmd: ${yamlString(command || "true")}`,
      "      changed_when: false"
    ];
  }
  if (action.kind === "restart") {
    const service = action.label.split(":").slice(1).join(":").replace(/\.$/, "").trim();
    return [
      `    - name: ${yamlString(action.label)}`,
      "      ansible.builtin.service:",
      `        name: ${yamlString(shellWord(service))}`,
      "        state: restarted",
      "      when: envforge_allow_service_restart | default(false)"
    ];
  }
  if (action.kind === "copyConfig") {
    return [
      `    - name: ${yamlString(action.label)}`,
      "      ansible.builtin.debug:",
      "        msg: Review EnvForge config diff/secret scan before enabling file copy"
    ];
  }
  return [
    `    - name: ${yamlString(action.label)}`,
    "      ansible.builtin.debug:",
    `        msg: ${yamlString(action.label)}`
  ];
}

function bashLinesForAction(action: MigrationPlanAction): string[] {
  if (action.command) return [`echo ${quote(action.label)}`, action.command];
  if (action.kind === "installPackage") {
    const name = action.label.replace(/^Install package\/capability\s+/i, "").replace(/\.$/, "");
    return [
      `echo ${quote(action.label)}`,
      `# sudo apt-get install -y ${shellWord(name)}`
    ];
  }
  if (action.kind === "copyConfig") {
    return [
      `echo ${quote(action.label)}`,
      "# copy operations require source/target mapping from the reviewed EnvForge plan"
    ];
  }
  if (action.kind === "validate" || action.kind === "restart") {
    const command = action.label.split(":").slice(1).join(":").replace(/\.$/, "").trim();
    return command ? [`echo ${quote(action.label)}`, `# ${command}`] : [`echo ${quote(action.label)}`];
  }
  return [`echo ${quote(action.label)}`];
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function shellWord(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:+-]/g, "");
}

function shellComment(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\*/g, "");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
