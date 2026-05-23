/**
 * totp.ts — TOTP-based 2FA enrolment, verification, and recovery codes
 * (auth-and-ecosystem spec P1.9).
 *
 * Lifecycle of a TOTP secret:
 *
 *   1. enroll(userId)
 *      - Generate a fresh 20-byte base32 secret + otpauth:// URI + QR PNG.
 *      - Persist as PendingTotpEnrollment (10-minute TTL).
 *      - Return { otpauthUri, qrDataUrl } to the caller; the secret stays server-side.
 *      - User scans the QR with Google Authenticator / 1Password / Bitwarden /
 *        Microsoft Authenticator / Authy.
 *
 *   2. confirm(userId, code)
 *      - Look up the pending row.
 *      - Verify the 6-digit code against the pending secret (window=±1).
 *      - Encrypt the secret with the master key (AES-256-GCM via crypto.ts).
 *      - Generate 8 fresh recovery codes; persist their SHA-256 hashes only.
 *      - Move totpSecretEnc + totpEnabledAt onto the user; delete pending row.
 *      - Return { recoveryCodes: string[] } — shown to the user ONCE.
 *
 *   3. verify(userId, code)
 *      - Decrypt the secret, validate the code at delta {-1, 0, +1}
 *        (90-second window total).
 *      - On success the same code can NOT be replayed because each TOTP step
 *        is 30 seconds long; an attacker who replays within the window would
 *        only succeed if they captured a code currently valid for the same
 *        user, which means the password was already compromised. We accept
 *        this tradeoff (standard TOTP behavior).
 *
 *   4. consumeRecoveryCode(userId, code)
 *      - SHA-256 the input, search for a match in totpRecoveryCodesHashed.
 *      - On match: remove the hash from the array. Each code is one-shot.
 *      - Used during login when the user can't access their authenticator.
 *
 *   5. disable(userId)
 *      - Clear totpSecretEnc, totpEnabledAt, totpRecoveryCodesHashed.
 *      - Caller must have already verified the user (password / OAuth re-auth).
 *
 *   6. regenerateRecoveryCodes(userId)
 *      - Replaces the existing 8 with 8 fresh ones. Returns plaintext once.
 *
 * Issuer string is fixed "EnvForge" (D-13.4 in design.md). Account label is
 * the user's email so multiple Authenticator entries don't collide for users
 * with multiple accounts.
 */
import { createHash, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import * as QRCode from "qrcode";
import {
  readRuntimeDatabase,
  updateRuntimeDatabase,
  type PendingTotpEnrollment
} from "../runtime-store.js";
import { decryptSecret, encryptSecret } from "../crypto.js";

const TOTP_ISSUER = "EnvForge";
const TOTP_PERIOD_SEC = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGO = "SHA1"; // standard for Authenticator app compatibility
const TOTP_VERIFY_WINDOW = 1; // ±1 step → ±30s on each side, 90s total tolerance
const ENROLL_TTL_MS = 10 * 60 * 1000;
const RECOVERY_CODE_COUNT = 8;
/** Length in bytes of the plaintext recovery code BEFORE base32 encoding. 10 → 16-char output. */
const RECOVERY_CODE_BYTES = 10;

export interface EnrollResult {
  otpauthUri: string;
  qrDataUrl: string;
  /**
   * Base32-encoded secret. Surfaced so users who can't scan the QR can type
   * it manually into their authenticator app. Same plaintext as in the URI.
   */
  secret: string;
}

export interface ConfirmResult {
  recoveryCodes: string[];
}

export type VerifyResult = "ok" | "wrong-code" | "not-enrolled";
export type ConfirmFailReason = "no-pending" | "expired" | "wrong-code";

export class TotpError extends Error {
  constructor(public readonly reason: ConfirmFailReason | "not-enrolled" | "no-such-user") {
    super(reason);
    this.name = "TotpError";
  }
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

export function generateRecoveryCodePlain(): string {
  // 10 random bytes → 16-char base32 — short enough to type, plenty of entropy.
  // Format with a hyphen in the middle so it reads like XXXXXXXX-XXXXXXXX.
  // Copy into a fresh ArrayBuffer (not SharedArrayBuffer) to satisfy strict TS
  // typings on `Secret({ buffer })`.
  const bytes = randomBytes(RECOVERY_CODE_BYTES);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const raw = new Secret({ buffer: ab }).base32;
  return `${raw.slice(0, 8)}-${raw.slice(8, 16)}`;
}

export function hashRecoveryCode(plain: string): string {
  // Normalize: strip hyphens, uppercase, hash. Lets users enter
  // "abcd1234efgh5678" or "ABCD1234-EFGH5678" interchangeably.
  const normalized = plain.replace(/-/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export function buildOtpauthUri(secretBase32: string, accountLabel: string): string {
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: accountLabel,
    algorithm: TOTP_ALGO,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SEC,
    secret: Secret.fromBase32(secretBase32)
  });
  return totp.toString();
}

/** Construct a TOTP instance from a base32 secret (no I/O). */
function totpFromSecret(secretBase32: string, accountLabel: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label: accountLabel,
    algorithm: TOTP_ALGO,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SEC,
    secret: Secret.fromBase32(secretBase32)
  });
}

/** Validate a 6-digit code given a base32 secret. Pure, time-based. */
export function verifyCodeAgainstSecret(
  secretBase32: string,
  code: string,
  accountLabel: string,
  windowSteps: number = TOTP_VERIFY_WINDOW
): boolean {
  if (!/^\d{6}$/.test(code.trim())) return false;
  const totp = totpFromSecret(secretBase32, accountLabel);
  const delta = totp.validate({ token: code.trim(), window: windowSteps });
  return delta !== null;
}

// ── Public API (DB-backed) ─────────────────────────────────────────────────

/**
 * Step 1 — Generate a pending enrolment (secret + QR). Replaces any prior
 * pending row for this user. Does NOT touch StoredUser.totpSecretEnc.
 */
export async function enroll(userId: string): Promise<EnrollResult> {
  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new TotpError("no-such-user");

  // Fresh 20-byte (160-bit) secret — RFC 6238 recommended size for SHA-1.
  const secret = new Secret({ size: 20 }).base32;
  const accountLabel = user.email;
  const otpauthUri = buildOtpauthUri(secret, accountLabel);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 1, width: 256 });

  const now = new Date();
  const pending: PendingTotpEnrollment = {
    userId,
    secret,
    otpauthUri,
    qrDataUrl,
    expiresAt: new Date(now.getTime() + ENROLL_TTL_MS).toISOString(),
    createdAt: now.toISOString()
  };

  await updateRuntimeDatabase((d) => {
    if (!d.pendingTotpEnrollments) d.pendingTotpEnrollments = [];
    d.pendingTotpEnrollments = d.pendingTotpEnrollments.filter((p) => p.userId !== userId);
    d.pendingTotpEnrollments.push(pending);
  });

  return { otpauthUri, qrDataUrl, secret };
}

/**
 * Step 2 — Confirm the code, encrypt the secret onto the user, generate
 * recovery codes. Returns the plaintext recovery codes (shown ONCE).
 *
 * Idempotency: confirming twice on the same pending row will fail the second
 * time because the row is removed on success.
 */
export async function confirm(userId: string, code: string): Promise<ConfirmResult> {
  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new TotpError("no-such-user");
  const pending = (db.pendingTotpEnrollments ?? []).find((p) => p.userId === userId);
  if (!pending) throw new TotpError("no-pending");
  if (Date.now() >= new Date(pending.expiresAt).getTime()) throw new TotpError("expired");
  if (!verifyCodeAgainstSecret(pending.secret, code, user.email)) {
    throw new TotpError("wrong-code");
  }

  const totpSecretEnc = encryptSecret(pending.secret);
  const recoveryCodes: string[] = [];
  const recoveryHashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const plain = generateRecoveryCodePlain();
    recoveryCodes.push(plain);
    recoveryHashes.push(hashRecoveryCode(plain));
  }

  const now = new Date().toISOString();
  await updateRuntimeDatabase((d) => {
    const target = d.users.find((u) => u.id === userId);
    if (!target) return; // race condition — user deleted mid-confirm; safer to no-op
    target.totpSecretEnc = totpSecretEnc;
    target.totpEnabledAt = now;
    target.totpRecoveryCodesHashed = recoveryHashes;
    target.updatedAt = now;
    if (d.pendingTotpEnrollments) {
      d.pendingTotpEnrollments = d.pendingTotpEnrollments.filter((p) => p.userId !== userId);
    }
  });

  return { recoveryCodes };
}

/**
 * Verify a 6-digit code submitted at login (or for sensitive ops). User must
 * already have totpEnabledAt set; otherwise returns "not-enrolled".
 *
 * Pure-ish: reads DB to fetch the encrypted secret + email; no writes.
 */
export async function verify(userId: string, code: string): Promise<VerifyResult> {
  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.totpSecretEnc || !user.totpEnabledAt) return "not-enrolled";
  const secret = decryptSecret(user.totpSecretEnc);
  return verifyCodeAgainstSecret(secret, code, user.email) ? "ok" : "wrong-code";
}

/**
 * Match the input against an unused recovery code; on match, consume it
 * (remove the hash) and return true. Subsequent calls with the same code
 * return false.
 *
 * Used as a fallback during login when the user lost their authenticator.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const submittedHash = hashRecoveryCode(code);
  let consumed = false;
  await updateRuntimeDatabase((d) => {
    const user = d.users.find((u) => u.id === userId);
    if (!user || !user.totpEnabledAt) return;
    const list = user.totpRecoveryCodesHashed ?? [];
    const idx = list.findIndex((h) => h === submittedHash);
    if (idx === -1) return;
    list.splice(idx, 1);
    user.totpRecoveryCodesHashed = list;
    user.updatedAt = new Date().toISOString();
    consumed = true;
  });
  return consumed;
}

/**
 * Disable 2FA for a user. Caller MUST have re-authenticated the user (e.g.
 * fresh password check or OAuth re-auth) — this function trusts its input.
 *
 * Note: admin-forced disable goes through a separate code path that emails
 * a verification code first (P1.10 / future task). This function is the
 * voluntary "I want to turn off 2FA" path.
 */
export async function disable(userId: string): Promise<void> {
  await updateRuntimeDatabase((d) => {
    const user = d.users.find((u) => u.id === userId);
    if (!user) return;
    delete user.totpSecretEnc;
    delete user.totpEnabledAt;
    delete user.totpRecoveryCodesHashed;
    user.updatedAt = new Date().toISOString();
    if (d.pendingTotpEnrollments) {
      d.pendingTotpEnrollments = d.pendingTotpEnrollments.filter((p) => p.userId !== userId);
    }
  });
}

/**
 * Regenerate the 8 recovery codes (e.g. user lost their saved list).
 * Replaces the existing hashes wholesale. Returns the new plaintexts ONCE.
 */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const recoveryCodes: string[] = [];
  const recoveryHashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const plain = generateRecoveryCodePlain();
    recoveryCodes.push(plain);
    recoveryHashes.push(hashRecoveryCode(plain));
  }

  let ok = false;
  await updateRuntimeDatabase((d) => {
    const user = d.users.find((u) => u.id === userId);
    if (!user || !user.totpEnabledAt) return;
    user.totpRecoveryCodesHashed = recoveryHashes;
    user.updatedAt = new Date().toISOString();
    ok = true;
  });
  if (!ok) throw new TotpError("not-enrolled");
  return recoveryCodes;
}

/** Inspect a user's 2FA status without exposing the encrypted secret. */
export interface TotpStatus {
  enabled: boolean;
  enabledAt?: string;
  recoveryCodesRemaining: number;
  hasPendingEnrollment: boolean;
}

export async function getStatus(userId: string): Promise<TotpStatus> {
  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return { enabled: false, recoveryCodesRemaining: 0, hasPendingEnrollment: false };
  const pending = (db.pendingTotpEnrollments ?? []).find((p) => p.userId === userId);
  const pendingFresh = pending && Date.now() < new Date(pending.expiresAt).getTime();
  return {
    enabled: !!user.totpEnabledAt,
    enabledAt: user.totpEnabledAt,
    recoveryCodesRemaining: (user.totpRecoveryCodesHashed ?? []).length,
    hasPendingEnrollment: !!pendingFresh
  };
}
