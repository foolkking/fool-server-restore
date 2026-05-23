/**
 * oauth/state.ts — HMAC-signed, self-contained OAuth state tokens.
 *
 * The OAuth `state` parameter is sent to the provider when redirecting the
 * browser to authorize, then echoed back to our callback. It must:
 *   1. Be unguessable (CSRF protection — an attacker can't forge a callback)
 *   2. Carry our intent across the redirect dance (login vs link, redirect path)
 *   3. Have a short lifetime so leaked states can't be replayed
 *   4. Be single-use so a captured state can't be reused (best-effort —
 *      we use an in-memory consumed set; restart wipes it but states expire
 *      in 10 min anyway, so worst case is a 10-min replay window post-restart)
 *
 * Format: `<base64url-payload>.<base64url-hmac>`
 *   - payload = JSON of { purpose, userId?, redirectTo?, nonce, ts }
 *   - HMAC-SHA256 over the payload using a sub-key derived from the master key
 *
 * The token is cookie-safe (no = signs, no special chars).
 *
 * P1.7+ uses this in:
 *   - GET /api/auth/github → createState({ purpose: "login" })
 *   - POST /api/me/identities/github/connect → createState({ purpose: "link", userId })
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deriveSubKey } from "../../crypto.js";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const HMAC_SUBKEY_PURPOSE = "oauth-state-hmac";

export interface StatePayload {
  /** "login" = create or sign in to an account; "link" = attach to currently-logged-in user */
  purpose: "login" | "link";
  /** When `purpose=link`, the id of the user to attach the new identity to. Required. */
  userId?: string;
  /** Optional path to redirect to after successful auth (e.g. "/account/identities"). */
  redirectTo?: string;
  /** Random nonce to make every token unique even with identical payload + ts. */
  nonce: string;
  /** Issue time — Unix ms. Used to enforce TTL. */
  ts: number;
}

export interface CreateStateInput {
  purpose: "login" | "link";
  userId?: string;
  redirectTo?: string;
}

/**
 * Build a fresh signed state token. Caller stores nothing — verifyState()
 * is enough to recover the payload.
 */
export function createState(input: CreateStateInput): string {
  if (input.purpose === "link" && !input.userId) {
    throw new Error("createState: purpose='link' requires userId.");
  }
  const payload: StatePayload = {
    purpose: input.purpose,
    userId: input.userId,
    redirectTo: input.redirectTo,
    nonce: randomBytes(12).toString("base64url"),
    ts: Date.now()
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" | "replayed" };

/**
 * Verify a state token returned from the OAuth provider.
 *
 * Returns the decoded payload on success. On any failure the caller should
 * reject the entire OAuth flow with a generic "authentication failed" error
 * (don't leak which specific check failed — that's a CSRF oracle).
 *
 * SUCCESS marks the token as consumed in an in-process set so it can't be
 * verified again. The set is bounded (auto-prunes after TTL).
 */
export function verifyState(token: string): VerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const dot = token.indexOf(".");
  if (dot === -1) return { ok: false, reason: "malformed" };

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payloadB64 || !sig) return { ok: false, reason: "malformed" };

  const expected = signPayload(payloadB64);
  if (!constantTimeEqual(sig, expected)) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.ts !== "number" || !Number.isFinite(payload.ts)) {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() - payload.ts > STATE_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  if (payload.purpose !== "login" && payload.purpose !== "link") {
    return { ok: false, reason: "malformed" };
  }

  // Single-use enforcement
  if (consumedTokens.has(token)) {
    return { ok: false, reason: "replayed" };
  }
  consumedTokens.add(token);
  scheduleCleanup();

  return { ok: true, payload };
}

// ── Internal helpers ───────────────────────────────────────────────────────

function signPayload(payloadB64: string): string {
  const key = deriveSubKey(HMAC_SUBKEY_PURPOSE);
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  // Convert to fixed-length buffers; differing-length strings are unequal but
  // we still need a constant-time comparator after equalizing length.
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * In-memory set of consumed tokens. Bounded by TTL — entries are pruned
 * on a periodic timer. Restart wipes the set, but every token expires
 * within 10 minutes so the worst-case replay window post-restart is the
 * remaining TTL of any leaked token.
 */
const consumedTokens = new Set<string>();
let cleanupTimer: NodeJS.Timeout | null = null;

function scheduleCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    pruneConsumed();
    // Schedule the next sweep only if there are still entries to consider.
    if (consumedTokens.size > 0) scheduleCleanup();
  }, STATE_TTL_MS);
  cleanupTimer.unref?.();
}

function pruneConsumed(): void {
  // The signed payload itself carries `ts` — re-verify each entry's age
  // and drop expired ones. O(n) but n is small (10-min window of OAuth flows).
  const now = Date.now();
  for (const tok of consumedTokens) {
    const dot = tok.indexOf(".");
    if (dot === -1) {
      consumedTokens.delete(tok);
      continue;
    }
    try {
      const payload = JSON.parse(Buffer.from(tok.slice(0, dot), "base64url").toString("utf8")) as StatePayload;
      if (now - payload.ts > STATE_TTL_MS) {
        consumedTokens.delete(tok);
      }
    } catch {
      consumedTokens.delete(tok);
    }
  }
}

/** Test-only — clear the consumed-tokens set. */
export function _resetOAuthStateForTests(): void {
  consumedTokens.clear();
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}
