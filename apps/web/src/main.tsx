import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  CheckCircle2,
  Cpu,
  Database,
  Edit3,
  HardDrive,
  KeyRound,
  Languages,
  Lock,
  LogIn,
  LogOut,
  MemoryStick,
  MonitorCog,
  PackagePlus,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  UploadCloud,
  UserRound,
  Wifi,
  X,
  type LucideIcon
} from "lucide-react";
import {
  connectServer,
  createProfile,
  deleteProfile,
  fetchCatalog,
  fetchCatalogGuide,
  fetchConnections,
  fetchCurrentUser,
  fetchMigrationStrategies,
  fetchProfiles,
  fetchTargets,
  loginAccount,
  probeAgent,
  registerAccount,
  reprobeConnection,
  runScan,
  updateProfile,
  uploadVmSnapshot,
  type AgentProbeResult,
  type AuthUser,
  type CatalogGuide,
  type CatalogComponent,
  type CatalogItem,
  type ConnectionProfile,
  type CreateProfileInput,
  type CurrentUser,
  type MigrationStrategy,
  type ProfileComponent,
  type ScanResponse,
  type TargetSoftware,
  type SystemConfigItem,
  type TargetVirtualMachine,
  type UploadSnapshotInput,
  type UserProfile
} from "./api";
import "./styles.css";

type Locale = "zh" | "en";
type Page = "machine" | "market" | "me";
type ConnectionMethod = "ssh-password" | "ssh-key" | "winrm" | "docker";

const text = {
  zh: {
    appName: "Fool 服务器还原",
    subtitle: "虚拟机软硬件配置管理",
    machine: "虚拟机管理",
    market: "配置市场",
    me: "我的空间",
    search: "搜索可加入虚拟机的软件、配置、系统策略",
    filter: "筛选",
    connectTitle: "连接至远程服务器",
    connectHint: "成功连接后才展示完整系统信息；未连接时仅可选择连接方式和凭据。",
    runScan: "扫描当前虚拟机",
    upload: "上传当前虚拟机配置",
    selected: "已选择",
    software: "软件信息",
    configs: "系统配置清单",
    addToVm: "加入虚拟机",
    guest: "游客",
    login: "登录",
    register: "注册",
    logout: "登出",
    editProfile: "编辑资料",
    profile: "个人信息",
    uploads: "我上传的虚拟机配置",
    language: "中文",
    locked: "连接成功后显示",
    connection: "连接状态",
    connected: "已连接",
    disconnected: "未连接",
    connectBtn: "连接",
    privacyNote: "未登录或未解锁时，只能安装公开软件；私有配置和应用数据保持锁定。",
    installCommand: "安装命令",
    packageAlias: "包与 alias 偏好",
    agentUrl: "Agent URL（可选，如 http://127.0.0.1:4001）",
    agentProbe: "探测真实数据",
    agentOnline: "Agent 在线",
    agentOffline: "Agent 离线",
    probing: "探测中…",
    realData: "真实数据（来自 mock-agent）"
  },
  en: {
    appName: "Fool Server Restore",
    subtitle: "VM software and hardware configuration manager",
    machine: "VM Manager",
    market: "Config Market",
    me: "My Space",
    search: "Search software, configs, and system policies",
    filter: "Filter",
    connectTitle: "Connect remote server",
    connectHint: "Full system information is visible only after a successful connection.",
    runScan: "Scan current VM",
    upload: "Upload current VM profile",
    selected: "Selected",
    software: "Software",
    configs: "System configs",
    addToVm: "Add to VM",
    guest: "Guest",
    login: "Login",
    register: "Register",
    logout: "Logout",
    editProfile: "Edit profile",
    profile: "Profile",
    uploads: "My uploaded VM profiles",
    language: "English",
    locked: "Visible after connection",
    connection: "Connection",
    connected: "Connected",
    disconnected: "Disconnected",
    connectBtn: "Connect",
    privacyNote: "Without login or unlock, only public software can be installed; private configs and app data stay locked.",
    installCommand: "Install command",
    packageAlias: "Packages and alias preferences",
    agentUrl: "Agent URL (optional, e.g. http://127.0.0.1:4001)",
    agentProbe: "Probe real data",
    agentOnline: "Agent online",
    agentOffline: "Agent offline",
    probing: "Probing…",
    realData: "Live data (from mock-agent)"
  }
};

const navItems: Array<{ id: Page; icon: LucideIcon }> = [
  { id: "machine", icon: MonitorCog },
  { id: "market", icon: PackagePlus },
  { id: "me", icon: UserRound }
];

const categoryIcons: Record<CatalogItem["category"], LucideIcon> = {
  runtime: Cpu,
  developer: Settings2,
  database: Database,
  container: Box,
  security: ShieldCheck,
  network: Wifi,
  service: Server
};

const connectionFields: Record<ConnectionMethod, string[]> = {
  "ssh-password": ["Host", "Port", "Username", "Password"],
  "ssh-key": ["Host", "Port", "Username", "Private key path", "Passphrase"],
  winrm: ["Host", "Domain", "Username", "Password"],
  docker: ["Context name", "Socket / Host"]
};

const connectionFieldKeys: Record<ConnectionMethod, string[]> = {
  "ssh-password": ["host", "port", "username", "password"],
  "ssh-key": ["host", "port", "username", "privateKeyPath", "passphrase"],
  winrm: ["host", "domain", "username", "password"],
  docker: ["contextName", "host"]
};

const installCommands: Record<string, string> = {
  node: "npm install -g pnpm typescript tsx",
  docker: "winget install Docker.DockerDesktop",
  pm2: "npm install -g pm2",
  iis: "Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole"
};

function App() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [page, setPage] = useState<Page>("machine");
  const [targets, setTargets] = useState<TargetVirtualMachine[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [strategies, setStrategies] = useState<MigrationStrategy[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [guide, setGuide] = useState<CatalogGuide | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [query, setQuery] = useState("");
  const [catalogKind, setCatalogKind] = useState<"software" | "combo">("software");
  const [connected, setConnected] = useState(false);
  const [method, setMethod] = useState<ConnectionMethod>("ssh-password");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [connectionProfile, setConnectionProfile] = useState<ConnectionProfile | null>(null);
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [probeResult, setProbeResult] = useState<AgentProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(["software-node", "config-aliases"]));
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const t = text[locale];

  // 当前激活的连接档案（含 probeSnapshot）
  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? connectionProfile ?? null;
  const activeProbe = (activeConnection?.probeSnapshot as AgentProbeResult | undefined) ?? probeResult;

  useEffect(() => {
    void load();
  }, []);

  async function load(token?: string) {
    const [catalogResult, userResult] = await Promise.allSettled([
      fetchCatalog(),
      fetchCurrentUser()
    ]);
    const strategyResult = await fetchMigrationStrategies().catch(() => []);
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
    if (userResult.status === "fulfilled") setCurrentUser(userResult.value);
    setStrategies(strategyResult);

    // 如果有 token，加载已保存的连接列表和配置组合
    const activeToken = token ?? authToken;
    if (activeToken) {
      const [conns, profs] = await Promise.all([
        fetchConnections(activeToken).catch(() => [] as ConnectionProfile[]),
        fetchProfiles(activeToken).catch(() => [] as UserProfile[])
      ]);
      setConnections(conns);
      setUserProfiles(profs);
      // 自动激活最近一次 probed 的连接
      const probed = conns.find((c) => c.status === "probed");
      if (probed) {
        setActiveConnectionId(probed.id);
        setConnected(true);
        if (probed.probeSnapshot) {
          setProbeResult(probed.probeSnapshot as AgentProbeResult);
        }
      }
    }
  }

  async function handleScan() {
    const result = await runScan("default", true);
    setScan(result);
  }

  async function handleConnect(fields: Record<string, string>, agentUrl: string) {
    setConnectionError("");
    setProbing(true);
    if (!authToken) {
      setConnectionError(locale === "zh" ? "请先登录后再保存服务器连接。" : "Please login before saving a server connection.");
      setProbing(false);
      return;
    }

    try {
      const result = await connectServer({
        token: authToken,
        method,
        label: fields.host || fields.contextName || method,
        fields,
        agentUrl: agentUrl.trim() || undefined
      });
      setConnectionProfile(result.connection);
      setActiveConnectionId(result.connection.id);
      setConnected(true);
      // probe 结果直接从连接响应里拿，不需要再单独请求
      if (result.probe) {
        setProbeResult(result.probe as AgentProbeResult);
      }
      // 刷新连接列表
      const conns = await fetchConnections(authToken).catch(() => connections);
      setConnections(conns);
    } catch (error) {
      setConnected(false);
      setConnectionError(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setProbing(false);
    }
  }

  async function handleReprobe(connectionId: string) {
    if (!authToken) return;
    setProbing(true);
    try {
      const updated = await reprobeConnection(authToken, connectionId);
      setConnections((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      if (updated.probeSnapshot) {
        setProbeResult(updated.probeSnapshot as AgentProbeResult);
      }
    } catch {
      // reprobe 失败静默处理
    } finally {
      setProbing(false);
    }
  }

  function handleAuthSuccess(result: { token: string; user: AuthUser }) {
    setAuthToken(result.token);
    setAuthUser(result.user);
    void load(result.token);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredCatalog = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesKind = item.kind === catalogKind;
      const matchesQuery =
        !lower ||
        [item.name, item.nameEn, item.summary, item.summaryEn, item.category]
          .join(" ")
          .toLowerCase()
          .includes(lower);
      return matchesKind && matchesQuery;
    });
  }, [catalog, catalogKind, query]);

  const activeTarget = targets[0];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <strong>{t.appName}</strong>
            <span>{t.subtitle}</span>
          </div>
        </div>

        <nav className="main-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={page === item.id ? "active" : ""} key={item.id} type="button" onClick={() => setPage(item.id)}>
                <Icon aria-hidden />
                <span>{t[item.id]}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          {page === "market" ? (
            <label className="search-box">
              <Search aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
            </label>
          ) : (
            <div>
              <p className="eyebrow">{page === "machine" ? t.connection : t.me}</p>
              <h1>{t[page]}</h1>
            </div>
          )}

          <div className="top-actions">
            <button className="ghost-action" type="button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>
              <Languages aria-hidden />
              {t.language}
            </button>
            <div className="avatar">{authUser ? authUser.name.slice(0, 1).toUpperCase() : locale === "zh" ? "游" : "G"}</div>
          </div>
        </header>

        {page === "machine" ? (
          <MachinePage
            t={t}
            locale={locale}
            connections={connections}
            activeConnectionId={activeConnectionId}
            scan={scan}
            selected={selected}
            connected={connected}
            connectionProfile={connectionProfile}
            connectionError={connectionError}
            probeResult={activeProbe ?? null}
            probing={probing}
            method={method}
            onMethod={setMethod}
            onConnect={handleConnect}
            onSelectConnection={(id) => {
              setActiveConnectionId(id);
              const conn = connections.find((c) => c.id === id);
              if (conn?.probeSnapshot) setProbeResult(conn.probeSnapshot as AgentProbeResult);
              setConnected(true);
            }}
            onReprobe={handleReprobe}
            onToggle={toggleSelected}
            onScan={handleScan}
            onUploadSnapshot={async (input) => {
              if (!activeConnectionId || !authToken) return;
              const profile = await uploadVmSnapshot(authToken, activeConnectionId, input);
              setUserProfiles((prev) => [profile, ...prev]);
            }}
            authUser={authUser}
          />
        ) : null}

        {page === "market" ? (
            <MarketPage
            t={t}
            locale={locale}
            items={filteredCatalog}
            selected={selected}
            kind={catalogKind}
            onKind={setCatalogKind}
            onOpenGuide={async (id) => setGuide(await fetchCatalogGuide(id))}
            onToggle={toggleSelected}
          />
        ) : null}

        {page === "me" ? (
          <MePage
            t={t}
            locale={locale}
            user={currentUser}
            authUser={authUser}
            authToken={authToken}
            strategies={strategies}
            userProfiles={userProfiles}
            onLogin={async (input) => handleAuthSuccess(await loginAccount(input))}
            onRegister={async (input) => handleAuthSuccess(await registerAccount(input))}
            onUpdateProfile={async (input) => {
              const user = await updateProfile({ token: authToken, ...input });
              setAuthUser(user);
            }}
            onLogout={() => {
              setAuthToken("");
              setAuthUser(null);
              setConnected(false);
              setConnectionProfile(null);
              setUserProfiles([]);
            }}
            onProfilesChange={(profiles) => setUserProfiles(profiles)}
          />
        ) : null}

        {guide ? <MarkdownOverlay guide={guide} locale={locale} onClose={() => setGuide(null)} /> : null}
      </section>
    </main>
  );
}

function MachinePage({
  t,
  locale,
  connections,
  activeConnectionId,
  scan,
  selected,
  connected,
  connectionProfile,
  connectionError,
  probeResult,
  probing,
  method,
  onMethod,
  onConnect,
  onSelectConnection,
  onReprobe,
  onToggle,
  onScan,
  onUploadSnapshot,
  authUser
}: {
  t: typeof text.zh;
  locale: Locale;
  connections: ConnectionProfile[];
  activeConnectionId: string | null;
  scan: ScanResponse | null;
  selected: Set<string>;
  connected: boolean;
  connectionProfile: ConnectionProfile | null;
  connectionError: string;
  probeResult: AgentProbeResult | null;
  probing: boolean;
  method: ConnectionMethod;
  onMethod: (method: ConnectionMethod) => void;
  onConnect: (fields: Record<string, string>, agentUrl: string) => void;
  onSelectConnection: (id: string) => void;
  onReprobe: (id: string) => void;
  onToggle: (id: string) => void;
  onScan: () => void;
  onUploadSnapshot: (input: UploadSnapshotInput) => Promise<void>;
  authUser: AuthUser | null;
}) {
  const [fields, setFields] = useState<Record<string, string>>({ port: "22" });
  const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:4001");
  const [showNewForm, setShowNewForm] = useState(connections.length === 0);

  // 硬件摘要：优先用 probeResult 真实数据，否则用静态占位
  const hardware = probeResult ? [
    { label: locale === "zh" ? "CPU 核心" : "CPU cores", value: `${probeResult.system.cpu.cores} cores · ${probeResult.system.cpu.model.slice(0, 30)}`, icon: Cpu },
    { label: locale === "zh" ? "总内存" : "Total memory", value: `${probeResult.system.memory.totalGb} GB`, icon: MemoryStick },
    { label: locale === "zh" ? "可用运行内存" : "Available RAM", value: `${probeResult.system.memory.freeGb} GB free`, icon: MemoryStick },
    { label: locale === "zh" ? "系统" : "OS", value: `${probeResult.system.platform} ${probeResult.system.arch} · ${probeResult.system.hostname}`, icon: HardDrive }
  ] : [
    { label: locale === "zh" ? "CPU 核心" : "CPU cores", value: "— —", icon: Cpu },
    { label: locale === "zh" ? "总内存" : "Total memory", value: "— —", icon: MemoryStick },
    { label: locale === "zh" ? "可用运行内存" : "Available RAM", value: "— —", icon: MemoryStick },
    { label: locale === "zh" ? "磁盘空间" : "Disk space", value: "— —", icon: HardDrive }
  ];

  // 软件列表：优先用 probeResult 真实数据
  const softwareRows: Array<{ id: string; icon: LucideIcon; name: string; value: string; command: string }> =
    probeResult
      ? probeResult.software.map((item: TargetSoftware) => ({
          id: `software-${item.name}`,
          icon: PackagePlus,
          name: item.name,
          value: `${item.version} · ${item.source} · ${item.status}`,
          command: installCommands[item.name] ?? `install ${item.name}`
        }))
      : [];

  // 配置清单：优先用 probeResult 真实数据
  const configRows: Array<{ id: string; icon: LucideIcon; name: string; value: string; command: string }> =
    probeResult
      ? probeResult.configChecklist.map((item: SystemConfigItem) => ({
          id: `config-${item.id}`,
          icon: Settings2,
          name: item.label,
          value: `${item.category} · ${item.status} · ${item.lastChanged}`,
          command: ""
        }))
      : [
          { id: "config-packages", icon: PackagePlus, name: locale === "zh" ? "包管理器清单" : "Package manifest", value: "npm global, winget, scoop, apt packages", command: "npm list -g --depth=0" },
          { id: "config-aliases", icon: Settings2, name: locale === "zh" ? "命令 alias 偏好" : "Command aliases", value: "gs, ll, k, dc, dev shortcuts", command: "Get-Alias / cat ~/.bashrc" },
          { id: "config-shell", icon: Settings2, name: locale === "zh" ? "Shell profile" : "Shell profile", value: "PowerShell profile, PATH snippets, prompt", command: "code $PROFILE" },
          { id: "config-registry", icon: Wifi, name: locale === "zh" ? "镜像源与代理" : "Registry and proxy", value: "npm registry, pip index, proxy env names", command: "npm config get registry" }
        ];

  function updateField(key: string, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
  }

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const statusColor: Record<string, string> = {
    probed: "#065f46",
    ssh_ok: "#1d4ed8",
    validated: "#6b7280",
    ssh_failed: "#b42318",
    unreachable: "#b42318"
  };
  const statusLabel: Record<string, { zh: string; en: string }> = {
    probed:      { zh: "已采集", en: "Probed" },
    ssh_ok:      { zh: "SSH 成功", en: "SSH OK" },
    validated:   { zh: "已验证", en: "Validated" },
    ssh_failed:  { zh: "SSH 失败", en: "SSH Failed" },
    unreachable: { zh: "不可达", en: "Unreachable" }
  };

  return (
    <div className="page-stack">

      {/* 已保存的连接列表 */}
      {connections.length > 0 ? (
        <section className="saved-connections">
          <div className="saved-connections-header">
            <p className="eyebrow">{locale === "zh" ? "已保存的连接" : "Saved connections"}</p>
            <button className="ghost-action" type="button" onClick={() => setShowNewForm((v) => !v)}>
              {showNewForm ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "+ 新建连接" : "+ New connection")}
            </button>
          </div>
          <div className="connection-chips">
            {connections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                className={`connection-chip ${conn.id === activeConnectionId ? "active" : ""} status-${conn.status}`}
                onClick={() => onSelectConnection(conn.id)}
                title={conn.sshError ?? conn.status}
              >
                <span className="chip-dot" style={{ background: statusColor[conn.status] ?? "#6b7280" }} />
                <span>{conn.label}</span>
                <span className="chip-method">{conn.method}</span>
                <span className="chip-status" style={{ color: statusColor[conn.status] ?? "#6b7280" }}>
                  {locale === "zh" ? statusLabel[conn.status]?.zh : statusLabel[conn.status]?.en}
                </span>
                {conn.id === activeConnectionId && conn.agentUrl ? (
                  <button
                    className="chip-reprobe"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onReprobe(conn.id); }}
                    title={locale === "zh" ? "重新探测" : "Reprobe"}
                  >↻</button>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="connection-stage">
        <div className={connected ? "machine-intro" : "machine-intro blurred"}>
          <p className="eyebrow">{connected ? t.connected : t.disconnected}</p>
          <h2>{probeResult ? probeResult.system.hostname : (activeConn?.label ?? "—")}</h2>
          <p>{connected
            ? probeResult
              ? `${probeResult.system.platform} ${probeResult.system.arch} · ${t.agentOnline}`
              : `${activeConn?.method ?? "SSH"} · ${activeConn?.fields?.host ?? "—"}`
            : t.locked}
          </p>
          {probeResult ? (
            <p className="agent-badge"><CheckCircle2 aria-hidden />{t.realData} · {new Date(probeResult.collectedAt).toLocaleTimeString()}</p>
          ) : null}
          {activeConn?.status === "ssh_failed" && activeConn.sshError ? (
            <p className="connection-error ssh-error-inline">
              {locale === "zh" ? "SSH 失败：" : "SSH failed: "}{activeConn.sshError}
            </p>
          ) : null}
        </div>

        {(!connected || showNewForm) ? (
          <div className="connection-card">
            <div>
              <h2>{t.connectTitle}</h2>
              <p>{t.connectHint}</p>
            </div>
            <select value={method} onChange={(event) => onMethod(event.target.value as ConnectionMethod)}>
              <option value="ssh-password">SSH Password</option>
              <option value="ssh-key">SSH Key</option>
              <option value="winrm">WinRM</option>
              <option value="docker">Docker Context</option>
            </select>
            <div className="connection-fields">
              {connectionFields[method].map((field, index) => {
                const key = connectionFieldKeys[method][index];
                return (
                  <input
                    key={key}
                    placeholder={field}
                    type={field.toLowerCase().includes("password") || field.toLowerCase().includes("passphrase") ? "password" : "text"}
                    value={fields[key] ?? ""}
                    onChange={(event) => updateField(key, event.target.value)}
                  />
                );
              })}
            </div>
            <div className="agent-url-row">
              <Server aria-hidden />
              <input
                placeholder={t.agentUrl}
                value={agentUrl}
                onChange={(event) => setAgentUrl(event.target.value)}
              />
            </div>
            {connectionProfile?.status === "probed" ? (
              <p className="connection-note success-note">
                <CheckCircle2 aria-hidden />
                {locale === "zh" ? "SSH 连接成功，已采集真实系统数据。" : "SSH connected. Real system data collected."}
              </p>
            ) : connectionProfile?.status === "ssh_failed" ? (
              <p className="connection-error">
                {locale === "zh" ? "SSH 连接失败：" : "SSH failed: "}{connectionProfile.sshError}
              </p>
            ) : connectionProfile ? (
              <p className="connection-note">{locale === "zh" ? "已保存连接档案。" : "Connection profile saved."}</p>
            ) : null}
            {connectionError ? <p className="connection-error">{connectionError}</p> : null}
            {probing ? (
              <p className="connection-note probing-note">
                {locale === "zh" ? "正在连接并采集系统信息，请稍候（最长 15 秒）…" : "Connecting and collecting system info, please wait (up to 15s)…"}
              </p>
            ) : null}
            <button className="primary-action" type="button" onClick={() => onConnect(fields, agentUrl)} disabled={probing}>
              <KeyRound aria-hidden />
              {probing ? (locale === "zh" ? "连接中…" : "Connecting…") : t.connectBtn}
            </button>
          </div>
        ) : null}
      </section>

      <section className={connected ? "hardware-row" : "hardware-row blurred"}>
        {hardware.map((item) => {
          const Icon = item.icon;
          return (
            <article className="hardware-tile" key={item.label}>
              <Icon aria-hidden />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          );
        })}
      </section>

      <div className="toolbar-row">
        <button
          className="primary-action"
          type="button"
          onClick={onScan}
          disabled={!connected || !authUser}
          title={!authUser ? (locale === "zh" ? "请先登录" : "Login required") : !connected ? (locale === "zh" ? "请先选择已连接的虚拟机" : "Select a connected VM first") : undefined}
        >
          <MonitorCog aria-hidden />
          {t.runScan}
        </button>
        <UploadSnapshotButton
          locale={locale}
          t={t}
          connected={connected}
          authUser={authUser}
          onUpload={onUploadSnapshot}
        />
        <span className="privacy-note"><Lock aria-hidden />{t.privacyNote}</span>
      </div>

      <section className={connected ? "two-panel-grid" : "two-panel-grid blurred"}>
        <InventoryPanel title={t.software} rows={softwareRows} selected={selected} onToggle={onToggle} commandLabel={t.installCommand} />
        <InventoryPanel title={t.configs} rows={configRows} selected={selected} onToggle={onToggle} commandLabel={t.packageAlias} />
      </section>
    </div>
  );
}

function UploadSnapshotButton({
  locale,
  t,
  connected,
  authUser,
  onUpload
}: {
  locale: Locale;
  t: typeof text.zh;
  connected: boolean;
  authUser: AuthUser | null;
  onUpload: (input: UploadSnapshotInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const disabled = !connected || !authUser;
  const tooltip = !authUser
    ? (locale === "zh" ? "请先登录" : "Login required")
    : !connected
    ? (locale === "zh" ? "请先选择已连接的虚拟机" : "Select a connected VM first")
    : undefined;

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onUpload({ name: name.trim() || undefined, userNotes: notes.trim() || undefined });
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setName(""); setNotes(""); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className="secondary-action"
        type="button"
        disabled={disabled}
        title={tooltip}
        onClick={() => !disabled && setOpen(true)}
      >
        <UploadCloud aria-hidden />
        {t.upload}
      </button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <section className="profile-modal">
            <header>
              <div>
                <p className="eyebrow">{locale === "zh" ? "上传运行环境快照" : "Upload VM snapshot"}</p>
                <h2>{locale === "zh" ? "保存当前虚拟机配置" : "Save current VM profile"}</h2>
              </div>
              <button className="ghost-action icon-action" type="button" onClick={() => setOpen(false)} aria-label="Close"><X aria-hidden /></button>
            </header>
            <p style={{ color: "#64748b", fontSize: 14 }}>
              {locale === "zh"
                ? "将当前连接虚拟机的完整运行环境（软件版本、系统信息等）保存为私有快照，仅自己可见，可用于换机器时还原。"
                : "Save the full environment of the connected VM as a private snapshot. Only visible to you, useful for restoring on a new machine."}
            </p>
            <div className="modal-form">
              <label>
                <span>{locale === "zh" ? "快照名称（可选）" : "Snapshot name (optional)"}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={locale === "zh" ? "留空则自动使用主机名" : "Leave blank to use hostname"} />
              </label>
              <label>
                <span>{locale === "zh" ? "备注（可选）" : "Notes (optional)"}</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={locale === "zh" ? "记录这台机器的用途、特殊配置等" : "Describe this machine's purpose or special config"} style={{ padding: "10px 12px", resize: "vertical" }} />
              </label>
            </div>
            {error ? <p className="connection-error">{error}</p> : null}
            {done ? <p className="success-note"><CheckCircle2 aria-hidden />{locale === "zh" ? "快照已保存到「我的空间」" : "Snapshot saved to My Space"}</p> : null}
            <footer style={{ display: "flex", gap: 12, justifyContent: "flex-end", borderTop: "1px solid #eef0f2", paddingTop: 16 }}>
              <button className="ghost-action" type="button" onClick={() => setOpen(false)}>{locale === "zh" ? "取消" : "Cancel"}</button>
              <button className="primary-action" type="button" onClick={() => void submit()} disabled={saving}>
                <UploadCloud aria-hidden />
                {saving ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "保存快照" : "Save snapshot")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MarketPage({
  t,
  locale,
  items,
  selected,
  kind,
  onKind,
  onOpenGuide,
  onToggle
}: {
  t: typeof text.zh;
  locale: Locale;
  items: CatalogItem[];
  selected: Set<string>;
  kind: "software" | "combo";
  onKind: (kind: "software" | "combo") => void;
  onOpenGuide: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const componentLabels = {
    software: locale === "zh" ? "软件" : "Software",
    "system-command": locale === "zh" ? "命令" : "Command",
    "system-config": locale === "zh" ? "配置" : "Config"
  };

  return (
    <div className="store-content">
      <div className="store-heading">
        <h1>{t.market}</h1>
        <div className="market-switch" aria-label={locale === "zh" ? "配置类型" : "Config type"}>
          <button className={kind === "software" ? "active" : ""} type="button" onClick={() => onKind("software")}>
            {locale === "zh" ? "软件配置" : "Software"}
          </button>
          <button className={kind === "combo" ? "active" : ""} type="button" onClick={() => onKind("combo")}>
            {locale === "zh" ? "热门组合" : "Popular bundles"}
          </button>
        </div>
      </div>

      <div className="catalog-grid">
        {items.map((item) => {
          const Icon = categoryIcons[item.category];
          const isSelected = selected.has(item.id);
          return (
            <article className="catalog-card" key={item.id}>
              <div className={`catalog-art ${item.imageTone}`}>
                <Icon aria-hidden />
                <strong>{locale === "zh" ? item.name : item.nameEn}</strong>
              </div>
              <div className="catalog-body">
                <div>
                  <h2>{locale === "zh" ? item.name : item.nameEn}</h2>
                  <p>{locale === "zh" ? item.summary : item.summaryEn}</p>
                </div>
                <div className="catalog-meta">
                  <span>{item.rating.toFixed(1)} ★</span>
                  <span>{item.installs}</span>
                  <span>{item.sensitivity}</span>
                </div>
                <ComponentPreview components={getCatalogComponents(item)} labels={componentLabels} locale={locale} compact={item.kind === "software"} />
                  <button className={isSelected ? "selected-action" : "primary-action"} type="button" onClick={() => onToggle(item.id)}>
                  <CheckCircle2 aria-hidden />
                  {isSelected ? t.selected : t.addToVm}
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onOpenGuide(item.id)}>
                    MD
                  </button>
                </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ComponentPreview({
  components,
  labels,
  locale,
  compact
}: {
  components: CatalogComponent[];
  labels: Record<CatalogComponent["type"], string>;
  locale: Locale;
  compact: boolean;
}) {
  const grouped = components.reduce<Record<CatalogComponent["type"], CatalogComponent[]>>(
    (acc, component) => {
      acc[component.type].push(component);
      return acc;
    },
    { software: [], "system-command": [], "system-config": [] }
  );

  if (compact) {
    return (
      <div className="asset-chips">
        {components.slice(0, 3).map((component) => (
          <span key={`${component.type}-${component.label}`}>{locale === "zh" ? component.label : component.labelEn}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="bundle-preview">
      {(Object.keys(grouped) as Array<CatalogComponent["type"]>).map((type) => (
        grouped[type].length ? (
          <div className={`bundle-group ${type}`} key={type}>
            <strong>{labels[type]}</strong>
            <div>
              {grouped[type].map((component) => (
                <span key={`${type}-${component.label}`}>{locale === "zh" ? component.label : component.labelEn}</span>
              ))}
            </div>
          </div>
        ) : null
      ))}
    </div>
  );
}

function getCatalogComponents(item: CatalogItem): CatalogComponent[] {
  if (Array.isArray(item.components) && item.components.length) {
    return item.components;
  }

  return item.assets.map((asset) => ({
    type: item.kind === "software" ? "software" : asset.includes("alias") || asset.includes("registry") || asset.includes("profile") ? "system-config" : "system-command",
    label: asset,
    labelEn: asset,
    detail: item.category
  }));
}

function MePage({
  t,
  locale,
  user,
  authUser,
  authToken,
  strategies,
  userProfiles,
  onLogin,
  onRegister,
  onUpdateProfile,
  onLogout,
  onProfilesChange
}: {
  t: typeof text.zh;
  locale: Locale;
  user: CurrentUser | null;
  authUser: AuthUser | null;
  authToken: string;
  strategies: MigrationStrategy[];
  userProfiles: UserProfile[];
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onRegister: (input: { name: string; email: string; password: string }) => Promise<void>;
  onUpdateProfile: (input: { name: string; defaultSshUser: string }) => Promise<void>;
  onLogout: () => void;
  onProfilesChange: (profiles: UserProfile[]) => void;
}) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const emptyForm = (): CreateProfileInput => ({
    kind: "combo",
    name: "",
    nameEn: "",
    category: "developer",
    summary: "",
    summaryEn: "",
    sensitivity: "safe",
    components: [],
    installMode: "skip-existing",
    guideMarkdown: ""
  });
  const [uploadForm, setUploadForm] = useState<CreateProfileInput>(emptyForm());
  const [componentDraft, setComponentDraft] = useState({ type: "software" as ProfileComponent["type"], label: "", labelEn: "", detail: "" });

  const authenticated = Boolean(authUser);
  const displayName = authUser?.name ?? t.guest;

  async function submitAuth(mode: "login" | "register") {
    setAuthError("");
    try {
      if (mode === "login") await onLogin({ email: authForm.email, password: authForm.password });
      else await onRegister({ name: authForm.name, email: authForm.email, password: authForm.password });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    }
  }

  function addComponent() {
    if (!componentDraft.label.trim()) return;
    setUploadForm((prev) => ({
      ...prev,
      components: [...prev.components, { ...componentDraft, label: componentDraft.label.trim(), labelEn: componentDraft.labelEn.trim() || componentDraft.label.trim() }]
    }));
    setComponentDraft({ type: "software", label: "", labelEn: "", detail: "" });
  }

  function removeComponent(index: number) {
    setUploadForm((prev) => ({ ...prev, components: prev.components.filter((_, i) => i !== index) }));
  }

  async function submitUpload() {
    setUploadError("");
    setUploadSaving(true);
    try {
      const profile = await createProfile(authToken, uploadForm);
      onProfilesChange([profile, ...userProfiles]);
      setUploadForm(emptyForm());
      setShowUploadForm(false);
      setEditingProfileId(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setUploadSaving(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      await deleteProfile(authToken, id);
      onProfilesChange(userProfiles.filter((p) => p.id !== id));
    } catch {
      // 静默处理
    }
  }

  function startEdit(profile: UserProfile) {
    setUploadForm({
      kind: profile.kind,
      name: profile.name,
      nameEn: profile.nameEn,
      category: profile.category,
      summary: profile.summary,
      summaryEn: profile.summaryEn,
      sensitivity: profile.sensitivity,
      components: profile.components,
      installMode: profile.installMode,
      guideMarkdown: profile.guideMarkdown ?? ""
    });
    setEditingProfileId(profile.id);
    setShowUploadForm(true);
  }

  const categoryOptions: Array<{ value: UserProfile["category"]; label: string; labelEn: string }> = [
    { value: "runtime", label: "运行时", labelEn: "Runtime" },
    { value: "developer", label: "开发工具", labelEn: "Developer" },
    { value: "database", label: "数据库", labelEn: "Database" },
    { value: "container", label: "容器", labelEn: "Container" },
    { value: "security", label: "安全", labelEn: "Security" },
    { value: "network", label: "网络", labelEn: "Network" },
    { value: "service", label: "服务", labelEn: "Service" }
  ];

  const sensitivityLabels: Record<UserProfile["sensitivity"], string> = {
    safe: locale === "zh" ? "安全" : "Safe",
    review: locale === "zh" ? "需审查" : "Review",
    privileged: locale === "zh" ? "需权限" : "Privileged"
  };

  const componentTypeLabels: Record<ProfileComponent["type"], string> = {
    software: locale === "zh" ? "软件" : "Software",
    "system-command": locale === "zh" ? "命令" : "Command",
    "system-config": locale === "zh" ? "配置" : "Config"
  };

  return (
    <div className="page-stack">
      {/* 顶部 hero */}
      <section className="profile-hero">
        <div className="profile-avatar">{authUser ? authUser.name.slice(0, 1).toUpperCase() : locale === "zh" ? "游" : "G"}</div>
        <div>
          <p className="eyebrow">{authenticated ? t.profile : t.guest}</p>
          <h1>{displayName}</h1>
          <p>{authenticated
            ? (locale === "zh" ? "已登录，可管理上传配置和复用自己的虚拟机配置资产。" : "Signed in. You can manage uploaded VM profiles.")
            : (locale === "zh" ? "登录后可以管理个人资料、上传配置和复用自己的虚拟机配置资产。" : "Login to manage your profile, uploaded configs, and reusable VM assets.")}
          </p>
        </div>
        <div className="profile-actions">
          {authenticated ? (
            <>
              <button className="primary-action" type="button" onClick={() => setEditingProfile(true)}><Edit3 aria-hidden />{t.editProfile}</button>
              <button className="ghost-action" type="button" onClick={onLogout}><LogOut aria-hidden />{t.logout}</button>
            </>
          ) : (
            <>
              <button className={authMode === "login" ? "primary-action" : "secondary-action"} type="button" onClick={() => setAuthMode("login")}><LogIn aria-hidden />{t.login}</button>
              <button className={authMode === "register" ? "primary-action" : "secondary-action"} type="button" onClick={() => setAuthMode("register")}><UserRound aria-hidden />{t.register}</button>
            </>
          )}
        </div>
      </section>

      {/* 登录/注册表单 */}
      {!authenticated ? (
        <section className="panel-large auth-panel">
          <div className="panel-heading">
            <h2>{authMode === "login" ? t.login : t.register}</h2>
            <span>{locale === "zh" ? "本地账户" : "Local account"}</span>
          </div>
          <div className="form-grid">
            {authMode === "register" ? (
              <input placeholder={locale === "zh" ? "昵称" : "Display name"} value={authForm.name} onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))} />
            ) : null}
            <input placeholder={locale === "zh" ? "邮箱" : "Email"} value={authForm.email} onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} />
            <input placeholder={locale === "zh" ? "密码（至少 8 位）" : "Password (at least 8 characters)"} type="password" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} />
            <button className="primary-action" type="button" onClick={() => void submitAuth(authMode)}>
              {authMode === "login" ? <LogIn aria-hidden /> : <UserRound aria-hidden />}
              {authMode === "login" ? t.login : t.register}
            </button>
          </div>
          {authError ? <p className="connection-error">{authError}</p> : null}
        </section>
      ) : null}

      {/* 我上传的配置组合 */}
      {authenticated ? (
        <section className="panel-large">
          <div className="panel-heading">
            <h2>{t.uploads}</h2>
            <button className="primary-action" type="button" onClick={() => { setShowUploadForm((v) => !v); setEditingProfileId(null); setUploadForm(emptyForm()); }}>
              <UploadCloud aria-hidden />
              {showUploadForm ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "上传配置组合" : "Upload profile")}
            </button>
          </div>

          {/* 上传/编辑表单 */}
          {showUploadForm ? (
            <div className="upload-form">
              <div className="upload-form-grid">
                <label>
                  <span>{locale === "zh" ? "名称（中文）" : "Name (Chinese)"}</span>
                  <input value={uploadForm.name} onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))} placeholder={locale === "zh" ? "例：Node.js 开发环境" : "e.g. Node.js dev env"} />
                </label>
                <label>
                  <span>{locale === "zh" ? "名称（英文）" : "Name (English)"}</span>
                  <input value={uploadForm.nameEn} onChange={(e) => setUploadForm((p) => ({ ...p, nameEn: e.target.value }))} placeholder="e.g. Node.js dev env" />
                </label>
                <label>
                  <span>{locale === "zh" ? "类型" : "Kind"}</span>
                  <select value={uploadForm.kind} onChange={(e) => setUploadForm((p) => ({ ...p, kind: e.target.value as "software" | "combo" | "vm-snapshot" }))}>
                    <option value="combo">{locale === "zh" ? "热门组合" : "Combo"}</option>
                    {authUser?.role === "admin" ? (
                      <option value="software">{locale === "zh" ? "软件配置" : "Software"}</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  <span>{locale === "zh" ? "分类" : "Category"}</span>
                  <select value={uploadForm.category} onChange={(e) => setUploadForm((p) => ({ ...p, category: e.target.value as UserProfile["category"] }))}>
                    {categoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{locale === "zh" ? opt.label : opt.labelEn}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{locale === "zh" ? "敏感度" : "Sensitivity"}</span>
                  <select value={uploadForm.sensitivity} onChange={(e) => setUploadForm((p) => ({ ...p, sensitivity: e.target.value as UserProfile["sensitivity"] }))}>
                    <option value="safe">{sensitivityLabels.safe}</option>
                    <option value="review">{sensitivityLabels.review}</option>
                    <option value="privileged">{sensitivityLabels.privileged}</option>
                  </select>
                </label>
                <label>
                  <span>{locale === "zh" ? "安装模式" : "Install mode"}</span>
                  <select value={uploadForm.installMode} onChange={(e) => setUploadForm((p) => ({ ...p, installMode: e.target.value as UserProfile["installMode"] }))}>
                    <option value="skip-existing">{locale === "zh" ? "跳过已有" : "Skip existing"}</option>
                    <option value="replace-existing">{locale === "zh" ? "覆盖已有" : "Replace existing"}</option>
                  </select>
                </label>
              </div>

              <label className="upload-full-label">
                <span>{locale === "zh" ? "简介（中文）" : "Summary (Chinese)"}</span>
                <textarea value={uploadForm.summary} onChange={(e) => setUploadForm((p) => ({ ...p, summary: e.target.value }))} rows={2} placeholder={locale === "zh" ? "一句话描述这个配置组合的用途" : "One-line description"} />
              </label>
              <label className="upload-full-label">
                <span>{locale === "zh" ? "简介（英文）" : "Summary (English)"}</span>
                <textarea value={uploadForm.summaryEn} onChange={(e) => setUploadForm((p) => ({ ...p, summaryEn: e.target.value }))} rows={2} placeholder="One-line description in English" />
              </label>

              {/* 组件列表 */}
              <div className="upload-components">
                <p className="upload-section-label">{locale === "zh" ? "组件列表" : "Components"}</p>
                {uploadForm.components.length > 0 ? (
                  <div className="component-list">
                    {uploadForm.components.map((comp, i) => (
                      <div className="component-row" key={i}>
                        <span className={`comp-type-badge ${comp.type}`}>{componentTypeLabels[comp.type]}</span>
                        <span>{comp.label}</span>
                        {comp.detail ? <span className="comp-detail">{comp.detail}</span> : null}
                        <button type="button" className="ghost-action icon-action" onClick={() => removeComponent(i)} aria-label="Remove"><X aria-hidden /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="component-draft">
                  <select value={componentDraft.type} onChange={(e) => setComponentDraft((p) => ({ ...p, type: e.target.value as ProfileComponent["type"] }))}>
                    <option value="software">{componentTypeLabels.software}</option>
                    <option value="system-command">{componentTypeLabels["system-command"]}</option>
                    <option value="system-config">{componentTypeLabels["system-config"]}</option>
                  </select>
                  <input value={componentDraft.label} onChange={(e) => setComponentDraft((p) => ({ ...p, label: e.target.value }))} placeholder={locale === "zh" ? "标签（中文）" : "Label"} />
                  <input value={componentDraft.labelEn} onChange={(e) => setComponentDraft((p) => ({ ...p, labelEn: e.target.value }))} placeholder="Label (EN)" />
                  <input value={componentDraft.detail} onChange={(e) => setComponentDraft((p) => ({ ...p, detail: e.target.value }))} placeholder={locale === "zh" ? "详情" : "Detail"} />
                  <button type="button" className="secondary-action" onClick={addComponent}>{locale === "zh" ? "+ 添加" : "+ Add"}</button>
                </div>
              </div>

              {/* Markdown 说明 */}
              <label className="upload-full-label">
                <span>{locale === "zh" ? "使用说明（Markdown，可选）" : "Guide (Markdown, optional)"}</span>
                <textarea value={uploadForm.guideMarkdown} onChange={(e) => setUploadForm((p) => ({ ...p, guideMarkdown: e.target.value }))} rows={6} placeholder={locale === "zh" ? "## 安装步骤\n\n```bash\nnpm install ...\n```" : "## Installation\n\n```bash\nnpm install ...\n```"} className="code-textarea" />
              </label>

              {uploadError ? <p className="connection-error">{uploadError}</p> : null}
              <div className="upload-actions">
                <button className="primary-action" type="button" onClick={() => void submitUpload()} disabled={uploadSaving}>
                  <UploadCloud aria-hidden />
                  {uploadSaving ? (locale === "zh" ? "保存中…" : "Saving…") : (editingProfileId ? (locale === "zh" ? "保存修改" : "Save changes") : (locale === "zh" ? "发布配置组合" : "Publish profile"))}
                </button>
                <button className="ghost-action" type="button" onClick={() => { setShowUploadForm(false); setUploadForm(emptyForm()); setEditingProfileId(null); }}>
                  {locale === "zh" ? "取消" : "Cancel"}
                </button>
              </div>
            </div>
          ) : null}

          {/* 已上传的配置组合列表 */}
          <div className="profile-list">
            {userProfiles.length === 0 ? (
              <p className="empty-hint">{locale === "zh" ? "还没有上传任何配置组合。" : "No profiles uploaded yet."}</p>
            ) : userProfiles.map((profile) => (
              <article className="profile-row" key={profile.id}>
                <div>
                  <strong>{locale === "zh" ? profile.name : profile.nameEn}</strong>
                  <span>
                    {locale === "zh"
                      ? categoryOptions.find((c) => c.value === profile.category)?.label
                      : categoryOptions.find((c) => c.value === profile.category)?.labelEn}
                    {" · "}
                    {profile.kind === "vm-snapshot"
                      ? (locale === "zh" ? "🔒 私有快照" : "🔒 Private snapshot")
                      : profile.kind === "combo"
                      ? (locale === "zh" ? "热门组合" : "Combo")
                      : (locale === "zh" ? "软件配置" : "Software")}
                    {" · "}{sensitivityLabels[profile.sensitivity]}
                    {" · "}{profile.components.length} {locale === "zh" ? "个组件" : "components"}
                    {" · "}{new Date(profile.updatedAt).toLocaleDateString()}
                  </span>
                  {profile.summary ? <span className="profile-summary">{locale === "zh" ? profile.summary : profile.summaryEn}</span> : null}
                </div>
                <div className="profile-row-actions">
                  <button className="secondary-action" type="button" onClick={() => startEdit(profile)}><Edit3 aria-hidden />{locale === "zh" ? "编辑" : "Edit"}</button>
                  <button className="ghost-action" type="button" onClick={() => void handleDeleteProfile(profile.id)}><X aria-hidden />{locale === "zh" ? "删除" : "Delete"}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* 迁移方法 */}
      <section className="panel-large">
        <div className="panel-heading">
          <h2>{locale === "zh" ? "完整迁移方法" : "Full migration methods"}</h2>
          <span>{strategies.length}</span>
        </div>
        <div className="profile-list">
          {strategies.map((strategy) => (
            <article className="profile-row" key={strategy.id}>
              <div>
                <strong>{strategy.name}</strong>
                <span>{strategy.source} · {strategy.useCase}</span>
              </div>
              <button className="secondary-action" type="button">skip / replace</button>
            </article>
          ))}
        </div>
      </section>

      {/* 个人信息只读展示 */}
      {authenticated ? (
        <section className="panel-large profile-locked">
          <div className="panel-heading">
            <h2>{t.profile}</h2>
            <Lock aria-hidden />
          </div>
          <div className="readonly-profile">
            <InfoPair label={locale === "zh" ? "昵称" : "Display name"} value={displayName} />
            <InfoPair label={locale === "zh" ? "邮箱" : "Email"} value={authUser?.email ?? ""} />
            <InfoPair label={locale === "zh" ? "默认 SSH 用户名" : "Default SSH user"} value={authUser?.defaultSshUser ?? "ubuntu"} />
            <InfoPair label={locale === "zh" ? "资料可见性" : "Profile visibility"} value={locale === "zh" ? "仅自己可见" : "Private"} />
          </div>
        </section>
      ) : null}

      {editingProfile && authUser ? (
        <ProfileEditModal
          user={authUser}
          locale={locale}
          onClose={() => setEditingProfile(false)}
          onSave={async (input) => { await onUpdateProfile(input); setEditingProfile(false); }}
        />
      ) : null}
    </div>
  );
}

function ProfileEditModal({
  user,
  locale,
  onClose,
  onSave
}: {
  user: AuthUser;
  locale: Locale;
  onClose: () => void;
  onSave: (input: { name: string; defaultSshUser: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: user.name,
    defaultSshUser: user.defaultSshUser ?? "ubuntu"
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <section className="profile-modal">
        <header>
          <div>
            <p className="eyebrow">{locale === "zh" ? "账户设置" : "Account settings"}</p>
            <h2>{locale === "zh" ? "编辑资料" : "Edit profile"}</h2>
          </div>
          <button className="ghost-action icon-action" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>
        <div className="profile-edit-summary">
          <div className="profile-avatar small">{(form.name || user.name).slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{form.name || user.name}</strong>
            <span>{user.email}</span>
          </div>
        </div>
        <div className="modal-form">
          <label>
            <span>{locale === "zh" ? "昵称" : "Display name"}</span>
            <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} />
          </label>
          <label>
            <span>{locale === "zh" ? "邮箱（暂不可在此修改）" : "Email (read-only here)"}</span>
            <input value={user.email} disabled />
          </label>
          <label>
            <span>{locale === "zh" ? "默认 SSH 用户名" : "Default SSH username"}</span>
            <input value={form.defaultSshUser} onChange={(event) => setForm((previous) => ({ ...previous, defaultSshUser: event.target.value }))} />
          </label>
        </div>
        {error ? <p className="connection-error">{error}</p> : null}
        <footer>
          <button className="secondary-action" type="button" onClick={onClose}>{locale === "zh" ? "取消" : "Cancel"}</button>
          <button className="primary-action" type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? (locale === "zh" ? "保存中" : "Saving") : (locale === "zh" ? "保存修改" : "Save changes")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function InventoryPanel({
  title,
  rows,
  selected,
  onToggle,
  commandLabel
}: {
  title: string;
  rows: Array<{ id: string; icon: LucideIcon; name: string; value: string; command: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  commandLabel: string;
}) {
  return (
    <section className="panel-large">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{rows.length}</span>
      </div>
      <div className="inventory-list">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <label className="inventory-item detailed" key={row.id}>
              <input checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" />
              <Icon aria-hidden />
              <span>
                <strong>{row.name}</strong>
                <small>{row.value}</small>
                <code>{commandLabel}: {row.command}</code>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-pair">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MarkdownOverlay({ guide, locale, onClose }: { guide: CatalogGuide; locale: Locale; onClose: () => void }) {
  return (
    <div className="markdown-overlay" role="dialog" aria-modal="true">
      <article className="markdown-reader">
        <header>
          <div>
            <p className="eyebrow">{guide.item.guideAuthor === "admin" ? "Admin MD" : "User MD"}</p>
            <h2>{locale === "zh" ? guide.item.name : guide.item.nameEn}</h2>
          </div>
          <button className="ghost-action icon-action" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>
        <section className="markdown-preview">
          <div className="markdown-meta">
            <span>{guide.item.installMode}</span>
            <span>{guide.item.sensitivity}</span>
            <span>{guide.item.guideAuthor === "admin" ? "admin guide" : "user guide"}</span>
          </div>
          {renderMarkdownPreview(guide.markdown)}
        </section>
      </article>
    </div>
  );
}

function renderMarkdownPreview(markdown: string): React.ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  function flushList() {
    if (!list.length) return;
    const items = list;
    list = [];
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
      </ul>
    );
  }

  function flushCode() {
    if (!code.length) return;
    const content = code.join("\n");
    code = [];
    nodes.push(<pre key={`code-${nodes.length}`}><code>{content}</code></pre>);
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      if (level === 1) nodes.push(<h1 key={`h-${nodes.length}`}>{content}</h1>);
      else if (level === 2) nodes.push(<h2 key={`h-${nodes.length}`}>{content}</h2>);
      else nodes.push(<h3 key={`h-${nodes.length}`}>{content}</h3>);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    nodes.push(<p key={`p-${nodes.length}`}>{line}</p>);
  }

  flushList();
  flushCode();
  return nodes;
}

createRoot(document.getElementById("root")!).render(<App />);
