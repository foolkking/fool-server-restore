import React, { useState, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { uninstallPackages, streamTask, type ExecutionTask } from "../api";
import type { Locale } from "../lib/types";
import type { LucideIcon } from "lucide-react";

const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  "apt": { bg: "#fef3c7", fg: "#92400e" },
  "apt-manual": { bg: "#fde68a", fg: "#78350f" },
  "rpm": { bg: "#fee2e2", fg: "#991b1b" },
  "snap": { bg: "#e0e7ff", fg: "#3730a3" },
  "flatpak": { bg: "#ede9fe", fg: "#5b21b6" },
  "npm": { bg: "#dcfce7", fg: "#166534" },
  "pip": { bg: "#f0fdf4", fg: "#14532d" },
  "gem": { bg: "#fce7f3", fg: "#9d174d" },
  "cargo": { bg: "#fff7ed", fg: "#9a3412" },
  "local-bin": { bg: "#f1f5f9", fg: "#334155" },
  "opt": { bg: "#f8fafc", fg: "#475569" },
  "user-bin": { bg: "#f5f3ff", fg: "#6d28d9" },
  "nvm": { bg: "#ecfdf5", fg: "#065f46" },
  "pyenv": { bg: "#eff6ff", fg: "#1d4ed8" },
  "rbenv": { bg: "#fef2f2", fg: "#b91c1c" },
  "asdf": { bg: "#f0fdfa", fg: "#115e59" },
  "sdkman": { bg: "#fefce8", fg: "#854d0e" },
  "docker": { bg: "#dbeafe", fg: "#1e40af" },
  "runtime": { bg: "#eff6ff", fg: "#1d4ed8" },
  "system": { bg: "#f1f5f9", fg: "#475569" },
  "container": { bg: "#dbeafe", fg: "#1e40af" },
  "local-app": { bg: "#fef3c7", fg: "#92400e" },
  "systemd": { bg: "#e0e7ff", fg: "#3730a3" },
  "srv": { bg: "#fef9c3", fg: "#854d0e" },
  "go-bin": { bg: "#ecfdf5", fg: "#065f46" },
  "cron": { bg: "#fce7f3", fg: "#9d174d" },
  "systemd-timer": { bg: "#e0e7ff", fg: "#4338ca" },
};

function getSourceStyle(source: string) {
  return SOURCE_COLORS[source] ?? { bg: "#f8fafc", fg: "#475569" };
}

export interface InventoryRow {
  id: string;
  icon: LucideIcon;
  name: string;
  value: string;
  command: string;
  source?: string;
  /** Only set on apt source. "uncertain" rows are hidden by default in the software panel. */
  trust?: "user" | "uncertain";
}

export function InventoryPanel({
  title, rows, selected, onToggle, commandLabel, locale, panelKind, counts,
  authToken, connectionId, onTaskUpdate, pushLog
}: {
  title: string;
  rows: InventoryRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  commandLabel: string;
  locale: Locale;
  panelKind: "software" | "config";
  counts?: Record<string, number>;
  authToken?: string;
  connectionId?: string | null;
  onTaskUpdate?: (task: ExecutionTask) => void;
  pushLog?: (type: "info" | "success" | "error" | "cmd", text: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Hidden by default: apt rows marked "uncertain" (probably cloud-image bloat).
  // User can flip "show all" to see everything.
  const trustedRows = useMemo(() => {
    if (showAll || panelKind !== "software") return rows;
    return rows.filter((r) => r.trust !== "uncertain");
  }, [rows, showAll, panelKind]);
  const hiddenByTrust = rows.length - trustedRows.length;

  const sourceFilters = useMemo(() => {
    if (counts && Object.keys(counts).length > 0) {
      return Object.entries(counts)
        .filter(([key, val]) => val > 0 && key !== "total" && key !== "enabledServices" && key !== "runningServices")
        .sort((a, b) => b[1] - a[1]);
    }
    const map = new Map<string, number>();
    for (const row of rows) { map.set(row.source ?? "other", (map.get(row.source ?? "other") ?? 0) + 1); }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [counts, rows]);

  const filterKeyToSource: Record<string, string> = { localBin: "local-bin", userBin: "user-bin" };

  const filteredRows = useMemo(() => {
    let result = trustedRows;
    if (activeFilter !== "all") {
      const matchSource = filterKeyToSource[activeFilter] ?? activeFilter;
      result = result.filter((r) => {
        const s = r.source ?? "";
        if (matchSource === "apt") return s === "apt" || s === "apt-manual";
        return s === matchSource;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
    }
    return result;
  }, [trustedRows, activeFilter, searchQuery]);

  const MAX_DISPLAY = 200;
  const displayRows = filteredRows.slice(0, MAX_DISPLAY);
  const hasMore = filteredRows.length > MAX_DISPLAY;
  const totalCount = counts?.total ?? rows.length;

  // Uninstall selected packages
  async function handleUninstallSelected() {
    if (!authToken || !connectionId) return;
    const selectedRows = rows.filter((r) => selected.has(r.id));
    if (selectedRows.length === 0) return;
    // Group by source
    const bySource = new Map<string, string[]>();
    for (const row of selectedRows) {
      const src = row.source ?? "apt";
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(row.name);
    }
    pushLog?.("cmd", `uninstall ${selectedRows.map((r) => r.name).join(", ")}`);
    for (const [source, pkgs] of bySource) {
      try {
        const result = await uninstallPackages(authToken, connectionId, pkgs, source, false);
        pushLog?.("info", `Task ${result.taskId}: removing ${pkgs.join(", ")} (${source})`);
        if (onTaskUpdate) {
          streamTask(result.taskId, onTaskUpdate, authToken);
        }
      } catch (err) {
        pushLog?.("error", err instanceof Error ? err.message : "Uninstall failed");
      }
    }
  }

  // Uninstall single package
  async function handleUninstallOne(row: InventoryRow) {
    if (!authToken || !connectionId) return;
    setUninstallingId(row.id);
    pushLog?.("cmd", `uninstall ${row.name} (${row.source})`);
    try {
      const result = await uninstallPackages(authToken, connectionId, [row.name], row.source ?? "apt", false);
      pushLog?.("info", `Task ${result.taskId}: removing ${row.name}`);
      if (onTaskUpdate) {
        streamTask(result.taskId, (task) => {
          onTaskUpdate(task);
          if (task.status === "succeeded" || task.status === "failed") {
            setUninstallingId(null);
            pushLog?.(task.status === "succeeded" ? "success" : "error",
              task.status === "succeeded" ? `${row.name} 已卸载` : `卸载失败: ${task.error ?? ""}`);
          }
        }, authToken);
      }
    } catch (err) {
      setUninstallingId(null);
      pushLog?.("error", err instanceof Error ? err.message : "Uninstall failed");
    }
  }

  const canUninstall = Boolean(authToken && connectionId) && panelKind === "software";
  const hasSelected = [...selected].some((id) => rows.find((r) => r.id === id));

  return (
    <section className="panel-large">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="panel-count">{totalCount}</span>
      </div>

      {panelKind === "software" && rows.length > 10 ? (
        <div className="inventory-filters">
          <div className="filter-pills">
            <button type="button" className={`filter-pill ${activeFilter === "all" ? "active" : ""}`} onClick={() => setActiveFilter("all")}>
              {locale === "zh" ? "全部" : "All"} ({totalCount})
            </button>
            {sourceFilters.slice(0, 12).map(([key, count]) => (
              <button key={key} type="button" className={`filter-pill ${activeFilter === key ? "active" : ""}`}
                onClick={() => setActiveFilter(activeFilter === key ? "all" : key)}>
                <span className="filter-pill-dot" style={{ background: getSourceStyle(filterKeyToSource[key] ?? key).fg }} />
                {key} ({count})
              </button>
            ))}
          </div>
          <input className="inventory-search" type="text" placeholder={locale === "zh" ? "搜索软件名…" : "Search packages…"}
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {panelKind === "software" && hiddenByTrust > 0 ? (
            <label className="inventory-toggle" title={locale === "zh"
              ? "默认只显示已知用户级软件（如 nginx、redis、docker 等）。开启后显示所有 apt-mark showmanual 包，包含云镜像预装的额外软件。"
              : "By default we only show known server software (nginx, redis, docker, ...). Toggle on to see every apt-mark showmanual package including cloud-image preinstalls."}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              <span>{locale === "zh"
                ? `显示全部（含 ${hiddenByTrust} 个云镜像预装）`
                : `Show all (incl. ${hiddenByTrust} cloud-image)`}</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {/* Batch uninstall button */}
      {canUninstall && hasSelected ? (
        <div style={{ marginBottom: 12 }}>
          <button className="conn-btn conn-btn-danger" type="button" onClick={() => void handleUninstallSelected()}
            style={{ fontSize: 13, gap: 6 }}>
            <Trash2 style={{ width: 14, height: 14 }} />
            {locale === "zh" ? `卸载选中 (${[...selected].filter((id) => rows.find((r) => r.id === id)).length})` : `Uninstall selected (${[...selected].filter((id) => rows.find((r) => r.id === id)).length})`}
          </button>
        </div>
      ) : null}

      {activeFilter !== "all" || searchQuery ? (
        <div className="filter-status">
          {locale === "zh" ? `显示 ${filteredRows.length} / ${totalCount} 项` : `Showing ${filteredRows.length} / ${totalCount} items`}
          {activeFilter !== "all" ? (
            <button type="button" className="filter-clear" onClick={() => { setActiveFilter("all"); setSearchQuery(""); }}>
              ✕ {locale === "zh" ? "清除筛选" : "Clear filter"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="inventory-list">
        {displayRows.map((row) => {
          const Icon = row.icon;
          const isExpanded = expandedId === row.id;
          const srcStyle = getSourceStyle(row.source ?? "system");
          const isUninstalling = uninstallingId === row.id;
          return (
            <div key={row.id} className="inventory-item-wrap">
              <div className={`inventory-item ${isExpanded ? "expanded" : ""}`}>
                <input checked={selected.has(row.id)} onChange={() => onToggle(row.id)} type="checkbox" />
                <Icon aria-hidden />
                <span>
                  <strong>{row.name}</strong>
                  <small style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: srcStyle.bg, color: srcStyle.fg, borderRadius: 4, fontSize: 10, fontWeight: 700, padding: "1px 5px" }}>{row.source ?? "system"}</span>
                    <span style={{ color: "#64748b" }}>{row.value}</span>
                  </small>
                </span>
                <div className="inventory-item-actions">
                  {canUninstall ? (
                    <button className="inv-action-btn" type="button"
                      disabled={isUninstalling}
                      onClick={() => void handleUninstallOne(row)}
                      title={locale === "zh" ? "卸载" : "Uninstall"}
                      style={{ color: isUninstalling ? "#94a3b8" : "#ef4444" }}>
                      {isUninstalling ? "⏳" : <Trash2 style={{ width: 14, height: 14 }} />}
                    </button>
                  ) : null}
                  <button className="inv-action-btn" type="button" onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    title={locale === "zh" ? "详情" : "Details"}>
                    {isExpanded ? "▲" : "▼"}
                  </button>
                </div>
              </div>
              {isExpanded ? (
                <div className="inventory-detail">
                  <div className="inv-detail-grid">
                    <div className="inv-detail-row"><span>{locale === "zh" ? "名称" : "Name"}</span><strong>{row.name}</strong></div>
                    <div className="inv-detail-row"><span>{locale === "zh" ? "版本" : "Version"}</span><span>{row.value}</span></div>
                    <div className="inv-detail-row"><span>{locale === "zh" ? "来源" : "Source"}</span><span style={{ background: srcStyle.bg, color: srcStyle.fg, borderRadius: 4, padding: "1px 6px", fontSize: 12, fontWeight: 600 }}>{row.source}</span></div>
                    {row.command ? <div className="inv-detail-row"><span>{commandLabel}</span><code>{row.command}</code></div> : null}
                  </div>
                  {canUninstall ? (
                    <div className="inv-detail-actions" style={{ marginTop: 10 }}>
                      <button className="conn-btn conn-btn-danger" type="button" disabled={isUninstalling}
                        onClick={() => void handleUninstallOne(row)} style={{ fontSize: 13 }}>
                        <Trash2 style={{ width: 14, height: 14 }} />
                        {isUninstalling ? (locale === "zh" ? "卸载中…" : "Removing…") : (locale === "zh" ? "卸载此软件" : "Uninstall")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {hasMore ? (
          <div className="inventory-more-hint">
            {locale === "zh" ? `还有 ${filteredRows.length - MAX_DISPLAY} 项未显示，请使用搜索或筛选缩小范围` : `${filteredRows.length - MAX_DISPLAY} more items not shown.`}
          </div>
        ) : null}
      </div>
    </section>
  );
}
