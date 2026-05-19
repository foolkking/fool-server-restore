import type { DiffItem, SnapshotManifest } from "./types.js";

export function diffSnapshots(current: SnapshotManifest, target: SnapshotManifest): DiffItem[] {
  const items: DiffItem[] = [];
  const collectorIds = new Set([
    ...Object.keys(current.collectors),
    ...Object.keys(target.collectors)
  ]);

  for (const collectorId of collectorIds) {
    const currentCollector = current.collectors[collectorId];
    const targetCollector = target.collectors[collectorId];

    if (!currentCollector && targetCollector) {
      items.push(createItem("missing", `collectors.${collectorId}`, "Collector is missing locally."));
      continue;
    }

    if (currentCollector && !targetCollector) {
      items.push(createItem("extra", `collectors.${collectorId}`, "Collector exists only locally."));
      continue;
    }

    if (JSON.stringify(currentCollector?.data) !== JSON.stringify(targetCollector?.data)) {
      items.push(createItem("changed", `collectors.${collectorId}`, "Collector data differs."));
    }
  }

  return items;
}

function createItem(kind: DiffItem["kind"], path: string, summary: string): DiffItem {
  return {
    kind,
    path,
    summary,
    risk: kind === "changed" ? "medium" : "low",
    requiresPrivilege: false,
    canAutoRestore: kind !== "extra",
    overwritesExisting: kind === "changed"
  };
}
