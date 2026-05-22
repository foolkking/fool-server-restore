/**
 * PreviewPanel — 在 ConfigureRunPanel 提交后展示 "如果点 Run 会发生什么" 报告。
 *
 * 三个 Tab：
 *   - 任务清单：每个任务的最终参数 + 是否会被 when: 条件跳过
 *   - 受影响文件：会被创建/修改/删除的远端文件路径 + 内容预览
 *   - YAML：完整渲染后的 YAML（{{ vars }} 已替换）
 *
 * 用户可以"返回编辑"回去改表单，也可以"确认并运行"真正提交。预览本身不连远端 SSH，
 * 纯本地计算，安全且即时。
 */
import React, { useState } from "react";
import { ChevronLeft, FileText, ListChecks, FileCode, AlertTriangle, CheckCircle2, SkipForward } from "lucide-react";
import type { PlaybookPreview, PreviewTask, PreviewFile } from "../api";
import type { Locale } from "../lib/types";

type Tab = "tasks" | "files" | "yaml";

const effectIcon: Record<PreviewTask["effectKind"], string> = {
  install: "📦",
  config: "⚙️",
  service: "🔌",
  command: "⌨️",
  filesystem: "📁",
  user: "👤",
  other: "•"
};

const effectLabelZh: Record<PreviewTask["effectKind"], string> = {
  install: "安装",
  config: "配置",
  service: "服务",
  command: "命令",
  filesystem: "文件",
  user: "用户",
  other: "其他"
};

const effectLabelEn: Record<PreviewTask["effectKind"], string> = {
  install: "Install",
  config: "Config",
  service: "Service",
  command: "Command",
  filesystem: "File",
  user: "User",
  other: "Other"
};

export function PreviewPanel({
  preview,
  locale,
  onBack,
  onConfirm,
  submitting,
  hideBackButton
}: {
  preview: PlaybookPreview;
  locale: Locale;
  /** 返回到表单视图（用户想改某个值） */
  onBack: () => void;
  /** 用户已确认，开始真正运行（vars 已经在父组件那里 cached 好） */
  onConfirm: () => void;
  /** 父组件正在提交时锁住按钮 */
  submitting?: boolean;
  /** 当 Playbook 没有 schema 时（直接进预览，没有"编辑"阶段），把"返回编辑"改成"取消" */
  hideBackButton?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("tasks");
  const t = locale === "zh"
    ? { back: "← 返回编辑", cancel: "取消", confirm: "✓ 确认并安装", submitting: "运行中…",
        tasks: "任务清单", files: "受影响文件", yaml: "完整 YAML",
        tasksDesc: "EnvForge 会按顺序执行以下任务（被 when: 跳过的会标灰）",
        filesDesc: "这些远端文件会被创建、修改或删除", filesEmpty: "此次运行不会修改任何文件（只装包/启服务）",
        yamlDesc: "vars 已替换为你填写的值，可以下载或离开 EnvForge 用 ansible-playbook 跑",
        verifyTitle: "🔍 安装后会跑这些 verify 检查",
        hiddenVarsLabel: "因表单条件而被隐藏的字段（不会传给运行器）：",
        skipped: "（跳过）", impact: "影响范围",
        actionLabels: { "create-or-replace": "创建/覆盖", "edit-line": "行级修改", "delete": "删除" } }
    : { back: "← Back to edit", cancel: "Cancel", confirm: "✓ Apply & install", submitting: "Running…",
        tasks: "Tasks", files: "Affected files", yaml: "Rendered YAML",
        tasksDesc: "EnvForge will run these tasks in order (skipped ones are dimmed)",
        filesDesc: "These remote files will be created, modified, or deleted", filesEmpty: "No files will be modified by this run.",
        yamlDesc: "All vars are filled in. You can copy this and run it standalone with ansible-playbook.",
        verifyTitle: "🔍 Post-install verify checks",
        hiddenVarsLabel: "Schema fields hidden by form conditions (not sent to runner):",
        skipped: "(skipped)", impact: "Impact",
        actionLabels: { "create-or-replace": "Create/Replace", "edit-line": "Edit line", "delete": "Delete" } };

  return (
    <div className="preview-panel">
      <div className="preview-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "tasks"} className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
          <ListChecks size={14} /> {t.tasks} <span className="preview-tab-count">{preview.tasks.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
          <FileText size={14} /> {t.files} <span className="preview-tab-count">{preview.files.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "yaml"} className={tab === "yaml" ? "active" : ""} onClick={() => setTab("yaml")}>
          <FileCode size={14} /> {t.yaml}
        </button>
      </div>

      <div className="preview-content">
        {tab === "tasks" && <TaskList preview={preview} locale={locale} desc={t.tasksDesc} skippedLabel={t.skipped} hiddenLabel={t.hiddenVarsLabel} verifyTitle={t.verifyTitle} impactLabel={t.impact} />}
        {tab === "files" && <FilesList files={preview.files} desc={t.filesDesc} empty={t.filesEmpty} actionLabels={t.actionLabels} />}
        {tab === "yaml" && <YamlPreview yaml={preview.renderedYaml} desc={t.yamlDesc} />}
      </div>

      <div className="preview-actions">
        <button type="button" className="ghost-action" onClick={onBack} disabled={submitting}>
          {hideBackButton ? t.cancel : <><ChevronLeft size={14} /> {t.back}</>}
        </button>
        <button type="button" className="primary-action" onClick={onConfirm} disabled={submitting}>
          {submitting ? t.submitting : t.confirm}
        </button>
      </div>
    </div>
  );
}

// ─── Subviews ──────────────────────────────────────────────────────────────

function TaskList({
  preview, locale, desc, skippedLabel, hiddenLabel, verifyTitle, impactLabel
}: {
  preview: PlaybookPreview;
  locale: Locale;
  desc: string;
  skippedLabel: string;
  hiddenLabel: string;
  verifyTitle: string;
  impactLabel: string;
}) {
  const labels = locale === "zh" ? effectLabelZh : effectLabelEn;
  return (
    <div>
      <p className="preview-section-desc">{desc}</p>

      {/* Impact summary 卡片 */}
      <div className="preview-impact">
        <strong>{impactLabel}:</strong>
        {preview.impact.disk && <span>磁盘 {String(preview.impact.disk)}</span>}
        {preview.impact.time && <span>耗时 {String(preview.impact.time)}</span>}
        {preview.impact.sudo === true && <span className="badge-sudo">sudo</span>}
        {preview.impact.risk && (
          <span className={`badge-risk badge-risk-${preview.impact.risk}`}>
            {preview.impact.risk === "high" ? <AlertTriangle size={12} /> : null}
            {String(preview.impact.risk)}
          </span>
        )}
      </div>

      <ol className="preview-tasks">
        {preview.tasks.map((t, i) => (
          <li key={i} className={t.willSkip ? "skipped" : ""}>
            <span className="preview-task-icon" title={labels[t.effectKind]}>{effectIcon[t.effectKind]}</span>
            <div className="preview-task-body">
              <div className="preview-task-name">
                {t.name}
                {t.willSkip && <span className="preview-skipped-tag"><SkipForward size={11} /> {skippedLabel}</span>}
              </div>
              <div className="preview-task-summary">{t.summary}</div>
              {t.willSkip && t.skipReason && <div className="preview-task-skip-reason">{t.skipReason}</div>}
            </div>
          </li>
        ))}
      </ol>

      {preview.verifyChecks && preview.verifyChecks.length > 0 && (
        <>
          <h4 className="preview-section-h">{verifyTitle}</h4>
          <ul className="preview-verify">
            {preview.verifyChecks.map((v, i) => (
              <li key={i}>
                <CheckCircle2 size={12} aria-hidden /> <strong>{v.name}</strong>
                <code>{v.cmd}</code>
              </li>
            ))}
          </ul>
        </>
      )}

      {preview.hiddenVars.length > 0 && (
        <div className="preview-hidden-vars">
          <span>{hiddenLabel}</span>
          {preview.hiddenVars.map((h) => <code key={h}>{h}</code>)}
        </div>
      )}
    </div>
  );
}

function FilesList({
  files, desc, empty, actionLabels
}: {
  files: PreviewFile[];
  desc: string;
  empty: string;
  actionLabels: Record<PreviewFile["action"], string>;
}) {
  if (files.length === 0) {
    return <p className="preview-section-desc">{empty}</p>;
  }
  return (
    <div>
      <p className="preview-section-desc">{desc}</p>
      {files.map((f, i) => (
        <div key={i} className="preview-file">
          <div className="preview-file-header">
            <code className="preview-file-path">{f.path}</code>
            <span className={`preview-file-action preview-file-action-${f.action}`}>{actionLabels[f.action]}</span>
            <span className="preview-file-via">via <code>{f.via}</code></span>
          </div>
          {f.contentPreview && (
            <pre className="preview-file-content"><code>{f.contentPreview}</code></pre>
          )}
        </div>
      ))}
    </div>
  );
}

function YamlPreview({ yaml, desc }: { yaml: string; desc: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="preview-yaml-header">
        <p className="preview-section-desc">{desc}</p>
        <button
          type="button"
          className="ghost-action small"
          onClick={() => {
            void navigator.clipboard.writeText(yaml);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "✓ Copied" : "Copy YAML"}
        </button>
      </div>
      <pre className="preview-yaml"><code>{yaml}</code></pre>
    </div>
  );
}
