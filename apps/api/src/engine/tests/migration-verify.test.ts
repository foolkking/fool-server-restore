import test from "node:test";
import assert from "node:assert/strict";
import { buildMigrationVerificationPreview } from "../../migration-verify.js";
import type { MigrationPlan } from "../../migration-classifier.js";

test("migration verification preview extracts command and service checks", () => {
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
          { kind: "validate", label: "Validate with: nginx -t." },
          { kind: "restart", label: "Reload/restart service: nginx." }
        ]
      },
      {
        id: "opt:frp",
        name: "frp",
        type: "manual-install",
        confidence: 0.44,
        userDecision: "pending",
        risks: [],
        actions: [{ kind: "review", label: "Review this item before execution." }]
      }
    ]
  };

  const preview = buildMigrationVerificationPreview(plan);
  assert.equal(preview.summary.total, 3);
  assert.equal(preview.summary.required, 1);
  assert.equal(preview.summary.recommended, 1);
  assert.equal(preview.summary.manual, 1);
  assert.equal(preview.checks[0].command, "nginx -t");
  assert.equal(preview.checks[1].command, "systemctl is-active nginx");
  assert.equal(preview.checks[2].kind, "manual");
});
