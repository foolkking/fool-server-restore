import React, { useState, useEffect, useRef } from "react";
import { Terminal, ChevronDown, ChevronUp, X } from "lucide-react";
import type { ExecutionTask, ConnectionProfile } from "../api";
import type { Locale } from "../lib/types";

export interface TerminalLogEntry {
  time: string;
  type: "info" | "success" | "error" | "cmd";
  text: string;
}

export function TerminalPanel({
  locale,
  activeTask,
  activeConnection,
  terminalLogs,
  onClose
}: {
  locale: Locale;
  activeTask: ExecutionTask | null;
  activeConnection: ConnectionProfile | null;
  terminalLogs: TerminalLogEntry[];
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(320);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-expand when task starts or new logs arrive
  useEffect(() => {
    if (activeTask && activeTask.status === "running") setExpanded(true);
  }, [activeTask?.id, activeTask?.status]);

  useEffect(() => {
    if (terminalLogs.length > 0) setExpanded(true);
  }, [terminalLogs.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current && expanded) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [terminalLogs.length, activeTask?.steps?.length, expanded]);

  const statusIcon: Record<string, string> = {
    succeeded: "✓", failed: "✗", running: "⏳", pending: "○", skipped: "—", cancelled: "✕", queued: "⌛"
  };
  const statusColor: Record<string, string> = {
    succeeded: "#34d399", failed: "#f87171", running: "#60a5fa", pending: "#64748b", skipped: "#fbbf24", cancelled: "#94a3b8", queued: "#a78bfa"
  };

  // Header text
  let headerText: string;
  if (activeTask) {
    if (activeTask.status === "queued") {
      const ahead = activeTask.queuePosition ?? 0;
      headerText = locale === "zh"
        ? `任务排队中 · 前面还有 ${ahead} 个任务`
        : `Task queued · ${ahead} ahead`;
    } else if (activeTask.kind === "batch-install" && activeTask.items) {
      const done = activeTask.items.filter((it) => it.status === "succeeded" || it.status === "failed" || it.status === "skipped").length;
      const total = activeTask.items.length;
      const statusStr = locale === "zh"
        ? (activeTask.status === "running" ? "安装中" : activeTask.status === "succeeded" ? "完成" : activeTask.status === "failed" ? "失败" : "已取消")
        : (activeTask.status === "running" ? "Installing" : activeTask.status === "succeeded" ? "Done" : activeTask.status === "failed" ? "Failed" : "Cancelled");
      headerText = `${locale === "zh" ? "批量安装" : "Batch Install"} · ${statusStr} · ${done}/${total}`;
    } else {
      const done = activeTask.steps.filter((s) => s.status === "succeeded").length;
      headerText = `${locale === "zh" ? "任务" : "Task"} · ${done}/${activeTask.steps.length}`;
    }
  } else if (activeConnection) {
    headerText = `${activeConnection.fields.username ?? ""}@${activeConnection.fields.host ?? ""}:${activeConnection.fields.port ?? "22"}`;
  } else {
    headerText = locale === "zh" ? "终端" : "Terminal";
  }

  const logCount = terminalLogs.length + (activeTask?.steps?.length ?? 0);

  // Drag to resize
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    function onMove(ev: MouseEvent) {
      const delta = startY - ev.clientY;
      setHeight(Math.max(150, Math.min(window.innerHeight * 0.8, startH + delta)));
    }
    function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div ref={panelRef} className={`terminal-panel ${expanded ? "expanded" : ""}`} style={expanded ? { "--terminal-height": `${height}px` } as React.CSSProperties : undefined}>
      {expanded ? <div className="terminal-resize-handle" onMouseDown={handleResizeStart} /> : null}
      <button
        className="terminal-header"
        type="button"
        onClick={() => setExpanded((v) => !v)}
      >
        <Terminal aria-hidden style={{ width: 16, height: 16 }} />
        <span className="terminal-title">{headerText}</span>
        {activeTask?.status === "running" ? <span className="terminal-running-dot" /> : null}
        {logCount > 0 ? <span className="terminal-log-count">{logCount}</span> : null}
        <span className="terminal-toggle">
          {expanded
            ? <ChevronDown aria-hidden style={{ width: 16, height: 16 }} />
            : <ChevronUp aria-hidden style={{ width: 16, height: 16 }} />}
        </span>
        {expanded && activeTask ? (
          <span className="terminal-close" onClick={(e) => { e.stopPropagation(); onClose(); }} role="button">
            <X aria-hidden style={{ width: 14, height: 14 }} />
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="terminal-body" ref={bodyRef}>
          {/* Connection logs */}
          {terminalLogs.length > 0 ? (
            <div className="terminal-log">
              {terminalLogs.map((log, i) => (
                <div key={i} className={`terminal-line terminal-${log.type}`}>
                  <span className="terminal-time">{log.time}</span>
                  {log.type === "cmd" ? "$ " : log.type === "success" ? "✓ " : log.type === "error" ? "✗ " : "› "}
                  {log.text}
                </div>
              ))}
            </div>
          ) : null}

          {/* Task execution logs */}
          {activeTask ? (
            <div className="terminal-log">
              <div className="terminal-line terminal-info" style={{ borderTop: terminalLogs.length > 0 ? "1px solid #1e293b" : "none", paddingTop: 8, marginTop: 4 }}>
                ▶ {activeTask.kind === "batch-install" ? (locale === "zh" ? "批量安装任务" : "Batch install task") : (locale === "zh" ? "执行任务" : "Execution task")}
                {activeTask.dryRun ? ` (${locale === "zh" ? "预览模式" : "dry-run"})` : ""}
              </div>
              {activeTask.kind === "batch-install"
                ? renderBatchTask(activeTask)
                : renderSingleTask(activeTask)}
            </div>
          ) : null}

          {/* Empty state */}
          {terminalLogs.length === 0 && !activeTask ? (
            <div className="terminal-empty">
              <Terminal aria-hidden style={{ width: 28, height: 28, opacity: 0.35 }} />
              <p>{locale === "zh"
                ? "选择一个已保存的连接开始操作。连接、采集、安装的日志都会显示在这里。"
                : "Select a saved connection to start. Connection, collection, and install logs appear here."}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  function renderBatchTask(task: ExecutionTask) {
    if (!task.items) return null;
    return (
      <>
        {task.items.map((item) => {
          const itemSteps = task.steps.filter((s) => s.itemIndex === item.index);
          const isRunning = item.status === "running";
          return (
            <div key={item.catalogId} className={`terminal-batch-item status-${item.status}`}>
              <div className="terminal-batch-header">
                <span style={{ color: statusColor[item.status] ?? "#64748b" }}>
                  {statusIcon[item.status] ?? "○"}
                </span>
                <span className="terminal-batch-name">{item.displayName}</span>
                {isRunning ? <span className="terminal-running-dot" style={{ marginLeft: 6 }} /> : null}
                {item.error ? <span className="terminal-batch-error">{item.error}</span> : null}
              </div>
              {itemSteps.length > 0 ? (
                <div className="terminal-batch-steps">
                  {itemSteps.map((step) => (
                    <div key={step.id} className={`terminal-step status-${step.status}`}>
                      <span className="step-icon" style={{ color: statusColor[step.status] ?? "#64748b" }}>
                        {statusIcon[step.status] ?? "○"}
                      </span>
                      <span className="step-label">{step.label}</span>
                      {step.durationMs > 0 ? <span className="step-duration">{step.durationMs}ms</span> : null}
                      <div className="step-command">$ {step.command}</div>
                      {step.stdout ? <pre className="step-output">{step.stdout.slice(0, 400)}</pre> : null}
                      {step.stderr ? <pre className="step-output stderr">{step.stderr.slice(0, 200)}</pre> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {task.error ? <div className="terminal-line terminal-error">✗ {task.error}</div> : null}
      </>
    );
  }

  function renderSingleTask(task: ExecutionTask) {
    return (
      <>
        {task.steps.map((step) => (
          <div key={step.id} className={`terminal-step status-${step.status}`}>
            <span className="step-icon" style={{ color: statusColor[step.status] ?? "#64748b" }}>
              {statusIcon[step.status] ?? "○"}
            </span>
            <span className="step-label">{step.label}</span>
            {step.durationMs > 0 ? <span className="step-duration">{step.durationMs}ms</span> : null}
            <div className="step-command">$ {step.command}</div>
            {step.stdout ? <pre className="step-output">{step.stdout.slice(0, 600)}</pre> : null}
            {step.stderr ? <pre className="step-output stderr">{step.stderr.slice(0, 300)}</pre> : null}
          </div>
        ))}
        {task.error ? <div className="terminal-line terminal-error">✗ {task.error}</div> : null}
      </>
    );
  }
}
