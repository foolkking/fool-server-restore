/**
 * CatalogAdminPanel — admin-only panel to add / edit / hide catalog items.
 *
 * Used inside SettingsPage as the "Catalog" tab. Visible only to users with role==="admin".
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchAdminCatalog, fetchAdminCatalogItem, createAdminCatalog, updateAdminCatalog,
  deleteAdminCatalog, resetAdminCatalog,
  type AdminCatalogList, type AdminCatalogDetail, type AdminCatalogInput, type CatalogStatus,
  type VarsSchema
} from "../api";
import type { Locale } from "../lib/types";
import { SchemaEditor } from "./SchemaEditor";

type EditTab = "meta" | "yaml" | "markdown" | "schema";

const STATUS_LABEL: Record<CatalogStatus, { zh: string; en: string; bg: string; fg: string }> = {
  baseline: { zh: "基线", en: "Baseline", bg: "#f1f5f9", fg: "#475569" },
  modified: { zh: "已修改", en: "Modified", bg: "#fef3c7", fg: "#92400e" },
  added:    { zh: "新增", en: "Added", bg: "#dcfce7", fg: "#166534" },
  hidden:   { zh: "已隐藏", en: "Hidden", bg: "#fee2e2", fg: "#991b1b" }
};

const NEW_TEMPLATE_YAML = `# New catalog item
name: My App
hosts: all

tasks:
  - name: Install package
    module: package
    args:
      name: my-app
      state: present

  - name: Enable and start service
    module: service
    args:
      name: my-app
      enabled: true
      state: started
`;

export function CatalogAdminPanel({ locale, authToken }: { locale: Locale; authToken: string }) {
  const [list, setList] = useState<AdminCatalogList | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  async function reload() {
    setLoading(true); setError("");
    try { setList(await fetchAdminCatalog(authToken)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [authToken]);

  const filteredItems = useMemo(() => {
    if (!list) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return list.items;
    return list.items.filter((i) =>
      i.id.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.nameEn.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    );
  }, [list, filter]);

  if (loading && !list) {
    return <p className="empty-hint"><span className="spinning">↻</span></p>;
  }

  return (
    <div className="catalog-admin-layout">
      <div className="catalog-admin-list">
        <div className="catalog-admin-list-header">
          <input
            placeholder={locale === "zh" ? "搜索…" : "Filter…"}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="catalog-admin-filter"
          />
          <button
            type="button"
            className="primary-action"
            style={{ fontSize: 13, padding: "8px 12px" }}
            onClick={() => { setActiveId(null); setCreatingNew(true); }}
          >
            + {locale === "zh" ? "新建" : "New"}
          </button>
        </div>
        {error && <p className="settings-error">{error}</p>}
        <div className="catalog-admin-items">
          {filteredItems.map((it) => {
            const st = list?.status[it.id] ?? "baseline";
            const label = STATUS_LABEL[st];
            return (
              <button
                key={it.id}
                type="button"
                className={`catalog-admin-row ${activeId === it.id && !creatingNew ? "active" : ""}`}
                onClick={() => { setActiveId(it.id); setCreatingNew(false); }}
              >
                <div className="catalog-admin-row-main">
                  <strong>{locale === "zh" ? it.name : it.nameEn}</strong>
                  <span className="catalog-admin-row-meta">
                    <code>{it.id}</code> {" · "}{it.category} {" · "}{it.kind}
                  </span>
                </div>
                <span
                  className="catalog-admin-status"
                  style={{ background: label.bg, color: label.fg }}
                >
                  {locale === "zh" ? label.zh : label.en}
                </span>
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <p className="empty-hint">{locale === "zh" ? "无结果" : "No results"}</p>
          )}
        </div>
      </div>
      <div className="catalog-admin-detail">
        {creatingNew ? (
          <CatalogEditor
            locale={locale}
            authToken={authToken}
            mode="create"
            onSaved={async () => { setCreatingNew(false); await reload(); }}
            onCancel={() => setCreatingNew(false)}
          />
        ) : activeId ? (
          <CatalogEditor
            locale={locale}
            authToken={authToken}
            mode="edit"
            id={activeId}
            status={list?.status[activeId] ?? "baseline"}
            onSaved={async () => { await reload(); }}
            onCancel={() => setActiveId(null)}
          />
        ) : (
          <div className="catalog-admin-empty">
            <p>{locale === "zh" ? "选择左侧条目编辑，或点「+ 新建」添加新项。" : "Pick an item on the left or click + New."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogEditor({
  locale, authToken, mode, id, status, onSaved, onCancel
}: {
  locale: Locale;
  authToken: string;
  mode: "create" | "edit";
  id?: string;
  status?: CatalogStatus;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<EditTab>("meta");
  const [detail, setDetail] = useState<AdminCatalogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // Form state
  const [form, setForm] = useState<AdminCatalogInput>({
    id: "",
    kind: "software",
    name: "",
    nameEn: "",
    category: "runtime",
    summary: "",
    summaryEn: "",
    imageTone: "slate",
    sensitivity: "safe",
    rating: 0,
    playbookYaml: NEW_TEMPLATE_YAML,
    guideMarkdown: "",
    deployModes: ["system"],
    varsSchema: undefined  // 不动；admin 在 schema tab 里改
  });
  // schema 单独维护一份 state，让"删除整个 schema"和"保存"区分得开：
  //   - varsSchemaCurrent: null  → schema 当前不存在
  //   - varsSchemaCurrent: 对象  → 现在的 schema 内容
  //   - dirty 标记：是否被改过，决定 PATCH 时是否提交 varsSchema 字段
  const [varsSchemaCurrent, setVarsSchemaCurrent] = useState<VarsSchema | null>(null);
  const [schemaDirty, setSchemaDirty] = useState<"keep" | "save" | "delete">("keep");

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    setLoading(true); setErr(""); setSavedMsg("");
    void fetchAdminCatalogItem(authToken, id)
      .then((d) => {
        setDetail(d);
        setForm({
          id: d.item.id,
          kind: d.item.kind,
          name: d.item.name,
          nameEn: d.item.nameEn,
          category: d.item.category,
          summary: d.item.summary,
          summaryEn: d.item.summaryEn,
          imageTone: d.item.imageTone,
          sensitivity: d.item.sensitivity,
          rating: d.item.rating,
          playbookYaml: d.yaml,
          guideMarkdown: d.markdown,
          deployModes: d.item.deployModes ?? ["system"],
          varsSchema: undefined
        });
        setVarsSchemaCurrent(d.varsSchema);
        setSchemaDirty("keep");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [mode, id, authToken]);

  async function handleSave() {
    setSaving(true); setErr(""); setSavedMsg("");
    try {
      // 把 schema 状态合并到 form 里：
      //   keep   → 不传 varsSchema 字段，后端不动 override
      //   save   → 传当前 varsSchemaCurrent
      //   delete → 传 null，后端会删除 override
      const formWithSchema: AdminCatalogInput = { ...form };
      if (schemaDirty === "save") formWithSchema.varsSchema = varsSchemaCurrent ?? undefined;
      else if (schemaDirty === "delete") formWithSchema.varsSchema = null;

      if (mode === "create") {
        if (!formWithSchema.id?.match(/^[a-z0-9][a-z0-9-]{0,59}$/)) {
          throw new Error(locale === "zh"
            ? "id 必须由小写字母、数字、连字符组成（1-60 字符）"
            : "id must match [a-z0-9-]{1,60}");
        }
        await createAdminCatalog(authToken, formWithSchema);
        // create 端点目前不接受 varsSchema；如果用户在 create 时同时填了 schema，
        // 第一步 create 后再 PATCH 一次写 schema
        if (schemaDirty === "save" && varsSchemaCurrent && formWithSchema.id) {
          await updateAdminCatalog(authToken, formWithSchema.id, { varsSchema: varsSchemaCurrent });
        }
        setSavedMsg(locale === "zh" ? "✓ 已创建" : "✓ Created");
      } else if (id) {
        await updateAdminCatalog(authToken, id, formWithSchema);
        setSavedMsg(locale === "zh" ? "✓ 已保存" : "✓ Saved");
      }
      setSchemaDirty("keep");
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(
      status === "added"
        ? (locale === "zh" ? "确定删除此用户新增项？此操作不可撤销。" : "Permanently delete this user-added item?")
        : (locale === "zh" ? "隐藏此基线项（市场不再显示）？可随时重置恢复。" : "Hide this baseline item from the market? You can reset later.")
    )) return;
    setSaving(true); setErr("");
    try {
      await deleteAdminCatalog(authToken, id);
      setSavedMsg(locale === "zh" ? "✓ 已删除" : "✓ Deleted");
      await onSaved();
      onCancel();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    if (!id) return;
    if (!confirm(locale === "zh" ? "重置为基线？所有自定义修改将丢失。" : "Reset to baseline? All customizations will be lost.")) return;
    setSaving(true); setErr("");
    try {
      await resetAdminCatalog(authToken, id);
      setSavedMsg(locale === "zh" ? "✓ 已重置" : "✓ Reset");
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="empty-hint"><span className="spinning">↻</span></p>;

  const isCreate = mode === "create";
  const isModified = status === "modified";
  const isAdded = status === "added";
  const isHidden = status === "hidden";

  return (
    <div className="catalog-editor">
      <header className="catalog-editor-header">
        <div>
          <p className="eyebrow">
            {isCreate
              ? (locale === "zh" ? "新建 catalog 项" : "Create catalog item")
              : <>
                {locale === "zh" ? "编辑：" : "Edit: "}
                <code>{id}</code>
                {isModified && <span className="catalog-editor-badge">已修改</span>}
                {isAdded && <span className="catalog-editor-badge added">新增</span>}
                {isHidden && <span className="catalog-editor-badge hidden">已隐藏</span>}
              </>
            }
          </p>
          <h3>{form.name || (locale === "zh" ? "（未命名）" : "(unnamed)")}</h3>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!isCreate && isModified && (
            <button type="button" className="ghost-action" onClick={handleReset} disabled={saving}>
              {locale === "zh" ? "重置为基线" : "Reset"}
            </button>
          )}
          {!isCreate && (
            <button type="button" className="conn-btn conn-btn-danger" onClick={handleDelete} disabled={saving}>
              {isAdded ? (locale === "zh" ? "删除" : "Delete") : (locale === "zh" ? "隐藏" : "Hide")}
            </button>
          )}
          <button type="button" className="ghost-action" onClick={onCancel}>{locale === "zh" ? "取消" : "Cancel"}</button>
          <button type="button" className="primary-action" onClick={handleSave} disabled={saving}>
            {saving ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "保存" : "Save")}
          </button>
        </div>
      </header>

      {err && <div className="settings-error">{err}</div>}
      {savedMsg && <div className="catalog-editor-success">{savedMsg}</div>}

      <nav className="catalog-editor-tabs">
        <button type="button" className={tab === "meta" ? "active" : ""} onClick={() => setTab("meta")}>
          {locale === "zh" ? "基本信息" : "Metadata"}
        </button>
        <button type="button" className={tab === "yaml" ? "active" : ""} onClick={() => setTab("yaml")}>
          Playbook YAML
        </button>
        <button type="button" className={tab === "markdown" ? "active" : ""} onClick={() => setTab("markdown")}>
          {locale === "zh" ? "安装说明" : "Guide (Markdown)"}
        </button>
        <button type="button" className={tab === "schema" ? "active" : ""} onClick={() => setTab("schema")}>
          {locale === "zh" ? "可配置参数" : "Vars Schema"}
          {varsSchemaCurrent && Object.keys(varsSchemaCurrent).length > 0 && (
            <span className="catalog-editor-tab-count">{Object.keys(varsSchemaCurrent).length}</span>
          )}
        </button>
      </nav>

      <div className="catalog-editor-body">
        {tab === "meta" && (
          <div className="catalog-meta-form">
            {isCreate && (
              <Field label="ID" hint={locale === "zh" ? "字母数字-，唯一标识。例如 my-app" : "lowercase a-z 0-9 -, unique. e.g. my-app"}>
                <input value={form.id ?? ""} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} placeholder="my-app" />
              </Field>
            )}
            <Field label={locale === "zh" ? "名称（中文）" : "Name (zh)"}>
              <input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label={locale === "zh" ? "名称（英文）" : "Name (en)"}>
              <input value={form.nameEn ?? ""} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
            </Field>
            <Field label={locale === "zh" ? "分类" : "Category"}>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AdminCatalogInput["category"] }))}>
                <option value="runtime">runtime</option>
                <option value="developer">developer</option>
                <option value="database">database</option>
                <option value="container">container</option>
                <option value="security">security</option>
                <option value="network">network</option>
                <option value="service">service</option>
              </select>
            </Field>
            <Field label={locale === "zh" ? "类型" : "Kind"}>
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "software" | "combo" }))}>
                <option value="software">software</option>
                <option value="combo">combo</option>
              </select>
            </Field>
            <Field label={locale === "zh" ? "敏感度" : "Sensitivity"}>
              <select value={form.sensitivity} onChange={(e) => setForm((f) => ({ ...f, sensitivity: e.target.value as AdminCatalogInput["sensitivity"] }))}>
                <option value="safe">safe</option>
                <option value="review">review</option>
                <option value="privileged">privileged</option>
              </select>
            </Field>
            <Field label={locale === "zh" ? "图标色调" : "Image tone"}>
              <select value={form.imageTone} onChange={(e) => setForm((f) => ({ ...f, imageTone: e.target.value }))}>
                {["slate", "teal", "blue", "emerald", "amber", "yellow", "red", "indigo", "cyan", "orange"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={locale === "zh" ? "评分（0-5）" : "Rating (0-5)"}>
              <input type="number" min={0} max={5} step={0.1} value={form.rating ?? 0} onChange={(e) => setForm((f) => ({ ...f, rating: parseFloat(e.target.value) || 0 }))} />
            </Field>
            <Field label={locale === "zh" ? "部署模式" : "Deploy modes"}>
              <div style={{ display: "flex", gap: 14 }}>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={form.deployModes?.includes("system") ?? false}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      deployModes: e.target.checked
                        ? Array.from(new Set([...(f.deployModes ?? []), "system" as const]))
                        : (f.deployModes ?? []).filter((m) => m !== "system")
                    }))}
                  /> system
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={form.deployModes?.includes("docker") ?? false}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      deployModes: e.target.checked
                        ? Array.from(new Set([...(f.deployModes ?? []), "docker" as const]))
                        : (f.deployModes ?? []).filter((m) => m !== "docker")
                    }))}
                  /> docker
                </label>
              </div>
            </Field>
            <Field label={locale === "zh" ? "简介（中文）" : "Summary (zh)"} full>
              <textarea rows={2} value={form.summary ?? ""} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
            </Field>
            <Field label={locale === "zh" ? "简介（英文）" : "Summary (en)"} full>
              <textarea rows={2} value={form.summaryEn ?? ""} onChange={(e) => setForm((f) => ({ ...f, summaryEn: e.target.value }))} />
            </Field>
          </div>
        )}
        {tab === "yaml" && (
          <div>
            {detail?.hasYamlOverride && !isCreate && (
              <p className="catalog-editor-hint">
                {locale === "zh" ? "📝 当前显示的是 admin 修改后的版本。重置即可恢复基线。" : "📝 Showing admin override. Click Reset to restore baseline."}
              </p>
            )}
            <textarea
              className="catalog-editor-textarea"
              value={form.playbookYaml ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, playbookYaml: e.target.value }))}
              spellCheck={false}
              rows={28}
            />
          </div>
        )}
        {tab === "markdown" && (
          <div>
            {detail?.hasMarkdownOverride && !isCreate && (
              <p className="catalog-editor-hint">
                {locale === "zh" ? "📝 当前显示的是 admin 修改后的版本。" : "📝 Showing admin override."}
              </p>
            )}
            <textarea
              className="catalog-editor-textarea"
              value={form.guideMarkdown ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, guideMarkdown: e.target.value }))}
              spellCheck={false}
              rows={20}
              placeholder={locale === "zh" ? "# 安装说明\n\n这个软件做什么..." : "# Install Guide\n\nWhat this does..."}
            />
          </div>
        )}
        {tab === "schema" && (
          <div>
            {detail?.hasSchemaOverride && !isCreate && (
              <p className="catalog-editor-hint">
                {locale === "zh"
                  ? "📝 当前显示的是 admin override 的 schema。删除整个 schema 即可恢复基线版本。"
                  : "📝 Showing admin schema override. Delete entire schema to revert to baseline."}
              </p>
            )}
            <SchemaEditor
              schema={varsSchemaCurrent}
              locale={locale}
              onChange={(newSchema) => {
                setVarsSchemaCurrent(newSchema);
                setSchemaDirty("save");
              }}
              onClear={() => {
                setVarsSchemaCurrent(null);
                setSchemaDirty("delete");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children, full }: { label: string; hint?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`catalog-meta-field ${full ? "full" : ""}`}>
      <span className="catalog-meta-label">{label}</span>
      {children}
      {hint && <small className="catalog-meta-hint">{hint}</small>}
    </label>
  );
}
