import React, { useState, useEffect, useMemo } from "react";
import { FileText, FolderOpen, Save, X, Edit3, Eye, GitCompare, Variable } from "lucide-react";
import { fetchConfigFiles, readRemoteConfigFile, writeRemoteConfigFile, fetchConfigFileDiff, type ConfigFileInfo, type ConfigFileContent } from "../api";
import type { Locale } from "../lib/types";

type ViewMode = "view" | "edit" | "diff" | "template";

export function ConfigFilesPanel({
  locale,
  authToken,
  connectionId,
  pushLog
}: {
  locale: Locale;
  authToken: string;
  connectionId: string;
  pushLog?: (type: "info" | "success" | "error" | "cmd", text: string) => void;
}) {
  const [files, setFiles] = useState<ConfigFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFile, setActiveFile] = useState<ConfigFileContent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("view");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [filter, setFilter] = useState<"all" | "system" | "user" | "app">("all");
  // Snapshot storage for diff
  const [snapshots, setSnapshots] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("envforge_config_snapshots") ?? "{}"); } catch { return {}; }
  });
  // Template variables
  const [templateVars, setTemplateVars] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("envforge_template_vars") ?? "{}"); } catch { return {}; }
  });
  // Server-side .envforge.bak content for diff (lazy-loaded when entering diff mode)
  const [bakContent, setBakContent] = useState<string | null>(null);
  const [bakLoading, setBakLoading] = useState(false);
  const [diffSource, setDiffSource] = useState<"snapshot" | "envforge-bak">("envforge-bak");

  useEffect(() => { loadFiles(); }, [connectionId]);

  async function loadFiles() {
    setLoading(true);
    setError("");
    try {
      const result = await fetchConfigFiles(authToken, connectionId);
      setFiles(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(path: string) {
    setError("");
    setActiveFile(null);
    setViewMode("view");
    setSaveMsg("");
    pushLog?.("cmd", `cat ${path}`);
    try {
      const content = await readRemoteConfigFile(authToken, connectionId, path);
      setActiveFile(content);
      setEditContent(content.content);
      pushLog?.("success", `${path} (${content.size} bytes)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read file";
      setError(msg);
      pushLog?.("error", msg);
    }
  }

  async function handleSave() {
    if (!activeFile) return;
    setSaving(true);
    setSaveMsg("");
    pushLog?.("cmd", `sudo tee ${activeFile.path}`);
    try {
      const result = await writeRemoteConfigFile(authToken, connectionId, activeFile.path, editContent);
      setSaveMsg(result.message);
      setActiveFile({ ...activeFile, content: editContent });
      setViewMode("view");
      pushLog?.("success", result.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setSaveMsg(msg);
      pushLog?.("error", msg);
    } finally {
      setSaving(false);
    }
  }

  function handleSnapshot() {
    if (!activeFile) return;
    const next = { ...snapshots, [`${connectionId}::${activeFile.path}`]: activeFile.content };
    setSnapshots(next);
    localStorage.setItem("envforge_config_snapshots", JSON.stringify(next));
    setSaveMsg(locale === "zh" ? "快照已保存（用于对比）" : "Snapshot saved (for diff)");
    setTimeout(() => setSaveMsg(""), 3000);
  }

  function handleSaveTemplateVars(vars: Record<string, string>) {
    setTemplateVars(vars);
    localStorage.setItem("envforge_template_vars", JSON.stringify(vars));
  }

  // When entering diff mode, lazily fetch the server-side .envforge.bak
  useEffect(() => {
    if (viewMode !== "diff" || !activeFile) return;
    let cancelled = false;
    setBakLoading(true);
    setBakContent(null);
    fetchConfigFileDiff(authToken, connectionId, activeFile.path)
      .then((res) => { if (!cancelled) setBakContent(res.backup?.content ?? null); })
      .catch(() => { if (!cancelled) setBakContent(null); })
      .finally(() => { if (!cancelled) setBakLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, activeFile?.path, authToken, connectionId]);

  const snapshotKey = activeFile ? `${connectionId}::${activeFile.path}` : "";
  const hasSnapshot = Boolean(snapshots[snapshotKey]);

  const filteredFiles = filter === "all" ? files : files.filter((f) => f.category === filter);

  const categoryColors: Record<string, { bg: string; fg: string }> = {
    system: { bg: "#fee2e2", fg: "#991b1b" },
    user: { bg: "#dbeafe", fg: "#1e40af" },
    app: { bg: "#dcfce7", fg: "#166534" },
  };

  return (
    <section className="panel-large config-panel">
      <div className="panel-heading">
        <h2><FolderOpen style={{ width: 20, height: 20, display: "inline", verticalAlign: "middle", marginRight: 8 }} />{locale === "zh" ? "配置文件" : "Config Files"}</h2>
        <span className="panel-count">{files.length}</span>
      </div>

      <div className="config-filters">
        {(["all", "system", "user", "app"] as const).map((cat) => (
          <button key={cat} type="button" className={`filter-pill ${filter === cat ? "active" : ""}`}
            onClick={() => setFilter(cat)}>
            {cat === "all" ? (locale === "zh" ? "全部" : "All") : cat === "system" ? (locale === "zh" ? "系统" : "System") : cat === "user" ? (locale === "zh" ? "用户" : "User") : (locale === "zh" ? "应用" : "App")}
            {cat === "all" ? ` (${files.length})` : ` (${files.filter((f) => f.category === cat).length})`}
          </button>
        ))}
        <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void loadFiles()} style={{ marginLeft: "auto" }}>
          ↻ {locale === "zh" ? "刷新" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="config-loading"><span className="spinning">↻</span> {locale === "zh" ? "正在扫描配置文件…" : "Scanning config files…"}</div>
      ) : error && !activeFile ? (
        <div className="conn-feedback conn-feedback-error">{error}</div>
      ) : (
        <div className="config-layout">
          <div className="config-file-list">
            {filteredFiles.map((file) => {
              const catStyle = categoryColors[file.category] ?? categoryColors.system;
              return (
                <button key={file.path} type="button"
                  className={`config-file-item ${activeFile?.path === file.path ? "active" : ""}`}
                  onClick={() => void handleOpen(file.path)}>
                  <FileText style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <div className="config-file-info">
                    <span className="config-file-path">{file.path}</span>
                    <span className="config-file-meta">
                      <span className="config-cat-badge" style={{ background: catStyle.bg, color: catStyle.fg }}>{file.category}</span>
                      {file.associatedSoftware ? <span className="config-sw-badge">{file.associatedSoftware}</span> : null}
                      <span>{formatSize(file.size)}</span>
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredFiles.length === 0 && !loading ? (
              <p className="config-empty">{locale === "zh" ? "未找到配置文件" : "No config files found"}</p>
            ) : null}
          </div>

          {activeFile ? (
            <div className="config-viewer">
              <div className="config-viewer-header">
                <span className="config-viewer-path">{activeFile.path}</span>
                <div className="config-viewer-actions">
                  {/* Mode buttons */}
                  <button className={`conn-btn ${viewMode === "view" ? "conn-btn-primary" : "conn-btn-ghost"}`} type="button"
                    onClick={() => { setViewMode("view"); setEditContent(activeFile.content); }}>
                    <Eye style={{ width: 13, height: 13 }} />
                  </button>
                  <button className={`conn-btn ${viewMode === "edit" ? "conn-btn-primary" : "conn-btn-ghost"}`} type="button"
                    onClick={() => setViewMode("edit")}>
                    <Edit3 style={{ width: 13, height: 13 }} />
                  </button>
                  <button className={`conn-btn ${viewMode === "diff" ? "conn-btn-primary" : "conn-btn-ghost"}`} type="button"
                    onClick={() => setViewMode("diff")} disabled={!hasSnapshot}
                    title={hasSnapshot ? (locale === "zh" ? "对比快照" : "Compare with snapshot") : (locale === "zh" ? "无快照可对比" : "No snapshot to compare")}>
                    <GitCompare style={{ width: 13, height: 13 }} />
                  </button>
                  <button className={`conn-btn ${viewMode === "template" ? "conn-btn-primary" : "conn-btn-ghost"}`} type="button"
                    onClick={() => setViewMode("template")}>
                    <Variable style={{ width: 13, height: 13 }} />
                  </button>
                  <span className="config-viewer-sep" />
                  <button className="conn-btn conn-btn-ghost" type="button" onClick={handleSnapshot}
                    title={locale === "zh" ? "保存当前内容为快照（用于后续对比）" : "Save snapshot for later comparison"}>
                    📸
                  </button>
                  {viewMode === "edit" ? (
                    <button className="conn-btn conn-btn-primary" type="button" onClick={() => void handleSave()} disabled={saving}>
                      <Save style={{ width: 13, height: 13 }} />
                      {saving ? "…" : (locale === "zh" ? "保存" : "Save")}
                    </button>
                  ) : null}
                </div>
              </div>
              {saveMsg ? <div className={`config-save-msg ${saveMsg.includes("fail") || saveMsg.includes("denied") ? "error" : "success"}`}>{saveMsg}</div> : null}

              {viewMode === "view" ? (
                <pre className="config-code">{activeFile.content}</pre>
              ) : viewMode === "edit" ? (
                <textarea className="config-editor" value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} />
              ) : viewMode === "diff" ? (
                <DiffView
                  locale={locale}
                  diffSource={diffSource}
                  onChangeSource={setDiffSource}
                  oldContent={
                    diffSource === "snapshot"
                      ? (snapshots[snapshotKey] ?? "")
                      : (bakContent ?? "")
                  }
                  newContent={activeFile.content}
                  hasManualSnapshot={hasSnapshot}
                  hasEnvforgeBak={bakContent !== null}
                  bakLoading={bakLoading}
                />
              ) : (
                <TemplateView
                  locale={locale}
                  content={activeFile.content}
                  vars={templateVars}
                  onVarsChange={handleSaveTemplateVars}
                />
              )}
            </div>
          ) : (
            <div className="config-viewer config-viewer-empty">
              <Eye style={{ width: 32, height: 32, opacity: 0.3 }} />
              <p>{locale === "zh" ? "选择左侧文件查看内容" : "Select a file to view"}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Diff View ──

function DiffView({
  locale,
  oldContent,
  newContent,
  diffSource,
  onChangeSource,
  hasManualSnapshot,
  hasEnvforgeBak,
  bakLoading
}: {
  locale: Locale;
  oldContent: string;
  newContent: string;
  diffSource: "snapshot" | "envforge-bak";
  onChangeSource: (s: "snapshot" | "envforge-bak") => void;
  hasManualSnapshot: boolean;
  hasEnvforgeBak: boolean;
  bakLoading: boolean;
}) {
  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);

  const stats = useMemo(() => {
    let added = 0, removed = 0, unchanged = 0;
    for (const l of diffLines) {
      if (l.type === "add") added++;
      else if (l.type === "remove") removed++;
      else unchanged++;
    }
    return { added, removed, unchanged };
  }, [diffLines]);

  return (
    <div className="config-diff">
      <div className="config-diff-source">
        <span className="config-diff-source-label">
          {locale === "zh" ? "对比版本：" : "Compare against:"}
        </span>
        <button
          type="button"
          className={`conn-btn ${diffSource === "envforge-bak" ? "conn-btn-primary" : "conn-btn-ghost"}`}
          onClick={() => onChangeSource("envforge-bak")}
          disabled={bakLoading}
          title={locale === "zh" ? "EnvForge 第一次写入前自动备份的版本" : "Auto-backup made before first EnvForge write"}
        >
          {locale === "zh" ? "原始备份" : "Original backup"}
          {bakLoading ? " ⏳" : !hasEnvforgeBak ? " · ∅" : ""}
        </button>
        <button
          type="button"
          className={`conn-btn ${diffSource === "snapshot" ? "conn-btn-primary" : "conn-btn-ghost"}`}
          onClick={() => onChangeSource("snapshot")}
          disabled={!hasManualSnapshot}
          title={locale === "zh" ? "手动点击 📸 保存的快照" : "Manual snapshot taken with 📸"}
        >
          {locale === "zh" ? "手动快照" : "Manual snapshot"}
          {!hasManualSnapshot ? " · ∅" : ""}
        </button>
      </div>
      <div className="config-diff-stats">
        <span className="diff-stat-added">+{stats.added}</span>
        <span className="diff-stat-removed">-{stats.removed}</span>
        <span className="diff-stat-unchanged">{stats.unchanged} {locale === "zh" ? "行未变" : "unchanged"}</span>
      </div>
      <pre className="config-diff-content">
        {diffLines.map((line, i) => (
          <div key={i} className={`diff-line diff-${line.type}`}>
            <span className="diff-marker">{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span>
            <span className="diff-text">{line.text}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

interface DiffLine { type: "add" | "remove" | "same"; text: string }

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = lcsMatrix(oldLines, newLines);
  let i = oldLines.length, j = newLines.length;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "same", text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      stack.push({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

// ── Template View ──

function TemplateView({ locale, content, vars, onVarsChange }: {
  locale: Locale;
  content: string;
  vars: Record<string, string>;
  onVarsChange: (vars: Record<string, string>) => void;
}) {
  // Detect variables in content: patterns like {{var}}, ${var}, $VAR, <IP>, <DOMAIN>
  const detected = useMemo(() => {
    const patterns = new Set<string>();
    // {{ var }} style
    for (const m of content.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) patterns.add(m[1]);
    // Common patterns that look like placeholders
    for (const m of content.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)) patterns.add(`IP:${m[1]}`);
    for (const m of content.matchAll(/server_name\s+([a-z0-9.-]+\.[a-z]{2,})/gi)) patterns.add(`DOMAIN:${m[1]}`);
    for (const m of content.matchAll(/listen\s+(\d+)/g)) patterns.add(`PORT:${m[1]}`);
    return [...patterns];
  }, [content]);

  const [localVars, setLocalVars] = useState<Record<string, string>>(vars);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  function addVar() {
    if (!newKey.trim()) return;
    const next = { ...localVars, [newKey.trim()]: newVal };
    setLocalVars(next);
    onVarsChange(next);
    setNewKey("");
    setNewVal("");
  }

  function removeVar(key: string) {
    const next = { ...localVars };
    delete next[key];
    setLocalVars(next);
    onVarsChange(next);
  }

  function updateVar(key: string, value: string) {
    const next = { ...localVars, [key]: value };
    setLocalVars(next);
    onVarsChange(next);
  }

  // Apply template variables to content
  const rendered = useMemo(() => {
    let result = content;
    for (const [key, value] of Object.entries(localVars)) {
      if (!value) continue;
      // Replace {{ key }} patterns
      result = result.replace(new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "g"), value);
      // Replace literal values (IP, domain, port)
      if (key.startsWith("IP:")) {
        result = result.replace(new RegExp(escapeRegex(key.slice(3)), "g"), value);
      } else if (key.startsWith("DOMAIN:")) {
        result = result.replace(new RegExp(escapeRegex(key.slice(7)), "g"), value);
      } else if (key.startsWith("PORT:")) {
        result = result.replace(new RegExp(`\\b${escapeRegex(key.slice(5))}\\b`, "g"), value);
      }
    }
    return result;
  }, [content, localVars]);

  return (
    <div className="config-template">
      <div className="config-template-vars">
        <p className="config-template-title">
          {locale === "zh" ? "模板变量" : "Template Variables"}
          <span className="config-template-hint">
            {locale === "zh" ? "定义变量后，迁移到新服务器时自动替换 IP/域名/端口" : "Define variables to auto-replace IP/domain/port on migration"}
          </span>
        </p>

        {detected.length > 0 ? (
          <div className="config-template-detected">
            <span className="config-template-detected-label">{locale === "zh" ? "检测到的值：" : "Detected values:"}</span>
            {detected.map((d) => (
              <button key={d} type="button" className="config-template-detected-pill"
                onClick={() => { if (!localVars[d]) { const next = { ...localVars, [d]: "" }; setLocalVars(next); onVarsChange(next); } }}>
                {d}
              </button>
            ))}
          </div>
        ) : null}

        <div className="config-template-list">
          {Object.entries(localVars).map(([key, value]) => (
            <div key={key} className="config-template-row">
              <code className="config-template-key">{key}</code>
              <input className="config-template-input" value={value} placeholder={locale === "zh" ? "新值…" : "New value…"}
                onChange={(e) => updateVar(key, e.target.value)} />
              <button type="button" className="config-template-remove" onClick={() => removeVar(key)}>✕</button>
            </div>
          ))}
        </div>

        <div className="config-template-add">
          <input placeholder={locale === "zh" ? "变量名" : "Variable name"} value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <input placeholder={locale === "zh" ? "替换值" : "Replace with"} value={newVal} onChange={(e) => setNewVal(e.target.value)} />
          <button type="button" className="conn-btn conn-btn-ghost" onClick={addVar}>+</button>
        </div>
      </div>

      <div className="config-template-preview">
        <p className="config-template-preview-label">{locale === "zh" ? "替换预览" : "Preview with replacements"}</p>
        <pre className="config-code">{rendered}</pre>
      </div>
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
