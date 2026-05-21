/**
 * drift.ts — Detect software drift on a VM since the last baseline
 *
 * Workflow:
 *   1. User clicks "set baseline" on a connection → snapshot current software set
 *   2. A scheduled job (or manual click) calls `runDriftCheck(connectionId)`
 *   3. Diff against the baseline; emit added/removed software
 *   4. If non-empty diff: fire `drift.detected` webhook
 *
 * The baseline is opaque to keep storage small: we only persist a list of
 * `<source>::<name>` keys (no version numbers — version drift is OK and very noisy).
 */

import { connectSshForConnection } from "./ssh-pool.js";
import { collectRemoteSnapshot } from "./collectors/remote-collector.js";
import { readRuntimeDatabase, updateRuntimeDatabase, createId, type StoredConnection, type StoredDriftBaseline } from "./runtime-store.js";
import { fireWebhooks } from "./webhooks.js";

export interface DriftReport {
  baselineCapturedAt: string;
  checkedAt: string;
  addedSoftware: Array<{ name: string; version: string; source: string }>;
  removedSoftware: Array<{ name: string; version: string; source: string }>;
  /** True if either added or removed is non-empty */
  hasDrift: boolean;
}

function softwareKey(s: { name: string; source: string }): string {
  return `${s.source}::${s.name}`;
}

/** Capture a fresh baseline for a connection. Overwrites any existing baseline. */
export async function setBaseline(userId: string, conn: StoredConnection): Promise<StoredDriftBaseline> {
  const client = await connectSshForConnection(conn, userId);
  try {
    const snap = await collectRemoteSnapshot(client, conn.fields.host ?? "");
    const keys = (snap.software ?? []).map(softwareKey);
    const baseline: StoredDriftBaseline = {
      id: createId("baseline"),
      userId,
      connectionId: conn.id,
      capturedAt: new Date().toISOString(),
      softwareKeys: keys
    };
    await updateRuntimeDatabase((db) => {
      if (!db.driftBaselines) db.driftBaselines = [];
      // Replace any existing baseline for this connection
      db.driftBaselines = db.driftBaselines.filter((b) => b.connectionId !== conn.id);
      db.driftBaselines.push(baseline);
    });
    return baseline;
  } finally {
    client.end();
  }
}

/** Run a drift check against the latest baseline; fires webhook if drift detected. */
export async function runDriftCheck(userId: string, conn: StoredConnection): Promise<DriftReport | null> {
  const db = await readRuntimeDatabase();
  const baseline = (db.driftBaselines ?? []).find((b) => b.connectionId === conn.id && b.userId === userId);
  if (!baseline) return null;

  const client = await connectSshForConnection(conn, userId);
  let added: DriftReport["addedSoftware"] = [];
  let removed: DriftReport["removedSoftware"] = [];
  try {
    const snap = await collectRemoteSnapshot(client, conn.fields.host ?? "");
    const currentSoftware = snap.software ?? [];
    const baseKeys = new Set(baseline.softwareKeys);
    const currentKeys = new Set(currentSoftware.map(softwareKey));
    added = currentSoftware.filter((s) => !baseKeys.has(softwareKey(s)));
    // For "removed", we need to reconstruct the metadata. We only have keys, so we
    // can list the keys but not versions — fine for drift purposes.
    removed = baseline.softwareKeys
      .filter((k) => !currentKeys.has(k))
      .map((k) => {
        const [source, name] = k.split("::");
        return { name, version: "", source };
      });
  } finally {
    client.end();
  }

  const report: DriftReport = {
    baselineCapturedAt: baseline.capturedAt,
    checkedAt: new Date().toISOString(),
    addedSoftware: added,
    removedSoftware: removed,
    hasDrift: added.length > 0 || removed.length > 0
  };

  // Persist last report to the baseline
  await updateRuntimeDatabase((dbu) => {
    const target = (dbu.driftBaselines ?? []).find((b) => b.id === baseline.id);
    if (target) {
      target.lastReport = {
        checkedAt: report.checkedAt,
        addedSoftware: report.addedSoftware,
        removedSoftware: report.removedSoftware
      };
    }
  });

  // Fire webhook on drift
  if (report.hasDrift) {
    await fireWebhooks(userId, "drift.detected", {
      connectionId: conn.id,
      connectionLabel: conn.label,
      added: report.addedSoftware,
      removed: report.removedSoftware,
      baselineCapturedAt: report.baselineCapturedAt,
      checkedAt: report.checkedAt
    });
  }

  return report;
}
