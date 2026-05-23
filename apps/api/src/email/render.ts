/**
 * email/render.ts — minimal template renderer for outgoing email bodies.
 *
 * Replaces `{{ key }}` placeholders with values from a context map. Both
 * plain-text and HTML variants are loaded from disk; HTML output is escaped
 * by default to prevent XSS when user-supplied data (e.g. display names,
 * comment bodies) lands in an email.
 *
 * Two intentional limitations:
 *   1. No control flow ({{#if}}, loops, etc.). Templates stay simple; if you
 *      need branching, render two separate templates.
 *   2. Strict context — referencing an undefined key throws. Catches typos
 *      early instead of silently emailing "Hi {{ name }}, ...".
 *
 * NOTE: We do NOT use marked/dompurify here. Those are reserved for
 * user-generated markdown (comments, suggestions). Email bodies are
 * authored by the platform; the only untrusted input is per-user values
 * that come in via the context, which we HTML-escape.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveFromRoot } from "../repo.js";

export type TemplateContext = Record<string, string | number>;

const TEMPLATES_DIR = resolveFromRoot("apps/api/src/email/templates");
// In production (running from dist/), templates live alongside compiled code.
// Try both locations; whichever exists wins.
const TEMPLATES_DIR_DIST = resolveFromRoot("apps/api/dist/email/templates");

/** HTML-escape user-supplied values to prevent injection in HTML emails. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a string template, substituting {{ key }} with context[key]. */
export function renderString(template: string, context: TemplateContext, escape: boolean): string {
  return template.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (_, key: string) => {
    if (!(key in context)) {
      throw new Error(`Email template references undefined variable: {{ ${key} }}`);
    }
    const value = String(context[key]);
    return escape ? escapeHtml(value) : value;
  });
}

/** Resolve template file from either source dir (dev) or dist dir (prod). */
async function readTemplateFile(name: string): Promise<string> {
  const candidates = [
    path.join(TEMPLATES_DIR, name),
    path.join(TEMPLATES_DIR_DIST, name)
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      // try next
    }
  }
  throw new Error(`Email template not found: ${name} (looked in ${candidates.join(", ")})`);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Load template files for a given template id (e.g. "verify-register") and
 * render them with the provided context.
 *
 * Subject line is the first line of the .txt file prefixed with `Subject: `.
 * If no such line exists, falls back to a templated default.
 */
export async function renderTemplate(
  templateId: string,
  context: TemplateContext
): Promise<RenderedEmail> {
  const txtRaw = await readTemplateFile(`${templateId}.txt`);
  const htmlRaw = await readTemplateFile(`${templateId}.html`);

  // Extract subject from the first line if it starts with "Subject:"
  const lines = txtRaw.split(/\r?\n/);
  let subjectTemplate = `EnvForge: ${templateId}`;
  let bodyText = txtRaw;
  if (lines[0]?.startsWith("Subject:")) {
    subjectTemplate = lines[0].slice("Subject:".length).trim();
    bodyText = lines.slice(1).join("\n").replace(/^\n+/, "");
  }

  return {
    subject: renderString(subjectTemplate, context, false),
    text: renderString(bodyText, context, false), // text is not HTML-escaped
    html: renderString(htmlRaw, context, true)    // HTML is escaped
  };
}
