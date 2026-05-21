/**
 * PreflightPanel — show preflight check results inline before confirming an install.
 */
import React from "react";
import type { PreflightReport, PreflightCheck } from "../api";
import type { Locale } from "../lib/types";

const STATUS_ICON: Record<PreflightCheck["status"], string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
  skipped: "—"
};

const STATUS_COLOR: Record<PreflightCheck["status"], string> = {
  pass: "#16a34a",
  warn: "#d97706",
  fail: "#dc2626",
  skipped: "#94a3b8"
};

export function PreflightPanel({
  report,
  loading,
  locale,
  onClose,
  onProceed,
  proceedDisabled
}: {
  report: PreflightReport | null;
  loading: boolean;
  locale: Locale;
  onClose?: () => void;
  onProceed?: () => void;
  proceedDisabled?: boolean;
}) {
  if (loading) {
    return (
      <div className="preflight-panel">
        <p className="preflight-loading">
          <span className="spinning">↻</span>
          {locale === "zh" ? "执行前检查中…" : "Running preflight checks…"}
        </p>
      </div>
    );
  }
  if (!report) return null;

  const blocked = report.summary.fail > 0;

  return (
    <div className={`preflight-panel ${blocked ? "preflight-panel-blocked" : ""}`}>
      <header className="preflight-header">
        <p className="preflight-title">
          {locale === "zh" ? "执行前检查" : "Preflight checks"}
          <span className="preflight-meta">
            · {report.summary.pass} pass · {report.summary.warn} warn · {report.summary.fail} fail
            · {report.durationMs}ms
          </span>
        </p>
        {onClose ? (
          <button type="button" className="ghost-action" onClick={onClose} style={{ fontSize: 12, padding: "4px 8px" }}>✕</button>
        ) : null}
      </header>
      <ul className="preflight-checks">
        {report.checks.map((c) => (
          <li key={c.id} className={`preflight-check preflight-${c.status}`}>
            <span className="preflight-status" style={{ color: STATUS_COLOR[c.status] }}>
              {STATUS_ICON[c.status]}
            </span>
            <span className="preflight-label">{c.label}</span>
            <span className="preflight-detail">{c.detail}</span>
          </li>
        ))}
      </ul>
      {onProceed ? (
        <footer className="preflight-footer">
          <button
            type="button"
            className={blocked ? "ghost-action" : "primary-action"}
            onClick={onProceed}
            disabled={proceedDisabled}
          >
            {blocked
              ? (locale === "zh" ? "忽略警告并执行" : "Proceed despite failures")
              : (locale === "zh" ? "继续执行" : "Proceed")}
          </button>
        </footer>
      ) : null}
    </div>
  );
}
