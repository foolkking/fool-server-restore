/**
 * SchemaEditor — admin 用的 vars.schema.json 表单可视化编辑器。
 *
 * 而不是让 admin 手写 JSON（容易出错、字段名拼错、类型不对），这个组件提供
 * 字段一个个新增 / 编辑 / 删除的 UI。最终的 schema 对象通过 onChange 回传给父
 * 组件，由父组件保存到后端。
 *
 * 支持所有 6 种字段类型 (string / number / boolean / choice / password / port)，
 * 以及高级特性（required / validate 正则 / show_when 条件 / choice 选项 /
 * password 自动生成长度）。
 */
import React, { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import type { VarsSchema, VarsSchemaField } from "../api";
import type { Locale } from "../lib/types";

type FieldType = VarsSchemaField["type"];

const TYPE_LABEL: Record<FieldType, { zh: string; en: string }> = {
  string: { zh: "字符串", en: "String" },
  number: { zh: "数字", en: "Number" },
  boolean: { zh: "布尔（开关）", en: "Boolean" },
  choice: { zh: "下拉选项", en: "Choice" },
  password: { zh: "密码（自动生成）", en: "Password" },
  port: { zh: "端口（1-65535）", en: "Port" }
};

const VAR_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;

export function SchemaEditor({
  schema,
  locale,
  onChange,
  onClear
}: {
  /** 当前 schema（null 表示这个 catalog 项还没有 schema） */
  schema: VarsSchema | null;
  locale: Locale;
  /** 用户改了 schema：传新值 */
  onChange: (newSchema: VarsSchema) => void;
  /** 用户点"删除整个 schema"：恢复到基线（或没有 schema） */
  onClear: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const t = locale === "zh"
    ? {
        title: "可配置参数 (vars.schema.json)",
        emptyTitle: "此 Playbook 还没有配置参数",
        emptyDesc: "添加字段后，用户在配置市场卡片上会看到一个 ⚙ 按钮，点开有表单可以填写参数。这些参数会替换 Playbook 中的 {{ var_name }} 占位符。",
        addField: "+ 添加字段",
        clearSchema: "🗑 删除整个 schema",
        clearConfirm: "确定删除整个 schema 吗？此 Playbook 将不再有可配置参数（恢复到基线行为）。",
        moveUp: "上移", moveDown: "下移", deleteField: "删除此字段"
      }
    : {
        title: "Configurable parameters (vars.schema.json)",
        emptyTitle: "No vars schema yet",
        emptyDesc: "After you add fields, the catalog card shows a ⚙ button that opens a form. Form values replace {{ var_name }} placeholders in the Playbook.",
        addField: "+ Add field",
        clearSchema: "🗑 Delete entire schema",
        clearConfirm: "Delete the entire schema? This Playbook will no longer have configurable parameters.",
        moveUp: "Move up", moveDown: "Move down", deleteField: "Delete field"
      };

  const fields: Array<[string, VarsSchemaField]> = schema ? Object.entries(schema) : [];

  function update(name: string, field: VarsSchemaField) {
    onChange({ ...(schema ?? {}), [name]: field });
  }

  function rename(oldName: string, newName: string, field: VarsSchemaField) {
    if (oldName === newName) return;
    if (!VAR_NAME_REGEX.test(newName)) return;
    if (schema && newName in schema && newName !== oldName) return; // dup
    const next: VarsSchema = {};
    for (const [k, v] of fields) {
      if (k === oldName) next[newName] = field;
      else next[k] = v;
    }
    onChange(next);
  }

  function remove(name: string) {
    if (!schema) return;
    const next = { ...schema };
    delete next[name];
    if (Object.keys(next).length === 0) {
      onClear();
    } else {
      onChange(next);
    }
  }

  function move(name: string, dir: -1 | 1) {
    const idx = fields.findIndex(([k]) => k === name);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= fields.length) return;
    const reordered = [...fields];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const next: VarsSchema = {};
    for (const [k, v] of reordered) next[k] = v;
    onChange(next);
  }

  function addField(name: string, type: FieldType) {
    if (!VAR_NAME_REGEX.test(name)) return;
    if (schema && name in schema) return;
    const newField = makeDefaultField(type);
    onChange({ ...(schema ?? {}), [name]: newField });
    setAdding(false);
  }

  return (
    <div className="schema-editor">
      <div className="schema-editor-header">
        <div>
          <h4 style={{ margin: 0 }}>{t.title}</h4>
          {fields.length > 0 && <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{fields.length} {locale === "zh" ? "个字段" : "fields"}</p>}
        </div>
        {fields.length > 0 && (
          <button
            type="button"
            className="ghost-action"
            onClick={() => { if (confirm(t.clearConfirm)) onClear(); }}
            style={{ color: "#dc2626", borderColor: "#fecaca", fontSize: 12 }}
          >
            {t.clearSchema}
          </button>
        )}
      </div>

      {fields.length === 0 ? (
        <div className="schema-editor-empty">
          <p><strong>{t.emptyTitle}</strong></p>
          <p style={{ fontSize: 13, color: "#64748b" }}>{t.emptyDesc}</p>
          {!adding && (
            <button type="button" className="primary-action" onClick={() => setAdding(true)}>
              {t.addField}
            </button>
          )}
        </div>
      ) : (
        <ol className="schema-fields-list">
          {fields.map(([name, field], i) => (
            <li key={name} className="schema-field-card">
              <div className="schema-field-card-header">
                <input
                  className="schema-field-name-input"
                  value={name}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === name) return;
                    if (!VAR_NAME_REGEX.test(v)) return;
                    rename(name, v, field);
                  }}
                  spellCheck={false}
                  aria-label="var name"
                />
                <select
                  value={field.type}
                  onChange={(e) => {
                    const newType = e.target.value as FieldType;
                    if (newType === field.type) return;
                    // Replacing type — start fresh with defaults
                    update(name, { ...makeDefaultField(newType), label: field.label });
                  }}
                  className="schema-field-type-select"
                >
                  {(Object.keys(TYPE_LABEL) as FieldType[]).map((tp) => (
                    <option key={tp} value={tp}>{TYPE_LABEL[tp][locale]}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="schema-icon-btn" onClick={() => move(name, -1)} title={t.moveUp} disabled={i === 0}><ChevronUp size={14} /></button>
                  <button type="button" className="schema-icon-btn" onClick={() => move(name, 1)} title={t.moveDown} disabled={i === fields.length - 1}><ChevronDown size={14} /></button>
                  <button type="button" className="schema-icon-btn schema-icon-danger" onClick={() => remove(name)} title={t.deleteField}><Trash2 size={14} /></button>
                </div>
              </div>
              <FieldDetailEditor field={field} onChange={(f) => update(name, f)} locale={locale} />
            </li>
          ))}
        </ol>
      )}

      {fields.length > 0 && !adding && (
        <button type="button" className="ghost-action" onClick={() => setAdding(true)} style={{ marginTop: 12 }}>
          <Plus size={14} /> {t.addField}
        </button>
      )}

      {adding && (
        <AddFieldForm
          existing={new Set(fields.map(([k]) => k))}
          locale={locale}
          onAdd={addField}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// ─── Subviews ──────────────────────────────────────────────────────────────

function AddFieldForm({
  existing, locale, onAdd, onCancel
}: {
  existing: Set<string>;
  locale: Locale;
  onAdd: (name: string, type: FieldType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("string");
  const valid = VAR_NAME_REGEX.test(name) && !existing.has(name);
  return (
    <div className="schema-add-form">
      <h5 style={{ margin: "0 0 8px" }}>{locale === "zh" ? "添加字段" : "Add field"}</h5>
      <div className="schema-add-row">
        <input
          placeholder={locale === "zh" ? "字段名（如 listen_port）" : "Field name (e.g. listen_port)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
          autoFocus
        />
        <select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
          {(Object.keys(TYPE_LABEL) as FieldType[]).map((tp) => (
            <option key={tp} value={tp}>{TYPE_LABEL[tp][locale]}</option>
          ))}
        </select>
        <button type="button" className="primary-action" onClick={() => onAdd(name, type)} disabled={!valid}>
          {locale === "zh" ? "添加" : "Add"}
        </button>
        <button type="button" className="ghost-action" onClick={onCancel}>
          {locale === "zh" ? "取消" : "Cancel"}
        </button>
      </div>
      {name && !valid && (
        <p className="schema-hint-error">
          {existing.has(name)
            ? (locale === "zh" ? "字段名已存在" : "Field name already exists")
            : (locale === "zh"
                ? "字段名只能含字母数字下划线，且以字母或下划线开头"
                : "Must start with a letter/underscore, only [A-Za-z0-9_]")}
        </p>
      )}
    </div>
  );
}

function FieldDetailEditor({
  field, onChange, locale
}: {
  field: VarsSchemaField;
  onChange: (f: VarsSchemaField) => void;
  locale: Locale;
}) {
  const t = locale === "zh"
    ? {
        label: "中文标签 (label)",
        labelEn: "英文标签 (labelEn, 可选)",
        help: "中文帮助文本 (help)",
        helpEn: "英文帮助 (helpEn, 可选)",
        required: "必填",
        defaultStr: "默认值",
        defaultBool: "默认值",
        defaultNum: "默认数字",
        validate: "validate (JS 正则字符串)",
        placeholder: "占位文本 (placeholder)",
        showWhen: "show_when 条件 (如 use_proxy == true)",
        min: "最小值",
        max: "最大值",
        step: "步长",
        generateLength: "自动生成长度（用户留空时）",
        revealAfterRun: "运行结束后明文显示一次",
        choiceOptions: "选项",
        addOption: "+ 添加选项",
        removeOption: "删除选项"
      }
    : {
        label: "Label (zh)",
        labelEn: "Label (en, optional)",
        help: "Help text (zh)",
        helpEn: "Help (en, optional)",
        required: "Required",
        defaultStr: "Default",
        defaultBool: "Default",
        defaultNum: "Default number",
        validate: "validate (JS regex)",
        placeholder: "placeholder",
        showWhen: "show_when (e.g. use_proxy == true)",
        min: "min",
        max: "max",
        step: "step",
        generateLength: "Auto-generate length (when blank)",
        revealAfterRun: "Reveal after run",
        choiceOptions: "Options",
        addOption: "+ Add option",
        removeOption: "Remove"
      };

  // Common rows for all types
  const commonRows = (
    <>
      <Row>
        <Col label={t.label} required>
          <input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} />
        </Col>
        <Col label={t.labelEn}>
          <input value={field.labelEn ?? ""} onChange={(e) => onChange({ ...field, labelEn: e.target.value || undefined })} />
        </Col>
      </Row>
      <Row>
        <Col label={t.help} full>
          <textarea rows={2} value={field.help ?? ""} onChange={(e) => onChange({ ...field, help: e.target.value || undefined })} />
        </Col>
      </Row>
      <Row>
        <Col label={t.helpEn} full>
          <textarea rows={2} value={field.helpEn ?? ""} onChange={(e) => onChange({ ...field, helpEn: e.target.value || undefined })} />
        </Col>
      </Row>
      <Row>
        <Col label={t.showWhen}>
          <input
            value={field.show_when ?? ""}
            onChange={(e) => onChange({ ...field, show_when: e.target.value || undefined })}
            placeholder="use_proxy == true"
            spellCheck={false}
          />
        </Col>
        {field.type !== "boolean" && (
          <Col label={t.required}>
            <label className="schema-toggle">
              <input
                type="checkbox"
                checked={field.required ?? false}
                onChange={(e) => onChange({ ...field, required: e.target.checked || undefined })}
              />
              <span>{field.required ? "✓" : "—"}</span>
            </label>
          </Col>
        )}
      </Row>
    </>
  );

  return (
    <div className="schema-field-detail">
      {commonRows}
      {field.type === "string" && (
        <>
          <Row>
            <Col label={t.defaultStr}>
              <input value={field.default ?? ""} onChange={(e) => onChange({ ...field, default: e.target.value || undefined })} />
            </Col>
            <Col label={t.placeholder}>
              <input value={field.placeholder ?? ""} onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })} />
            </Col>
          </Row>
          <Row>
            <Col label={t.validate} full>
              <input
                value={field.validate ?? ""}
                onChange={(e) => onChange({ ...field, validate: e.target.value || undefined })}
                placeholder="^[a-zA-Z0-9.-]+$"
                spellCheck={false}
              />
            </Col>
          </Row>
        </>
      )}
      {field.type === "number" && (
        <Row>
          <Col label={t.defaultNum}>
            <input type="number" value={field.default ?? ""} onChange={(e) => onChange({ ...field, default: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Col>
          <Col label={t.min}>
            <input type="number" value={field.min ?? ""} onChange={(e) => onChange({ ...field, min: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Col>
          <Col label={t.max}>
            <input type="number" value={field.max ?? ""} onChange={(e) => onChange({ ...field, max: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Col>
          <Col label={t.step}>
            <input type="number" value={field.step ?? ""} onChange={(e) => onChange({ ...field, step: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Col>
        </Row>
      )}
      {field.type === "boolean" && (
        <Row>
          <Col label={t.defaultBool}>
            <label className="schema-toggle">
              <input
                type="checkbox"
                checked={field.default}
                onChange={(e) => onChange({ ...field, default: e.target.checked })}
              />
              <span>{field.default ? "true" : "false"}</span>
            </label>
          </Col>
        </Row>
      )}
      {field.type === "port" && (
        <Row>
          <Col label={t.defaultNum}>
            <input type="number" min={1} max={65535} value={field.default ?? ""} onChange={(e) => onChange({ ...field, default: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Col>
        </Row>
      )}
      {field.type === "password" && (
        <Row>
          <Col label={t.generateLength}>
            <input type="number" min={8} max={128} value={field.generate_length ?? 24} onChange={(e) => onChange({ ...field, generate_length: Number(e.target.value) || 24 })} />
          </Col>
          <Col label={t.revealAfterRun}>
            <label className="schema-toggle">
              <input
                type="checkbox"
                checked={field.reveal_after_run ?? false}
                onChange={(e) => onChange({ ...field, reveal_after_run: e.target.checked || undefined })}
              />
              <span>{field.reveal_after_run ? "✓" : "—"}</span>
            </label>
          </Col>
          <Col label={t.validate} full>
            <input
              value={field.validate ?? ""}
              onChange={(e) => onChange({ ...field, validate: e.target.value || undefined })}
              placeholder="^[A-Za-z0-9_-]+$"
              spellCheck={false}
            />
          </Col>
        </Row>
      )}
      {field.type === "choice" && (
        <ChoiceOptionsEditor field={field} onChange={onChange} locale={locale} t={t} />
      )}
    </div>
  );
}

function ChoiceOptionsEditor({
  field, onChange, locale, t
}: {
  field: Extract<VarsSchemaField, { type: "choice" }>;
  onChange: (f: VarsSchemaField) => void;
  locale: Locale;
  t: { defaultStr: string; choiceOptions: string; addOption: string; removeOption: string };
}) {
  function updateOpt(idx: number, opt: { value: string; label: string; labelEn?: string }) {
    const next = [...field.options];
    next[idx] = opt;
    onChange({ ...field, options: next });
  }
  function addOpt() {
    onChange({ ...field, options: [...field.options, { value: `option${field.options.length + 1}`, label: "" }] });
  }
  function removeOpt(idx: number) {
    onChange({ ...field, options: field.options.filter((_, i) => i !== idx) });
  }
  return (
    <>
      <Row>
        <Col label={t.defaultStr}>
          <select value={field.default ?? ""} onChange={(e) => onChange({ ...field, default: e.target.value || undefined })}>
            <option value="">{locale === "zh" ? "（无默认）" : "(none)"}</option>
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
          </select>
        </Col>
      </Row>
      <Row>
        <Col label={t.choiceOptions} full>
          <div className="schema-options-list">
            {field.options.map((opt, idx) => (
              <div key={idx} className="schema-option-row">
                <input
                  placeholder="value"
                  value={opt.value}
                  onChange={(e) => updateOpt(idx, { ...opt, value: e.target.value })}
                  className="schema-option-value"
                  spellCheck={false}
                />
                <input
                  placeholder={locale === "zh" ? "中文标签" : "label"}
                  value={opt.label}
                  onChange={(e) => updateOpt(idx, { ...opt, label: e.target.value })}
                />
                <input
                  placeholder={locale === "zh" ? "英文标签（可选）" : "labelEn (optional)"}
                  value={opt.labelEn ?? ""}
                  onChange={(e) => updateOpt(idx, { ...opt, labelEn: e.target.value || undefined })}
                />
                <button type="button" className="schema-icon-btn schema-icon-danger" onClick={() => removeOpt(idx)} title={t.removeOption}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="ghost-action small" onClick={addOpt} style={{ marginTop: 6 }}>
            {t.addOption}
          </button>
        </Col>
      </Row>
    </>
  );
}

// ─── Layout helpers ────────────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return <div className="schema-form-row">{children}</div>;
}

function Col({ label, children, required, full }: { label: string; children: React.ReactNode; required?: boolean; full?: boolean }) {
  return (
    <label className={`schema-form-col ${full ? "full" : ""}`}>
      <span className="schema-form-label">
        {label}{required && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

// ─── Defaults ──────────────────────────────────────────────────────────────

function makeDefaultField(type: FieldType): VarsSchemaField {
  switch (type) {
    case "string":
      return { type: "string", label: "" };
    case "number":
      return { type: "number", label: "" };
    case "boolean":
      return { type: "boolean", label: "", default: false };
    case "choice":
      return { type: "choice", label: "", options: [{ value: "option1", label: "Option 1" }] };
    case "password":
      return { type: "password", label: "", generate_length: 24, reveal_after_run: true };
    case "port":
      return { type: "port", label: "" };
  }
}
