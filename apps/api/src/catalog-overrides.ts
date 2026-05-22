/**
 * catalog-overrides.ts — admin-managed overlay on top of the static catalog
 *
 * Responsibilities:
 *   - Merge baseline CatalogItem[] with runtime-db overrides (modify / hide / new)
 *   - Persist Playbook YAML overrides under data/catalog-overrides/playbooks/<id>.yaml
 *   - Persist Markdown guide overrides under data/catalog-overrides/guides/<id>.md
 *
 * The static catalog (apps/api/src/catalog.ts + configs/catalog/playbooks/*.yaml)
 * stays read-only. All admin edits live under data/ so they survive across releases
 * and can be backed up independently.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { CatalogItem } from "./catalog.js";
import { getConfig } from "./config.js";
import { resolveFromRoot } from "./repo.js";
import type { CatalogOverride } from "./runtime-store.js";

/** Allowed id pattern — strict to prevent path-traversal in filenames */
export const CATALOG_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,59}$/;

export function isValidCatalogId(id: string): boolean {
  return CATALOG_ID_REGEX.test(id);
}

function overrideRoot(): string {
  return path.join(getConfig().dataDir, "catalog-overrides");
}

function playbookOverridePath(id: string): string {
  return path.join(overrideRoot(), "playbooks", `${id}.yaml`);
}

function guideOverridePath(id: string): string {
  return path.join(overrideRoot(), "guides", `${id}.md`);
}

/** Apply field-level overrides on top of a baseline item */
function applyOverrides(base: CatalogItem, ov: CatalogOverride): CatalogItem {
  if (!ov.overrides) return base;
  return { ...base, ...ov.overrides } as CatalogItem;
}

/** Build a new CatalogItem from override.overrides for user-added items */
function buildNewItem(ov: CatalogOverride): CatalogItem | null {
  if (!ov.overrides) return null;
  // Sane defaults for fields not provided
  const item: CatalogItem = {
    id: ov.id,
    kind: ov.overrides.kind ?? "software",
    name: ov.overrides.name ?? ov.id,
    nameEn: ov.overrides.nameEn ?? ov.id,
    category: ov.overrides.category ?? "service",
    summary: ov.overrides.summary ?? "",
    summaryEn: ov.overrides.summaryEn ?? "",
    rating: ov.overrides.rating ?? 0,
    installs: ov.overrides.installs ?? "0",
    imageTone: ov.overrides.imageTone ?? "slate",
    sensitivity: ov.overrides.sensitivity ?? "safe",
    assets: ov.overrides.assets ?? [],
    guidePath: `data/catalog-overrides/guides/${ov.id}.md`,
    guideAuthor: "admin",
    installMode: "skip-existing",
    components: ov.overrides.components ?? [],
    deployModes: ov.overrides.deployModes ?? ["system"]
  };
  return item;
}

/**
 * Merge baseline catalog with admin overrides.
 *
 * Resolution rules:
 *   - For every baseline item: if there's an override with baseId === item.id:
 *     - if hidden=true → skip it
 *     - else apply field overrides
 *   - For every override with baseId undefined: it's a brand-new item, append
 *   - Overrides whose baseId points at a non-existent baseline are ignored
 */
export function mergeCatalog(baseline: CatalogItem[], overrides: CatalogOverride[] | undefined): CatalogItem[] {
  if (!overrides || overrides.length === 0) return baseline;
  const byBaseId = new Map<string, CatalogOverride>();
  const newItems: CatalogOverride[] = [];
  for (const ov of overrides) {
    if (ov.baseId) byBaseId.set(ov.baseId, ov);
    else newItems.push(ov);
  }

  const merged: CatalogItem[] = [];
  for (const base of baseline) {
    const ov = byBaseId.get(base.id);
    if (!ov) { merged.push(base); continue; }
    if (ov.hidden) continue; // hidden by admin
    merged.push(applyOverrides(base, ov));
  }
  // Append user-added items
  for (const ov of newItems) {
    const item = buildNewItem(ov);
    if (item) merged.push(item);
  }
  return merged;
}

/** Read a Playbook YAML override; returns null if no override exists. */
export async function loadOverrideYaml(id: string): Promise<string | null> {
  if (!isValidCatalogId(id)) return null;
  try {
    return await fs.readFile(playbookOverridePath(id), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write a Playbook YAML override (creates dir as needed). */
export async function saveOverrideYaml(id: string, yamlText: string): Promise<void> {
  if (!isValidCatalogId(id)) throw new Error(`Invalid catalog id: ${id}`);
  const dest = playbookOverridePath(id);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, yamlText, "utf8");
}

/** Delete a Playbook YAML override (silent if missing). */
export async function deleteOverrideYaml(id: string): Promise<void> {
  if (!isValidCatalogId(id)) return;
  try {
    await fs.unlink(playbookOverridePath(id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Read a Markdown guide override; returns null if missing. */
export async function loadOverrideMarkdown(id: string): Promise<string | null> {
  if (!isValidCatalogId(id)) return null;
  try {
    return await fs.readFile(guideOverridePath(id), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write a Markdown guide override. */
export async function saveOverrideMarkdown(id: string, md: string): Promise<void> {
  if (!isValidCatalogId(id)) throw new Error(`Invalid catalog id: ${id}`);
  const dest = guideOverridePath(id);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, md, "utf8");
}

/** Delete a Markdown guide override. */
export async function deleteOverrideMarkdown(id: string): Promise<void> {
  if (!isValidCatalogId(id)) return;
  try {
    await fs.unlink(guideOverridePath(id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Resolve playbook YAML for a given catalog id, with override taking precedence. */
export async function resolvePlaybookYaml(id: string): Promise<string> {
  const override = await loadOverrideYaml(id);
  if (override !== null) return override;
  // Fall back to baseline
  const filePath = resolveFromRoot(path.join("configs/catalog/playbooks", `${id}.yaml`));
  return await fs.readFile(filePath, "utf8");
}

/** True if either override or baseline has a Playbook YAML for this id. */
export async function hasResolvedPlaybook(id: string): Promise<boolean> {
  if (!isValidCatalogId(id)) return false;
  if ((await loadOverrideYaml(id)) !== null) return true;
  try {
    await fs.access(resolveFromRoot(path.join("configs/catalog/playbooks", `${id}.yaml`)));
    return true;
  } catch {
    return false;
  }
}

/** Build a status map for the UI: id → "baseline" | "modified" | "added" | "hidden" */
export function annotateOverrides(
  baseline: CatalogItem[],
  overrides: CatalogOverride[] | undefined
): Map<string, "baseline" | "modified" | "added" | "hidden"> {
  const status = new Map<string, "baseline" | "modified" | "added" | "hidden">();
  const baseIds = new Set(baseline.map((i) => i.id));
  for (const item of baseline) status.set(item.id, "baseline");
  if (overrides) {
    for (const ov of overrides) {
      if (ov.baseId && baseIds.has(ov.baseId)) {
        status.set(ov.baseId, ov.hidden ? "hidden" : "modified");
      } else if (!ov.baseId) {
        status.set(ov.id, "added");
      }
    }
  }
  return status;
}
