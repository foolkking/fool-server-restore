/**
 * ConfigureRunPanel — split-pane modal for configurable Playbooks.
 *
 * Layout: README guide on the left, form fields on the right. The form is
 * driven by the Playbook's vars.schema.json (loaded via fetchVarsSchema).
 *
 * When the user submits, values are sent to /api/execute as `vars`. The server
 * validates against the schema; if validation fails we surface per-field errors.
 *
 * If a Playbook has no schema, callers should use the simple "run" flow
 * directly — this component only renders when a schema exists.
 */
import React, { useState, useEffect, useMemo } from "react";
import { X, Eye, EyeOff, RotateCw } from "lucide-react";
import type { CatalogGuide, VarsSchema, VarsSchemaField } from "../api";
import type { Locale } from "../lib/types";
import { renderMarkdownPreview } from "./MarkdownOverlay";

// Mirrors the server's evalShowWhen — kept identical so what the user sees in
// the form is exactly what the server will validate. Fail-open on parse errors.
function evalShowWhen(expr: string, vars: Record<string, unknown>): boolean {
  const m = expr.match(/^\s*([a-zA-Z_]\w*)\s*(==|!=)\s*(.+?)\s*$/);
  if (!m) return true;
  const [, name, op, rhsRaw] = m;
  const lhs = vars[name];
  let rhs: unknown;
  if (rhsRaw === "true") rhs = true;
  else if (rhsRaw === "false") rhs = false;
  else if (/^-?\d+(?:\.\d+)?$/.test(rhsRaw)) rhs = Number(rhsRaw);
  else if ((rhsRaw.startsWith('"') && rhsRaw.endsWith('"')) || (rhsRaw.startsWith("'") && rhsRaw.endsWith("'"))) {
    rhs = rhsRaw.slice(1, -1);
  } else {
    rhs = rhsRaw;
  }
  // eslint-disable-next-line eqeqeq
  const equal = lhs == rhs;
  return op === "==" ? equal : !equal;
}

/** Initial form values from schema defaults. Booleans always have a default. */
function initialValues(schema: VarsSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(schema)) {
    if ("default" in field && field.default !== undefined) {
      out[name] = field.default;
    } else if (field.type === "boolean") {
      out[name] = false; // safety net — should never trigger because schema requires default
    } else if (field.type === "password") {
      out[name] = ""; // empty → server auto-generates on submit
    } else {
      out[name] = "";
    }
  }
  return out;
}

function fieldLabel(field: VarsSchemaField, locale: Locale): string {
  return locale === "en" && field.labelEn ? field.labelEn : field.label;
}

function fieldHelp(field: VarsSchemaField, locale: Locale): string | undefined {
  return locale === "en" && field.helpEn ? field.helpEn : field.help;
}

export function ConfigureRunPanel({
  guide,
  schema,
  locale,
  isAdmin,
  onClose,
  onSubmit,
  submitting,
  fieldErrors
}: {
  /** Markdown guide shown on the left side */
  guide: CatalogGuide | null;
  schema: VarsSchema;
  locale: Locale;
  /** When true, show a "Edit YAML directly" link for power users */
  isAdmin?: boolean;
  onClose: () => void;
  /** Called when user clicks "Run" — receives validated form values */
  onSubmit: (vars: Record<string, unknown>) => void;
  /** When the parent is mid-submission (locks the form) */
  submitting?: boolean;
  /** Per-field errors returned from the server (after a failed submission) */
  fieldErrors?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(schema));
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  // Re-init when schema changes (different Playbook selected)
  useEffect(() => { setValues(initialValues(schema)); setLocalErrors({}); }, [schema]);

  // Filter out fields hidden by show_when, in the same order the schema declares them
  const visibleFields = useMemo(() => {
    return Object.entries(schema).filter(([, field]) =>
      !field.show_when || evalShowWhen(field.show_when, values)
    );
  }, [schema, values]);

  function update(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear errors for this field as user starts editing
    if (localErrors[name] || fieldErrors?.[name]) {
      setLocalErrors((prev) => { const { [name]: _, ...rest } = prev; return rest; });
    }
  }

  function validateLocally(): boolean {
    const errors: Record<string, string> = {};
    for (const [name, field] of visibleFields) {
      const value = values[name];
      if (field.type === "boolean") continue; // always valid
      if (field.required && (value == null || value === "")) {
        errors[name] = locale === "zh" ? "必填项" : "Required";
        continue;
      }
      if (value == null || value === "") continue; // optional empty → skip further checks
      if ((field.type === "string" || field.type === "password") && "validate" in field && field.validate) {
        try {
          if (!new RegExp(field.validate).test(String(value))) {
            errors[name] = locale === "zh" ? `格式不符合：${field.validate}` : `Format mismatch: ${field.validate}`;
          }
        } catch { /* server-side will catch malformed regex */ }
      }
      if (field.type === "number" || field.type === "port") {
        const n = Number(value);
        if (!Number.isFinite(n)) errors[name] = locale === "zh" ? "必须为数字" : "Must be a number";
        else if (field.type === "port" && (n < 1 || n > 65535)) errors[name] = locale === "zh" ? "端口范围 1-65535" : "Port must be 1-65535";
        else if (field.type === "number") {
          if ("min" in field && field.min !== undefined && n < field.min) errors[name] = locale === "zh" ? `不小于 ${field.min}` : `Min: ${field.min}`;
          if ("max" in field && field.max !== undefined && n > field.max) errors[name] = locale === "zh" ? `不大于 ${field.max}` : `Max: ${field.max}`;
        }
      }
    }
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit() {
    if (submitting) return;
    if (!validateLocally()) return;
    // Convert numeric strings to numbers for number/port fields
    const submitted: Record<string, unknown> = {};
    for (const [name, field] of visibleFields) {
      const v = values[name];
      if (v == null || v === "") {
        // Empty string for password → leave undefined so server auto-generates.
        // Empty string for other fields → also undefined (defaults will fill in).
        continue;
      }
      if (field.type === "number" || field.type === "port") submitted[name] = Number(v);
      else if (field.type === "boolean") submitted[name] = Boolean(v);
      else submitted[name] = v;
    }
    onSubmit(submitted);
  }

  function resetDefaults() {
    setValues(initialValues(schema));
    setLocalErrors({});
  }

  // Combined error map: server-side wins over local
  const errors = { ...localErrors, ...(fieldErrors ?? {}) };

  return (
    <div className="markdown-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <article className="configure-run-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">{locale === "zh" ? "配置并运行" : "Configure & Run"}</p>
            <h2>{guide ? (locale === "zh" ? guide.item.name : guide.item.nameEn) : (locale === "zh" ? "配置 Playbook" : "Configure Playbook")}</h2>
          </div>
          <button className="ghost-action icon-action" type="button" onClick={onClose} disabled={submitting} aria-label={locale === "zh" ? "关闭" : "Close"}>
            <X aria-hidden />
          </button>
        </header>

        <div className="configure-run-body">
          {/* Left pane: Markdown guide */}
          <section className="configure-run-guide" aria-label={locale === "zh" ? "使用说明" : "Guide"}>
            {guide
              ? <div className="markdown-preview">{renderMarkdownPreview(guide.markdown)}</div>
              : <p className="muted">{locale === "zh" ? "（此 Playbook 没有提供使用说明）" : "(No guide available for this Playbook)"}</p>}
          </section>

          {/* Right pane: Form */}
          <section className="configure-run-form" aria-label={locale === "zh" ? "配置参数" : "Configuration"}>
            <div className="form-fields">
              {visibleFields.map(([name, field]) => (
                <FormField
                  key={name}
                  name={name}
                  field={field}
                  value={values[name]}
                  onChange={(v) => update(name, v)}
                  error={errors[name]}
                  locale={locale}
                  passwordRevealed={revealedPasswords.has(name)}
                  togglePasswordReveal={() => {
                    setRevealedPasswords((prev) => {
                      const next = new Set(prev);
                      if (next.has(name)) next.delete(name); else next.add(name);
                      return next;
                    });
                  }}
                />
              ))}
              {visibleFields.length === 0 && (
                <p className="muted">{locale === "zh" ? "无需配置参数。" : "No parameters needed."}</p>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="ghost-action" onClick={resetDefaults} disabled={submitting}>
                <RotateCw size={14} /> {locale === "zh" ? "重置默认值" : "Reset defaults"}
              </button>
              <button type="button" className="primary-action" onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? (locale === "zh" ? "运行中..." : "Running...")
                  : (locale === "zh" ? "✓ 应用配置并安装" : "✓ Apply & Install")}
              </button>
            </div>

            {Object.keys(errors).length > 0 && (
              <p className="form-summary-error">
                {locale === "zh" ? "请修正上述高亮的字段后重试。" : "Fix the highlighted fields above to continue."}
              </p>
            )}
          </section>
        </div>
      </article>
    </div>
  );
}

// ─── Single field renderer ──────────────────────────────────────────────────

function FormField({
  name,
  field,
  value,
  onChange,
  error,
  locale,
  passwordRevealed,
  togglePasswordReveal
}: {
  name: string;
  field: VarsSchemaField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  locale: Locale;
  passwordRevealed: boolean;
  togglePasswordReveal: () => void;
}) {
  const label = fieldLabel(field, locale);
  const help = fieldHelp(field, locale);
  const fieldId = `var-${name}`;

  return (
    <div className={`form-field ${error ? "has-error" : ""}`}>
      <label htmlFor={fieldId} className="form-field-label">
        {label}
        {field.required && <span className="form-required" aria-label="required">*</span>}
        <code className="form-var-name">{name}</code>
      </label>

      {(() => {
        switch (field.type) {
          case "string":
            return <input id={fieldId} type="text" value={String(value ?? "")} placeholder={field.placeholder ?? ""}
              onChange={(e) => onChange(e.target.value)} />;
          case "number":
            return <input id={fieldId} type="number" value={value === undefined || value === "" ? "" : Number(value)}
              min={field.min} max={field.max} step={field.step}
              onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
          case "port":
            return <input id={fieldId} type="number" value={value === undefined || value === "" ? "" : Number(value)}
              min={1} max={65535}
              onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
          case "boolean":
            return (
              <label className="form-toggle">
                <input id={fieldId} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
                <span>{Boolean(value) ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未启用" : "Disabled")}</span>
              </label>
            );
          case "choice":
            return (
              <select id={fieldId} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
                <option value="">{locale === "zh" ? "（未选择）" : "(none)"}</option>
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {locale === "en" && opt.labelEn ? opt.labelEn : opt.label}
                  </option>
                ))}
              </select>
            );
          case "password":
            return (
              <div className="form-password-wrap">
                <input id={fieldId} type={passwordRevealed ? "text" : "password"}
                  value={String(value ?? "")}
                  placeholder={locale === "zh" ? "（留空自动生成）" : "(empty → auto-generate)"}
                  onChange={(e) => onChange(e.target.value)}
                  autoComplete="new-password" />
                <button type="button" className="form-password-toggle" onClick={togglePasswordReveal} aria-label={passwordRevealed ? "Hide" : "Show"}>
                  {passwordRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            );
        }
      })()}

      {help && !error && <p className="form-field-help">{help}</p>}
      {error && <p className="form-field-error">{error}</p>}
    </div>
  );
}
