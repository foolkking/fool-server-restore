import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Terminal, X } from "lucide-react";
import type { ConnectionProfile, ExecutionTask } from "../api";
import type { Locale } from "../lib/types";

export interface TerminalLogEntry {
  time: string;
  type: "info" | "success" | "error" | "cmd";
  text: string;
}

const statusIcon: Record<string, string> = {
  succeeded: "OK",
  failed: "ERR",
  running: "RUN",
  pending: "WAIT",
  skipped: "SKIP",
  cancelled: "STOP",
  queued: "QUEUE"
};

const statusColor: Record<string, string> = {
  succeeded: "#34d399",
  failed: "#f87171",
  running: "#60a5fa",
  pending: "#94a3b8",
  skipped: "#fbbf24",
  cancelled: "#cbd5e1",
  queued: "#a78bfa"
};

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
  const [height, setHeight] = useState(300);
  const [width, setWidth] = useState(420);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTask?.status === "running" || activeTask?.status === "queued") setExpanded(true);
  }, [activeTask?.id, activeTask?.status]);

  useEffect(() => {
    if (bodyRef.current && expanded) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [terminalLogs.length, activeTask?.steps?.length, expanded]);

  const headerText = getHeaderText(locale, activeTask, activeConnection);
  const logCount = terminalLogs.length + (activeTask?.steps?.length ?? 0);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    function onMove(ev: MouseEvent) {
      setHeight(Math.max(170, Math.min(window.innerHeight * 0.72, startH + startY - ev.clientY)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleWidthResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    function onMove(ev: MouseEvent) {
      const maxWidth = Math.max(320, window.innerWidth - 278 - 18);
      setWidth(Math.max(320, Math.min(maxWidth, startW + ev.clientX - startX)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`terminal-panel ${expanded ? "expanded" : "collapsed"}`}
      style={{ "--terminal-height": `${height}px`, "--terminal-width": `${width}px` } as React.CSSProperties}
    >
      {expanded ? <div className="terminal-width-resize-handle" onMouseDown={handleWidthResizeStart} /> : null}
      {expanded ? <div className="terminal-resize-handle" onMouseDown={handleResizeStart} /> : null}
      <button className="terminal-header" type="button" onClick={() => setExpanded((value) => !value)}>
        <Terminal aria-hidden />
        <span className="terminal-title">{headerText}</span>
        {activeTask?.status === "running" ? <span className="terminal-running-dot" /> : null}
        {logCount > 0 ? <span className="terminal-log-count">{logCount}</span> : null}
        <span className="terminal-toggle">{expanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}</span>
        {expanded && activeTask ? (
          <span className="terminal-close" onClick={(e) => { e.stopPropagation(); onClose(); }} role="button" aria-label="Clear task">
            <X aria-hidden />
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="terminal-body" ref={bodyRef}>
          {terminalLogs.length > 0 ? (
            <div className="terminal-log">
              {terminalLogs.map((log, index) => (
                <div key={`${log.time}-${index}`} className={`terminal-line terminal-${log.type}`}>
                  <span className="terminal-time">{log.time}</span>
                  <span className="terminal-prefix">{log.type === "cmd" ? "$" : log.type === "success" ? "OK" : log.type === "error" ? "ERR" : ">"}</span>
                  <span>{log.text}</span>
                </div>
              ))}
            </div>
          ) : null}

          {activeTask ? (
            <div className="terminal-log terminal-task-log">
              <div className="terminal-line terminal-info">
                <span className="terminal-prefix">TASK</span>
                <span>{activeTask.kind === "batch-install" ? (locale === "zh" ? "批量安装任务" : "Batch install task") : (locale === "zh" ? "执行任务" : "Execution task")}</span>
              </div>
              {activeTask.kind === "batch-install" ? renderBatchTask(activeTask) : renderSingleTask(activeTask)}
            </div>
          ) : null}

          {terminalLogs.length === 0 && !activeTask ? (
            <div className="terminal-empty">
              <Terminal aria-hidden />
              <p>{locale === "zh" ? "连接、采集、安装和配置写入日志会显示在这里。" : "Connection, scan, install, and config write logs appear here."}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getHeaderText(locale: Locale, activeTask: ExecutionTask | null, activeConnection: ConnectionProfile | null) {
  if (activeTask) {
    if (activeTask.status === "queued") {
      return locale === "zh" ? `任务排队中，前方 ${activeTask.queuePosition ?? 0} 个` : `Task queued, ${activeTask.queuePosition ?? 0} ahead`;
    }
    if (activeTask.kind === "batch-install" && activeTask.items) {
      const done = activeTask.items.filter((item) => ["succeeded", "failed", "skipped"].includes(item.status)).length;
      return `${locale === "zh" ? "批量安装" : "Batch install"} · ${done}/${activeTask.items.length}`;
    }
    const done = activeTask.steps.filter((step) => step.status === "succeeded").length;
    return `${locale === "zh" ? "任务" : "Task"} · ${done}/${activeTask.steps.length}`;
  }
  if (activeConnection) {
    return `${activeConnection.fields.username ?? "user"}@${activeConnection.fields.host ?? "host"}:${activeConnection.fields.port ?? "22"}`;
  }
  return locale === "zh" ? "终端日志" : "Terminal log";
}

function renderBatchTask(task: ExecutionTask) {
  if (!task.items) return null;
  return task.items.map((item) => {
    const itemSteps = task.steps.filter((step) => step.itemIndex === item.index);
    return (
      <div key={item.catalogId} className={`terminal-batch-item status-${item.status}`}>
        <div className="terminal-batch-header">
          <span className="terminal-status-chip" style={{ color: statusColor[item.status] ?? "#94a3b8" }}>{statusIcon[item.status] ?? item.status}</span>
          <span className="terminal-batch-name">{item.displayName}</span>
          {item.error ? <span className="terminal-batch-error">{item.error}</span> : null}
        </div>
        {itemSteps.map((step) => renderStep(step))}
      </div>
    );
  });
}

function renderSingleTask(task: ExecutionTask) {
  return (
    <>
      {task.steps.map((step) => renderStep(step))}
      {task.error ? <div className="terminal-line terminal-error"><span className="terminal-prefix">ERR</span>{task.error}</div> : null}
    </>
  );
}

function renderStep(step: ExecutionTask["steps"][number]) {
  return (
    <div key={step.id} className={`terminal-step status-${step.status}`}>
      <span className="step-icon" style={{ color: statusColor[step.status] ?? "#94a3b8" }}>{statusIcon[step.status] ?? step.status}</span>
      <span className="step-label">{step.label}</span>
      {step.durationMs > 0 ? <span className="step-duration">{step.durationMs}ms</span> : null}
      <div className="step-command">$ {step.command}</div>
      {step.stdout ? <pre className="step-output">{step.stdout.slice(0, 600)}</pre> : null}
      {step.stderr ? <pre className="step-output stderr">{step.stderr.slice(0, 300)}</pre> : null}
    </div>
  );
}
