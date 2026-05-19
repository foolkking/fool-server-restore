import fs from "node:fs/promises";
import path from "node:path";
import type { SnapshotManifest } from "@fool/core";
import { getMachineSnapshotPath } from "@fool/core";
import { getConfig } from "./config.js";
import { resolveFromRoot } from "./repo.js";

export interface SnapshotSummary {
  user: string;
  machineId: string;
  createdAt: string;
  path: string;
  isLatest: boolean;
}

export async function persistSnapshot(manifest: SnapshotManifest): Promise<{
  snapshotPath: string;
  latestPath: string;
}> {
  const relativeSnapshotPath = getMachineSnapshotPath(manifest);
  const snapshotPath = resolveSnapshotPath(relativeSnapshotPath);
  const latestPath = path.join(path.dirname(snapshotPath), "latest.json");
  const content = `${JSON.stringify(manifest, null, 2)}\n`;

  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, content, "utf8");
  await fs.writeFile(latestPath, content, "utf8");

  return {
    snapshotPath: relativeSnapshotPath.replace(/\\/g, "/"),
    latestPath: displaySnapshotPath(latestPath)
  };
}

export async function listSnapshots(): Promise<SnapshotSummary[]> {
  const root = path.join(getConfig().snapshotDir, "users");
  const summaries: SnapshotSummary[] = [];

  try {
    await collectSnapshotSummaries(root, summaries);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function collectSnapshotSummaries(directory: string, summaries: SnapshotSummary[]): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSnapshotSummaries(fullPath, summaries);
      continue;
    }

    if (!entry.name.endsWith(".json")) continue;

    const content = await fs.readFile(fullPath, "utf8");
    const manifest = JSON.parse(content) as SnapshotManifest;
    summaries.push({
      user: manifest.user,
      machineId: manifest.machine.id,
      createdAt: manifest.createdAt,
      path: displaySnapshotPath(fullPath),
      isLatest: entry.name === "latest.json"
    });
  }
}

function resolveSnapshotPath(relativeSnapshotPath: string): string {
  const normalized = relativeSnapshotPath.replace(/\\/g, "/");
  const suffix = normalized.replace(/^configs\/snapshots\/?/, "");
  return path.join(getConfig().snapshotDir, suffix);
}

function displaySnapshotPath(absolutePath: string): string {
  const relativeToData = path.relative(getConfig().dataDir, absolutePath).replace(/\\/g, "/");
  if (!relativeToData.startsWith("..")) return `data/${relativeToData}`;
  return path.relative(resolveFromRoot(), absolutePath).replace(/\\/g, "/");
}
