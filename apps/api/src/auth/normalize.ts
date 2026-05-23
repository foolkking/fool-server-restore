/**
 * normalize.ts — input validation/normalization for auth fields.
 *
 * Each function returns the cleaned value or throws a user-facing Error.
 * Throwing keeps call sites short; the route layer catches and 400s.
 */

export function normalizeName(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required.");
  if (trimmed.length > 80) throw new Error("Name is too long.");
  return trimmed;
}

export function normalizeEmail(email?: string): string {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email is required.");
  }
  return normalized;
}

export function normalizePassword(password?: string): string {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  return password;
}

export function normalizeDefaultSshUser(defaultSshUser: string): string {
  const trimmed = defaultSshUser.trim();
  if (!trimmed) throw new Error("Default SSH user is required.");
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$/.test(trimmed)) {
    throw new Error("Default SSH user must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens.");
  }
  return trimmed;
}

// ── Profile fields (added by auth-and-ecosystem spec P1.11) ─────────────────

/**
 * displayName — what the UI shows. Free-form unicode text. We HTML-escape
 * before render rather than at write time so users can store " or & in their
 * own copy of the value, but no markup leaks into other users' pages.
 */
export function normalizeDisplayName(value?: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error("Display name is required.");
  if (trimmed.length > 80) throw new Error("Display name is too long (max 80 characters).");
  // Reject control chars (newlines, NUL, etc.) — keep names single-line.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new Error("Display name contains forbidden control characters.");
  }
  return trimmed;
}

/**
 * Free-form bio shown on the user's public-facing profile page. Markdown is
 * NOT supported (P1.11) — surfaced as plain text after HTML escape on render.
 * Markdown comes later in P3.3 alongside catalog comments.
 */
export function normalizeBio(value?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined; // Treat empty string as "clear"
  if (trimmed.length > 1000) {
    throw new Error("Bio is too long (max 1000 characters).");
  }
  // Reject NUL bytes; allow newlines (multi-paragraph bio is fine).
  if (/[\u0000\u0007]/.test(trimmed)) {
    throw new Error("Bio contains forbidden control characters.");
  }
  return trimmed;
}

/**
 * avatarUrl — must be HTTPS. Block data:, file:, and any non-https schemes
 * (security: prevents stored XSS via `data:text/html` and SSRF via file:).
 * Empty string clears the field.
 */
export function normalizeAvatarUrl(value?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > 500) {
    throw new Error("Avatar URL is too long.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Avatar URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Avatar URL must use the https:// scheme.");
  }
  return trimmed;
}

/**
 * IANA timezone name. Validated via Intl.DateTimeFormat — Node 22+ knows the
 * canonical list. Empty string clears.
 */
export function normalizeTimezone(value?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > 60) throw new Error("Timezone is too long.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
  } catch {
    throw new Error(`"${trimmed}" is not a valid IANA timezone.`);
  }
  return trimmed;
}

/**
 * UI locale. Allowed values: "auto" (browser-decided), or BCP-47 tags we
 * actually ship translations for. Empty string clears.
 */
const SUPPORTED_LOCALES = new Set(["auto", "zh-CN", "en-US"]);

export function normalizeLocale(value?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!SUPPORTED_LOCALES.has(trimmed)) {
    throw new Error(`Locale must be one of: ${[...SUPPORTED_LOCALES].join(", ")}.`);
  }
  return trimmed;
}

/**
 * username — internal handle used for @ mentions and URLs. Must be unique;
 * caller checks DB. Format: lowercase alphanumeric + underscore + hyphen,
 * 3-32 chars, must start with a letter.
 */
export function normalizeUsername(value?: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) throw new Error("Username is required.");
  if (trimmed.length < 3) throw new Error("Username must be at least 3 characters.");
  if (trimmed.length > 32) throw new Error("Username must be at most 32 characters.");
  if (!/^[a-z][a-z0-9_-]*$/.test(trimmed)) {
    throw new Error("Username must start with a letter and contain only lowercase letters, digits, underscores, and hyphens.");
  }
  return trimmed;
}

/** HTML-escape free-form user text for safe inline rendering. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
