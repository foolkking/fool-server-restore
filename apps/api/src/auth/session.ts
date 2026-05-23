/**
 * session.ts — session token management and the unified `getUserByToken`
 * dispatcher that handles both web sessions and CI/CD API tokens.
 *
 * Two distinct token namespaces:
 *   - "envf_*"  → API token (CI/CD), looked up by SHA-256 hash
 *   - everything else → web session token, looked up by exact match
 *
 * Three classes of session (auth-and-ecosystem spec P1.10):
 *   - Regular session — full access (twofaPending=false, enrollmentRequired=false)
 *   - 2FA-pending session — only `/api/auth/login/2fa` accepts it
 *     - Created by `loginUser` when user has TOTP enabled
 *     - 5-minute TTL
 *     - All other routes treat it as anonymous (return 401)
 *   - Enrollment-required session — only `/api/me/2fa/{status,enroll,confirm}`
 *     accept it. Admin without 2FA is forced through this gate (D-2.1).
 *     - 15-minute TTL
 *
 * The default `getUserByToken(token)` enforces "regular session only".
 * Callers that need to accept restricted sessions pass an option flag.
 */
import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "../config.js";
import {
  readRuntimeDatabase,
  updateRuntimeDatabase,
  type StoredSession,
  type StoredUser
} from "../runtime-store.js";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getSessionTtlMs(): number {
  return getConfig().sessionTtlHours * 60 * 60 * 1000;
}

/** TTL for a 2FA-pending session — short, just enough to enter a code. */
export const TWOFA_PENDING_TTL_MS = 5 * 60 * 1000;

/**
 * TTL for an enrollment-required session — generous so admin users have time
 * to install an authenticator app, scan the QR, and confirm.
 */
export const ENROLLMENT_REQUIRED_TTL_MS = 15 * 60 * 1000;

export interface GetUserOptions {
  /** Allow 2FA-pending sessions to resolve. Default: false. */
  allowTwofaPending?: boolean;
  /** Allow enrollment-required sessions to resolve. Default: false. */
  allowEnrollmentRequired?: boolean;
}

export interface ResolvedSession {
  user: StoredUser;
  /**
   * Restriction flag on the underlying session, if any. `undefined` means
   * a regular fully-authenticated session.
   */
  restriction?: "twofa-pending" | "enrollment-required";
  /**
   * For session tokens this is the matched StoredSession. For API tokens
   * it's undefined (API tokens cannot be 2FA-pending).
   */
  session?: StoredSession;
}

/**
 * Resolve a token to the matching user, or undefined if invalid/expired.
 *
 * Default behavior: reject restricted sessions (only fully-authenticated
 * regular sessions resolve). Pass options to opt in to restricted modes.
 *
 * - API tokens (envf_*): hashed lookup, last-used timestamp updated best-effort.
 * - Session tokens: exact-match lookup, expiry checked, restriction enforced.
 *
 * Returns the StoredUser (raw, not the public projection); callers project
 * via toPublicUser() if they need to send it over the wire.
 */
export async function getUserByToken(
  token?: string,
  options: GetUserOptions = {}
): Promise<StoredUser | undefined> {
  const resolved = await resolveSession(token, options);
  return resolved?.user;
}

/**
 * Like `getUserByToken` but also surfaces the underlying session row + its
 * restriction class. Use when you need to react differently to restricted
 * sessions (e.g. only the /login/2fa upgrade route).
 */
export async function resolveSession(
  token?: string,
  options: GetUserOptions = {}
): Promise<ResolvedSession | undefined> {
  if (!token) return undefined;
  const database = await readRuntimeDatabase();

  // Path 1: API token (CI/CD integration). These start with "envf_".
  if (token.startsWith("envf_")) {
    const hash = createHash("sha256").update(token).digest("hex");
    const apiToken = (database.apiTokens ?? []).find((t) => t.tokenHash === hash);
    if (!apiToken) return undefined;
    if (apiToken.expiresAt && new Date(apiToken.expiresAt).getTime() <= Date.now()) return undefined;
    void updateRuntimeDatabase((db) => {
      const t = (db.apiTokens ?? []).find((x) => x.id === apiToken.id);
      if (t) t.lastUsedAt = new Date().toISOString();
    });
    const user = database.users.find((u) => u.id === apiToken.userId);
    if (!user) return undefined;
    return { user };
  }

  // Path 2: session token (web login)
  const session = database.sessions.find((s) => s.token === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return undefined;

  const user = database.users.find((u) => u.id === session.userId);
  if (!user) return undefined;

  if (session.twofaPending) {
    if (!options.allowTwofaPending) return undefined;
    return { user, restriction: "twofa-pending", session };
  }
  if (session.enrollmentRequired) {
    if (!options.allowEnrollmentRequired) return undefined;
    return { user, restriction: "enrollment-required", session };
  }
  return { user, session };
}

/**
 * Replace one session token with a fresh one (rotation). Used after 2FA
 * upgrade and after enrollment completion to ensure the freshly-issued
 * token has zero overlap with the restricted session that came before.
 *
 * On success returns the new full-access token + expiry.
 */
export async function rotateSession(
  oldToken: string
): Promise<{ token: string; expiresAt: string } | null> {
  const newToken = createSessionToken();
  const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();
  let userId: string | null = null;

  await updateRuntimeDatabase((db) => {
    const idx = db.sessions.findIndex((s) => s.token === oldToken);
    if (idx === -1) return;
    const old = db.sessions[idx];
    userId = old.userId;
    db.sessions.splice(idx, 1);
    db.sessions.push({
      token: newToken,
      userId: old.userId,
      createdAt: new Date().toISOString(),
      expiresAt
    });
  });

  if (!userId) return null;
  return { token: newToken, expiresAt };
}
