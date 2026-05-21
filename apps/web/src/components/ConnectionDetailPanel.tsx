import React, { useState } from "react";
import { Activity, CheckCircle2, Clock, Cpu, Edit3, HardDrive, MemoryStick, RefreshCw, Server, Trash2, X } from "lucide-react";
import type { ConnectionProfile } from "../api";
import type { Locale } from "../lib/types";

export function ConnectionDetailPanel({
  conn,
  locale,
  onReprobe,
  onDelete,
  onUpdate
}: {
  conn: ConnectionProfile;
  locale: Locale;
  onReprobe: () => Promise<void>;
  onDelete: () => void;
  onUpdate: (input: { label?: string; agentUrl?: string; tags?: string[] }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(conn.label);
  const [tagsInput, setTagsInput] = useState(conn.tags?.join(", ") ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reprobing, setReprobing] = useState(false);
  const [reprobeSuccess, setReprobeSuccess] = useState(false);
  const [reprobeError, setReprobeError] = useState("");

  async function handleReprobe() {
    setReprobing(true);
    setReprobeSuccess(false);
    setReprobeError("");
    try {
      await onReprobe();
      setReprobeSuccess(true);
      setTimeout(() => setReprobeSuccess(false), 4000);
    } catch (err) {
      setReprobeError(err instanceof Error ? err.message : "Reprobe failed");
    } finally {
      setReprobing(false);
    }
  }

  const probe = conn.probeSnapshot;
  const hasProbe = Boolean(probe);

  return (
    <div className="conn-detail-card">
      {/* Header bar */}
      <div className="conn-detail-top">
        <div className="conn-detail-top-left">
          <StatusIndicator status={conn.status} locale={locale} />
          <span className="conn-detail-updated">
            <Clock style={{ width: 12, height: 12 }} />
            {new Date(conn.updatedAt).toLocaleString()}
          </span>
        </div>
        <div className="conn-detail-top-actions">
          <button
            className={`conn-btn conn-btn-primary ${reprobing ? "conn-btn-loading" : ""}`}
            type="button"
            onClick={() => void handleReprobe()}
            disabled={reprobing}
          >
            <RefreshCw style={{ width: 14, height: 14 }} className={reprobing ? "spinning" : ""} />
            {reprobing ? (locale === "zh" ? "采集中…" : "Probing…") : (locale === "zh" ? "重新采集" : "Reprobe")}
          </button>
          <button className="conn-btn conn-btn-ghost" type="button" onClick={() => setEditing((v) => !v)}>
            <Edit3 style={{ width: 14, height: 14 }} />
          </button>
          {confirmDelete ? (
            <div className="conn-delete-confirm">
              <button className="conn-btn conn-btn-danger" type="button" onClick={onDelete}>
                {locale === "zh" ? "确认" : "Confirm"}
              </button>
              <button className="conn-btn conn-btn-ghost" type="button" onClick={() => setConfirmDelete(false)}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ) : (
            <button className="conn-btn conn-btn-ghost conn-btn-danger-text" type="button" onClick={() => setConfirmDelete(true)}>
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      {/* Reprobe feedback */}
      {reprobing ? (
        <div className="conn-feedback conn-feedback-info">
          <Activity style={{ width: 14, height: 14 }} className="spinning" />
          {locale === "zh" ? "正在通过 SSH 重新采集系统信息…" : "Re-collecting system info via SSH…"}
        </div>
      ) : reprobeSuccess ? (
        <div className="conn-feedback conn-feedback-success">
          <CheckCircle2 style={{ width: 14, height: 14 }} />
          {locale === "zh" ? "采集完成，数据已更新" : "Collection complete, data updated"}
        </div>
      ) : reprobeError ? (
        <div className="conn-feedback conn-feedback-error">
          <X style={{ width: 14, height: 14 }} />
          {reprobeError}
        </div>
      ) : null}

      {/* System info cards — only when probed */}
      {hasProbe && probe ? (
        <div className="conn-system-grid">
          <div className="conn-sys-card">
            <Server style={{ width: 16, height: 16 }} />
            <div>
              <span className="conn-sys-label">{locale === "zh" ? "主机" : "Host"}</span>
              <strong>{probe.system.hostname}</strong>
              {probe.system.osPretty ? <span className="conn-sys-sub">{probe.system.osPretty}</span> : null}
            </div>
          </div>
          <div className="conn-sys-card">
            <Cpu style={{ width: 16, height: 16 }} />
            <div>
              <span className="conn-sys-label">CPU</span>
              <strong>{probe.system.cpu.cores} cores</strong>
              <span className="conn-sys-sub">{probe.system.cpu.model?.slice(0, 28)}</span>
            </div>
          </div>
          <div className="conn-sys-card">
            <MemoryStick style={{ width: 16, height: 16 }} />
            <div>
              <span className="conn-sys-label">{locale === "zh" ? "内存" : "Memory"}</span>
              <strong>{probe.system.memory.totalGb} GB</strong>
              <span className="conn-sys-sub">{probe.system.memory.freeGb} GB {locale === "zh" ? "可用" : "free"}</span>
            </div>
          </div>
          <div className="conn-sys-card">
            <HardDrive style={{ width: 16, height: 16 }} />
            <div>
              <span className="conn-sys-label">{locale === "zh" ? "磁盘" : "Disk"}</span>
              {probe.system.disk ? (
                <>
                  <strong>{probe.system.disk.usePercent}</strong>
                  <span className="conn-sys-sub">{probe.system.disk.used} / {probe.system.disk.total}</span>
                </>
              ) : (
                <strong>—</strong>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Software summary */}
      {hasProbe && probe ? (
        <div className="conn-software-summary">
          <div className="conn-sw-header">
            <span>{locale === "zh" ? "已安装软件" : "Installed software"}</span>
            <span className="conn-sw-count">{probe.software.length}</span>
          </div>
          <div className="conn-sw-pills">
            {probe.software.slice(0, 12).map((s) => (
              <span key={`${s.source}-${s.name}`} className="conn-sw-pill">
                {s.name} <em>{s.version?.slice(0, 12)}</em>
              </span>
            ))}
            {probe.software.length > 12 ? (
              <span className="conn-sw-pill conn-sw-more">+{probe.software.length - 12}</span>
            ) : null}
          </div>
          {(probe as any).counts ? (
            <div className="conn-sw-sources">
              {Object.entries((probe as any).counts as Record<string, number>)
                .filter(([k, v]) => (v as number) > 0 && k !== "total" && k !== "enabledServices" && k !== "runningServices")
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 8)
                .map(([k, v]) => (
                  <span key={k} className="conn-source-tag">{k}: {v as number}</span>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Connection fields */}
      <div className="conn-fields-compact">
        {Object.entries(conn.fields)
          .filter(([key]) => !key.startsWith("_"))
          .map(([key, value]) => (
            <div className="conn-field-item" key={key}>
              <span>{key}</span>
              <code>{value}</code>
            </div>
          ))}
      </div>

      {conn.sshError ? (
        <div className="conn-feedback conn-feedback-error" style={{ marginTop: 0 }}>
          {conn.sshError}
        </div>
      ) : null}

      {/* Edit form */}
      {editing ? (
        <div className="conn-edit-section">
          <label>
            <span>{locale === "zh" ? "标签" : "Label"}</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            <span>{locale === "zh" ? "标签组（逗号分隔）" : "Tags (comma-separated)"}</span>
            <input
              value={tagsInput}
              placeholder="dev, staging, prod"
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </label>
          <div className="conn-edit-actions">
            <button className="conn-btn conn-btn-primary" type="button" onClick={() => {
              const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
              onUpdate({ label, tags });
              setEditing(false);
            }}>
              {locale === "zh" ? "保存" : "Save"}
            </button>
            <button className="conn-btn conn-btn-ghost" type="button" onClick={() => setEditing(false)}>
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusIndicator({ status, locale }: { status: string; locale: Locale }) {
  const config: Record<string, { color: string; bg: string; label: { zh: string; en: string } }> = {
    probed: { color: "#065f46", bg: "#dcfce7", label: { zh: "已采集", en: "Probed" } },
    ssh_ok: { color: "#1d4ed8", bg: "#dbeafe", label: { zh: "SSH 成功", en: "SSH OK" } },
    validated: { color: "#6b7280", bg: "#f3f4f6", label: { zh: "已验证", en: "Validated" } },
    ssh_failed: { color: "#b42318", bg: "#fee2e2", label: { zh: "SSH 失败", en: "SSH Failed" } },
    unreachable: { color: "#b42318", bg: "#fee2e2", label: { zh: "不可达", en: "Unreachable" } }
  };
  const c = config[status] ?? config.validated;
  return (
    <span className="conn-status-pill" style={{ background: c.bg, color: c.color }}>
      <span className="conn-status-pill-dot" style={{ background: c.color }} />
      {locale === "zh" ? c.label.zh : c.label.en}
    </span>
  );
}
