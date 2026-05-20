import { collectSnapshotInputs } from "@fool/collectors";
import { createSnapshotManifest, defaultPolicy } from "@fool/core";
import { createRestorePlan } from "@fool/restorers";
import { readSnapshot, writeSnapshot } from "./snapshot-store.js";

export async function scanCommand(user = "default"): Promise<void> {
  const inputs = await collectSnapshotInputs(defaultPolicy);
  const manifest = createSnapshotManifest({
    user,
    machine: inputs.machine,
    collectors: inputs.collectors,
    redactions: inputs.redactions
  });

  const paths = await writeSnapshot(manifest);
  console.log(`Snapshot written: ${paths.snapshotPath}`);
  console.log(`Latest updated: ${paths.latestPath}`);
}

export async function restoreCommand(snapshotPath: string, apply: boolean): Promise<void> {
  const snapshot = await readSnapshot(snapshotPath);
  const plan = createRestorePlan(snapshot, snapshotPath);

  console.log(JSON.stringify(plan, null, 2));

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply when apply support is implemented and reviewed.");
    return;
  }

  throw new Error("Apply mode is intentionally not implemented yet. The first milestone only creates safe plans.");
}

export async function bootstrapCommand(): Promise<void> {
  console.log("EnvForge bootstrap");
  console.log("1. Run npm install");
  console.log("2. Run npm run build");
  console.log("3. Run npm run scan to create the first local snapshot");
  console.log("4. Start the API/Web after dependencies are installed");
}
