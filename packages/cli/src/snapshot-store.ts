import fs from "node:fs/promises";
import path from "node:path";
import type { SnapshotManifest } from "@fool/core";
import { getMachineSnapshotPath } from "@fool/core";
import { resolveFromRoot } from "./paths.js";

export async function writeSnapshot(manifest: SnapshotManifest): Promise<{
  snapshotPath: string;
  latestPath: string;
}> {
  const relativeSnapshotPath = getMachineSnapshotPath(manifest);
  const snapshotPath = resolveFromRoot(relativeSnapshotPath);
  const latestPath = path.join(path.dirname(snapshotPath), "latest.json");

  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(snapshotPath, content, "utf8");
  await fs.writeFile(latestPath, content, "utf8");

  return {
    snapshotPath,
    latestPath
  };
}

export async function readSnapshot(relativePath: string): Promise<SnapshotManifest> {
  const content = await fs.readFile(resolveFromRoot(relativePath), "utf8");
  return JSON.parse(content) as SnapshotManifest;
}
