import path from "node:path";
import { fileURLToPath } from "node:url";

export function findRepoRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../..");
}

export function resolveFromRoot(...segments: string[]): string {
  return path.join(findRepoRoot(), ...segments);
}
