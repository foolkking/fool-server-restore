import test from "node:test";
import assert from "node:assert/strict";
import { buildMigrationDryRun } from "../../migration-dry-run.js";
import type { MigrationPlan } from "../../migration-classifier.js";

test("migration dry-run converts plan actions into non-mutating execution preview", () => {
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
        risks: [],
        actions: [
          { kind: "installPackage", label: "Install package/capability Nginx.", requiresSudo: true },
          { kind: "copyConfig", label: "Copy catalog-owned config files with backup and diff.", backup: true },
          { kind: "validate", label: "Validate with: nginx -t." },
          { kind: "restart", label: "Reload/restart service: nginx." }
        ]
      }
    ]
  };

  const result = buildMigrationDryRun(plan);
  assert.equal(result.dryRun, true);
  assert.equal(result.summary.total, 4);
  assert.equal(result.summary["would-run"], 3);
  assert.equal(result.summary["needs-review"], 1);
  assert.equal(result.steps[0].command, "sudo apt-get install -y nginx");
  assert.equal(result.steps[1].status, "needs-review");
  assert.equal(result.steps[2].validationHook, "nginx -t");
  assert.equal(result.steps[3].command, "sudo systemctl reload-or-restart nginx");
});

test("migration dry-run maps language package installers conservatively", () => {
  const plan: MigrationPlan = {
    sourceHost: "vm-old",
    generatedAt: "2026-05-27T00:00:00.000Z",
    items: [
      {
        id: "npm:eslint",
        name: "eslint",
        type: "language-global-package",
        confidence: 0.55,
        userDecision: "pending",
        risks: [],
        actions: [{ kind: "installPackage", label: "Install package/capability eslint.", requiresSudo: false }]
      }
    ]
  };

  const result = buildMigrationDryRun(plan);
  assert.equal(result.steps[0].command, "sudo npm install -g eslint");
});
