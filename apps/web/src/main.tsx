import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Languages, Search } from "lucide-react";
import {
  connectServer,
  deleteConnection,
  fetchCatalog,
  fetchCatalogGuide,
  fetchConnections,
  fetchCurrentUser,
  fetchMigrationStrategies,
  fetchProfiles,
  loginAccount,
  registerAccount,
  reprobeConnection,
  updateConnection,
  updateProfile,
  uploadVmSnapshot,
  fetchSshKeys,
  type AgentProbeResult,
  type AuthUser,
  type CatalogGuide,
  type CatalogItem,
  type ConnectionProfile,
  type CurrentUser,
  type ExecutionTask,
  type MigrationStrategy,
  type SshKeyMeta,
  type UserProfile
} from "./api";
import { text, navItems, type Locale, type Page } from "./lib/types";
import { MachinePage } from "./pages/MachinePage";
import { MarketPage } from "./pages/MarketPage";
import { MePage } from "./pages/MePage";
import { PlaybookPage } from "./pages/PlaybookPage";
import { SettingsPage } from "./pages/SettingsPage";
import { fetchPlaybooks, type StoredPlaybook } from "./api";
import { TerminalPanel } from "./components/TerminalPanel";
import { MarkdownOverlay } from "./components/MarkdownOverlay";
import { OnboardingWizard } from "./components/OnboardingWizard";
import "./styles.css";

type ConnectionMethod = "ssh-password" | "ssh-key";

function App() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [page, setPage] = useState<Page>("machine");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [userPlaybooks, setUserPlaybooks] = useState<StoredPlaybook[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [strategies, setStrategies] = useState<MigrationStrategy[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [guide, setGuide] = useState<CatalogGuide | null>(null);
  const [query, setQuery] = useState("");
  const [catalogKind, setCatalogKind] = useState<"software" | "combo">("software");
  const [connected, setConnected] = useState(false);
  const [method, setMethod] = useState<ConnectionMethod>("ssh-password");
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem("envforge_user");
      return saved ? JSON.parse(saved) as AuthUser : null;
    } catch { return null; }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("envforge_token") ?? "");
  const [sshKeys, setSshKeys] = useState<SshKeyMeta[]>([]);
  const [connectionProfile, setConnectionProfile] = useState<ConnectionProfile | null>(null);
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [probeResult, setProbeResult] = useState<AgentProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [activeTask, setActiveTask] = useState<ExecutionTask | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<Array<{ time: string; type: "info" | "success" | "error" | "cmd"; text: string }>>([]);
  const t = text[locale];

  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? connectionProfile ?? null;
  const activeProbe = (activeConnection?.probeSnapshot as AgentProbeResult | undefined) ?? probeResult;

  function pushLog(type: "info" | "success" | "error" | "cmd", text: string) {
    setTerminalLogs((prev) => [...prev.slice(-200), { time: new Date().toLocaleTimeString(), type, text }]);
  }

  useEffect(() => {
    void load();
    // Validate persisted session on startup
    if (authToken) {
      fetch("/api/auth/session", { headers: { Authorization: `Bearer ${authToken}` } })
        .then((res) => {
          if (!res.ok) {
            // Token expired or invalid — clear session
            setAuthToken("");
            setAuthUser(null);
            localStorage.removeItem("envforge_token");
            localStorage.removeItem("envforge_user");
          }
        })
        .catch(() => { /* offline, keep local state */ });
    }
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
    if (token) {
      void fetchPlaybooks(token).then(setUserPlaybooks).catch(() => setUserPlaybooks([]));
    }

    const activeToken = token ?? authToken;
    if (activeToken) {
      const [conns, profs, keys] = await Promise.all([
        fetchConnections(activeToken).catch(() => [] as ConnectionProfile[]),
        fetchProfiles(activeToken).catch(() => [] as UserProfile[]),
        fetchSshKeys(activeToken).catch(() => [] as SshKeyMeta[])
      ]);
      setConnections(conns);
      setUserProfiles(profs);
      setSshKeys(keys);
      // Don't auto-connect — user should manually select which connection to activate
    }
  }

  async function handleScan() {
    // "扫描虚拟机" = reprobe the active connection to get fresh data
    if (!authToken || !activeConnectionId) return;
    pushLog("cmd", `ssh reprobe → ${activeConnectionId}`);
    pushLog("info", locale === "zh" ? "正在通过 SSH 重新采集系统信息…" : "Re-collecting system info via SSH…");
    try {
      const updated = await reprobeConnection(authToken, activeConnectionId);
      setConnections((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      if (updated.probeSnapshot) {
        setProbeResult(updated.probeSnapshot as AgentProbeResult);
        const sw = updated.probeSnapshot.software?.length ?? 0;
        pushLog("success", locale === "zh"
          ? `采集完成：${sw} 个软件包，时间 ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`
          : `Collection done: ${sw} packages at ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`);
      } else {
        pushLog("error", locale === "zh" ? "采集失败：未获取到数据" : "Collection failed: no data returned");
      }
    } catch (err) {
      pushLog("error", err instanceof Error ? err.message : "Scan failed");
    }
  }

  async function handleConnect(fields: Record<string, string>, agentUrl: string) {
    setConnectionError("");
    setProbing(true);
    if (!authToken) {
      setConnectionError(locale === "zh" ? "请先登录后再保存服务器连接。" : "Please login before saving a server connection.");
      setProbing(false);
      return;
    }

    const host = fields.host || "unknown";
    const port = fields.port || "22";
    const user = fields.username || "root";
    pushLog("cmd", `ssh ${user}@${host}:${port}`);
    pushLog("info", locale === "zh" ? `正在建立 SSH 连接到 ${host}:${port}…` : `Connecting via SSH to ${host}:${port}…`);

    try {
      const result = await connectServer({
        token: authToken,
        method,
        label: fields.host || fields.contextName || method,
        fields: Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "_keyId")),
        keyId: fields._keyId || undefined
      });
      setConnectionProfile(result.connection);
      setActiveConnectionId(result.connection.id);
      setConnected(true);
      if (result.probe) {
        setProbeResult(result.probe as AgentProbeResult);
        const sw = result.probe.software?.length ?? 0;
        pushLog("success", locale === "zh"
          ? `SSH 连接成功！已采集 ${sw} 个软件包。`
          : `SSH connected! Collected ${sw} packages.`);
        pushLog("info", `hostname: ${result.probe.system.hostname}, OS: ${result.probe.system.platform} ${result.probe.system.arch}`);
      } else if (result.connection.status === "ssh_failed") {
        pushLog("error", `SSH failed: ${result.connection.sshError ?? "unknown error"}`);
      } else {
        pushLog("info", locale === "zh" ? "连接已保存（未采集数据）" : "Connection saved (no data collected)");
      }
      const conns = await fetchConnections(authToken).catch(() => connections);
      setConnections(conns);
    } catch (error) {
      setConnected(false);
      const msg = error instanceof Error ? error.message : "Connection failed";
      setConnectionError(msg);
      pushLog("error", msg);
    } finally {
      setProbing(false);
    }
  }

  async function handleReprobe(connectionId: string) {
    if (!authToken) return;
    const conn = connections.find((c) => c.id === connectionId);
    const host = conn?.fields?.host ?? "unknown";
    pushLog("cmd", `ssh reprobe → ${host}`);
    pushLog("info", locale === "zh" ? `正在重新采集 ${host} 的系统信息…` : `Re-probing ${host}…`);
    setProbing(true);
    try {
      const updated = await reprobeConnection(authToken, connectionId);
      setConnections((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      if (updated.probeSnapshot) {
        setProbeResult(updated.probeSnapshot as AgentProbeResult);
        const sw = updated.probeSnapshot.software?.length ?? 0;
        pushLog("success", locale === "zh"
          ? `采集完成：${sw} 个软件包，时间 ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`
          : `Done: ${sw} packages at ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`);
      } else {
        pushLog("error", updated.sshError ?? (locale === "zh" ? "采集失败" : "Probe failed"));
      }
    } catch (err) {
      pushLog("error", err instanceof Error ? err.message : "Reprobe failed");
    } finally {
      setProbing(false);
    }
  }

  async function handleDeleteConnection(id: string) {
    if (!authToken) return;
    try {
      await deleteConnection(authToken, id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (activeConnectionId === id) {
        setActiveConnectionId(null);
        setConnected(false);
        setProbeResult(null);
        setConnectionProfile(null);
      }
    } catch { /* silent */ }
  }

  async function handleUpdateConnection(id: string, input: { label?: string; agentUrl?: string }) {
    if (!authToken) return;
    try {
      const updated = await updateConnection(authToken, id, input);
      setConnections((prev) => prev.map((c) => c.id === id ? updated : c));
    } catch { /* silent */ }
  }

  function handleAuthSuccess(result: { token: string; user: AuthUser }) {
    setAuthToken(result.token);
    setAuthUser(result.user);
    setShowOnboarding(localStorage.getItem("envforge_onboarded") !== "1");
    localStorage.setItem("envforge_token", result.token);
    localStorage.setItem("envforge_user", JSON.stringify(result.user));
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
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
              <p className="eyebrow">{page === "machine" ? t.connection : page === "playbooks" ? "IaC" : t.me}</p>
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
              if (conn?.probeSnapshot) {
                setProbeResult(conn.probeSnapshot as AgentProbeResult);
                setConnected(true);
                pushLog("info", locale === "zh"
                  ? `已选择连接：${conn.label} (${conn.fields.host})`
                  : `Selected: ${conn.label} (${conn.fields.host})`);
              } else {
                // Connection exists but no probe data — need to reprobe
                setConnected(true);
                setProbeResult(null);
                pushLog("info", locale === "zh"
                  ? `已选择连接：${conn?.label ?? id}（无缓存数据，请点击重新采集）`
                  : `Selected: ${conn?.label ?? id} (no cached data, click reprobe)`);
              }
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
            authToken={authToken}
            sshKeys={sshKeys}
            onSshKeysChange={setSshKeys}
            onDeleteConnection={handleDeleteConnection}
            onUpdateConnection={handleUpdateConnection}
            pushLog={pushLog}
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
            authToken={authToken}
            activeConnectionId={activeConnectionId}
            activeTask={activeTask}
            onTaskUpdate={setActiveTask}
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
              localStorage.removeItem("envforge_token");
              localStorage.removeItem("envforge_user");
            }}
            onProfilesChange={(profiles) => setUserProfiles(profiles)}
            activeConnectionId={activeConnectionId}
          />
        ) : null}

        {page === "playbooks" ? (
          <PlaybookPage
            locale={locale}
            authToken={authToken}
            connections={connections}
            activeTask={activeTask}
            onTaskUpdate={setActiveTask}
          />
        ) : null}

        {page === "settings" && authUser && authToken ? (
          <SettingsPage
            locale={locale}
            authToken={authToken}
            connections={connections}
            playbooks={userPlaybooks}
            catalog={catalog}
            isAdmin={authUser.role === "admin"}
          />
        ) : page === "settings" ? (
          <p className="empty-hint">{locale === "zh" ? "请先登录以使用高级设置。" : "Login to access settings."}</p>
        ) : null}

        {guide ? <MarkdownOverlay guide={guide} locale={locale} onClose={() => setGuide(null)} /> : null}
        {showOnboarding ? <OnboardingWizard locale={locale} onClose={() => setShowOnboarding(false)} /> : null}
      </section>

      {connected ? (
        <TerminalPanel
          locale={locale}
          activeTask={activeTask}
          activeConnection={activeConnection}
          terminalLogs={terminalLogs}
          onClose={() => setActiveTask(null)}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
