/**
 * oauth/google.ts — Google OAuth provider.
 *
 * Implements:
 *   1. `getAuthorizeUrl(state)` — redirect browser to Google consent screen.
 *   2. `exchangeCodeForToken(code)` — exchange code for Google accessToken.
 *   3. `fetchProfile(accessToken)` — fetch Google user profile info.
 */
import type { CreateStateInput } from "./state.js";
import { createState } from "./state.js";
import { getConfig } from "../../config.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USER_API = "https://www.googleapis.com/oauth2/v3/userinfo";

export const DEFAULT_SCOPES = ["openid", "email", "profile"] as const;

export interface GoogleProfile {
  id: string; // google sub
  email?: string;
  avatarUrl?: string;
  displayName?: string;
}

export function getAuthorizeUrl(input: CreateStateInput, scopes: readonly string[] = DEFAULT_SCOPES): string {
  const cfg = getConfig().google;
  if (!cfg.clientId || !cfg.redirectUri) {
    throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID missing).");
  }

  const state = createState(input);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    prompt: "consent",
    access_type: "online"
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const cfg = getConfig().google;
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error("Google OAuth is not configured.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "EnvForge"
    },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: cfg.redirectUri
    }).toString()
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (body.error) {
    throw new Error(`Google token exchange rejected: ${body.error}`);
  }
  if (!body.access_token) {
    throw new Error("Google token exchange returned no access_token.");
  }
  return body.access_token;
}

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USER_API, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "User-Agent": "EnvForge"
    }
  });

  if (!res.ok) {
    throw new Error(`Google userinfo failed: HTTP ${res.status}`);
  }

  const user = (await res.json()) as {
    sub: string;
    email?: string;
    picture?: string;
    name?: string;
  };

  return {
    id: user.sub,
    email: user.email?.toLowerCase(),
    avatarUrl: user.picture,
    displayName: user.name?.trim()
  };
}
