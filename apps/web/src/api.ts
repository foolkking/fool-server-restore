export interface ScanResponse {
  manifest: SnapshotManifest;
  persisted: boolean;
  paths?: {
    snapshotPath: string;
    latestPath: string;
  };
}

export interface SnapshotManifest {
  schemaVersion: string;
  createdAt: string;
  user: string;
  machine: {
    id: string;
    hostname: string;
    os: string;
    platform: string;
    arch: string;
  };
  collectors: Record<string, CollectorOutput>;
  files: unknown[];
  redactions: unknown[];
  restoreHints: unknown[];
}

export interface CollectorOutput {
  id: string;
  label: string;
  status: "available" | "partial" | "unavailable";
  data: unknown;
  issues: Array<{ code: string; message: string; needsPrivilege?: boolean }>;
}

export interface SnapshotSummary {
  user: string;
  machineId: string;
  createdAt: string;
  path: string;
  isLatest: boolean;
}

export interface TargetVirtualMachine {
  id: string;
  name: string;
  provider: string;
  address: string;
  status: "healthy" | "warning" | "failed" | "unsynced";
  os: string;
  region: string;
  lastSeen: string;
  software: TargetSoftware[];
  configChecklist: SystemConfigItem[];
}

export interface CatalogItem {
  id: string;
  kind: "software" | "combo";
  name: string;
  nameEn: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary: string;
  summaryEn: string;
  rating: number;
  installs: string;
  imageTone: string;
  sensitivity: "safe" | "review" | "privileged";
  assets: string[];
  guidePath: string;
  guideAuthor: "admin" | "user";
  installMode: "skip-existing" | "replace-existing";
  components: CatalogComponent[];
}

export interface CatalogComponent {
  type: "software" | "system-command" | "system-config";
  label: string;
  labelEn: string;
  detail: string;
}

export interface CatalogGuide {
  item: CatalogItem;
  markdown: string;
}

export interface MigrationStrategy {
  id: string;
  name: string;
  source: string;
  useCase: string;
  conflictModes: Array<"skip-existing" | "replace-existing">;
}

export interface CurrentUser {
  id: string;
  name: string;
  nameEn: string;
  authenticated: boolean;
  uploadedProfiles: Array<{
    id: string;
    name: string;
    nameEn: string;
    items: number;
    updatedAt: string;
  }>;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  authenticated: true;
  defaultSshUser?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export type ConnectionMethod = "ssh-password" | "ssh-key" | "winrm" | "docker";

export interface ConnectionProfile {
  id: string;
  userId: string;
  method: ConnectionMethod;
  label: string;
  status: "validated" | "probed" | "unreachable";
  fields: Record<string, string>;
  maskedSecrets: string[];
  realConnection: false;
  agentUrl?: string;
  probeSnapshot?: AgentProbeResult;
  lastProbeAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionResponse {
  connection: ConnectionProfile;
  probe: AgentProbeResult | null;
  note: string;
}

export interface TargetSoftware {
  name: string;
  version: string;
  source: "npm" | "system" | "container" | "runtime";
  status: "synced" | "unsynced" | "warning";
}

export interface SystemConfigItem {
  id: string;
  label: string;
  category: "security" | "network" | "runtime" | "service";
  status: "healthy" | "warning" | "failed";
  lastChanged: string;
}

export interface AgentSystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  uptime: number;
  cpu: { model: string; cores: number; speedMhz: number };
  memory: { totalBytes: number; freeBytes: number; usedBytes: number; totalGb: string; freeGb: string };
}

export interface AgentProbeResult {
  reachable: true;
  agentId: string;
  collectedAt: string;
  system: AgentSystemInfo;
  software: TargetSoftware[];
  configChecklist: SystemConfigItem[];
}

export interface AgentProbeFailure {
  reachable: false;
  error: string;
}

export type ProbeResult = AgentProbeResult | AgentProbeFailure;

// ── 用户配置组合 ──────────────────────────────────────────

export interface ProfileComponent {
  type: "software" | "system-command" | "system-config";
  label: string;
  labelEn: string;
  detail: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  kind: "software" | "combo";
  name: string;
  nameEn: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary: string;
  summaryEn: string;
  sensitivity: "safe" | "review" | "privileged";
  components: ProfileComponent[];
  installMode: "skip-existing" | "replace-existing";
  guideMarkdown?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  kind: "software" | "combo";
  name: string;
  nameEn?: string;
  category: UserProfile["category"];
  summary: string;
  summaryEn?: string;
  sensitivity: UserProfile["sensitivity"];
  components: ProfileComponent[];
  installMode: UserProfile["installMode"];
  guideMarkdown?: string;
}

export async function runScan(user = "default", persist = true): Promise<ScanResponse> {
  const response = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, persist })
  });

  if (!response.ok) {
    throw new Error(`Scan failed: ${response.status}`);
  }

  return response.json() as Promise<ScanResponse>;
}

export async function fetchSnapshots(): Promise<SnapshotSummary[]> {
  const response = await fetch("/api/snapshots");
  if (!response.ok) {
    throw new Error(`Snapshot list failed: ${response.status}`);
  }

  const body = (await response.json()) as { snapshots: SnapshotSummary[] };
  return body.snapshots;
}

export async function fetchTargets(): Promise<TargetVirtualMachine[]> {
  const response = await fetch("/api/targets");
  if (!response.ok) {
    throw new Error(`Target VM list failed: ${response.status}`);
  }

  const body = (await response.json()) as { targets: TargetVirtualMachine[] };
  return body.targets;
}

export async function fetchCatalog(): Promise<CatalogItem[]> {
  const response = await fetch("/api/catalog");
  if (!response.ok) {
    throw new Error(`Catalog failed: ${response.status}`);
  }

  const body = (await response.json()) as { items: CatalogItem[] };
  return body.items;
}

export async function fetchCatalogGuide(id: string): Promise<CatalogGuide> {
  const response = await fetch(`/api/catalog/${encodeURIComponent(id)}/guide`);
  if (!response.ok) {
    throw new Error(`Catalog guide failed: ${response.status}`);
  }

  return response.json() as Promise<CatalogGuide>;
}

export async function fetchMigrationStrategies(): Promise<MigrationStrategy[]> {
  const response = await fetch("/api/migration/strategies");
  if (!response.ok) {
    throw new Error(`Migration strategies failed: ${response.status}`);
  }

  const body = (await response.json()) as { strategies: MigrationStrategy[] };
  return body.strategies;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await fetch("/api/me");
  if (!response.ok) {
    throw new Error(`Current user failed: ${response.status}`);
  }

  return response.json() as Promise<CurrentUser>;
}

export async function registerAccount(input: { name: string; email: string; password: string }): Promise<AuthResponse> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJsonOrThrow<AuthResponse>(response, "Registration failed");
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJsonOrThrow<AuthResponse>(response, "Login failed");
}

export async function connectServer(input: {
  token: string;
  method: ConnectionMethod;
  label?: string;
  fields: Record<string, string>;
  agentUrl?: string;
}): Promise<ConnectionResponse> {
  const response = await fetch("/api/connections/connect", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${input.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      method: input.method,
      label: input.label,
      fields: input.fields,
      agentUrl: input.agentUrl
    })
  });
  return readJsonOrThrow<ConnectionResponse>(response, "Connection failed");
}

export async function updateProfile(input: {
  token: string;
  name: string;
  defaultSshUser: string;
}): Promise<AuthUser> {
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${input.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: input.name,
      defaultSshUser: input.defaultSshUser
    })
  });
  const body = await readJsonOrThrow<{ user: AuthUser }>(response, "Profile update failed");
  return body.user;
}

async function readJsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const errorBody = body as { error?: string };
    throw new Error(errorBody.error ? errorBody.error : `${fallback}: ${response.status}`);
  }
  return body as T;
}

export async function probeAgent(agentUrl: string): Promise<ProbeResult> {
  const response = await fetch("/api/targets/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentUrl })
  });
  const body = (await response.json()) as ProbeResult;
  return body;
}

export async function pingAgent(agentUrl: string): Promise<boolean> {
  const response = await fetch("/api/targets/ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentUrl })
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { online: boolean };
  return body.online;
}

export async function reprobeConnection(token: string, connectionId: string): Promise<ConnectionProfile> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/reprobe`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const body = await readJsonOrThrow<{ connection: ConnectionProfile }>(response, "Reprobe failed");
  return body.connection;
}

export async function fetchConnections(token: string): Promise<ConnectionProfile[]> {
  const response = await fetch("/api/connections", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ connections: ConnectionProfile[] }>(response, "Fetch connections failed");
  return body.connections;
}

// ── 用户配置组合 ──────────────────────────────────────────

export async function fetchProfiles(token: string): Promise<UserProfile[]> {
  const response = await fetch("/api/profiles", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ profiles: UserProfile[] }>(response, "Fetch profiles failed");
  return body.profiles;
}

export async function createProfile(token: string, input: CreateProfileInput): Promise<UserProfile> {
  const response = await fetch("/api/profiles", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJsonOrThrow<{ profile: UserProfile }>(response, "Create profile failed");
  return body.profile;
}

export async function updateProfileData(token: string, id: string, input: Partial<CreateProfileInput>): Promise<UserProfile> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJsonOrThrow<{ profile: UserProfile }>(response, "Update profile failed");
  return body.profile;
}

export async function deleteProfile(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow<{ ok: boolean }>(response, "Delete profile failed");
}
