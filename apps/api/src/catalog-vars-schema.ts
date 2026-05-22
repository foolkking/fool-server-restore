/**
 * catalog-vars-schema.ts — vars.json schema for configurable Playbooks
 *
 * Each Playbook in the catalog can opt-in to user-configurable vars by shipping
 * a `vars.schema.json` next to its YAML. The schema declares form fields the UI
 * renders on the right side of the configure-and-run pane (Markdown guide on
 * the left), and the values get substituted into `{{ var_name }}` placeholders
 * in the Playbook YAML at run time.
 *
 * Why a mini-spec rather than full JSON Schema:
 *   - We need only ~5 field types. JSON Schema's full surface (oneOf, allOf,
 *     refs, pattern format negotiation) would cost ~100KB of bundle for 0 benefit.
 *   - The schema is hand-written by catalog admins; a small surface keeps that easy.
 *   - We can serialize trivially as JSON5/JSON.
 *
 * Supported field types: string, number, boolean, choice, password, port
 *
 *   string:   plain single-line text input
 *   number:   numeric input with optional min/max
 *   boolean:  checkbox/toggle
 *   choice:   <select> with predefined options
 *   password: like string but masked + auto-generates a default if not provided
 *   port:     1-65535 numeric input with port-specific validation
 *
 * Conditional visibility (`show_when`): a tiny expression like
 *   "enable_https == true"  or  "deploy_mode == 'docker'"
 * Hides the field when the expression is false. Keeps the form clean for
 * variants like "only show backend_url when reverse_proxy is on".
 *
 * Validation: `validate` is a JS regex string applied to string/password fields.
 *
 * Default values: `default` is mandatory for boolean fields (so the form starts
 * in a deterministic state); optional but recommended for everything else.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveFromRoot } from "./repo.js";
import { getConfig } from "./config.js";
import { isValidCatalogId } from "./catalog-overrides.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type VarType = "string" | "number" | "boolean" | "choice" | "password" | "port";

export interface VarFieldBase {
  type: VarType;
  /** Display label (Chinese) */
  label: string;
  /** Optional English label; falls back to `label` if missing */
  labelEn?: string;
  /** Help text shown under the field */
  help?: string;
  helpEn?: string;
  /** Conditional visibility expression, e.g. "enable_https == true" */
  show_when?: string;
  /** Whether the field must have a non-empty value before submit */
  required?: boolean;
}

export interface VarFieldString extends VarFieldBase {
  type: "string";
  default?: string;
  /** Regex to validate the value against; serialized as a string */
  validate?: string;
  placeholder?: string;
}

export interface VarFieldNumber extends VarFieldBase {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface VarFieldBoolean extends VarFieldBase {
  type: "boolean";
  default: boolean; // mandatory — boolean must have an unambiguous initial state
}

export interface VarFieldChoice extends VarFieldBase {
  type: "choice";
  default?: string;
  /** Each option: value goes into the var, label is what the user sees */
  options: Array<{ value: string; label: string; labelEn?: string }>;
}

export interface VarFieldPassword extends VarFieldBase {
  type: "password";
  /** Length of the auto-generated default (when no `default` is provided) */
  generate_length?: number;
  /** If true, also display the value in the post-run guide so the user can copy it */
  reveal_after_run?: boolean;
  validate?: string;
}

export interface VarFieldPort extends VarFieldBase {
  type: "port";
  default?: number;
}

export type VarField =
  | VarFieldString
  | VarFieldNumber
  | VarFieldBoolean
  | VarFieldChoice
  | VarFieldPassword
  | VarFieldPort;

/**
 * The full schema is an ordered map of var-name → field definition.
 * We keep it ordered (using a plain object preserves insertion order in modern JS)
 * so the form renders fields in author intent, not alphabetical chaos.
 */
export type VarsSchema = Record<string, VarField>;

// ─── File resolution ────────────────────────────────────────────────────────

function baselineSchemaPath(id: string): string {
  return resolveFromRoot(path.join("configs/catalog/playbooks", `${id}.vars.json`));
}

function overrideSchemaPath(id: string): string {
  return path.join(getConfig().dataDir, "catalog-overrides", "schemas", `${id}.vars.json`);
}

/**
 * Load the vars schema for a catalog id. Override (admin-edited) takes precedence
 * over baseline, mirroring the override pattern used for YAML and Markdown.
 *
 * Returns null when no schema exists (Playbook has no configurable vars — it'll
 * just run as-is, exactly like before this feature existed).
 */
export async function loadVarsSchema(id: string): Promise<VarsSchema | null> {
  if (!isValidCatalogId(id)) return null;

  // Override first
  try {
    const text = await fs.readFile(overrideSchemaPath(id), "utf8");
    return parseAndValidateSchema(text, id);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Baseline
  try {
    const text = await fs.readFile(baselineSchemaPath(id), "utf8");
    return parseAndValidateSchema(text, id);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveOverrideSchema(id: string, schema: VarsSchema): Promise<void> {
  if (!isValidCatalogId(id)) throw new Error(`Invalid catalog id: ${id}`);
  // Validate before writing so we never persist a broken schema
  validateSchema(schema, id);
  const dest = overrideSchemaPath(id);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(schema, null, 2), "utf8");
}

export async function deleteOverrideSchema(id: string): Promise<void> {
  if (!isValidCatalogId(id)) return;
  try {
    await fs.unlink(overrideSchemaPath(id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── Parsing & validation ───────────────────────────────────────────────────

function parseAndValidateSchema(text: string, id: string): VarsSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in vars schema for ${id}: ${err instanceof Error ? err.message : err}`);
  }
  validateSchema(parsed, id);
  return parsed as VarsSchema;
}

const VAR_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/;
const ALLOWED_TYPES: ReadonlySet<VarType> = new Set(["string", "number", "boolean", "choice", "password", "port"]);

/**
 * Validate that a schema is well-formed. Throws on any structural issue so the
 * UI never tries to render a broken form, and so admin edits can't ship junk.
 *
 * Checks:
 *   - top-level is an object
 *   - var names match the legal pattern (must be valid Ansible/JS identifier)
 *   - each field has a known `type`
 *   - boolean fields have an explicit `default`
 *   - choice fields have at least one option
 *   - port fields have defaults in [1, 65535]
 *   - validate regex strings actually compile
 */
export function validateSchema(value: unknown, id: string): asserts value is VarsSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Schema for ${id}: must be a JSON object`);
  }
  const schema = value as Record<string, unknown>;
  for (const [name, raw] of Object.entries(schema)) {
    if (!VAR_NAME_REGEX.test(name)) {
      throw new Error(`Schema for ${id}: invalid var name "${name}" (must match ${VAR_NAME_REGEX})`);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Schema for ${id}: var "${name}" is not an object`);
    }
    const field = raw as Record<string, unknown>;
    const t = field.type;
    if (typeof t !== "string" || !ALLOWED_TYPES.has(t as VarType)) {
      throw new Error(`Schema for ${id}: var "${name}" has invalid type "${String(t)}" (allowed: ${[...ALLOWED_TYPES].join(", ")})`);
    }
    if (typeof field.label !== "string" || field.label.length === 0) {
      throw new Error(`Schema for ${id}: var "${name}" missing required "label"`);
    }
    if (t === "boolean" && typeof field.default !== "boolean") {
      throw new Error(`Schema for ${id}: boolean var "${name}" must have explicit "default" (true or false)`);
    }
    if (t === "choice") {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new Error(`Schema for ${id}: choice var "${name}" requires non-empty "options" array`);
      }
      for (const opt of field.options) {
        if (!opt || typeof opt !== "object" || typeof (opt as { value: unknown }).value !== "string") {
          throw new Error(`Schema for ${id}: choice var "${name}" has malformed option`);
        }
      }
    }
    if (t === "port") {
      const def = field.default;
      if (def !== undefined) {
        if (typeof def !== "number" || def < 1 || def > 65535) {
          throw new Error(`Schema for ${id}: port var "${name}" default ${String(def)} out of range 1-65535`);
        }
      }
    }
    if (typeof field.validate === "string") {
      try {
        new RegExp(field.validate);
      } catch (err) {
        throw new Error(`Schema for ${id}: var "${name}" has invalid validate regex: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

// ─── Value validation (form submission) ─────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  /** Final values, with defaults filled in and password fields auto-generated if missing */
  values: Record<string, unknown>;
}

/**
 * Validate user-submitted form values against the schema, return a normalised
 * `values` map (with defaults filled in, passwords auto-generated, etc) or
 * a per-field `errors` map.
 *
 * `show_when` fields whose condition is false are skipped — we don't validate
 * a field the user can't see, and we don't include it in `values`.
 */
export function validateAndNormalise(schema: VarsSchema, submitted: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  // We do TWO passes so `show_when` can reference earlier fields.
  // Pass 1: collect raw + default values without validation
  for (const [name, field] of Object.entries(schema)) {
    if (Object.prototype.hasOwnProperty.call(submitted, name)) {
      values[name] = submitted[name];
    } else if ("default" in field && field.default !== undefined) {
      values[name] = field.default;
    } else if (field.type === "password") {
      // Auto-generate
      const len = (field as VarFieldPassword).generate_length ?? 24;
      values[name] = generatePassword(len);
    } else {
      values[name] = undefined;
    }
  }

  // Pass 2: validate each visible field
  for (const [name, field] of Object.entries(schema)) {
    if (field.show_when && !evalShowWhen(field.show_when, values)) {
      // Hidden — skip validation AND remove from values so the runner doesn't
      // template it into config files.
      delete values[name];
      continue;
    }
    const value = values[name];
    const err = validateValue(field, value);
    if (err) errors[name] = err;
  }

  return { ok: Object.keys(errors).length === 0, errors, values };
}

function validateValue(field: VarField, value: unknown): string | null {
  if (value == null || value === "") {
    if (field.required) return "必填项";
    return null;
  }

  switch (field.type) {
    case "string":
    case "password": {
      if (typeof value !== "string") return "必须为文本";
      if (field.validate) {
        const re = new RegExp(field.validate);
        if (!re.test(value)) return `格式不符合要求（应匹配 ${field.validate}）`;
      }
      return null;
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "必须为数字";
      if (field.min !== undefined && n < field.min) return `不能小于 ${field.min}`;
      if (field.max !== undefined && n > field.max) return `不能大于 ${field.max}`;
      return null;
    }
    case "port": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n)) return "端口必须为整数";
      if (n < 1 || n > 65535) return "端口必须在 1-65535 之间";
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") return "必须为布尔值";
      return null;
    }
    case "choice": {
      const allowed = (field as VarFieldChoice).options.map((o) => o.value);
      if (typeof value !== "string" || !allowed.includes(value)) {
        return `必须为以下之一：${allowed.join(", ")}`;
      }
      return null;
    }
  }
}

/**
 * Evaluate a tiny `show_when` expression against the current vars.
 * Supported forms (intentionally minimal):
 *   foo == 'value'
 *   foo == "value"
 *   foo == true / false
 *   foo == 80
 *   foo != 'value'
 * Returns true on parse error so the field stays visible by default —
 * better to show a redundant field than to hide a required one.
 */
export function evalShowWhen(expr: string, vars: Record<string, unknown>): boolean {
  const m = expr.match(/^\s*([a-zA-Z_][\w]*)\s*(==|!=)\s*(.+?)\s*$/);
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
    rhs = rhsRaw; // bare token — compare as string
  }
  // Loose equality so 80 (number) matches "80" (form-string)
  // eslint-disable-next-line eqeqeq
  const equal = lhs == rhs;
  return op === "==" ? equal : !equal;
}

/** Cryptographically random URL-safe password of `length` chars. */
function generatePassword(length: number): string {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
