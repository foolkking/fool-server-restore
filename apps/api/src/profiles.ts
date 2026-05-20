import { createId, readRuntimeDatabase, updateRuntimeDatabase, type StoredUserProfile, type StoredProbeSnapshot } from "./runtime-store.js";
import { canUploadKind, canViewProfile } from "./rbac.js";
import type { StoredUser } from "./runtime-store.js";

export interface CreateProfileInput {
  kind?: "software" | "combo" | "vm-snapshot";
  visibility?: "public" | "private";
  name?: string;
  nameEn?: string;
  category?: StoredUserProfile["category"];
  summary?: string;
  summaryEn?: string;
  sensitivity?: StoredUserProfile["sensitivity"];
  components?: StoredUserProfile["components"];
  installMode?: StoredUserProfile["installMode"];
  guideMarkdown?: string;
  sourceConnectionId?: string;
  envSnapshot?: StoredUserProfile["envSnapshot"];
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
  envSnapshot?: StoredUserProfile["envSnapshot"];
}

const validCategories = new Set<StoredUserProfile["category"]>([
  "runtime", "developer", "database", "container", "security", "network", "service"
]);
const validSensitivities = new Set<StoredUserProfile["sensitivity"]>(["safe", "review", "privileged"]);
const validComponentTypes = new Set<StoredUserProfile["components"][number]["type"]>([
  "software", "system-command", "system-config"
]);

export async function createUserProfile(user: StoredUser, input: CreateProfileInput): Promise<StoredUserProfile> {
  const kind = normalizeKind(input.kind);

  // 权限校验
  if (!canUploadKind(user, kind)) {
    throw new Error(`Your role does not allow uploading profiles of kind "${kind}".`);
  }

  // vm-snapshot 强制 private，combo/software 强制 public
  const visibility: StoredUserProfile["visibility"] =
    kind === "vm-snapshot" ? "private" : "public";

  const name = normalizeName(input.name);
  const nameEn = (input.nameEn?.trim() || name).slice(0, 100);
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
    userId: user.id,
    kind,
    visibility,
    name,
    nameEn,
    category,
    summary,
    summaryEn,
    sensitivity,
    components,
    installMode,
    guideMarkdown,
    sourceConnectionId: input.sourceConnectionId,
    envSnapshot: kind === "vm-snapshot" ? input.envSnapshot : undefined,
    createdAt: now,
    updatedAt: now
  };

  await updateRuntimeDatabase((db) => {
    db.userProfiles.unshift(profile);
  });

  return profile;
}

/** 从已连接机器的 probeSnapshot 快速生成私有运行环境快照 */
export async function createVmSnapshot(
  user: StoredUser,
  connectionId: string,
  input: {
    name?: string;
    userNotes?: string;
    envVars?: Record<string, string>;
    configFiles?: Array<{ path: string; content: string }>;
  }
): Promise<StoredUserProfile> {
  const db = await readRuntimeDatabase();
  const conn = db.connections.find((c) => c.id === connectionId && c.userId === user.id);
  if (!conn) throw new Error("Connection not found.");
  if (!conn.probeSnapshot) throw new Error("No probe data available for this connection. Please connect first.");

  const snap = conn.probeSnapshot;
  const hostname = snap.system.hostname;
  const now = new Date().toISOString();

  const envSnapshot: StoredUserProfile["envSnapshot"] = {
    ...snap,
    envVars: input.envVars,
    configFiles: input.configFiles,
    userNotes: input.userNotes
  };

  const profile: StoredUserProfile = {
    id: createId("prof"),
    userId: user.id,
    kind: "vm-snapshot",
    visibility: "private",
    name: input.name?.trim() || `${hostname} 运行环境`,
    nameEn: input.name?.trim() || `${hostname} environment`,
    category: "runtime",
    summary: `${hostname} 的完整运行环境快照，采集于 ${snap.collectedAt.slice(0, 10)}`,
    summaryEn: `Full environment snapshot of ${hostname}, collected on ${snap.collectedAt.slice(0, 10)}`,
    sensitivity: "privileged",
    components: snap.software.map((s) => ({
      type: "software" as const,
      label: `${s.name} ${s.version}`,
      labelEn: `${s.name} ${s.version}`,
      detail: s.source
    })),
    installMode: "skip-existing",
    sourceConnectionId: connectionId,
    envSnapshot,
    createdAt: now,
    updatedAt: now
  };

  await updateRuntimeDatabase((db2) => {
    db2.userProfiles.unshift(profile);
  });

  return profile;
}

export async function listUserProfiles(requestingUser: StoredUser): Promise<StoredUserProfile[]> {
  const db = await readRuntimeDatabase();
  return db.userProfiles.filter((p) => canViewProfile(requestingUser, p));
}

export async function listPublicProfiles(): Promise<StoredUserProfile[]> {
  const db = await readRuntimeDatabase();
  return db.userProfiles.filter((p) => p.visibility === "public");
}

export async function getUserProfile(user: StoredUser, profileId: string): Promise<StoredUserProfile | null> {
  const db = await readRuntimeDatabase();
  const profile = db.userProfiles.find((p) => p.id === profileId);
  if (!profile || !canViewProfile(user, profile)) return null;
  return profile;
}

export async function updateUserProfile(
  user: StoredUser,
  profileId: string,
  input: UpdateProfileInput
): Promise<StoredUserProfile | null> {
  return updateRuntimeDatabase((db) => {
    const profile = db.userProfiles.find((p) => p.id === profileId && p.userId === user.id);
    if (!profile) return null;

    if (input.name !== undefined) profile.name = normalizeName(input.name);
    if (input.nameEn !== undefined) profile.nameEn = input.nameEn.trim().slice(0, 100) || profile.name;
    if (input.summary !== undefined) profile.summary = input.summary.trim().slice(0, 300);
    if (input.summaryEn !== undefined) profile.summaryEn = input.summaryEn.trim().slice(0, 300);
    if (input.sensitivity && validSensitivities.has(input.sensitivity)) profile.sensitivity = input.sensitivity;
    if (input.components !== undefined) profile.components = normalizeComponents(input.components);
    if (input.installMode !== undefined) profile.installMode = input.installMode === "replace-existing" ? "replace-existing" : "skip-existing";
    if (input.guideMarkdown !== undefined) profile.guideMarkdown = input.guideMarkdown.slice(0, 20000);
    if (input.envSnapshot !== undefined && profile.kind === "vm-snapshot") profile.envSnapshot = input.envSnapshot;
    profile.updatedAt = new Date().toISOString();

    return profile;
  });
}

export async function deleteUserProfile(user: StoredUser, profileId: string): Promise<boolean> {
  return updateRuntimeDatabase((db) => {
    const index = db.userProfiles.findIndex((p) => p.id === profileId && p.userId === user.id);
    if (index === -1) return false;
    db.userProfiles.splice(index, 1);
    return true;
  });
}

export async function listAllPublicProfilesAsCatalog(): Promise<StoredUserProfile[]> {
  const db = await readRuntimeDatabase();
  return db.userProfiles.filter((p) => p.visibility === "public");
}

function normalizeKind(kind?: string): StoredUserProfile["kind"] {
  if (kind === "combo" || kind === "software" || kind === "vm-snapshot") return kind;
  return "combo";
}

function normalizeName(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Profile name is required.");
  if (trimmed.length > 100) throw new Error("Profile name is too long (max 100 characters).");
  return trimmed;
}

function normalizeComponents(components: unknown[]): StoredUserProfile["components"] {
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
    .slice(0, 30);
}
