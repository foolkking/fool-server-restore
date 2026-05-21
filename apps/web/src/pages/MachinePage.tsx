import React, { useState } from "react";
import {
  CheckCircle2,
  Cpu,
  HardDrive,
  KeyRound,
  MemoryStick,
  MonitorCog,
  PackagePlus,
  Settings2,
  UploadCloud,
  Wifi,
  X,
  type LucideIcon
} from "lucide-react";
import {
  captureEnvironment as captureVmEnvironment,
  uploadSshKey,
  uploadVmSnapshot,
  type AgentProbeResult,
  type AuthUser,
  type CaptureResult,
  type ConnectionProfile,
  type SshKeyMeta,
  type SystemConfigItem,
  type TargetSoftware,
  type UploadSnapshotInput
} from "../api";
import type { Locale } from "../lib/types";
import {
  connectionFields,
  connectionFieldKeys,
  installCommands
} from "../lib/types";
import { ConnectionDetailPanel } from "../components/ConnectionDetailPanel";
import { InventoryPanel } from "../components/InventoryPanel";
import { ConfigFilesPanel } from "../components/ConfigFilesPanel";

// Use a structural type so both zh and en locales are accepted
type TextDict = {
  appName: string;
  subtitle: string;
  machine: string;
  market: string;
  me: string;
  search: string;
  filter: string;
  connectTitle: string;
  connectHint: string;
  runScan: string;
  upload: string;
  selected: string;
  software: string;
  configs: string;
  addToVm: string;
  guest: string;
  login: string;
  register: string;
  logout: string;
  editProfile: string;
  profile: string;
  uploads: string;
  language: string;
  locked: string;
  connection: string;
  connected: string;
  disconnected: string;
  connectBtn: string;
  privacyNote: string;
  installCommand: string;
  packageAlias: string;
  agentUrl: string;
  agentProbe: string;
  agentOnline: string;
  agentOffline: string;
  probing: string;
  realData: string;
};

type ConnectionMethod = "ssh-password" | "ssh-key";

// ── UploadSnapshotButton ──────────────────────────────────

function UploadSnapshotButton({
  locale,
  t,
  connected,
  authUser,
  onUpload
}: {
  locale: Locale;
  t: TextDict;
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

// ── MachinePage ───────────────────────────────────────────

export function MachinePage({
  t,
  locale,
  connections,
  activeConnectionId,
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
  authUser,
  authToken,
  sshKeys,
  onSshKeysChange,
  onDeleteConnection,
  onUpdateConnection,
  pushLog
}: {
  t: TextDict;
  locale: Locale;
  connections: ConnectionProfile[];
  activeConnectionId: string | null;
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
  onReprobe: (id: string) => Promise<void>;
  onToggle: (id: string) => void;
  onScan: () => Promise<void> | void;
  onUploadSnapshot: (input: UploadSnapshotInput) => Promise<void>;
  authUser: AuthUser | null;
  authToken: string;
  sshKeys: SshKeyMeta[];
  onSshKeysChange: (keys: SshKeyMeta[]) => void;
  onDeleteConnection: (id: string) => void;
  onUpdateConnection: (id: string, input: { label?: string; agentUrl?: string }) => void;
  pushLog?: (type: "info" | "success" | "error" | "cmd", text: string) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({ port: "22" });
  const [showNewForm, setShowNewForm] = useState(connections.length === 0);
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [showKeyUpload, setShowKeyUpload] = useState(false);
  const [keyUploadText, setKeyUploadText] = useState("");
  const [keyUploadLabel, setKeyUploadLabel] = useState("");
  const [keyUploading, setKeyUploading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);

  const softwareRows: Array<{ id: string; icon: LucideIcon; name: string; value: string; command: string; source?: string }> =
    probeResult
      ? probeResult.software.map((item: TargetSoftware) => ({
          id: `software-${item.source}-${item.name}`,
          icon: PackagePlus,
          name: item.name,
          value: item.version,
          source: item.source,
          command: installCommands[item.name] ?? `apt-get install -y ${item.name}`
        }))
      : [];

  const configRows: Array<{ id: string; icon: LucideIcon; name: string; value: string; command: string; source?: string }> =
    probeResult
      ? probeResult.configChecklist.map((item: SystemConfigItem) => ({
          id: `config-${item.id}`,
          icon: Settings2,
          name: item.label,
          value: `${item.category} · ${item.status} · ${item.lastChanged}`,
          source: item.category,
          command: ""
        }))
      : [
          { id: "config-packages", icon: PackagePlus, name: locale === "zh" ? "包管理器清单" : "Package manifest", value: "npm global, apt packages", command: "npm list -g --depth=0" },
          { id: "config-aliases", icon: Settings2, name: locale === "zh" ? "命令 alias 偏好" : "Command aliases", value: "gs, ll, k, dc, dev shortcuts", command: "cat ~/.bashrc" },
          { id: "config-shell", icon: Settings2, name: locale === "zh" ? "Shell profile" : "Shell profile", value: "bash/zsh profile, PATH snippets, prompt", command: "cat ~/.bashrc" },
          { id: "config-registry", icon: Wifi, name: locale === "zh" ? "镜像源与代理" : "Registry and proxy", value: "npm registry, pip index, proxy env", command: "npm config get registry" }
        ];

  function updateField(key: string, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
  }

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const statusColor: Record<string, string> = {
    probed: "#065f46", ssh_ok: "#1d4ed8", validated: "#6b7280", ssh_failed: "#b42318", unreachable: "#b42318"
  };
  const statusLabel: Record<string, { zh: string; en: string }> = {
    probed: { zh: "已采集", en: "Probed" },
    ssh_ok: { zh: "SSH 成功", en: "SSH OK" },
    validated: { zh: "已验证", en: "Validated" },
    ssh_failed: { zh: "SSH 失败", en: "SSH Failed" },
    unreachable: { zh: "不可达", en: "Unreachable" }
  };

  return (
    <div className="page-stack">

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
              <div key={conn.id} className="connection-chip-wrap">
                <button
                  type="button"
                  className={`connection-chip ${conn.id === activeConnectionId ? "active" : ""} status-${conn.status}`}
                  onClick={() => {
                    onSelectConnection(conn.id);
                    setExpandedConnId(expandedConnId === conn.id ? null : conn.id);
                  }}
                  title={conn.sshError ?? conn.status}
                >
                  <span className="chip-dot" style={{ background: statusColor[conn.status] ?? "#6b7280" }} />
                  <span>{conn.label}</span>
                  <span className="chip-method">{conn.method}</span>
                  {conn.tags?.map((tag) => (
                    <span key={tag} className="chip-method" style={{ background: "#dbeafe", color: "#1d4ed8" }}>#{tag}</span>
                  ))}
                  <span className="chip-status" style={{ color: statusColor[conn.status] ?? "#6b7280" }}>
                    {locale === "zh" ? statusLabel[conn.status]?.zh : statusLabel[conn.status]?.en}
                  </span>
                  <span className="chip-expand">{expandedConnId === conn.id ? "▲" : "▼"}</span>
                </button>

                {expandedConnId === conn.id ? (
                  <ConnectionDetailPanel
                    conn={conn}
                    locale={locale}
                    onReprobe={() => onReprobe(conn.id)}
                    onDelete={() => { onDeleteConnection(conn.id); setExpandedConnId(null); }}
                    onUpdate={(input) => onUpdateConnection(conn.id, input)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="connection-stage">
        <div className={connected ? "machine-intro" : "machine-intro blurred"}>
          {/* Connection status banner — always visible when connected */}
          {connected && activeConn ? (
            <div className={`conn-status-banner ${activeConn.status === "probed" ? "status-ok" : activeConn.status === "ssh_failed" ? "status-error" : "status-warn"}`}>
              <span className="conn-status-dot" />
              <span className="conn-status-host">
                {activeConn.fields.username}@{activeConn.fields.host}:{activeConn.fields.port ?? "22"}
              </span>
              <span className="conn-status-method">{activeConn.method}</span>
              {activeConn.status === "probed" ? (
                <span className="conn-status-label ok">
                  <CheckCircle2 style={{ width: 13, height: 13 }} />
                  {locale === "zh" ? "SSH 已连接 · 数据已采集" : "SSH connected · data collected"}
                </span>
              ) : activeConn.status === "ssh_failed" ? (
                <span className="conn-status-label error">
                  ✗ {locale === "zh" ? "SSH 连接失败" : "SSH failed"}
                </span>
              ) : (
                <span className="conn-status-label warn">
                  △ {locale === "zh" ? "已保存，未验证" : "Saved, not verified"}
                </span>
              )}
              {probeResult ? (
                <span className="conn-status-time">
                  {locale === "zh" ? "采集于" : "collected"} {new Date(probeResult.collectedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          ) : null}

          <p className="eyebrow">{connected ? t.connected : t.disconnected}</p>
          <h2>{probeResult ? probeResult.system.hostname : (activeConn?.label ?? "—")}</h2>
          {connected && probeResult ? (
            <div className="machine-hw-inline">
              {probeResult.system.osPretty ? (
                <span><MonitorCog aria-hidden style={{ width: 14, height: 14 }} /> {probeResult.system.osPretty}</span>
              ) : null}
              <span><Cpu aria-hidden style={{ width: 14, height: 14 }} /> {probeResult.system.cpu.cores} cores · {probeResult.system.cpu.model?.slice(0, 24)}</span>
              <span><MemoryStick aria-hidden style={{ width: 14, height: 14 }} /> {probeResult.system.memory.totalGb} GB total · {probeResult.system.memory.freeGb} GB free</span>
              <span><HardDrive aria-hidden style={{ width: 14, height: 14 }} /> {probeResult.system.platform} {probeResult.system.arch} · {probeResult.system.release}</span>
              {probeResult.system.disk ? (
                <span>💾 {probeResult.system.disk.used} / {probeResult.system.disk.total} ({probeResult.system.disk.usePercent})</span>
              ) : null}
              {probeResult.system.uptimeText ? (
                <span>⏱ {probeResult.system.uptimeText}</span>
              ) : null}
              {probeResult.counts ? (
                <span className="sw-total-badge">📦 {probeResult.counts.total} {locale === "zh" ? "个软件包" : "packages"}</span>
              ) : null}
            </div>
          ) : (
            <p>{connected ? `${activeConn?.method ?? "SSH"} · ${activeConn?.fields?.host ?? "—"}` : t.locked}</p>
          )}
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
            </select>
            <div className="connection-fields">
              {connectionFields[method].map((field, index) => {
                const key = connectionFieldKeys[method][index];
                if (key === "privateKeyPath" && method === "ssh-key") {
                  return (
                    <div key={key} className="ssh-key-selector">
                      {sshKeys.length > 0 ? (
                        <select value={selectedKeyId} onChange={(e) => setSelectedKeyId(e.target.value)} style={{ flex: 1 }}>
                          <option value="">{locale === "zh" ? "— 选择已上传的密钥 —" : "— Select uploaded key —"}</option>
                          {sshKeys.map((k) => (
                            <option key={k.id} value={k.id}>{k.label}</option>
                          ))}
                        </select>
                      ) : null}
                      <button
                        className="ghost-action"
                        type="button"
                        style={{ fontSize: 13, minHeight: 38, padding: "0 12px" }}
                        onClick={() => setShowKeyUpload((v) => !v)}
                      >
                        {showKeyUpload ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "+ 上传密钥" : "+ Upload key")}
                      </button>
                    </div>
                  );
                }
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

            {method === "ssh-key" && showKeyUpload ? (
              <div className="ssh-key-upload-panel">
                <p className="eyebrow" style={{ color: "#475569", margin: "0 0 8px" }}>
                  {locale === "zh" ? "粘贴 SSH 私钥内容（PEM 格式）" : "Paste SSH private key content (PEM format)"}
                </p>
                <input
                  placeholder={locale === "zh" ? "密钥标签（可选）" : "Key label (optional)"}
                  value={keyUploadLabel}
                  onChange={(e) => setKeyUploadLabel(e.target.value)}
                  style={{ marginBottom: 8, width: "100%", border: "1px solid #d7dde4", borderRadius: 8, minHeight: 36, padding: "0 10px", font: "inherit" }}
                />
                <textarea
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                  value={keyUploadText}
                  onChange={(e) => setKeyUploadText(e.target.value)}
                  rows={6}
                  style={{ width: "100%", fontFamily: "monospace", fontSize: 12, border: "1px solid #d7dde4", borderRadius: 8, padding: 10, resize: "vertical" }}
                />
                <button
                  className="primary-action"
                  type="button"
                  disabled={!keyUploadText.trim() || keyUploading || !authToken}
                  onClick={async () => {
                    if (!authToken) return;
                    setKeyUploading(true);
                    try {
                      const meta = await uploadSshKey(authToken, keyUploadLabel || "My key", keyUploadText.trim());
                      onSshKeysChange([...sshKeys, meta]);
                      setSelectedKeyId(meta.id);
                      setKeyUploadText("");
                      setKeyUploadLabel("");
                      setShowKeyUpload(false);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Upload failed");
                    } finally {
                      setKeyUploading(false);
                    }
                  }}
                  style={{ marginTop: 8, fontSize: 13, minHeight: 36 }}
                >
                  {keyUploading ? (locale === "zh" ? "上传中…" : "Uploading…") : (locale === "zh" ? "保存密钥" : "Save key")}
                </button>
              </div>
            ) : null}

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
                {locale === "zh" ? "正在通过 SSH 连接并采集系统信息…" : "Connecting via SSH and collecting system info…"}
              </p>
            ) : null}
            <button className="primary-action" type="button" onClick={() => {
              const connectFields = { ...fields };
              if (method === "ssh-key" && selectedKeyId) {
                connectFields._keyId = selectedKeyId;
              }
              onConnect(connectFields, "");
            }} disabled={probing}>
              {probing ? <span className="spinning">↻</span> : <KeyRound aria-hidden />}
              {probing ? (locale === "zh" ? "连接中…" : "Connecting…") : t.connectBtn}
            </button>
          </div>
        ) : null}
      </section>

      <div className="toolbar-row">
        <button
          className={`primary-action ${scanning ? "btn-loading" : ""}`}
          type="button"
          onClick={async () => {
            setScanning(true);
            setScanSuccess(false);
            try { await onScan(); setScanSuccess(true); setTimeout(() => setScanSuccess(false), 3000); } finally { setScanning(false); }
          }}
          disabled={!connected || !authUser || scanning}
          title={!authUser ? (locale === "zh" ? "请先登录" : "Login required") : !connected ? (locale === "zh" ? "请先选择已连接的虚拟机" : "Select a connected VM first") : undefined}
        >
          {scanning ? <span className="spinning">↻</span> : <MonitorCog aria-hidden />}
          {scanning ? (locale === "zh" ? "扫描中…" : "Scanning…") : scanSuccess ? (locale === "zh" ? "✓ 扫描完成" : "✓ Scan done") : t.runScan}
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!connected || !authUser || capturing}
          title={!authUser ? (locale === "zh" ? "请先登录" : "Login required") : !connected ? (locale === "zh" ? "请先连接虚拟机" : "Connect a VM first") : undefined}
          onClick={async () => {
            if (!authToken || !activeConnectionId) return;
            setCapturing(true);
            try {
              const result = await captureVmEnvironment(authToken, activeConnectionId);
              setCaptureResult(result);
            } catch (err) {
              alert(err instanceof Error ? err.message : "Capture failed");
            } finally {
              setCapturing(false);
            }
          }}
        >
          {capturing ? <span className="spinning">↻</span> : "📦"}
          {capturing ? (locale === "zh" ? "采集中…" : "Capturing…") : (locale === "zh" ? "环境保留（生成重建 Playbook）" : "Capture & Generate Rebuild Playbook")}
        </button>
      </div>

      {captureResult ? (
        <div className="capture-result-panel">
          <div className="capture-result-header">
            <div>
              <p className="eyebrow" style={{ color: "#065f46" }}>
                {locale === "zh" ? "环境保留完成" : "Environment captured"}
                <span style={{ marginLeft: 8, color: "#64748b", fontWeight: 400 }}>
                  · {new Date(captureResult.capturedAt).toLocaleString()}
                </span>
              </p>
              <div className="capture-summary">
                {captureResult.summary.aptPackages.length > 0 && (
                  <span>{captureResult.summary.aptPackages.length} {locale === "zh" ? "个 apt 包" : "apt packages"}</span>
                )}
                {captureResult.summary.enabledServices.length > 0 && (
                  <span>{captureResult.summary.enabledServices.length} {locale === "zh" ? "个服务" : "services"}</span>
                )}
                {captureResult.summary.bashrcLines.length > 0 && (
                  <span>{captureResult.summary.bashrcLines.length} {locale === "zh" ? "条 bashrc 配置" : "bashrc lines"}</span>
                )}
                {captureResult.summary.npmGlobals.length > 0 && (
                  <span>{captureResult.summary.npmGlobals.length} {locale === "zh" ? "个 npm 全局包" : "npm globals"}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="primary-action"
                type="button"
                style={{ fontSize: 13, minHeight: 36 }}
                onClick={() => {
                  const blob = new Blob([captureResult.playbookYaml], { type: "text/yaml" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `envforge-capture-${new Date().toISOString().slice(0, 10)}.yaml`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                ⬇ {locale === "zh" ? "下载 Playbook" : "Download Playbook"}
              </button>
              <button className="ghost-action" type="button" style={{ fontSize: 13, minHeight: 36 }} onClick={() => setCaptureResult(null)}>
                ✕
              </button>
            </div>
          </div>
          <pre className="capture-yaml-preview">{captureResult.playbookYaml.slice(0, 1200)}{captureResult.playbookYaml.length > 1200 ? "\n# ... (truncated, download for full)" : ""}</pre>
        </div>
      ) : null}

      {scanning ? (
        <div className="scan-feedback">
          <span className="spinning">↻</span>
          {locale === "zh" ? "正在扫描当前虚拟机，采集系统信息…" : "Scanning current VM, collecting system info…"}
        </div>
      ) : scanSuccess ? (
        <div className="scan-feedback scan-success">
          <CheckCircle2 style={{ width: 16, height: 16 }} />
          {locale === "zh" ? "扫描完成！系统信息已更新。" : "Scan complete! System info updated."}
        </div>
      ) : null}

      <section className={connected ? "two-panel-grid" : "two-panel-grid blurred"}>
        <InventoryPanel
          title={t.software}
          rows={softwareRows}
          selected={selected}
          onToggle={onToggle}
          commandLabel={t.installCommand}
          locale={locale}
          panelKind="software"
          counts={probeResult?.counts}
          authToken={authToken}
          connectionId={activeConnectionId}
          onTaskUpdate={undefined}
          pushLog={pushLog}
        />
        <InventoryPanel
          title={t.configs}
          rows={configRows}
          selected={selected}
          onToggle={onToggle}
          commandLabel={t.packageAlias}
          locale={locale}
          panelKind="config"
        />
      </section>

      {/* 配置文件管理面板 */}
      {connected && authToken && activeConnectionId ? (
        <ConfigFilesPanel
          locale={locale}
          authToken={authToken}
          connectionId={activeConnectionId}
          pushLog={pushLog}
        />
      ) : null}
    </div>
  );
}
