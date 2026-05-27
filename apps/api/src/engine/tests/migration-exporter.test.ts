import test from "node:test";
import assert from "node:assert/strict";
import { exportMigrationPlan } from "../../migration-exporter.js";
import type { MigrationPlan } from "../../migration-classifier.js";

const plan: MigrationPlan = {
  sourceHost: "vm-old",
  generatedAt: "2026-05-27T00:00:00.000Z",
  items: [
    {
      id: "apt:nginx",
      name: "nginx",
      type: "managed-software",
      confidence: 0.91,
      userDecision: "pending",
      risks: ["May overwrite existing Nginx configuration"],
      actions: [
        { kind: "installPackage", label: "Install package/capability Nginx." },
        { kind: "copyConfig", label: "Copy catalog-owned config files with backup and diff.", backup: true },
        { kind: "validate", label: "Validate with: nginx -t." }
      ]
    }
  ]
};

test("exports migration plan as markdown", () => {
  const text = exportMigrationPlan(plan, "markdown");
  assert.match(text, /# EnvForge Migration Plan/);
  assert.match(text, /Source host: vm-old/);
  assert.match(text, /nginx/);
  assert.match(text, /nginx -t/);
});

test("exports migration plan as bash review draft", () => {
  const text = exportMigrationPlan(plan, "bash");
  assert.match(text, /set -euo pipefail/);
  assert.match(text, /sudo apt-get install -y Nginx/);
  assert.match(text, /# nginx -t/);
});

test("exports migration plan as ansible review playbook", () => {
  const text = exportMigrationPlan(plan, "ansible");
  assert.match(text, /hosts: all/);
  assert.match(text, /ansible\.builtin\.package/);
  assert.match(text, /ansible\.builtin\.command/);
  assert.match(text, /nginx -t/);
});
