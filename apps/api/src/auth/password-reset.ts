/**
 * password-reset.ts — forgot-password flow (auth-and-ecosystem spec P1.12).
 *
 * Two-step:
 *
 *   1. requestReset(email)
 *      - Look up user by email. If found AND has a local password, persist
 *        a `PasswordResetRequest` row (token = HMAC over a random nonce +
 *        userId + ts), enqueue a "password-reset" email containing a
 *        single-use, 20-minute reset URL.
 *      - SECURITY: when the email is unknown OR the matched account is
 *        OAuth-only (no passwordHash), we do NOT throw. We enqueue NOTHING
 *        and return the same generic "if that account exists, an email is
 *        on the way" message. Prevents account-existence enumeration.
 *
 *   2. confirmReset(token, newPassword)
 *      - Verify the token's HMAC, look up the request row, check expiry +
 *        not-yet-used, hash + write the new password. Mark `usedAt`.
 *      - On success ALL existing sessions for this user are revoked
 *        (session-rotate-on-password-change is a hard rule for reset, even
 *        though voluntary `changePassword` doesn't revoke).
 *
 * Token format:  base64url(payload).base64url(hmac)
 *   payload = JSON({ id, ts })  — `id` is the `PasswordResetRequest.id`
 *   hmac    = HMAC-SHA256(deriveSubKey("password-reset"), payload)
 *
 * Storage: `RuntimeDatabase.passwordResetRequests` (added in this file's task).
 *   We persist the `id` server-side rather than baking userId+nonce into the
 *   token so we can also store `usedAt` to enforce single-use atomically.
 *
 * Rate limit: each user can have at most ONE pending reset at a time.
 *   A second `requestReset` replaces the first. Email-level rate limit comes
 *   from the email queue's `evaluateRateLimit` (P1.4).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  createId,
  readRuntimeDatabase,
  updateRuntimeDatabase,
  type PasswordResetRequest
} from "../runtime-store.js";
import { deriveSubKey } from "../crypto.js";
import { hashPassword } from "./password.js";
import { normalizeEmail, normalizePassword } from "./normalize.js";
import { enqueueEmail } from "../email/index.js";
import { getConfig } from "../config.js";

/** Token TTL — generous enough for users to read email + click + type. */
const RESET_TTL_MS = 20 * 60 * 1000;

/** Sub-key for HMAC. Stable derivation from the master key. */
function getSigningKey(): Buffer {
  return deriveSubKey("password-reset", 32);
}

export interface RequestResetResult {
  /**
   * Generic message safe to show the user. We never reveal whether the email
   * matched an account, which would be an enumeration oracle.
   */
  message: string;
  /**
   * In dev (NODE_ENV !== "production"), surfaces the reset URL directly so
   * tests + local development without SMTP can complete the flow. In
   * production this is undefined.
   */
  devResetUrl?: string;
}

/**
 * Step 1 — kick off password reset for the given email.
 *
 * Always returns the same generic success message. The actual email is only
 * sent if the user exists and has a local password.
 */
export async function requestPasswordReset(emailRaw: string): Promise<RequestResetResult> {
  let email: string;
  try {
    email = normalizeEmail(emailRaw);
  } catch {
    // Invalid email format — return the same generic message. We refuse to
    // tell the caller the input was even malformed; the SPA can do its own
    // client-side regex if it wants.
    return { message: GENERIC_MESSAGE };
  }

  const cfg = getConfig();
  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.email === email && !u.deletedAt);

  // Account not found OR OAuth-only (no local password): return generic
  // message without persisting / sending anything.
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return { message: GENERIC_MESSAGE };
  }

  // Replace any prior pending reset row for this user.
  const id = createId("pwreset");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);

  await updateRuntimeDatabase((d) => {
    if (!d.passwordResetRequests) d.passwordResetRequests = [];
    d.passwordResetRequests = d.passwordResetRequests.filter((r) => r.userId !== user.id);
    d.passwordResetRequests.push({
      id,
      userId: user.id,
      email,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString()
    });
  });

  const token = signToken(id, now.getTime());
  const resetUrl = `${cfg.publicBaseUrl}/auth/password-reset?token=${encodeURIComponent(token)}`;

  await enqueueEmail({
    to: email,
    userId: user.id,
    templateId: "password-reset",
    context: {
      displayName: user.displayName ?? user.name,
      resetUrl
    }
  });

  const result: RequestResetResult = { message: GENERIC_MESSAGE };
  if (cfg.nodeEnv !== "production") {
    result.devResetUrl = resetUrl;
  }
  return result;
}

const GENERIC_MESSAGE =
  "If an account with that email exists, a password reset link is on its way. The link expires in 20 minutes.";

export type ConfirmResetFailReason =
  | "malformed-token"
  | "bad-signature"
  | "not-found"
  | "expired"
  | "already-used"
  | "user-not-found";

export class PasswordResetError extends Error {
  constructor(public readonly reason: ConfirmResetFailReason) {
    super(reason);
    this.name = "PasswordResetError";
  }
}

export interface ConfirmResetResult {
  email: string;
  /** Number of sessions revoked as part of the reset. */
  sessionsRevoked: number;
}

/**
 * Step 2 — verify token + write new password + revoke sessions.
 *
 * Throws PasswordResetError on every failure branch.
 *
 * The token is single-use: on success we set `usedAt`. A second confirm
 * with the same token returns `already-used`. We deliberately keep the
 * row around (with `usedAt` set) for ~24h so post-mortem diagnosis is
 * possible — they're cleaned up by the next `cleanupExpiredResetRequests`.
 */
export async function confirmPasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<ConfirmResetResult> {
  const newPassword = normalizePassword(input.newPassword);
  const verified = verifyToken(input.token);
  if (verified.kind === "malformed") throw new PasswordResetError("malformed-token");
  if (verified.kind === "bad-signature") throw new PasswordResetError("bad-signature");

  const { id } = verified.payload;

  const db = await readRuntimeDatabase();
  const reqRow = (db.passwordResetRequests ?? []).find((r) => r.id === id);
  if (!reqRow) throw new PasswordResetError("not-found");
  if (reqRow.usedAt) throw new PasswordResetError("already-used");
  if (Date.now() >= new Date(reqRow.expiresAt).getTime()) {
    throw new PasswordResetError("expired");
  }

  const user = db.users.find((u) => u.id === reqRow.userId);
  if (!user || user.deletedAt) {
    throw new PasswordResetError("user-not-found");
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(newPassword, passwordSalt);
  const now = new Date().toISOString();

  let sessionsRevoked = 0;
  await updateRuntimeDatabase((d) => {
    const target = d.users.find((u) => u.id === user.id);
    if (target) {
      target.passwordHash = passwordHash;
      target.passwordSalt = passwordSalt;
      target.updatedAt = now;
    }
    // Mark single-use.
    const row = (d.passwordResetRequests ?? []).find((r) => r.id === id);
    if (row) row.usedAt = now;

    // Revoke all sessions for the user (forced log-out everywhere).
    const before = d.sessions.length;
    d.sessions = d.sessions.filter((s) => s.userId !== user.id);
    sessionsRevoked = before - d.sessions.length;
  });

  return { email: reqRow.email, sessionsRevoked };
}

/** Periodic cleanup helper — drop expired + old-used reset rows. */
export async function cleanupExpiredResetRequests(): Promise<{ removed: number }> {
  let removed = 0;
  await updateRuntimeDatabase((d) => {
    if (!d.passwordResetRequests) return;
    const before = d.passwordResetRequests.length;
    const now = Date.now();
    const usedRetentionCutoff = now - 24 * 60 * 60 * 1000; // keep used rows for 24h
    d.passwordResetRequests = d.passwordResetRequests.filter((r) => {
      const expired = now >= new Date(r.expiresAt).getTime();
      if (r.usedAt) {
        return new Date(r.usedAt).getTime() > usedRetentionCutoff;
      }
      return !expired;
    });
    removed = before - d.passwordResetRequests.length;
  });
  return { removed };
}

// ── Token signing ──────────────────────────────────────────────────────────

interface TokenPayload {
  id: string;
  ts: number;
}

type VerifyResult =
  | { kind: "ok"; payload: TokenPayload }
  | { kind: "malformed" }
  | { kind: "bad-signature" };

export function signToken(id: string, ts: number): string {
  const payload: TokenPayload = { id, ts };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", getSigningKey()).update(payloadB64).digest();
  const sigB64 = base64url(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyToken(token: string): VerifyResult {
  if (!token || typeof token !== "string") return { kind: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { kind: "malformed" };
  const [payloadB64, sigB64] = parts;

  let payloadBytes: Buffer;
  try {
    payloadBytes = fromBase64url(payloadB64);
  } catch {
    return { kind: "malformed" };
  }

  const expectedSig = createHmac("sha256", getSigningKey()).update(payloadB64).digest();
  let providedSig: Buffer;
  try {
    providedSig = fromBase64url(sigB64);
  } catch {
    return { kind: "malformed" };
  }
  if (providedSig.length !== expectedSig.length) return { kind: "bad-signature" };
  if (!timingSafeEqual(providedSig, expectedSig)) return { kind: "bad-signature" };

  let payload: TokenPayload;
  try {
    const parsed = JSON.parse(payloadBytes.toString("utf8")) as Partial<TokenPayload>;
    if (typeof parsed.id !== "string" || typeof parsed.ts !== "number") {
      return { kind: "malformed" };
    }
    payload = { id: parsed.id, ts: parsed.ts };
  } catch {
    return { kind: "malformed" };
  }
  return { kind: "ok", payload };
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Buffer {
  // Strict: only valid base64url alphabet chars + length must be 0/2/3 mod 4.
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("not base64url");
  const m = s.length % 4;
  const padded = s + (m === 2 ? "==" : m === 3 ? "=" : m === 0 ? "" : "===");
  if (m === 1) throw new Error("invalid length");
  const restored = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(restored, "base64");
}

// `PasswordResetRequest` referenced for type-only; suppress lint by using void-ref pattern.
void ({} as PasswordResetRequest);
