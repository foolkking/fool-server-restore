/**
 * PlaybookPage — Playbook 版本管理 + 多目标执行
 */

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  createPlaybook,
  deletePlaybook,
  fetchPlaybook,
  fetchPlaybooks,
  multiExecute,
  restorePlaybookVersion,
  streamTask,
  updatePlaybook,
  type ConnectionProfile,
  type ExecutionTask,
  type StoredPlaybook
} from "../api";
import type { Locale } from "../lib/types";
import { PlaybookEditor } from "../components/PlaybookEditor";

const EMPTY_YAML = `# New Playbook
name: My Playbook
hosts: all

tasks:
  - name: Example task
    module: shell
    args:
      cmd: "echo Hello from EnvForge"
`;

export function PlaybookPage({
  locale,
  authToken,
  connections,
  activeTask,
  onTaskUpdate
}: {
  locale: Locale;
  authToken: string;
  connections: ConnectionProfile[];
  activeTask: ExecutionTask | null;
  onTaskUpdate: (task: ExecutionTask) => void;
}) {
  const [playbooks, setPlaybooks] = useState<StoredPlaybook[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingPlaybook, setEditingPlaybook] = useState<StoredPlaybook | null>(null);
  const [editorYaml, setEditorYaml] = useState(EMPTY_YAML);
  const [editorName, setEditorName] = useState("");
  const [editorDesc, setEditorDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showMultiTarget, setShowMultiTarget] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState("");
  const [execResults, setExecResults] = useState<Array<{ connectionId: string; label: string; taskId: string }>>([]);
  const [createMode, setCreateMode] = useState(false);

  // Collect all unique tags from connections
  const allTags = Array.from(new Set(
    connections.flatMap((c) => c.tags ?? [])
  )).sort();

  // Probed connections only
  const probedConnections = connections.filter((c) => c.status === "probed");

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    fetchPlaybooks(authToken)
      .then(setPlaybooks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authToken]);

  async function handleSelect(id: string) {
    setSelectedId(id);
    setShowHistory(false);
    setCreateMode(false);
    try {
      const pb = await fetchPlaybook(authToken, id);
      setEditingPlaybook(pb);
      setEditorYaml(pb.yaml);
      setEditorName(pb.name);
      setEditorDesc(pb.description ?? "");
    } catch { /* silent */ }
  }

  async function handleSave(comment?: string) {
    setSaving(true);
    setSaveError("");
    try {
      if (createMode) {
        const pb = await createPlaybook(authToken, {
          name: editorName || "Untitled",
          description: editorDesc,
          yaml: editorYaml,
          sourceKind: "user",
          comment
        });
        setPlaybooks((prev) => [pb, ...prev]);
        setEditingPlaybook(pb);
        setSelectedId(pb.id);
        setCreateMode(false);
      } else if (editingPlaybook) {
        const pb = await updatePlaybook(authToken, editingPlaybook.id, {
          name: editorName,
          description: editorDesc,
          yaml: editorYaml,
          comment
        });
        setPlaybooks((prev) => prev.map((p) => p.id === pb.id ? { ...pb, history: undefined } : p));
        setEditingPlaybook(pb);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(locale === "zh" ? "确认删除此 Playbook？" : "Delete this Playbook?")) return;
    try {
      await deletePlaybook(authToken, id);
      setPlaybooks((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) { setSelectedId(null); setEditingPlaybook(null); }
    } catch { /* silent */ }
  }

  async function handleRestoreVersion(version: number) {
    if (!editingPlaybook) return;
    try {
      const pb = await restorePlaybookVersion(authToken, editingPlaybook.id, version);
      setEditingPlaybook(pb);
      setEditorYaml(pb.yaml);
      setPlaybooks((prev) => prev.map((p) => p.id === pb.id ? { ...pb, history: undefined } : p));
    } catch { /* silent */ }
  }

  async function handleMultiExecute(dryRun: boolean) {
    if (!editingPlaybook && !createMode) return;
    setExecuting(true);
    setExecError("");
    setExecResults([]);
    try {
      const result = await multiExecute(authToken, {
        yaml: editorYaml,
        connectionIds: selectedTargets.size > 0 ? Array.from(selectedTargets) : undefined,
        tags: selectedTags.size > 0 ? Array.from(selectedTags) : undefined,
        dryRun
      });
      setExecResults(result.targets);
      // Stream all tasks
      for (const target of result.targets) {
        const unsubscribe = streamTask(target.taskId, (task) => {
          onTaskUpdate(task);
          if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") {
            unsubscribe();
          }
        }, authToken);
      }
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  }

  const hasTargets = selectedTargets.size > 0 || selectedTags.size > 0;

  return (
    <div className="playbook-page">
      <div className="playbook-sidebar">
        <div className="playbook-sidebar-header">
          <h2>{locale === "zh" ? "我的 Playbook" : "My Playbooks"}</h2>
          <button
            className="primary-action"
            type="button"
            style={{ fontSize: 13, minHeight: 34, padding: "0 14px" }}
            onClick={() => {
              setCreateMode(true);
              setSelectedId(null);
              setEditingPlaybook(null);
              setEditorYaml(EMPTY_YAML);
              setEditorName("");
              setEditorDesc("");
            }}
          >
            + {locale === "zh" ? "新建" : "New"}
          </button>
          <label className="conn-btn conn-btn-ghost" style={{ fontSize: 12, minHeight: 34, padding: "0 10px", cursor: "pointer" }}>
            ↑ {locale === "zh" ? "上传" : "Upload"}
            <input type="file" accept=".yaml,.yml,.txt" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const content = reader.result as string;
                setCreateMode(true);
                setSelectedId(null);
                setEditingPlaybook(null);
                setEditorYaml(content);
                setEditorName(file.name.replace(/\.(yaml|yml|txt)$/, ""));
                setEditorDesc("");
              };
              reader.readAsText(file);
              e.target.value = "";
            }} />
          </label>
        </div>

        {loading ? (
          <p className="empty-hint"><span className="spinning">↻</span></p>
        ) : playbooks.length === 0 && !createMode ? (
          <p className="empty-hint">{locale === "zh" ? "暂无 Playbook" : "No playbooks yet"}</p>
        ) : (
          <div className="playbook-list">
            {playbooks.map((pb) => (
              <button
                key={pb.id}
                type="button"
                className={`playbook-list-item ${selectedId === pb.id ? "active" : ""}`}
                onClick={() => void handleSelect(pb.id)}
              >
                <div className="playbook-list-name">{pb.name}</div>
                <div className="playbook-list-meta">
                  v{pb.version} · {new Date(pb.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="playbook-editor-area">
        {(editingPlaybook || createMode) ? (
          <>
            <div className="playbook-editor-header">
              <div className="playbook-editor-meta-inputs">
                <input
                  className="playbook-name-input"
                  placeholder={locale === "zh" ? "Playbook 名称" : "Playbook name"}
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                />
                <input
                  className="playbook-desc-input"
                  placeholder={locale === "zh" ? "描述（可选）" : "Description (optional)"}
                  value={editorDesc}
                  onChange={(e) => setEditorDesc(e.target.value)}
                />
              </div>
              <div className="playbook-editor-actions">
                {editingPlaybook ? (
                  <span className="playbook-version-badge">v{editingPlaybook.version}</span>
                ) : null}
                <button
                  className="ghost-action"
                  type="button"
                  style={{ fontSize: 13, minHeight: 34 }}
                  onClick={() => setShowHistory((v) => !v)}
                  disabled={!editingPlaybook}
                >
                  {locale === "zh" ? "历史版本" : "History"}
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  style={{ fontSize: 13, minHeight: 34 }}
                  onClick={() => setShowMultiTarget((v) => !v)}
                >
                  🖥 {locale === "zh" ? "多目标执行" : "Multi-target"}
                </button>
                <button
                  className={`primary-action ${saving ? "btn-loading" : ""}`}
                  type="button"
                  style={{ fontSize: 13, minHeight: 34 }}
                  disabled={saving || !editorYaml.trim()}
                  onClick={() => void handleSave()}
                >
                  {saving ? <span className="spinning">↻</span> : null}
                  {saving ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "保存" : "Save")}
                </button>
                {editingPlaybook ? (
                  <button
                    className="ghost-action"
                    type="button"
                    style={{ fontSize: 13, minHeight: 34, color: "#b42318" }}
                    onClick={() => void handleDelete(editingPlaybook.id)}
                  >
                    {locale === "zh" ? "删除" : "Delete"}
                  </button>
                ) : null}
              </div>
            </div>

            {saveError ? <p className="connection-error" style={{ margin: "0 0 12px" }}>{saveError}</p> : null}

            {/* 历史版本面板 */}
            {showHistory && editingPlaybook?.history ? (
              <div className="playbook-history-panel">
                <div className="playbook-history-header">
                  <strong>{locale === "zh" ? "版本历史" : "Version History"}</strong>
                  <button className="ghost-action icon-action" type="button" onClick={() => setShowHistory(false)}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                <div className="playbook-history-list">
                  {editingPlaybook.history.map((h) => (
                    <div key={h.version} className="playbook-history-item">
                      <div className="playbook-history-item-meta">
                        <span className="playbook-version-badge">v{h.version}</span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>{new Date(h.savedAt).toLocaleString()}</span>
                        {h.comment ? <span style={{ color: "#475569", fontSize: 12 }}>{h.comment}</span> : null}
                      </div>
                      {h.version !== editingPlaybook.version ? (
                        <button
                          className="secondary-action"
                          type="button"
                          style={{ fontSize: 12, minHeight: 28, padding: "0 10px" }}
                          onClick={() => void handleRestoreVersion(h.version)}
                        >
                          {locale === "zh" ? "恢复此版本" : "Restore"}
                        </button>
                      ) : (
                        <span style={{ color: "#0f766e", fontSize: 12, fontWeight: 700 }}>
                          {locale === "zh" ? "当前版本" : "Current"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 多目标执行面板 */}
            {showMultiTarget ? (
              <div className="multi-target-panel">
                <div className="multi-target-header">
                  <strong>{locale === "zh" ? "选择目标服务器" : "Select Target Servers"}</strong>
                  <button className="ghost-action icon-action" type="button" onClick={() => setShowMultiTarget(false)}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>

                {allTags.length > 0 ? (
                  <div className="multi-target-tags">
                    <p style={{ color: "#475569", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>
                      {locale === "zh" ? "按标签选择" : "Select by tag"}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={selectedTags.has(tag) ? "selected-action" : "ghost-action"}
                          style={{ fontSize: 12, minHeight: 28, padding: "0 10px" }}
                          onClick={() => setSelectedTags((prev) => {
                            const next = new Set(prev);
                            if (next.has(tag)) next.delete(tag); else next.add(tag);
                            return next;
                          })}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="multi-target-connections">
                  <p style={{ color: "#475569", fontSize: 12, fontWeight: 700, margin: "8px 0 6px" }}>
                    {locale === "zh" ? "或直接选择服务器" : "Or select servers directly"}
                  </p>
                  {probedConnections.length === 0 ? (
                    <p className="empty-hint" style={{ fontSize: 12 }}>
                      {locale === "zh" ? "暂无已连接的服务器" : "No connected servers"}
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {probedConnections.map((conn) => (
                        <label key={conn.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={selectedTargets.has(conn.id)}
                            onChange={() => setSelectedTargets((prev) => {
                              const next = new Set(prev);
                              if (next.has(conn.id)) next.delete(conn.id); else next.add(conn.id);
                              return next;
                            })}
                            style={{ accentColor: "#0f766e" }}
                          />
                          <span style={{ fontWeight: 600 }}>{conn.label}</span>
                          <span style={{ color: "#64748b" }}>{conn.fields.host}</span>
                          {conn.tags?.map((t) => (
                            <span key={t} className="chip-method">#{t}</span>
                          ))}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {execError ? <p className="connection-error" style={{ margin: "8px 0 0" }}>{execError}</p> : null}

                {execResults.length > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ color: "#065f46", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>
                      ✓ {locale === "zh" ? `已在 ${execResults.length} 台服务器上启动执行` : `Launched on ${execResults.length} server(s)`}
                    </p>
                    {execResults.map((r) => (
                      <div key={r.taskId} style={{ fontSize: 11, color: "#64748b" }}>
                        {r.label}: task {r.taskId.slice(0, 12)}…
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={!hasTargets || executing}
                    onClick={() => void handleMultiExecute(true)}
                  >
                    ⚡ {locale === "zh" ? "预演（dry-run）" : "Dry-run"}
                  </button>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={!hasTargets || executing}
                    onClick={() => void handleMultiExecute(false)}
                  >
                    {executing ? <span className="spinning">↻</span> : null}
                    {executing
                      ? (locale === "zh" ? "执行中…" : "Executing…")
                      : (locale === "zh" ? "立即执行" : "Execute now")}
                  </button>
                </div>
              </div>
            ) : null}

            <PlaybookEditor
              yaml={editorYaml}
              onChange={setEditorYaml}
              locale={locale}
            />
          </>
        ) : (
          <div className="playbook-empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h3>{locale === "zh" ? "选择或新建 Playbook" : "Select or create a Playbook"}</h3>
            <p style={{ color: "#64748b", fontSize: 14 }}>
              {locale === "zh"
                ? "Playbook 是可重用的服务器配置脚本，与 Ansible 格式兼容。"
                : "Playbooks are reusable server configuration scripts, compatible with Ansible."}
            </p>
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                setCreateMode(true);
                setEditorYaml(EMPTY_YAML);
                setEditorName("");
                setEditorDesc("");
              }}
            >
              + {locale === "zh" ? "新建 Playbook" : "New Playbook"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
