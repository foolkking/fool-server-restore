import fs from "node:fs";
import path from "node:path";

export function findRepoRoot(start = process.cwd()): string {
  let current = start;

  while (true) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: string };
        if (packageJson.name === "envforge") {
          return current;
        }
      } catch {
        // Keep walking upward.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not find repository root.");
    }
    current = parent;
  }
}

export function resolveFromRoot(...segments: string[]): string {
  return path.join(findRepoRoot(), ...segments);
}
