import test from "node:test";
import assert from "node:assert/strict";
import { buildUnknownReviewQueue, decisionMap } from "../../migration-review.js";
import { assessMigrationApplyReadiness } from "../../migration-apply-readiness.js";
import type { MigrationCandidateReport, MigrationPlan } from "../../migration-classifier.js";

test("unknown review queue keeps weak and manual candidates visible", () => {
  const report: MigrationCandidateReport = {
    sourceHost: "vm-old",
    generatedAt: "2026-05-27T00:00:00.000Z",
    summary: { high: 0, medium: 1, low: 1, ignore: 0, total: 2 },
    candidates: [
      {
        id: "opt:frp",
        name: "frp",
        source: "opt",
        version: "directory",
        migrationClass: "manual-install",
        confidence: 0.44,
        band: "low",
        reasons: [],
        risks: [],
        recommendedActions: []
      },
      {
        id: "apt:nginx",
        name: "nginx",
        source: "apt",
        version: "1",
        migrationClass: "managed-software",
        confidence: 0.91,
        band: "high",
        reasons: [],
        risks: [],
        recommendedActions: []
      }
    ]
  };
  const queue = buildUnknownReviewQueue(report, [{ id: "d1", userId: "u1", connectionId: "c1", candidateId: "opt:frp", decision: "skipped", updatedAt: "now" }]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].decision, "skipped");
});

test("apply readiness blocks unapproved and config-copy actions", () => {
  const plan: MigrationPlan = {
    sourceHost: "vm-old",
    generatedAt: "2026-05-27T00:00:00.000Z",
    items: [
      {
        id: "apt:nginx",
        name: "nginx",
        type: "managed-software",
        confidence: 0.9,
        userDecision: "approved",
        risks: [],
        actions: [{ kind: "copyConfig", label: "Copy catalog-owned config files with backup and diff." }]
      },
      {
        id: "npm:eslint",
        name: "eslint",
        type: "language-global-package",
        confidence: 0.5,
        userDecision: "pending",
        risks: [],
        actions: [{ kind: "installPackage", label: "Install package/capability eslint." }]
      }
    ]
  };
  const readiness = assessMigrationApplyReadiness(plan);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockers.length, 2);
  assert.deepEqual(decisionMap([{ id: "d1", userId: "u", connectionId: "c", candidateId: "npm:eslint", decision: "approved", updatedAt: "now" }]), { "npm:eslint": "approved" });
});
