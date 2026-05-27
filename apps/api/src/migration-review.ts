import type { MigrationCandidate, MigrationCandidateReport, MigrationPlanItem } from "./migration-classifier.js";
import type { StoredMigrationDecision } from "./runtime-store.js";

export interface MigrationReviewQueueItem {
  candidate: MigrationCandidate;
  reason: string;
  decision: MigrationPlanItem["userDecision"];
  note?: string;
}

export function decisionMap(decisions: StoredMigrationDecision[] | undefined): Record<string, MigrationPlanItem["userDecision"]> {
  const result: Record<string, MigrationPlanItem["userDecision"]> = {};
  for (const row of decisions ?? []) result[row.candidateId] = row.decision;
  return result;
}

export function buildUnknownReviewQueue(
  report: MigrationCandidateReport,
  decisions: StoredMigrationDecision[] | undefined
): MigrationReviewQueueItem[] {
  const byCandidate = new Map((decisions ?? []).map((row) => [row.candidateId, row]));
  return report.candidates
    .filter((candidate) => candidate.band !== "ignore")
    .filter((candidate) =>
      candidate.migrationClass === "manual-install" ||
      candidate.migrationClass === "unknown-review" ||
      candidate.migrationClass === "container-workload" ||
      candidate.band === "low"
    )
    .map((candidate) => {
      const saved = byCandidate.get(candidate.id);
      return {
        candidate,
        reason: queueReason(candidate),
        decision: saved?.decision ?? "pending",
        note: saved?.note
      };
    });
}

function queueReason(candidate: MigrationCandidate): string {
  if (candidate.migrationClass === "container-workload") return "Docker image evidence is weak; prefer compose files, systemd services, or user confirmation.";
  if (candidate.migrationClass === "manual-install") return "Manual install location found; EnvForge needs user-confirmed config and data paths.";
  if (candidate.migrationClass === "unknown-review") return "No catalog rule matched strongly enough for automatic migration.";
  return "Low confidence candidate requires user review before it becomes part of the plan.";
}
