/**
 * oauth/github.ts — GitHub OAuth provider.
 *
 * Three responsibilities, kept as separate exports so tests / future Google
 * integration can mock them individually:
 *
 *   1. `getAuthorizeUrl(state, scope?)` — build the redirect URL the browser
 *      should hit to start the OAuth dance.
 *   2. `exchangeCodeForToken(code)` — POST the temporary code returned by
 *      GitHub for an access_token.
 *   3. `fetchProfile(accessToken)` — call /user + /user/emails to pull the
 *      identity we'll persist (id, login, primary email, avatar).
 *
 * The access_token is NEVER persisted — we only use it for the two profile
 * calls during the callback, then drop it. Re-authentication or a fresh
 * `connect` flow gets a new token.
 */
import type { CreateStateInput } from "./state.js";
import { createState } from "./state.js";
import { getConfig } from "../../config.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_API = "https://api.github.com/user";
const USER_EMAILS_API = "https://api.github.com/user/emails";

/** Minimum scope: read user profile + read primary email. */
export const DEFAULT_SCOPES = ["read:user", "user:email"] as const;

export interface GitHubProfile {
  /** GitHub's immutable numeric id. The stable identity key. */
  id: string;
  /** GitHub username (display handle, can change). */
  login: string;
  /**
   * Primary verified email if available. Users with no public email AND
   * the user:email scope still allow us to fetch from /user/emails.
   * Undefined when the user has no verified primary email at all.
   */
  email?: string;
  /** Avatar URL provided by GitHub. */
  avatarUrl?: string;
  /** Display name set in profile (may be empty / different from login). */
  displayName?: string;
}

/**
 * Build the authorize URL.
 *
 * The returned URL embeds a fresh state token. The caller (route handler)
 * should redirect the browser there — no need to set a cookie because
 * `verifyState` is self-contained (HMAC-signed).
 */
export function getAuthorizeUrl(input: CreateStateInput, scopes: readonly string[] = DEFAULT_SCOPES): string {
  const cfg = getConfig().github;
  if (!cfg.clientId) {
    throw new Error("GitHub OAuth is not configured (GITHUB_CLIENT_ID missing).");
  }
  if (!cfg.redirectUri) {
    throw new Error("GitHub OAuth is not configured (GITHUB_REDIRECT_URI missing).");
  }

  const state = createState(input);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: scopes.join(" "),
    state,
    // Don't allow GitHub to silently re-use a stale grant; force fresh consent
    // when the user has revoked the OAuth app server-side.
    allow_signup: "true"
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange a one-time `code` (from the callback) for an access_token.
 *
 * Returns the raw token. Caller is responsible for using it to fetch the
 * profile and then dropping it — nothing here persists it.
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const cfg = getConfig().github;
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error("GitHub OAuth is not configured.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "EnvForge"
    },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri
    })
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (body.error) {
    // Don't echo error_description verbatim — it can sometimes contain user-controlled
    // strings. Keep the log entry server-side via thrown Error.
    throw new Error(`GitHub token exchange rejected: ${body.error}`);
  }
  if (!body.access_token) {
    throw new Error("GitHub token exchange returned no access_token.");
  }
  return body.access_token;
}

/**
 * Fetch the user's profile + primary verified email.
 *
 * Two API calls (parallelized):
 *   - GET /user           → id, login, name, avatar_url, email (often null!)
 *   - GET /user/emails    → list with `primary` and `verified` flags
 *
 * The /user endpoint's `email` is null for users who hide their email; in
 * that case we fall back to the verified primary from /user/emails. If the
 * user has NO verified email at all, profile.email stays undefined and the
 * caller decides how to proceed (typically: refuse the flow, ask the user
 * to verify an email on GitHub first).
 */
export async function fetchProfile(accessToken: string): Promise<GitHubProfile> {
  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": "EnvForge",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const [userRes, emailsRes] = await Promise.all([
    fetch(USER_API, { headers }),
    // Best-effort — if scope didn't grant emails, this 404s and we proceed with /user only.
    fetch(USER_EMAILS_API, { headers }).catch(() => null)
  ]);

  if (!userRes.ok) {
    throw new Error(`GitHub /user failed: HTTP ${userRes.status}`);
  }
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };

  let primaryEmail = user.email ?? undefined;
  if (!primaryEmail && emailsRes && emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find((e) => e.primary && e.verified);
    primaryEmail = primary?.email;
  }

  return {
    id: String(user.id),
    login: user.login,
    email: primaryEmail?.toLowerCase(),
    avatarUrl: user.avatar_url ?? undefined,
    displayName: user.name?.trim() || undefined
  };
}
