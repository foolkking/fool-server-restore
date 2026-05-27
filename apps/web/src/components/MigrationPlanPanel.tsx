import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCode2, ListChecks, Play, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  dryRunMigrationPlan,
  exportMigrationPlan,
  fetchMigrationApplyReadiness,
  fetchMigrationCandidates,
  fetchMigrationPlan,
  fetchMigrationReviewQueue,
  fetchMigrationVerifyPreview,
  runMigrationVerify,
  saveMigrationDecision,
  type ConfidenceBand,
  type MigrationApplyReadiness,
  type MigrationCandidate,
  type MigrationCandidateReport,
  type MigrationDryRunResult,
  type MigrationPlan,
  type MigrationReviewQueueItem,
  type MigrationVerificationRunResult,
  type MigrationVerificationPreview
} from "../api";
import type { Locale } from "../lib/types";

export function MigrationPlanPanel({
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
  const [report, setReport] = useState<MigrationCandidateReport | null>(null);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [activeBand, setActiveBand] = useState<ConfidenceBand>("high");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportText, setExportText] = useState("");
  const [dryRun, setDryRun] = useState<MigrationDryRunResult | null>(null);
  const [verifyPreview, setVerifyPreview] = useState<MigrationVerificationPreview | null>(null);
  const [verifyRun, setVerifyRun] = useState<MigrationVerificationRunResult | null>(null);
  const [reviewQueue, setReviewQueue] = useState<MigrationReviewQueueItem[]>([]);
  const [readiness, setReadiness] = useState<MigrationApplyReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, [connectionId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextReport, nextPlan] = await Promise.all([
        fetchMigrationCandidates(authToken, connectionId),
        fetchMigrationPlan(authToken, connectionId)
      ]);
      const queue = await fetchMigrationReviewQueue(authToken, connectionId).catch(() => []);
      setReport(nextReport);
      setPlan(nextPlan);
      setReviewQueue(queue);
      pushLog?.("success", locale === "zh" ? "迁移候选和计划已生成" : "Migration candidates and plan generated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load migration plan";
      setError(msg);
      pushLog?.("error", msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(format: "json" | "markdown" | "bash" | "ansible") {
    setError("");
    try {
      pushLog?.("cmd", `envforge export migration-plan --format ${format}`);
      const text = await exportMigrationPlan(authToken, connectionId, format);
      setExportText(text);
      pushLog?.("success", locale === "zh" ? `已生成 ${format} 导出内容` : `${format} export generated`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setError(msg);
      pushLog?.("error", msg);
    }
  }

  async function handleDecision(candidateId: string, decision: "pending" | "approved" | "skipped") {
    setError("");
    try {
      await saveMigrationDecision(authToken, connectionId, candidateId, decision);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save decision failed";
      setError(msg);
      pushLog?.("error", msg);
    }
  }

  async function handleDryRun() {
    setError("");
    setDryRunning(true);
    try {
      pushLog?.("cmd", "envforge migration dry-run");
      const result = await dryRunMigrationPlan(authToken, connectionId);
      setDryRun(result);
      pushLog?.("success", locale === "zh" ? "Dry-run 预演完成，未修改远端机器" : "Dry-run completed; remote host was not modified");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Dry-run failed";
      setError(msg);
      pushLog?.("error", msg);
    } finally {
      setDryRunning(false);
    }
  }

  async function handleVerifyPreview() {
    setError("");
    setVerifyLoading(true);
    try {
      pushLog?.("cmd", "envforge migration verify --preview");
      const preview = await fetchMigrationVerifyPreview(authToken, connectionId);
      setVerifyPreview(preview);
      pushLog?.("success", locale === "zh" ? "Verify Preview 已生成" : "Verify preview generated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verify preview failed";
      setError(msg);
      pushLog?.("error", msg);
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleVerifyRun() {
    setError("");
    setVerifyLoading(true);
    try {
      pushLog?.("cmd", "envforge migration verify --run");
      const result = await runMigrationVerify(authToken, connectionId);
      setVerifyRun(result);
      pushLog?.(result.ok ? "success" : "error", result.ok ? "Verification passed" : "Verification has failures");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verify run failed";
      setError(msg);
      pushLog?.("error", msg);
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleReadiness() {
    setError("");
    try {
      const result = await fetchMigrationApplyReadiness(authToken, connectionId);
      setReadiness(result);
      pushLog?.(result.ready ? "success" : "info", result.ready ? "Apply readiness passed" : "Apply readiness has blockers");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Apply readiness failed";
      setError(msg);
      pushLog?.("error", msg);
    }
  }

  const grouped = useMemo(() => {
    const empty: Record<ConfidenceBand, MigrationCandidate[]> = { high: [], medium: [], low: [], ignore: [] };
    for (const candidate of report?.candidates ?? []) empty[candidate.band].push(candidate);
    return empty;
  }, [report]);

  const visible = grouped[activeBand];

  return (
    <section className="panel-large migration-panel">
      <div className="panel-heading">
        <h2>
          <ListChecks style={{ width: 20, height: 20 }} />
          {locale === "zh" ? "迁移候选与计划" : "Migration Candidates & Plan"}
        </h2>
        <span className="panel-count">{report?.summary.total ?? 0}</span>
      </div>

      <div className="migration-summary-row">
        {(["high", "medium", "low", "ignore"] as const).map((band) => (
          <button
            key={band}
            type="button"
            className={`migration-band-card band-${band} ${activeBand === band ? "active" : ""}`}
            onClick={() => setActiveBand(band)}
          >
            <span>{bandLabel(band, locale)}</span>
            <strong>{report?.summary[band] ?? 0}</strong>
          </button>
        ))}
        <button type="button" className="conn-btn conn-btn-ghost migration-refresh" onClick={() => void load()} disabled={loading}>
          <RefreshCw style={{ width: 14, height: 14 }} />
          {loading ? "..." : locale === "zh" ? "刷新" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="conn-feedback conn-feedback-error config-error-banner">
          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="migration-layout">
        <div className="migration-candidate-list">
          {visible.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`migration-candidate ${expanded === candidate.id ? "active" : ""}`}
              onClick={() => setExpanded(expanded === candidate.id ? null : candidate.id)}
            >
              <div className="migration-candidate-main">
                <span className={`migration-dot band-${candidate.band}`} />
                <div>
                  <strong>{candidate.catalogRuleName ?? candidate.name}</strong>
                  <span>{candidate.name} · {candidate.source} · {classLabel(candidate.migrationClass, locale)}</span>
                </div>
              </div>
              <span className="migration-score">{Math.round(candidate.confidence * 100)}%</span>
              {expanded === candidate.id ? (
                <div className="migration-detail">
                  <p>{locale === "zh" ? "判断原因" : "Reasons"}</p>
                  <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  {candidate.risks.length ? (
                    <>
                      <p>{locale === "zh" ? "风险" : "Risks"}</p>
                      <ul>{candidate.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
                    </>
                  ) : null}
                  <p>{locale === "zh" ? "建议动作" : "Recommended actions"}</p>
                  <ul>{candidate.recommendedActions.map((action) => <li key={action}>{action}</li>)}</ul>
                  <div className="migration-decision-actions">
                    <button type="button" className="conn-btn conn-btn-primary" onClick={(event) => { event.stopPropagation(); void handleDecision(candidate.id, "approved"); }}>Approve</button>
                    <button type="button" className="conn-btn conn-btn-ghost" onClick={(event) => { event.stopPropagation(); void handleDecision(candidate.id, "skipped"); }}>Skip</button>
                    <button type="button" className="conn-btn conn-btn-ghost" onClick={(event) => { event.stopPropagation(); void handleDecision(candidate.id, "pending"); }}>Pending</button>
                  </div>
                </div>
              ) : null}
            </button>
          ))}
          {!loading && visible.length === 0 ? (
            <div className="migration-empty">
              <ShieldAlert style={{ width: 26, height: 26 }} />
              <span>{locale === "zh" ? "当前分组没有候选项" : "No candidates in this group"}</span>
            </div>
          ) : null}
        </div>

        <aside className="migration-plan-card">
          <div className="migration-plan-head">
            <div>
              <span>{locale === "zh" ? "可审查计划" : "Reviewable plan"}</span>
              <strong>{plan?.items.length ?? 0} {locale === "zh" ? "项" : "items"}</strong>
            </div>
            <CheckCircle2 style={{ width: 20, height: 20 }} />
          </div>
          <ol className="migration-action-list">
            {(plan?.items ?? []).slice(0, 6).map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.actions[0]?.label ?? (locale === "zh" ? "等待审查" : "Pending review")}</span>
              </li>
            ))}
          </ol>
          <div className="migration-export-actions">
            <button type="button" className="conn-btn conn-btn-primary" onClick={() => void handleDryRun()} disabled={dryRunning}>
              <Play style={{ width: 14, height: 14 }} /> {dryRunning ? "..." : "Dry run"}
            </button>
            <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void handleVerifyPreview()} disabled={verifyLoading}>
              <ShieldCheck style={{ width: 14, height: 14 }} /> {verifyLoading ? "..." : "Verify"}
            </button>
            <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void handleVerifyRun()} disabled={verifyLoading}>
              Run verify
            </button>
            <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void handleReadiness()}>
              Readiness
            </button>
            <button type="button" className="conn-btn conn-btn-primary" onClick={() => void handleExport("markdown")}>
              <Download style={{ width: 14, height: 14 }} /> Markdown
            </button>
            <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void handleExport("bash")}>
              <FileCode2 style={{ width: 14, height: 14 }} /> Bash
            </button>
            <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void handleExport("json")}>JSON</button>
            <button type="button" className="conn-btn conn-btn-ghost" onClick={() => void handleExport("ansible")}>Ansible</button>
          </div>
          {reviewQueue.length ? (
            <div className="migration-review-queue">
              <strong>Unknown Review Queue</strong>
              {reviewQueue.slice(0, 5).map((item) => (
                <div key={item.candidate.id}>
                  <span>{item.candidate.name}</span>
                  <small>{item.reason}</small>
                </div>
              ))}
            </div>
          ) : null}
          {exportText ? (
            <textarea
              className="migration-export-preview"
              value={exportText}
              readOnly
              aria-label={locale === "zh" ? "迁移计划导出预览" : "Migration plan export preview"}
            />
          ) : null}
          {dryRun ? (
            <div className="migration-dry-run">
              <div className="migration-dry-run-head">
                <strong>{locale === "zh" ? "Dry-run 结果" : "Dry-run result"}</strong>
                <span>
                  {dryRun.summary["would-run"]} {locale === "zh" ? "将执行" : "would run"} · {dryRun.summary["needs-review"]} {locale === "zh" ? "需审查" : "review"} · {dryRun.summary.blocked} {locale === "zh" ? "阻断" : "blocked"}
                </span>
              </div>
              <div className="migration-dry-run-list">
                {dryRun.steps.slice(0, 12).map((step) => (
                  <div key={step.id} className={`migration-dry-run-step dry-${step.status}`}>
                    <span>{dryStatusLabel(step.status, locale)}</span>
                    <strong>{step.itemName}</strong>
                    <p>{step.command ?? step.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {verifyPreview ? (
            <div className="migration-verify-preview">
              <div className="migration-dry-run-head">
                <strong>{locale === "zh" ? "Verify Preview" : "Verify preview"}</strong>
                <span>
                  {verifyPreview.summary.required} required · {verifyPreview.summary.recommended} recommended · {verifyPreview.summary.manual} manual
                </span>
              </div>
              <div className="migration-dry-run-list">
                {verifyPreview.checks.slice(0, 12).map((check) => (
                  <div key={check.id} className={`migration-verify-step verify-${check.severity}`}>
                    <span>{check.severity}</span>
                    <strong>{check.itemName}</strong>
                    <p>{check.command ?? check.expected}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {verifyRun ? (
            <div className="migration-verify-preview">
              <div className="migration-dry-run-head">
                <strong>Verify Run</strong>
                <span>{verifyRun.summary.passed} passed · {verifyRun.summary.failed} failed · {verifyRun.summary.skipped} skipped</span>
              </div>
              <div className="migration-dry-run-list">
                {verifyRun.checks.slice(0, 12).map((check) => (
                  <div key={check.id} className={`migration-verify-step verify-${check.status === "passed" ? "recommended" : check.status === "failed" ? "manual" : "required"}`}>
                    <span>{check.status}</span>
                    <strong>{check.itemName}</strong>
                    <p>{check.command ?? check.expected}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {readiness ? (
            <div className={`migration-readiness ${readiness.ready ? "ready" : "blocked"}`}>
              <strong>{readiness.ready ? "Apply ready" : "Apply blocked"}</strong>
              <span>{readiness.blockers.length} blockers · {readiness.warnings.length} warnings</span>
              {readiness.blockers.slice(0, 4).map((blocker) => <p key={blocker}>{blocker}</p>)}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function bandLabel(band: ConfidenceBand, locale: Locale): string {
  const zh: Record<ConfidenceBand, string> = { high: "高置信度", medium: "中置信度", low: "低置信度", ignore: "不建议" };
  const en: Record<ConfidenceBand, string> = { high: "High", medium: "Medium", low: "Low", ignore: "Ignore" };
  return locale === "zh" ? zh[band] : en[band];
}

function classLabel(value: MigrationCandidate["migrationClass"], locale: Locale): string {
  const zh: Record<MigrationCandidate["migrationClass"], string> = {
    "managed-software": "已管理能力",
    "system-baseline": "系统基线",
    "user-dotfile": "用户配置",
    "service-config": "服务配置",
    "language-global-package": "语言全局包",
    "container-workload": "容器负载",
    "manual-install": "手工安装",
    "unknown-review": "待确认",
    "do-not-migrate": "不迁移"
  };
  return locale === "zh" ? zh[value] : value.replace(/-/g, " ");
}

function dryStatusLabel(status: MigrationDryRunResult["steps"][number]["status"], locale: Locale): string {
  if (status === "would-run") return locale === "zh" ? "将执行" : "run";
  if (status === "needs-review") return locale === "zh" ? "审查" : "review";
  return locale === "zh" ? "阻断" : "blocked";
}
