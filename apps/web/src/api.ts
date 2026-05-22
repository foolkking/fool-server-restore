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
  /** 支持的部署模式：system = apt 安装，docker = docker compose 部署 */
  deployModes?: Array<"system" | "docker">;
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
  role: "user" | "admin";
  defaultSshUser?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export type ConnectionMethod = "ssh-password" | "ssh-key";

export interface ConnectionProfile {
  id: string;
  userId: string;
  method: ConnectionMethod;
  label: string;
  /** 用户自定义标签，用于分组（如 dev、staging、prod） */
  tags?: string[];
  status: "validated" | "ssh_ok" | "ssh_failed" | "probed" | "unreachable";
  sshError?: string;
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
  source: string; // apt | apt-manual | rpm | snap | flatpak | npm | pip | gem | cargo | local-bin | opt | user-bin | nvm | pyenv | rbenv | asdf | sdkman | docker | runtime | system | container
  status: string; // installed | synced | unsynced | warning
  /** "user" = matches curated whitelist (always shown); "uncertain" = passed system blacklist
   *  but not in whitelist (hidden by default; UI offers a "show all" toggle).
   *  Only set on apt source; other sources are inherently user-installed. */
  trust?: "user" | "uncertain";
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
  osPretty?: string;
  cpu: { model: string; cores: number; speedMhz: number };
  memory: { totalBytes: number; freeBytes: number; usedBytes: number; totalGb: string; freeGb: string };
  disk?: { total: string; used: string; available: string; usePercent: string };
  uptimeText?: string;
}

export interface AgentProbeResult {
  reachable: true;
  agentId: string;
  collectedAt: string;
  system: AgentSystemInfo;
  software: TargetSoftware[];
  configChecklist: SystemConfigItem[];
  /** Per-source counts for summary display */
  counts?: {
    apt: number;
    rpm: number;
    snap: number;
    flatpak: number;
    npm: number;
    pip: number;
    gem: number;
    cargo: number;
    localBin: number;
    opt: number;
    userBin: number;
    nvm: number;
    pyenv: number;
    docker: number;
    enabledServices: number;
    runningServices: number;
    total: number;
  };
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
  kind: "software" | "combo" | "vm-snapshot";
  visibility: "public" | "private";
  name: string;
  nameEn: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary: string;
  summaryEn: string;
  sensitivity: "safe" | "review" | "privileged";
  components: ProfileComponent[];
  installMode: "skip-existing" | "replace-existing";
  guideMarkdown?: string;
  sourceConnectionId?: string;
  envSnapshot?: AgentProbeResult & { envVars?: Record<string, string>; userNotes?: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  kind: "software" | "combo" | "vm-snapshot";
  name: string;
  nameEn?: string;
  category: UserProfile["category"];
  summary: string;
  summaryEn?: string;
  sensitivity: UserProfile["sensitivity"];
  components: ProfileComponent[];
  installMode: UserProfile["installMode"];
  guideMarkdown?: string;
  sourceConnectionId?: string;
}

export interface UploadSnapshotInput {
  name?: string;
  userNotes?: string;
  envVars?: Record<string, string>;
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
  keyId?: string;
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
      agentUrl: input.agentUrl,
      keyId: input.keyId
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
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
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

export async function deleteConnection(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow<{ ok: boolean }>(response, "Delete connection failed");
}

export async function updateConnection(token: string, id: string, input: { label?: string; agentUrl?: string; tags?: string[] }): Promise<ConnectionProfile> {
  const response = await fetch(`/api/connections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJsonOrThrow<{ connection: ConnectionProfile }>(response, "Update connection failed");
  return body.connection;
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

export async function uploadVmSnapshot(token: string, connectionId: string, input: UploadSnapshotInput): Promise<UserProfile> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/upload-snapshot`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJsonOrThrow<{ profile: UserProfile }>(response, "Upload snapshot failed");
  return body.profile;
}

// ── 任务执行 ──────────────────────────────────────────────

export interface TaskStep {
  id: string;
  label: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  durationMs: number;
  /** 关联到 batch task 的第几个 item */
  itemIndex?: number;
}

export interface BatchItem {
  index: number;
  catalogId: string;
  displayName: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  error?: string;
}

export interface ExecutionTask {
  id: string;
  userId: string;
  connectionId: string;
  profileId: string;
  kind: "install-software" | "apply-combo" | "deploy-snapshot" | "batch-install";
  status: "queued" | "pending" | "running" | "succeeded" | "failed" | "cancelled";
  /** Number of tasks ahead of this one in the per-connection queue. Only set when status="queued". */
  queuePosition?: number;
  steps: TaskStep[];
  /** 仅 batch-install 任务才有 */
  items?: BatchItem[];
  dryRun: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export async function executeProfile(
  token: string,
  connectionId: string,
  profileId: string,
  dryRun = true,
  /** Optional form values for configurable Playbooks (vars.schema.json) */
  vars?: Record<string, unknown>
): Promise<{ taskId: string; steps: TaskStep[]; fieldErrors?: Record<string, string> }> {
  const response = await fetch("/api/execute", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, profileId, dryRun, vars })
  });
  // 400 with fieldErrors means the form failed validation — surface that to the caller
  if (response.status === 400) {
    const data = await response.json().catch(() => ({}));
    if (data && typeof data === "object" && "fieldErrors" in data) {
      return { taskId: "", steps: [], fieldErrors: data.fieldErrors as Record<string, string> };
    }
  }
  return readJsonOrThrow<{ taskId: string; steps: TaskStep[] }>(response, "Execute failed");
}

// ─── Vars schema (configurable Playbooks) ────────────────────────────────

export type VarsSchemaField =
  | { type: "string"; label: string; labelEn?: string; help?: string; helpEn?: string;
      default?: string; required?: boolean; validate?: string; placeholder?: string; show_when?: string; }
  | { type: "number"; label: string; labelEn?: string; help?: string; helpEn?: string;
      default?: number; required?: boolean; min?: number; max?: number; step?: number; show_when?: string; }
  | { type: "boolean"; label: string; labelEn?: string; help?: string; helpEn?: string;
      default: boolean; required?: boolean; show_when?: string; }
  | { type: "choice"; label: string; labelEn?: string; help?: string; helpEn?: string;
      default?: string; required?: boolean; options: Array<{ value: string; label: string; labelEn?: string }>; show_when?: string; }
  | { type: "password"; label: string; labelEn?: string; help?: string; helpEn?: string;
      generate_length?: number; reveal_after_run?: boolean; required?: boolean; validate?: string; show_when?: string; }
  | { type: "port"; label: string; labelEn?: string; help?: string; helpEn?: string;
      default?: number; required?: boolean; show_when?: string; };

export type VarsSchema = Record<string, VarsSchemaField>;

/**
 * Fetch a Playbook's vars schema. Returns null when the Playbook has no schema
 * (caller should fall back to the simple "run with defaults" button).
 */
export async function fetchVarsSchema(id: string): Promise<VarsSchema | null> {
  const response = await fetch(`/api/catalog/${encodeURIComponent(id)}/vars-schema`);
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return (data?.schema ?? null) as VarsSchema | null;
}

// ─── Pre-apply preview ───────────────────────────────────────────────────

/** 单个任务的预览信息（与后端 PreviewTask 对应） */
export interface PreviewTask {
  name: string;
  module: string;
  resolvedArgs: Record<string, unknown>;
  willSkip: boolean;
  skipReason?: string;
  summary: string;
  effectKind: "install" | "config" | "service" | "command" | "filesystem" | "user" | "other";
}

/** 会被写入或修改的远端文件 */
export interface PreviewFile {
  path: string;
  via: string;
  contentPreview?: string;
  totalLines?: number;
  action: "create-or-replace" | "edit-line" | "delete";
}

/** 预览整体响应 */
export interface PlaybookPreview {
  renderedYaml: string;
  effectiveVars: Record<string, unknown>;
  hiddenVars: string[];
  tasks: PreviewTask[];
  files: PreviewFile[];
  impact: { disk?: string; time?: string; sudo?: boolean; risk?: "low" | "medium" | "high"; [key: string]: unknown };
  verifyChecks?: Array<{ name: string; cmd: string }>;
}

/**
 * 请求 catalog 项的执行预览。submittedVars 会经过后端 schema 校验；校验失败时返回
 * { fieldErrors }，供 UI 直接绑回表单字段。
 */
export async function fetchPlaybookPreview(
  token: string,
  catalogId: string,
  vars: Record<string, unknown>
): Promise<{ preview: PlaybookPreview } | { error: string; fieldErrors?: Record<string, string> }> {
  const response = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/preview`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ vars })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      error: (data as { error?: string })?.error ?? `Preview failed (${response.status})`,
      fieldErrors: (data as { fieldErrors?: Record<string, string> })?.fieldErrors
    };
  }
  return data as { preview: PlaybookPreview };
}

export async function batchExecute(
  token: string,
  connectionId: string,
  catalogIds: string[],
  dryRun = true
): Promise<{ taskId: string; totalItems: number; items: BatchItem[] }> {
  const response = await fetch("/api/batch-execute", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, catalogIds, dryRun })
  });
  return readJsonOrThrow<{ taskId: string; totalItems: number; items: BatchItem[] }>(response, "Batch execute failed");
}

export async function cancelTaskRequest(token: string, taskId: string): Promise<void> {
  await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
}

// ── SSH 密钥管理 ──────────────────────────────────────────

export interface SshKeyMeta {
  id: string;
  userId: string;
  label: string;
  fingerprint: string;
  createdAt: string;
}

export async function uploadSshKey(token: string, label: string, privateKey: string): Promise<SshKeyMeta> {
  const response = await fetch("/api/keys", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label, privateKey })
  });
  const body = await readJsonOrThrow<{ key: SshKeyMeta }>(response, "Upload SSH key failed");
  return body.key;
}

export async function fetchSshKeys(token: string): Promise<SshKeyMeta[]> {
  const response = await fetch("/api/keys", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ keys: SshKeyMeta[] }>(response, "Fetch SSH keys failed");
  return body.keys;
}

export async function deleteSshKey(token: string, keyId: string): Promise<void> {
  const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow<{ ok: boolean }>(response, "Delete SSH key failed");
}

// ── 环境保留 ──────────────────────────────────────────────

export interface RedactionHit {
  path: string;
  line: number;
  rule: string;
  preview: string;
}

export interface CaptureResult {
  playbookYaml: string;
  summary: {
    aptPackages: string[];
    enabledServices: string[];
    bashrcLines: string[];
    npmGlobals: string[];
    pipGlobals: string[];
    dockerContainers: string[];
    configFiles: string[];
    diskInfo?: string;
    uptimeInfo?: string;
  };
  redactions?: RedactionHit[];
  skippedPaths?: string[];
  connectionId: string;
  capturedAt: string;
}

export async function captureEnvironment(token: string, connectionId: string): Promise<CaptureResult> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/capture`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return readJsonOrThrow<CaptureResult>(response, "Capture failed");
}

// ── 影响范围预估 ──────────────────────────────────────────

export interface ImpactItem {
  kind: "package" | "service" | "file" | "command" | "user" | "firewall";
  action: string;
  target: string;
  diskDeltaMb?: number;
  needsSudo: boolean;
  risk: "low" | "medium" | "high";
  descZh: string;
  descEn: string;
}

export interface ImpactReport {
  items: ImpactItem[];
  totalDiskDeltaMb: number;
  needsSudo: boolean;
  maxRisk: "low" | "medium" | "high";
  estimatedSeconds: number;
  summaryZh: string;
  summaryEn: string;
}

export interface BatchImpactResult {
  reports: Array<{ catalogId: string; name: string; impact: ImpactReport }>;
  totals: {
    diskDeltaMb: number;
    estimatedSeconds: number;
    needsSudo: boolean;
    maxRisk: "low" | "medium" | "high";
    summaryZh: string;
    summaryEn: string;
  };
}

export async function fetchCatalogImpact(catalogId: string): Promise<ImpactReport> {
  const response = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/impact`);
  const body = await readJsonOrThrow<{ impact: ImpactReport }>(response, "Impact fetch failed");
  return body.impact;
}

export async function fetchBatchImpact(catalogIds: string[]): Promise<BatchImpactResult> {
  const response = await fetch("/api/impact/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalogIds })
  });
  return readJsonOrThrow<BatchImpactResult>(response, "Batch impact failed");
}

// ── 任务历史 ──────────────────────────────────────────────

export interface TaskHistoryEntry {
  id: string;
  userId: string;
  connectionId: string;
  source: string;
  sourceKind: "catalog" | "user-profile" | "captured";
  status: "running" | "succeeded" | "failed" | "cancelled";
  dryRun: boolean;
  steps: Array<{
    name: string;
    module: string;
    status: "ok" | "changed" | "failed" | "skipped" | "running";
    durationMs?: number;
    msg?: string;
  }>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export async function fetchTaskHistory(token: string): Promise<TaskHistoryEntry[]> {
  const response = await fetch("/api/tasks", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ tasks: TaskHistoryEntry[] }>(response, "Fetch task history failed");
  return body.tasks;
}

// ── Playbook 版本管理 ─────────────────────────────────────

export interface StoredPlaybook {
  id: string;
  userId: string;
  name: string;
  description?: string;
  version: number;
  yaml: string;
  history?: Array<{
    version: number;
    yaml: string;
    savedAt: string;
    comment?: string;
  }>;
  sourceKind: "catalog" | "capture" | "user";
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchPlaybooks(token: string): Promise<StoredPlaybook[]> {
  const response = await fetch("/api/playbooks", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ playbooks: StoredPlaybook[] }>(response, "Fetch playbooks failed");
  return body.playbooks;
}

export async function fetchPlaybook(token: string, id: string): Promise<StoredPlaybook> {
  const response = await fetch(`/api/playbooks/${encodeURIComponent(id)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ playbook: StoredPlaybook }>(response, "Fetch playbook failed");
  return body.playbook;
}

export async function createPlaybook(token: string, input: {
  name: string;
  description?: string;
  yaml: string;
  sourceKind?: "catalog" | "capture" | "user";
  sourceId?: string;
  comment?: string;
}): Promise<StoredPlaybook> {
  const response = await fetch("/api/playbooks", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJsonOrThrow<{ playbook: StoredPlaybook }>(response, "Create playbook failed");
  return body.playbook;
}

export async function updatePlaybook(token: string, id: string, input: {
  name?: string;
  description?: string;
  yaml?: string;
  comment?: string;
}): Promise<StoredPlaybook> {
  const response = await fetch(`/api/playbooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readJsonOrThrow<{ playbook: StoredPlaybook }>(response, "Update playbook failed");
  return body.playbook;
}

export async function restorePlaybookVersion(token: string, id: string, version: number): Promise<StoredPlaybook> {
  const response = await fetch(`/api/playbooks/${encodeURIComponent(id)}/restore/${version}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ playbook: StoredPlaybook }>(response, "Restore playbook version failed");
  return body.playbook;
}

export async function deletePlaybook(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/playbooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow<{ ok: boolean }>(response, "Delete playbook failed");
}

// ── 多目标批量执行 ────────────────────────────────────────

export interface MultiExecuteResult {
  targets: Array<{ connectionId: string; label: string; taskId: string }>;
  dryRun: boolean;
  totalTargets: number;
  message: string;
}

export async function multiExecute(token: string, input: {
  yaml?: string;
  playbookId?: string;
  connectionIds?: string[];
  tags?: string[];
  dryRun?: boolean;
}): Promise<MultiExecuteResult> {
  const response = await fetch("/api/multi-execute", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJsonOrThrow<MultiExecuteResult>(response, "Multi-execute failed");
}

export async function fetchTask(token: string, taskId: string): Promise<ExecutionTask> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ task: ExecutionTask }>(response, "Fetch task failed");
  return body.task;
}

export function streamTask(taskId: string, onUpdate: (task: ExecutionTask) => void, token?: string): () => void {
  const url = `/api/tasks/${encodeURIComponent(taskId)}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const es = new EventSource(url);
  es.onmessage = (event) => {
    try { onUpdate(JSON.parse(event.data as string) as ExecutionTask); } catch { /* ignore */ }
  };
  es.onerror = () => es.close();
  return () => es.close();
}

export async function extractCombo(token: string, connectionId: string): Promise<Partial<CreateProfileInput>> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/extract-combo`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ draft: Partial<CreateProfileInput> }>(response, "Extract combo failed");
  return body.draft;
}

export async function fetchDockerCompose(catalogId: string): Promise<string> {
  const response = await fetch(`/api/catalog/${encodeURIComponent(catalogId)}/docker-compose`);
  if (!response.ok) throw new Error(`No Docker Compose for ${catalogId}`);
  return response.text();
}


// ── 配置文件管理 ──────────────────────────────────────────

export interface ConfigFileInfo {
  path: string;
  size: number;
  modifiedAt: string;
  category: "system" | "user" | "app";
  associatedSoftware?: string;
}

export interface ConfigFileContent {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
  encoding: "utf8";
}

export async function fetchConfigFiles(token: string, connectionId: string): Promise<ConfigFileInfo[]> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/configs`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const body = await readJsonOrThrow<{ files: ConfigFileInfo[] }>(response, "Fetch config files failed");
  return body.files;
}

export async function readRemoteConfigFile(token: string, connectionId: string, path: string): Promise<ConfigFileContent> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/configs/read?path=${encodeURIComponent(path)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return readJsonOrThrow<ConfigFileContent>(response, "Read config file failed");
}

export async function writeRemoteConfigFile(token: string, connectionId: string, path: string, content: string, backup = true): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/configs/write`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, backup })
  });
  return readJsonOrThrow<{ success: boolean; message: string }>(response, "Write config file failed");
}

export async function fetchConfigFileDiff(
  token: string,
  connectionId: string,
  path: string
): Promise<{ current: ConfigFileContent; backup?: ConfigFileContent & { backupPath: string } }> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/configs/diff?path=${encodeURIComponent(path)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return readJsonOrThrow(response, "Diff failed");
}


// ── 软件卸载 ──────────────────────────────────────────────

export async function uninstallPackages(token: string, connectionId: string, packages: string[], source: string, dryRun = false): Promise<{ taskId: string; dryRun: boolean; packages: string[] }> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/uninstall`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ packages, source, dryRun })
  });
  return readJsonOrThrow<{ taskId: string; dryRun: boolean; packages: string[] }>(response, "Uninstall failed");
}

// ── Preflight & Verify ───────────────────────────────────

export interface PreflightCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skipped";
  detail: string;
}

export interface PreflightReport {
  ranAt: string;
  durationMs: number;
  checks: PreflightCheck[];
  summary: { pass: number; warn: number; fail: number };
}

export async function runPreflightCheck(token: string, connectionId: string): Promise<PreflightReport> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/preflight`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await readJsonOrThrow<{ report: PreflightReport }>(response, "Preflight failed");
  return data.report;
}

// ─── Distro detection + compatibility ──────────────────────────────────

export type DistroFamily = "debian-family" | "rhel-family" | "suse-family" | "arch-family" | "alpine" | "unknown";

export interface DistroInfo {
  id: string;
  idLike: string[];
  prettyName: string;
  major: number;
  versionId: string;
  family: DistroFamily;
  packageManager: "apt" | "dnf" | "yum" | "zypper" | "apk" | "pacman" | "unknown";
}

export type CompatibilityLevel = "verified" | "compatible" | "untested" | "unsupported";

export interface CompatibilityResult {
  catalogId: string;
  level: CompatibilityLevel;
  reasonZh: string;
  reasonEn: string;
}

export async function fetchTargetDistro(token: string, connectionId: string): Promise<DistroInfo> {
  const r = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/distro`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await readJsonOrThrow<{ distro: DistroInfo }>(r, "Distro detection failed");
  return data.distro;
}

export async function checkCompatibility(
  token: string,
  connectionId: string,
  catalogIds: string[]
): Promise<{ distro: DistroInfo; results: CompatibilityResult[] }> {
  const r = await fetch("/api/compatibility/check", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, catalogIds })
  });
  return readJsonOrThrow(r, "Compatibility check failed");
}

export interface VerifyResult {
  verifiedAt: string;
  addedSoftware: Array<{ name: string; version: string; source: string }>;
  removedSoftware: Array<{ name: string; version: string; source: string }>;
}

export async function verifyAfterTask(
  token: string,
  connectionId: string,
  beforeProbe: { software?: Array<{ name: string; version: string; source: string }> }
): Promise<VerifyResult> {
  const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/verify`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ beforeProbe })
  });
  return readJsonOrThrow<VerifyResult>(response, "Verify failed");
}


// ── Schedules (cron) ─────────────────────────────────────

export interface Schedule {
  id: string;
  userId: string;
  name: string;
  playbookId?: string;
  catalogId?: string;
  connectionIds: string[];
  tags: string[];
  cron: string;
  dryRun: boolean;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: "succeeded" | "failed" | "partial" | "skipped";
  createdAt: string;
  updatedAt: string;
}

export async function fetchSchedules(token: string): Promise<Schedule[]> {
  const r = await fetch("/api/schedules", { headers: { "Authorization": `Bearer ${token}` } });
  return (await readJsonOrThrow<{ schedules: Schedule[] }>(r, "Fetch schedules failed")).schedules;
}

export async function createSchedule(token: string, input: Partial<Schedule>): Promise<Schedule> {
  const r = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return (await readJsonOrThrow<{ schedule: Schedule }>(r, "Create schedule failed")).schedule;
}

export async function updateSchedule(token: string, id: string, input: Partial<Schedule>): Promise<Schedule> {
  const r = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return (await readJsonOrThrow<{ schedule: Schedule }>(r, "Update schedule failed")).schedule;
}

export async function deleteSchedule(token: string, id: string): Promise<void> {
  const r = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow(r, "Delete schedule failed");
}

// ── Drift detection ──────────────────────────────────────

export interface DriftReport {
  baselineCapturedAt: string;
  checkedAt: string;
  addedSoftware: Array<{ name: string; version: string; source: string }>;
  removedSoftware: Array<{ name: string; version: string; source: string }>;
  hasDrift: boolean;
}

export async function setDriftBaseline(token: string, connectionId: string): Promise<{ id: string; capturedAt: string }> {
  const r = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/drift/baseline`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await readJsonOrThrow<{ baseline: { id: string; capturedAt: string } }>(r, "Baseline failed");
  return data.baseline;
}

export async function runDriftCheck(token: string, connectionId: string): Promise<DriftReport> {
  const r = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/drift`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await readJsonOrThrow<{ report: DriftReport }>(r, "Drift check failed");
  return data.report;
}

// ── Webhooks ─────────────────────────────────────────────

export interface Webhook {
  id: string;
  userId: string;
  label: string;
  url: string;
  secret?: string;
  events: Array<"task.completed" | "task.failed" | "drift.detected" | "schedule.fired">;
  enabled: boolean;
  createdAt: string;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: "success" | "failed";
  lastDeliveryError?: string;
}

export async function fetchWebhooks(token: string): Promise<Webhook[]> {
  const r = await fetch("/api/webhooks", { headers: { "Authorization": `Bearer ${token}` } });
  return (await readJsonOrThrow<{ webhooks: Webhook[] }>(r, "Fetch webhooks failed")).webhooks;
}

export async function createWebhook(token: string, input: Partial<Webhook>): Promise<Webhook> {
  const r = await fetch("/api/webhooks", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return (await readJsonOrThrow<{ webhook: Webhook }>(r, "Create webhook failed")).webhook;
}

export async function deleteWebhook(token: string, id: string): Promise<void> {
  const r = await fetch(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow(r, "Delete webhook failed");
}

export async function testWebhook(token: string, id: string): Promise<{ delivered: string; error?: string }> {
  const r = await fetch(`/api/webhooks/${encodeURIComponent(id)}/test`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  return readJsonOrThrow(r, "Test webhook failed");
}

// ── API tokens ───────────────────────────────────────────

export interface ApiTokenInfo {
  id: string;
  label: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export async function fetchApiTokens(token: string): Promise<ApiTokenInfo[]> {
  const r = await fetch("/api/tokens", { headers: { "Authorization": `Bearer ${token}` } });
  return (await readJsonOrThrow<{ tokens: ApiTokenInfo[] }>(r, "Fetch tokens failed")).tokens;
}

export async function createApiToken(token: string, label: string, expiresInDays?: number): Promise<{ token: string; id: string; label: string; tokenPrefix: string }> {
  const r = await fetch("/api/tokens", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label, expiresInDays })
  });
  return readJsonOrThrow(r, "Create token failed");
}

export async function deleteApiToken(token: string, id: string): Promise<void> {
  const r = await fetch(`/api/tokens/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow(r, "Delete token failed");
}

// ── Module docs ──────────────────────────────────────────

export interface ModuleArgSpec {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

export interface ModuleDoc {
  name: string;
  summary: string;
  category: string;
  args: ModuleArgSpec[];
  example: string;
  notes?: string;
}

export async function fetchModuleDocs(): Promise<ModuleDoc[]> {
  const r = await fetch("/api/modules/docs");
  return (await readJsonOrThrow<{ modules: ModuleDoc[] }>(r, "Fetch module docs failed")).modules;
}


// ── Admin: catalog management ─────────────────────────────

export type CatalogStatus = "baseline" | "modified" | "added" | "hidden";

export interface AdminCatalogList {
  items: CatalogItem[];
  status: Record<string, CatalogStatus>;
}

export interface AdminCatalogDetail {
  item: CatalogItem;
  yaml: string;
  markdown: string;
  /** Vars schema (override 优先，没有则基线，都没有则 null) */
  varsSchema: VarsSchema | null;
  hasYamlOverride: boolean;
  hasMarkdownOverride: boolean;
  hasSchemaOverride: boolean;
  isUserAdded: boolean;
}

export interface AdminCatalogInput {
  id?: string;
  kind?: "software" | "combo";
  name?: string;
  nameEn?: string;
  category?: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary?: string;
  summaryEn?: string;
  imageTone?: string;
  sensitivity?: "safe" | "review" | "privileged";
  rating?: number;
  playbookYaml?: string;
  guideMarkdown?: string;
  /**
   * varsSchema:
   *  - undefined → 不动（保留现有 override 或基线）
   *  - null → 删除 override（恢复到基线 / 没有 schema）
   *  - object → 保存为 override
   */
  varsSchema?: VarsSchema | null;
  components?: Array<{ type: "software" | "system-command" | "system-config"; label: string; labelEn: string; detail: string }>;
  deployModes?: Array<"system" | "docker">;
  hidden?: boolean;
}

export async function fetchAdminCatalog(token: string): Promise<AdminCatalogList> {
  const r = await fetch("/api/admin/catalog", { headers: { "Authorization": `Bearer ${token}` } });
  return readJsonOrThrow(r, "Fetch admin catalog failed");
}

export async function fetchAdminCatalogItem(token: string, id: string): Promise<AdminCatalogDetail> {
  const r = await fetch(`/api/admin/catalog/${encodeURIComponent(id)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return readJsonOrThrow(r, "Fetch catalog item failed");
}

export async function createAdminCatalog(token: string, input: AdminCatalogInput): Promise<{ id: string }> {
  const r = await fetch("/api/admin/catalog", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJsonOrThrow(r, "Create catalog failed");
}

export async function updateAdminCatalog(token: string, id: string, input: AdminCatalogInput): Promise<{ ok: true }> {
  const r = await fetch(`/api/admin/catalog/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJsonOrThrow(r, "Update catalog failed");
}

export async function deleteAdminCatalog(token: string, id: string): Promise<void> {
  const r = await fetch(`/api/admin/catalog/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow(r, "Delete catalog failed");
}

export async function resetAdminCatalog(token: string, id: string): Promise<void> {
  const r = await fetch(`/api/admin/catalog/${encodeURIComponent(id)}/reset`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  await readJsonOrThrow(r, "Reset catalog failed");
}
