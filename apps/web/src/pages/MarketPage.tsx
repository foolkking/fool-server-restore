import React, { useState, useEffect } from "react";
import {
  batchExecute,
  cancelTaskRequest,
  executeProfile,
  fetchBatchImpact,
  fetchDockerCompose,
  streamTask,
  type BatchImpactResult,
  type CatalogItem,
  type ExecutionTask
} from "../api";
import type { Locale } from "../lib/types";
import { categoryIcons } from "../lib/types";
import { ComponentPreview, getCatalogComponents } from "../components/ComponentPreview";

const text = {
  zh: {
    market: "配置市场"
  },
  en: {
    market: "Config Market"
  }
};

export function MarketPage({
  t,
  locale,
  items,
  selected,
  kind,
  onKind,
  onOpenGuide,
  onToggle,
  authToken,
  activeConnectionId,
  activeTask,
  onTaskUpdate
}: {
  t: typeof text.zh;
  locale: Locale;
  items: CatalogItem[];
  selected: Set<string>;
  kind: "software" | "combo";
  onKind: (kind: "software" | "combo") => void;
  onOpenGuide: (id: string) => void;
  onToggle: (id: string) => void;
  authToken: string;
  activeConnectionId: string | null;
  activeTask: ExecutionTask | null;
  onTaskUpdate: (task: ExecutionTask) => void;
}) {
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState("");
  const [batchInstalling, setBatchInstalling] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [impact, setImpact] = useState<BatchImpactResult | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [dockerComposeId, setDockerComposeId] = useState<string | null>(null);
  const [dockerComposeContent, setDockerComposeContent] = useState("");

  // Auto-fetch impact when selection changes (debounced)
  useEffect(() => {
    const selectedIds = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (selectedIds.length === 0) { setImpact(null); return; }

    setLoadingImpact(true);
    const timer = setTimeout(async () => {
      try {
        const result = await fetchBatchImpact(selectedIds);
        setImpact(result);
      } catch { /* silent */ } finally {
        setLoadingImpact(false);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [selected.size, items]);

  // 单个 catalog item 安装（用于单独安装按钮，如果保留的话）
  async function handleExecute(itemId: string, dryRun: boolean): Promise<boolean> {
    if (!authToken || !activeConnectionId) {
      setTaskError(locale === "zh" ? "请先登录并选择已连接的虚拟机" : "Login and select a connected VM first");
      return false;
    }
    setExecutingId(itemId);
    setTaskError("");
    return new Promise<boolean>((resolve) => {
      executeProfile(authToken, activeConnectionId, itemId, dryRun)
        .then((result) => {
          setActiveTaskId(result.taskId);
          const unsubscribe = streamTask(result.taskId, (task) => {
            onTaskUpdate(task);
            if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") {
              unsubscribe();
              setExecutingId(null);
              resolve(task.status === "succeeded");
            }
          }, authToken);
        })
        .catch((err: unknown) => {
          setTaskError(err instanceof Error ? err.message : "Execution failed");
          setExecutingId(null);
          resolve(false);
        });
    });
  }

  // 真正的批量安装：一次 SSH 连接，一个 taskId，SSE 流
  async function handleBatchInstall(dryRun: boolean) {
    if (!authToken || !activeConnectionId) {
      setTaskError(locale === "zh" ? "请先登录并选择已连接的虚拟机" : "Login and select a connected VM first");
      return;
    }
    const selectedItems = items.filter((i) => selected.has(i.id));
    if (selectedItems.length === 0) return;

    setBatchInstalling(true);
    setBatchProgress({ done: 0, total: selectedItems.length });
    setTaskError("");

    try {
      const result = await batchExecute(
        authToken,
        activeConnectionId,
        selectedItems.map((i) => i.id),
        dryRun
      );

      setActiveTaskId(result.taskId);

      // 订阅 SSE 流，实时更新进度
      const unsubscribe = streamTask(result.taskId, (task) => {
        onTaskUpdate(task);
        // 更新进度计数
        if (task.items) {
          const done = task.items.filter((it) => it.status === "succeeded" || it.status === "failed" || it.status === "skipped").length;
          setBatchProgress({ done, total: task.items.length });
        }

        if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") {
          unsubscribe();
          setBatchInstalling(false);
          if (task.status === "failed" && task.error) {
            setTaskError(task.error);
          }
        }
      }, authToken);
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : "Batch execute failed");
      setBatchInstalling(false);
      setBatchProgress(null);
    }
  }

  async function handleCancelBatch() {
    if (!authToken || !activeTaskId) return;
    await cancelTaskRequest(authToken, activeTaskId);
  }

  async function handleShowDockerCompose(e: React.MouseEvent, itemId: string) {
    e.stopPropagation();
    setDockerComposeId(itemId);
    setDockerComposeContent("");
    try {
      const content = await fetchDockerCompose(itemId);
      setDockerComposeContent(content);
    } catch (err) {
      setDockerComposeContent(`# Error: ${err instanceof Error ? err.message : "Failed to load"}`);
    }
  }

  function handleCloseDockerModal() {
    setDockerComposeId(null);
    setDockerComposeContent("");
  }

  function handleCopyCompose() {
    if (dockerComposeContent) {
      void navigator.clipboard.writeText(dockerComposeContent);
    }
  }

  function handleDownloadCompose() {
    if (!dockerComposeContent || !dockerComposeId) return;
    const blob = new Blob([dockerComposeContent], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dockerComposeId}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const componentLabels = {
    software: locale === "zh" ? "软件" : "Software",
    "system-command": locale === "zh" ? "命令" : "Command",
    "system-config": locale === "zh" ? "配置" : "Config"
  };

  const canExecute = Boolean(authToken && activeConnectionId);
  const executeTooltip = !authToken
    ? (locale === "zh" ? "请先登录" : "Login required")
    : !activeConnectionId
    ? (locale === "zh" ? "请先选择已连接的虚拟机" : "Select a connected VM first")
    : undefined;

  return (
    <div className="store-content">
      <div className="store-heading">
        <div>
          <h1>{t.market}</h1>
          <p className="store-hint">
            {locale === "zh"
              ? `共 ${items.length} 项·已选 ${selected.size} 项`
              : `${items.length} items · ${selected.size} selected`}
          </p>
        </div>
        <div className="market-header-actions">
          {selected.size > 0 ? (
            <button
              className="ghost-action"
              type="button"
              onClick={() => {
                items.forEach((i) => { if (selected.has(i.id)) onToggle(i.id); });
              }}
            >
              {locale === "zh" ? "清空" : "Clear"}
            </button>
          ) : null}
          {batchInstalling ? (
            <button
              className="ghost-action"
              type="button"
              style={{ color: "#b42318", borderColor: "#fecaca" }}
              onClick={() => void handleCancelBatch()}
            >
              ✕ {locale === "zh" ? "取消" : "Cancel"}
            </button>
          ) : null}
          <button
            className={`primary-action batch-install-btn ${batchInstalling ? "btn-loading" : ""}`}
            type="button"
            disabled={!canExecute || selected.size === 0 || batchInstalling}
            title={!canExecute ? executeTooltip : selected.size === 0 ? (locale === "zh" ? "请先勾选要安装的配置" : "Select items first") : undefined}
            onClick={() => void handleBatchInstall(false)}
          >
            {batchInstalling ? <span className="spinning">↻</span> : null}
            {batchInstalling
              ? batchProgress
                ? (locale === "zh" ? `安装中 ${batchProgress.done}/${batchProgress.total}` : `Installing ${batchProgress.done}/${batchProgress.total}`)
                : (locale === "zh" ? "连接中…" : "Connecting…")
              : (locale === "zh" ? `一键安装 (${selected.size})` : `Install (${selected.size})`)}
          </button>
          <div className="market-switch" aria-label={locale === "zh" ? "配置类型" : "Config type"}>
            <button className={kind === "software" ? "active" : ""} type="button" onClick={() => onKind("software")}>
              {locale === "zh" ? "软件" : "Software"}
            </button>
            <button className={kind === "combo" ? "active" : ""} type="button" onClick={() => onKind("combo")}>
              {locale === "zh" ? "组合" : "Combos"}
            </button>
          </div>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="market-category-filters">
        <button type="button" className={`filter-pill ${categoryFilter === "all" ? "active" : ""}`} onClick={() => setCategoryFilter("all")}>
          {locale === "zh" ? "全部" : "All"}
        </button>
        {["runtime", "database", "security", "network", "container", "developer", "service"].map((cat) => (
          <button key={cat} type="button" className={`filter-pill ${categoryFilter === cat ? "active" : ""}`} onClick={() => setCategoryFilter(cat)}>
            {cat === "runtime" ? (locale === "zh" ? "运行时" : "Runtime")
              : cat === "database" ? (locale === "zh" ? "数据库" : "Database")
              : cat === "security" ? (locale === "zh" ? "安全" : "Security")
              : cat === "network" ? (locale === "zh" ? "网络" : "Network")
              : cat === "container" ? (locale === "zh" ? "容器" : "Container")
              : cat === "developer" ? (locale === "zh" ? "开发" : "Dev")
              : (locale === "zh" ? "服务" : "Service")}
          </button>
        ))}
      </div>

      {taskError ? <p className="connection-error" style={{ marginBottom: 16 }}>{taskError}</p> : null}

      {/* 影响范围预估面板 */}
      {selected.size > 0 && (impact || loadingImpact) ? (
        <div className="impact-panel">
          {loadingImpact ? (
            <div className="impact-loading">
              <span className="spinning">↻</span>
              {locale === "zh" ? "正在预估影响范围…" : "Estimating impact…"}
            </div>
          ) : impact ? (
            <>
              <div className="impact-header">
                <span className={`impact-risk risk-${impact.totals.maxRisk}`}>
                  {impact.totals.maxRisk === "high" ? "⚠ " : impact.totals.maxRisk === "medium" ? "△ " : "✓ "}
                  {locale === "zh"
                    ? (impact.totals.maxRisk === "high" ? "高风险" : impact.totals.maxRisk === "medium" ? "中等风险" : "低风险")
                    : (impact.totals.maxRisk === "high" ? "High risk" : impact.totals.maxRisk === "medium" ? "Medium risk" : "Low risk")}
                </span>
                <span className="impact-summary">
                  {locale === "zh" ? impact.totals.summaryZh : impact.totals.summaryEn}
                </span>
              </div>
              <div className="impact-items">
                {impact.reports.map((r) => (
                  <div key={r.catalogId} className="impact-item">
                    <span className="impact-item-name">{r.name}</span>
                    <span className="impact-item-detail">
                      {locale === "zh" ? r.impact.summaryZh : r.impact.summaryEn}
                    </span>
                    {r.impact.needsSudo ? (
                      <span className="impact-sudo-badge">sudo</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="catalog-grid">
        {items.filter((item) => categoryFilter === "all" || item.category === categoryFilter).map((item) => {
          const Icon = categoryIcons[item.category];
          const isSelected = selected.has(item.id);
          return (
              <article className={`catalog-card ${isSelected ? "catalog-card-selected" : ""}`} key={item.id} onClick={() => onToggle(item.id)}>
                <div className={`catalog-art ${item.imageTone}`}>
                  <div className="catalog-check">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggle(item.id)} onClick={(e) => e.stopPropagation()} />
                  </div>
                  <Icon aria-hidden />
                </div>
                <div className="catalog-body" onClick={(e) => e.stopPropagation()}>
                  <div className="catalog-title-row">
                    <h2>{locale === "zh" ? item.name : item.nameEn}</h2>
                    <button className="catalog-md-link" type="button" onClick={() => onOpenGuide(item.id)} title="View guide">
                      MD
                    </button>
                    {item.deployModes?.includes("docker") ? (
                      <button
                        className="catalog-md-link"
                        type="button"
                        onClick={(e) => void handleShowDockerCompose(e, item.id)}
                        title={locale === "zh" ? "查看 Docker Compose 文件" : "View Docker Compose file"}
                        style={{ marginLeft: 4 }}
                      >
                        🐳
                      </button>
                    ) : null}
                  </div>
                  <p>{locale === "zh" ? item.summary : item.summaryEn}</p>
                  <div className="catalog-meta">
                    <span>★ {item.rating.toFixed(1)}</span>
                    <span>{item.installs}</span>
                    <span className={`sensitivity-tag sensitivity-${item.sensitivity}`}>{item.sensitivity}</span>
                  </div>
                  <ComponentPreview components={getCatalogComponents(item)} labels={componentLabels} locale={locale} compact={item.kind === "software"} />
                </div>
              </article>
          );
        })}
      </div>

      {/* 终端日志由全局 TerminalPanel 显示 */}

      {/* Docker Compose 预览模态框 */}
      {dockerComposeId ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === "zh" ? "Docker Compose 文件" : "Docker Compose file"}
          onClick={handleCloseDockerModal}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
          }}
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface, #1e1e2e)", borderRadius: 12, padding: 24,
              width: "min(720px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 8px 40px rgba(0,0,0,0.4)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                🐳 {locale === "zh" ? "Docker Compose" : "Docker Compose"} — {dockerComposeId}
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={handleCopyCompose}
                  title={locale === "zh" ? "复制" : "Copy"}
                >
                  {locale === "zh" ? "复制" : "Copy"}
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={handleDownloadCompose}
                  title={locale === "zh" ? "下载" : "Download"}
                >
                  {locale === "zh" ? "下载" : "Download"}
                </button>
                <button
                  className="ghost-action"
                  type="button"
                  onClick={handleCloseDockerModal}
                  aria-label={locale === "zh" ? "关闭" : "Close"}
                >
                  ✕
                </button>
              </div>
            </div>
            <pre
              style={{
                flex: 1, overflow: "auto", margin: 0, padding: 16,
                background: "var(--surface-alt, #13131f)", borderRadius: 8,
                fontSize: 13, lineHeight: 1.6, fontFamily: "monospace",
                whiteSpace: "pre", color: "var(--text, #e2e8f0)"
              }}
            >
              {dockerComposeContent
                ? dockerComposeContent
                : <span style={{ opacity: 0.5 }}>{locale === "zh" ? "加载中…" : "Loading…"}</span>}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
