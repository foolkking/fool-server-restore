import { createId, readRuntimeDatabase, updateRuntimeDatabase, type StoredUserProfile } from "./runtime-store.js";

export interface CreateProfileInput {
  kind?: "software" | "combo";
  name?: string;
  nameEn?: string;
  category?: StoredUserProfile["category"];
  summary?: string;
  summaryEn?: string;
  sensitivity?: StoredUserProfile["sensitivity"];
  components?: StoredUserProfile["components"];
  installMode?: StoredUserProfile["installMode"];
  guideMarkdown?: string;
}

export interface UpdateProfileInput {
  name?: string;
  nameEn?: string;
  summary?: string;
  summaryEn?: string;
  sensitivity?: StoredUserProfile["sensitivity"];
  components?: StoredUserProfile["components"];
  installMode?: StoredUserProfile["installMode"];
  guideMarkdown?: string;
}

const validCategories = new Set<StoredUserProfile["category"]>([
  "runtime", "developer", "database", "container", "security", "network", "service"
]);
const validSensitivities = new Set<StoredUserProfile["sensitivity"]>(["safe", "review", "privileged"]);
const validComponentTypes = new Set<StoredUserProfile["components"][number]["type"]>([
  "software", "system-command", "system-config"
]);

export async function createUserProfile(userId: string, input: CreateProfileInput): Promise<StoredUserProfile> {
  const name = normalizeName(input.name);
  const nameEn = (input.nameEn?.trim() || name).slice(0, 100);
  const kind = input.kind === "combo" ? "combo" : "software";
  const category = validCategories.has(input.category as StoredUserProfile["category"])
    ? (input.category as StoredUserProfile["category"])
    : "developer";
  const summary = (input.summary?.trim() || "").slice(0, 300);
  const summaryEn = (input.summaryEn?.trim() || summary).slice(0, 300);
  const sensitivity = validSensitivities.has(input.sensitivity as StoredUserProfile["sensitivity"])
    ? (input.sensitivity as StoredUserProfile["sensitivity"])
    : "safe";
  const components = normalizeComponents(input.components ?? []);
  const installMode = input.installMode === "replace-existing" ? "replace-existing" : "skip-existing";
  const guideMarkdown = input.guideMarkdown?.slice(0, 20000);
  const now = new Date().toISOString();

  const profile: StoredUserProfile = {
    id: createId("prof"),
    userId,
    kind,
    name,
    nameEn,
    category,
    summary,
    summaryEn,
    sensitivity,
    components,
    installMode,
    guideMarkdown,
    createdAt: now,
    updatedAt: now
  };

  await updateRuntimeDatabase((db) => {
    db.userProfiles.unshift(profile);
  });

  return profile;
}

export async function listUserProfiles(userId: string): Promise<StoredUserProfile[]> {
  const db = await readRuntimeDatabase();
  return db.userProfiles.filter((p) => p.userId === userId);
}

export async function getUserProfile(userId: string, profileId: string): Promise<StoredUserProfile | null> {
  const db = await readRuntimeDatabase();
  return db.userProfiles.find((p) => p.id === profileId && p.userId === userId) ?? null;
}

export async function updateUserProfile(
  userId: string,
  profileId: string,
  input: UpdateProfileInput
): Promise<StoredUserProfile | null> {
  return updateRuntimeDatabase((db) => {
    const profile = db.userProfiles.find((p) => p.id === profileId && p.userId === userId);
    if (!profile) return null;

    if (input.name !== undefined) profile.name = normalizeName(input.name);
    if (input.nameEn !== undefined) profile.nameEn = input.nameEn.trim().slice(0, 100) || profile.name;
    if (input.summary !== undefined) profile.summary = input.summary.trim().slice(0, 300);
    if (input.summaryEn !== undefined) profile.summaryEn = input.summaryEn.trim().slice(0, 300);
    if (input.sensitivity && validSensitivities.has(input.sensitivity)) profile.sensitivity = input.sensitivity;
    if (input.components !== undefined) profile.components = normalizeComponents(input.components);
    if (input.installMode !== undefined) profile.installMode = input.installMode === "replace-existing" ? "replace-existing" : "skip-existing";
    if (input.guideMarkdown !== undefined) profile.guideMarkdown = input.guideMarkdown.slice(0, 20000);
    profile.updatedAt = new Date().toISOString();

    return profile;
  });
}

export async function deleteUserProfile(userId: string, profileId: string): Promise<boolean> {
  return updateRuntimeDatabase((db) => {
    const index = db.userProfiles.findIndex((p) => p.id === profileId && p.userId === userId);
    if (index === -1) return false;
    db.userProfiles.splice(index, 1);
    return true;
  });
}

/** 把用户配置组合转换为 catalog 格式，供配置市场展示 */
export async function listAllUserProfilesAsCatalog(): Promise<StoredUserProfile[]> {
  const db = await readRuntimeDatabase();
  return db.userProfiles;
}

function normalizeName(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Profile name is required.");
  if (trimmed.length > 100) throw new Error("Profile name is too long (max 100 characters).");
  return trimmed;
}

function normalizeComponents(
  components: unknown[]
): StoredUserProfile["components"] {
  if (!Array.isArray(components)) return [];
  return components
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      type: validComponentTypes.has(c.type as StoredUserProfile["components"][number]["type"])
        ? (c.type as StoredUserProfile["components"][number]["type"])
        : "software",
      label: String(c.label ?? "").trim().slice(0, 80) || "item",
      labelEn: String(c.labelEn ?? c.label ?? "").trim().slice(0, 80) || "item",
      detail: String(c.detail ?? "").trim().slice(0, 100)
    }))
    .slice(0, 30); // 最多 30 个组件
}
