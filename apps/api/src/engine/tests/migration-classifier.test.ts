import test from "node:test";
import assert from "node:assert/strict";
import { buildMigrationCandidateReport, buildMigrationPlanFromCandidates } from "../../migration-classifier.js";
import type { FullSystemSnapshot } from "../../collectors/remote-collector.js";

function snapshot(software: FullSystemSnapshot["software"]): FullSystemSnapshot {
  return {
    agentId: "agent-test",
    collectedAt: "2026-05-27T00:00:00.000Z",
    system: {
      hostname: "vm-old",
      platform: "linux",
      arch: "x64",
      release: "6.8",
      uptime: 0,
      cpu: { model: "test", cores: 2, speedMhz: 0 },
      memory: { totalBytes: 1, freeBytes: 1, usedBytes: 0, totalGb: "0", freeGb: "0" }
    },
    software,
    configChecklist: [],
    counts: {
      apt: 0,
      rpm: 0,
      snap: 0,
      flatpak: 0,
      npm: 0,
      pip: 0,
      gem: 0,
      cargo: 0,
      localBin: 0,
      opt: 0,
      userBin: 0,
      nvm: 0,
      pyenv: 0,
      docker: 0,
      enabledServices: 0,
      runningServices: 0,
      total: software.length
    }
  };
}

test("Package Intent Score separates user intent from installed package noise", () => {
  const report = buildMigrationCandidateReport(snapshot([
    { name: "nginx", version: "1.24", source: "apt", status: "installed", trust: "user" },
    { name: "linux-image-generic", version: "6.8", source: "apt", status: "installed", trust: "uncertain" },
    { name: "eslint", version: "global", source: "npm", status: "installed", trust: "user" },
    { name: "redis", version: "service", source: "systemd", status: "installed", trust: "user" },
    { name: "library/ubuntu", version: "latest", source: "docker", status: "installed", trust: "user" },
    { name: "frp", version: "directory", source: "opt", status: "installed", trust: "user" }
  ]));

  const byName = new Map(report.candidates.map((candidate) => [candidate.name, candidate]));
  assert.equal(byName.get("nginx")?.migrationClass, "managed-software");
  assert.equal(byName.get("nginx")?.band, "high");
  assert.equal(byName.get("linux-image-generic")?.migrationClass, "do-not-migrate");
  assert.equal(byName.get("linux-image-generic")?.band, "ignore");
  assert.equal(byName.get("eslint")?.migrationClass, "language-global-package");
  assert.equal(byName.get("library/ubuntu")?.migrationClass, "container-workload");
  assert.equal(byName.get("frp")?.migrationClass, "manual-install");
  assert.ok((byName.get("redis")?.recommendedActions ?? []).some((action) => action.includes("Validate")));
});

test("migration plan excludes ignored baseline packages and keeps reviewable actions", () => {
  const report = buildMigrationCandidateReport(snapshot([
    { name: "docker.io", version: "24", source: "apt", status: "installed", trust: "user" },
    { name: "cloud-init", version: "23", source: "apt", status: "installed", trust: "uncertain" }
  ]));
  const plan = buildMigrationPlanFromCandidates(report);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].name, "docker.io");
  assert.ok(plan.items[0].actions.some((action) => action.kind === "copyConfig" || action.kind === "installPackage"));
});
