/**
 * SettingsPage — consolidated panel for power-user features:
 *   - Schedules (cron Playbook)
 *   - Webhooks (Slack/Discord/custom)
 *   - API tokens (CI/CD)
 *   - Module docs (engine reference)
 *   - Drift detection (set baseline / check drift per connection)
 */
import React, { useEffect, useState } from "react";
import {
  fetchSchedules, createSchedule, updateSchedule, deleteSchedule,
  fetchWebhooks, createWebhook, deleteWebhook, testWebhook,
  fetchApiTokens, createApiToken, deleteApiToken,
  fetchModuleDocs,
  setDriftBaseline, runDriftCheck,
  type Schedule, type Webhook, type ApiTokenInfo, type ModuleDoc, type DriftReport,
  type ConnectionProfile, type StoredPlaybook, type CatalogItem
} from "../api";
import type { Locale } from "../lib/types";
import { CatalogAdminPanel } from "../components/CatalogAdminPanel";
import { AccountPanel } from "../components/AccountPanel";
import { AdminPanel } from "../components/AdminPanel";

type Tab = "schedules" | "webhooks" | "tokens" | "modules" | "drift" | "catalog" | "account" | "admin";

export function SettingsPage({
  locale,
  authToken,
  connections,
  playbooks,
  catalog,
  isAdmin
}: {
  locale: Locale;
  authToken: string;
  connections: ConnectionProfile[];
  playbooks: StoredPlaybook[];
  catalog: CatalogItem[];
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("account");

  return (
    <div className="settings-page">
      <header className="settings-header">
        <p className="eyebrow">Power user</p>
        <h1>{locale === "zh" ? "高级设置" : "Settings"}</h1>
        <p className="settings-sub">
          {locale === "zh"
            ? "定时任务、漂移检测、Webhook 通知和 API Token 等高级功能。"
            : "Schedules, drift detection, webhook notifications, and API tokens."}
        </p>
      </header>
      <nav className="settings-tabs">
        <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")} type="button">
          👤 {locale === "zh" ? "账号安全" : "Account"}
        </button>
        <button className={tab === "schedules" ? "active" : ""} onClick={() => setTab("schedules")} type="button">
          🕐 {locale === "zh" ? "定时任务" : "Schedules"}
        </button>
        <button className={tab === "drift" ? "active" : ""} onClick={() => setTab("drift")} type="button">
          🔍 {locale === "zh" ? "漂移检测" : "Drift"}
        </button>
        <button className={tab === "webhooks" ? "active" : ""} onClick={() => setTab("webhooks")} type="button">
          🪝 Webhooks
        </button>
        <button className={tab === "tokens" ? "active" : ""} onClick={() => setTab("tokens")} type="button">
          🔑 API tokens
        </button>
        <button className={tab === "modules" ? "active" : ""} onClick={() => setTab("modules")} type="button">
          📚 {locale === "zh" ? "模块文档" : "Module docs"}
        </button>
        {isAdmin && (
          <>
            <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")} type="button">
              🛡️ {locale === "zh" ? "配置市场（管理员）" : "Catalog (admin)"}
            </button>
            <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")} type="button">
              🛡️ {locale === "zh" ? "用户与队列（管理员）" : "Users & Queues (admin)"}
            </button>
          </>
        )}
      </nav>
      <div className="settings-body">
        {tab === "account" && (
          <AccountPanel locale={locale} authToken={authToken} />
        )}        {tab === "schedules" && (
          <SchedulesPanel locale={locale} authToken={authToken} connections={connections} playbooks={playbooks} catalog={catalog} />
        )}
        {tab === "drift" && (
          <DriftPanel locale={locale} authToken={authToken} connections={connections} />
        )}
        {tab === "webhooks" && (
          <WebhooksPanel locale={locale} authToken={authToken} />
        )}
        {tab === "tokens" && (
          <TokensPanel locale={locale} authToken={authToken} />
        )}
        {tab === "modules" && (
          <ModuleDocsPanel locale={locale} />
        )}
        {tab === "catalog" && isAdmin && (
          <CatalogAdminPanel locale={locale} authToken={authToken} />
        )}
        {tab === "admin" && isAdmin && (
          <AdminPanel locale={locale} authToken={authToken} connections={connections} />
        )}
      </div>
    </div>
  );
}

function SchedulesPanel({
  locale, authToken, connections, playbooks, catalog
}: {
  locale: Locale; authToken: string;
  connections: ConnectionProfile[]; playbooks: StoredPlaybook[]; catalog: CatalogItem[];
}) {
  const [list, setList] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    setLoading(true); setError("");
    try { setList(await fetchSchedules(authToken)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, [authToken]);

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h3>{locale === "zh" ? "定时任务" : "Scheduled Playbooks"}</h3>
        <button className="primary-action" type="button" onClick={() => setShowForm(true)} style={{ fontSize: 13 }}>
          + {locale === "zh" ? "新建" : "New"}
        </button>
      </div>
      {error && <p className="settings-error">{error}</p>}
      {loading ? <p className="empty-hint"><span className="spinning">↻</span></p> : list.length === 0 ? (
        <p className="empty-hint">
          {locale === "zh"
            ? "还没有定时任务。点「新建」创建一个，例如每天凌晨 3 点跑安全审计 Playbook。"
            : "No schedules yet. Create one - e.g. run a security audit Playbook every day at 03:00 UTC."}
        </p>
      ) : (
        <ul className="settings-list">
          {list.map((s) => (
            <li key={s.id} className="settings-row">
              <div className="settings-row-main">
                <strong>{s.name}</strong>
                <span className="settings-row-meta">
                  <code>{s.cron}</code>
                  {" · "}{s.connectionIds.length > 0 ? `${s.connectionIds.length} ${locale === "zh" ? "目标" : "targets"}` : `tags: ${s.tags.join(",") || "all"}`}
                  {" · "}{s.dryRun ? "dry-run" : "apply"}
                  {s.nextRunAt ? ` · next: ${new Date(s.nextRunAt).toLocaleString()}` : ""}
                </span>
              </div>
              <div className="settings-row-actions">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={async () => {
                      await updateSchedule(authToken, s.id, { enabled: !s.enabled });
                      void reload();
                    }}
                  />
                  {locale === "zh" ? "启用" : "Enabled"}
                </label>
                <button type="button" className="conn-btn conn-btn-danger" onClick={async () => {
                  if (!confirm(locale === "zh" ? "删除该定时任务？" : "Delete this schedule?")) return;
                  await deleteSchedule(authToken, s.id);
                  void reload();
                }}>{locale === "zh" ? "删除" : "Delete"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {showForm && (
        <ScheduleForm
          locale={locale}
          connections={connections}
          playbooks={playbooks}
          catalog={catalog}
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            await createSchedule(authToken, input);
            setShowForm(false);
            void reload();
          }}
        />
      )}
    </section>
  );
}

function ScheduleForm({
  locale, connections, playbooks, catalog, onCancel, onSubmit
}: {
  locale: Locale;
  connections: ConnectionProfile[];
  playbooks: StoredPlaybook[];
  catalog: CatalogItem[];
  onCancel: () => void;
  onSubmit: (input: Partial<Schedule>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 3 * * *");
  const [source, setSource] = useState<"playbook" | "catalog">("playbook");
  const [playbookId, setPlaybookId] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <section className="profile-modal" style={{ maxWidth: 580 }}>
        <header>
          <div>
            <p className="eyebrow">{locale === "zh" ? "定时任务" : "Schedule"}</p>
            <h2>{locale === "zh" ? "新建定时任务" : "New schedule"}</h2>
          </div>
          <button type="button" className="ghost-action icon-action" onClick={onCancel}>×</button>
        </header>
        <div className="upload-form">
          <label>
            <span>{locale === "zh" ? "名称" : "Name"}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={locale === "zh" ? "例如：每晚备份" : "e.g. nightly backup"} />
          </label>
          <label>
            <span>{locale === "zh" ? "Cron 表达式（UTC）" : "Cron (UTC)"}</span>
            <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 3 * * *" />
            <small style={{ color: "#64748b", fontSize: 11 }}>
              {locale === "zh"
                ? "5 字段：分 时 日 月 周。例：0 3 * * * 每天 UTC 03:00；*/15 * * * * 每 15 分钟"
                : "5 fields: m h dom mon dow. e.g. 0 3 * * * = daily 03:00 UTC; */15 * * * * = every 15 min"}
            </small>
          </label>
          <label>
            <span>{locale === "zh" ? "执行源" : "Source"}</span>
            <select value={source} onChange={(e) => setSource(e.target.value as "playbook" | "catalog")}>
              <option value="playbook">{locale === "zh" ? "我的 Playbook" : "My Playbook"}</option>
              <option value="catalog">{locale === "zh" ? "配置市场" : "Catalog item"}</option>
            </select>
          </label>
          {source === "playbook" ? (
            <label>
              <span>Playbook</span>
              <select value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
                <option value="">— {locale === "zh" ? "请选择" : "select"} —</option>
                {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : (
            <label>
              <span>Catalog</span>
              <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
                <option value="">— {locale === "zh" ? "请选择" : "select"} —</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label>
            <span>{locale === "zh" ? "目标 VM（多选）" : "Target VMs (multi-select)"}</span>
            <select multiple value={connectionIds} onChange={(e) => setConnectionIds(Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ height: 120 }}>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="toggle-label">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            {locale === "zh" ? "Dry-run（不实际修改）" : "Dry-run (no real changes)"}
          </label>
          {err && <p className="settings-error">{err}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="ghost-action" onClick={onCancel}>{locale === "zh" ? "取消" : "Cancel"}</button>
            <button
              type="button"
              className="primary-action"
              disabled={submitting}
              onClick={async () => {
                setErr("");
                if (!name.trim()) { setErr(locale === "zh" ? "请填写名称" : "Name required"); return; }
                if (source === "playbook" && !playbookId) { setErr(locale === "zh" ? "请选择 Playbook" : "Pick a playbook"); return; }
                if (source === "catalog" && !catalogId) { setErr(locale === "zh" ? "请选择 Catalog" : "Pick a catalog item"); return; }
                setSubmitting(true);
                try {
                  await onSubmit({
                    name,
                    cron,
                    playbookId: source === "playbook" ? playbookId : undefined,
                    catalogId: source === "catalog" ? catalogId : undefined,
                    connectionIds,
                    tags: [],
                    dryRun,
                    enabled: true
                  });
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Failed");
                } finally {
                  setSubmitting(false);
                }
              }}
            >{locale === "zh" ? "创建" : "Create"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DriftPanel({ locale, authToken, connections }: { locale: Locale; authToken: string; connections: ConnectionProfile[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DriftReport | null>(null);
  const [error, setError] = useState("");

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "漂移检测" : "Drift detection"}</h3>
      <p className="settings-help">
        {locale === "zh"
          ? "在一台 VM 上设置基线后，可以随时（或通过定时任务）对比当前状态，发现意外安装/卸载的软件包。"
          : "Set a baseline once, then compare current state to detect unexpected software changes."}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <select value={activeId} onChange={(e) => { setActiveId(e.target.value); setReport(null); setError(""); }} style={{ flex: 1 }}>
          <option value="">— {locale === "zh" ? "选择虚拟机" : "select VM"} —</option>
          {connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button
          type="button"
          className="ghost-action"
          disabled={!activeId || busy}
          onClick={async () => {
            setBusy(true); setError(""); setReport(null);
            try {
              await setDriftBaseline(authToken, activeId);
              setError(locale === "zh" ? "✓ 基线已保存" : "✓ Baseline saved");
            } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
            finally { setBusy(false); }
          }}
        >
          {locale === "zh" ? "设置基线" : "Set baseline"}
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={!activeId || busy}
          onClick={async () => {
            setBusy(true); setError(""); setReport(null);
            try {
              setReport(await runDriftCheck(authToken, activeId));
            } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
            finally { setBusy(false); }
          }}
        >
          {locale === "zh" ? "立即检查" : "Check drift"}
        </button>
      </div>
      {error && <p className="settings-error">{error}</p>}
      {report && (
        <div className="drift-report">
          <p>
            <strong>{report.hasDrift
              ? (locale === "zh" ? "⚠️ 检测到漂移" : "⚠️ Drift detected")
              : (locale === "zh" ? "✓ 无漂移" : "✓ No drift")}</strong>
            <span className="settings-row-meta">
              {" · "}baseline: {new Date(report.baselineCapturedAt).toLocaleString()}
              {" · "}checked: {new Date(report.checkedAt).toLocaleString()}
            </span>
          </p>
          {report.addedSoftware.length > 0 && (
            <div className="drift-section">
              <h4>+ {locale === "zh" ? `新增 ${report.addedSoftware.length} 项` : `Added ${report.addedSoftware.length}`}</h4>
              <ul>
                {report.addedSoftware.map((s) => (
                  <li key={`${s.source}-${s.name}`}><code>{s.name}</code> <span className="settings-row-meta">[{s.source}]</span></li>
                ))}
              </ul>
            </div>
          )}
          {report.removedSoftware.length > 0 && (
            <div className="drift-section">
              <h4>- {locale === "zh" ? `移除 ${report.removedSoftware.length} 项` : `Removed ${report.removedSoftware.length}`}</h4>
              <ul>
                {report.removedSoftware.map((s) => (
                  <li key={`${s.source}-${s.name}`}><code>{s.name}</code> <span className="settings-row-meta">[{s.source}]</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function WebhooksPanel({ locale, authToken }: { locale: Locale; authToken: string }) {
  const [list, setList] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", url: "", secret: "" });
  const [err, setErr] = useState("");

  async function reload() {
    setLoading(true); setErr("");
    try { setList(await fetchWebhooks(authToken)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [authToken]);

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h3>{locale === "zh" ? "Webhook 通知" : "Webhooks"}</h3>
        <button type="button" className="primary-action" style={{ fontSize: 13 }} onClick={() => setShowForm((v) => !v)}>
          {showForm ? (locale === "zh" ? "收起" : "Collapse") : `+ ${locale === "zh" ? "新建" : "New"}`}
        </button>
      </div>
      <p className="settings-help">
        {locale === "zh"
          ? "任务完成 / 失败 / 漂移检测 / 定时任务触发时，POST JSON 到指定 URL。"
          : "POST JSON on task.completed / task.failed / drift.detected / schedule.fired."}
      </p>
      {showForm && (
        <div className="upload-form">
          <input placeholder={locale === "zh" ? "标签" : "Label"} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input placeholder="https://hooks.slack.com/services/..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input placeholder={locale === "zh" ? "可选 HMAC 密钥" : "Optional HMAC secret"} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
          {err && <p className="settings-error">{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary-action" onClick={async () => {
              setErr("");
              try {
                await createWebhook(authToken, { ...form, events: ["task.completed", "task.failed", "drift.detected", "schedule.fired"], enabled: true });
                setForm({ label: "", url: "", secret: "" });
                setShowForm(false);
                void reload();
              } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
            }}>{locale === "zh" ? "创建" : "Create"}</button>
          </div>
        </div>
      )}
      {loading ? <p className="empty-hint"><span className="spinning">↻</span></p> : list.length === 0 ? (
        <p className="empty-hint">{locale === "zh" ? "还没有 Webhook。" : "No webhooks yet."}</p>
      ) : (
        <ul className="settings-list">
          {list.map((w) => (
            <li key={w.id} className="settings-row">
              <div className="settings-row-main">
                <strong>{w.label}</strong>
                <span className="settings-row-meta">
                  <code>{w.url}</code> {" · "}{w.events.join(", ")}
                  {w.lastDeliveryStatus ? ` · last: ${w.lastDeliveryStatus}` : ""}
                </span>
              </div>
              <div className="settings-row-actions">
                <button type="button" className="ghost-action" onClick={async () => {
                  const r = await testWebhook(authToken, w.id);
                  alert(`${locale === "zh" ? "测试结果" : "Test result"}: ${r.delivered}${r.error ? ` · ${r.error}` : ""}`);
                  void reload();
                }}>{locale === "zh" ? "测试" : "Test"}</button>
                <button type="button" className="conn-btn conn-btn-danger" onClick={async () => {
                  if (!confirm(locale === "zh" ? "删除该 Webhook？" : "Delete?")) return;
                  await deleteWebhook(authToken, w.id);
                  void reload();
                }}>{locale === "zh" ? "删除" : "Delete"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TokensPanel({ locale, authToken }: { locale: Locale; authToken: string }) {
  const [list, setList] = useState<ApiTokenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("");
  const [created, setCreated] = useState<{ token: string; label: string } | null>(null);
  const [err, setErr] = useState("");

  async function reload() {
    setLoading(true); setErr("");
    try { setList(await fetchApiTokens(authToken)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [authToken]);

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "API Token（CI/CD 集成）" : "API tokens (CI/CD)"}</h3>
      <p className="settings-help">
        {locale === "zh"
          ? "创建 API token 后，外部系统（GitHub Actions / Jenkins）可用 Authorization: Bearer <token> 调用 EnvForge API。"
          : "Use these in CI: Authorization: Bearer <token> calls every EnvForge endpoint as you."}
      </p>
      <div className="upload-form">
        <input placeholder={locale === "zh" ? "标签（如 GitHub Actions prod）" : "Label (e.g. GitHub Actions prod)"} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder={locale === "zh" ? "有效天数（留空=永不过期）" : "Expires in days (empty = never)"} value={days} onChange={(e) => setDays(e.target.value)} />
        {err && <p className="settings-error">{err}</p>}
        <button type="button" className="primary-action" disabled={!label.trim()} onClick={async () => {
          setErr("");
          try {
            const result = await createApiToken(authToken, label.trim(), days ? parseInt(days, 10) : undefined);
            setCreated({ token: result.token, label: result.label });
            setLabel(""); setDays("");
            void reload();
          } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
        }}>{locale === "zh" ? "生成" : "Generate"}</button>
      </div>
      {created && (
        <div className="token-created-banner">
          <p><strong>⚠ {locale === "zh" ? "请立即复制保存。关闭后将不再显示。" : "Copy now. This token will not be shown again."}</strong></p>
          <code className="token-display">{created.token}</code>
          <button type="button" className="ghost-action" onClick={() => navigator.clipboard.writeText(created.token)}>
            {locale === "zh" ? "复制" : "Copy"}
          </button>
          <button type="button" className="ghost-action" onClick={() => setCreated(null)}>{locale === "zh" ? "我已保存" : "I saved it"}</button>
        </div>
      )}
      {loading ? <p className="empty-hint"><span className="spinning">↻</span></p> : list.length === 0 ? (
        <p className="empty-hint">{locale === "zh" ? "还没有 API Token。" : "No tokens yet."}</p>
      ) : (
        <ul className="settings-list">
          {list.map((t) => (
            <li key={t.id} className="settings-row">
              <div className="settings-row-main">
                <strong>{t.label}</strong>
                <span className="settings-row-meta">
                  <code>{t.tokenPrefix}…</code> {" · "}created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ` · ${locale === "zh" ? "未使用" : "unused"}`}
                  {t.expiresAt ? ` · expires ${new Date(t.expiresAt).toLocaleDateString()}` : ""}
                </span>
              </div>
              <button type="button" className="conn-btn conn-btn-danger" onClick={async () => {
                if (!confirm(locale === "zh" ? "撤销该 Token？" : "Revoke?")) return;
                await deleteApiToken(authToken, t.id);
                void reload();
              }}>{locale === "zh" ? "撤销" : "Revoke"}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ModuleDocsPanel({ locale }: { locale: Locale }) {
  const [docs, setDocs] = useState<ModuleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    void fetchModuleDocs().then((d) => { setDocs(d); setLoading(false); if (d[0]) setActive(d[0].name); });
  }, []);

  if (loading) return <p className="empty-hint"><span className="spinning">↻</span></p>;
  const current = docs.find((d) => d.name === active);

  return (
    <section className="settings-section module-docs-panel">
      <p className="settings-help">
        {locale === "zh"
          ? "EnvForge 引擎内置的所有模块。点击左侧查看参数和示例。"
          : "All built-in engine modules. Click on the left to see parameters and examples."}
      </p>
      <div className="module-docs-layout">
        <ul className="module-docs-nav">
          {docs.map((d) => (
            <li key={d.name}>
              <button type="button" className={d.name === active ? "active" : ""} onClick={() => setActive(d.name)}>
                <span className="module-docs-name">{d.name}</span>
                <span className="module-docs-cat">{d.category}</span>
              </button>
            </li>
          ))}
        </ul>
        {current && (
          <div className="module-docs-detail">
            <h3>{current.name}</h3>
            <p>{current.summary}</p>
            <h4>{locale === "zh" ? "参数" : "Args"}</h4>
            <table className="module-docs-args">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "名称" : "Name"}</th>
                  <th>{locale === "zh" ? "类型" : "Type"}</th>
                  <th>{locale === "zh" ? "必填" : "Required"}</th>
                  <th>{locale === "zh" ? "默认" : "Default"}</th>
                  <th>{locale === "zh" ? "说明" : "Description"}</th>
                </tr>
              </thead>
              <tbody>
                {current.args.map((a) => (
                  <tr key={a.name}>
                    <td><code>{a.name}</code></td>
                    <td>{a.type}</td>
                    <td>{a.required ? "✓" : ""}</td>
                    <td>{a.default ?? ""}</td>
                    <td>{a.description ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4>{locale === "zh" ? "示例" : "Example"}</h4>
            <pre className="module-docs-example">{current.example}</pre>
            {current.notes && <p className="module-docs-notes">⚠ {current.notes}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
