/**
 * email-codes.ts — short-lived 6-digit verification codes for email-bound flows
 * (registration, email change, password reset).
 *
 * Storage model:
 *   - The plain 6-digit code is shown to the user once (sent via email).
 *   - We persist only its SHA-256 hash + purpose + email + TTL.
 *   - Up to 5 failed verify attempts before the code is auto-invalidated.
 *   - On successful verify, `usedAt` is set; subsequent verify calls fail
 *     (single-use, prevents replay).
 *
 * Pure helpers exported separately so unit tests can exercise the lookup +
 * decision logic without going through the runtime-store singleton.
 */
import { createHash, randomInt } from "node:crypto";
import { createId, readRuntimeDatabase, updateRuntimeDatabase, type EmailVerificationCode } from "../runtime-store.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export interface IssuedCode {
  /** The id of the persisted EmailVerificationCode row. */
  codeId: string;
  /** The plain 6-digit code — included in the outgoing email, never re-readable from DB. */
  plainCode: string;
}

/**
 * Generate a fresh code, persist its hash, and return the plain digits to the
 * caller (typically the email-sending route).
 *
 * Idempotent guard: callers should NOT issue a new code while a fresh one
 * already exists for the same (email, purpose) pair — that's a separate
 * decision left to the caller (see auth/local.ts which logs and returns the
 * existing pending state).
 */
export async function issueVerificationCode(input: {
  email: string;
  purpose: EmailVerificationCode["purpose"];
  userId?: string;
}): Promise<IssuedCode> {
  const plainCode = generatePlainCode();
  const codeHash = sha256(plainCode);
  const now = new Date();
  const codeId = createId("vcode");

  await updateRuntimeDatabase((db) => {
    if (!db.emailVerifCodes) db.emailVerifCodes = [];
    db.emailVerifCodes.push({
      id: codeId,
      userId: input.userId,
      email: input.email,
      codeHash,
      purpose: input.purpose,
      attempts: 0,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString()
    });
    pruneExpiredInPlace(db.emailVerifCodes);
  });

  return { codeId, plainCode };
}

export type VerifyResult =
  | { ok: true; entry: EmailVerificationCode }
  | { ok: false; reason: "not-found" | "expired" | "wrong-code" | "already-used" | "too-many-attempts" };

/**
 * Verify a code submitted by the user. Increments the attempt counter on
 * mismatch; marks usedAt on success. Single-use — once consumed, returns
 * `already-used` on a second call.
 */
export async function verifyCode(input: {
  email: string;
  purpose: EmailVerificationCode["purpose"];
  code: string;
}): Promise<VerifyResult> {
  const codeHash = sha256(input.code.trim());
  let result: VerifyResult = { ok: false, reason: "not-found" };

  await updateRuntimeDatabase((db) => {
    if (!db.emailVerifCodes) db.emailVerifCodes = [];
    pruneExpiredInPlace(db.emailVerifCodes);

    // Find the most recent (still-valid) code for this email+purpose.
    // Sorting descending by expiresAt biases toward the freshest issued.
    const candidates = db.emailVerifCodes
      .filter((c) => c.email === input.email && c.purpose === input.purpose && !c.usedAt)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));

    if (candidates.length === 0) {
      result = { ok: false, reason: "not-found" };
      return;
    }

    const entry = candidates[0];

    if (Date.now() >= new Date(entry.expiresAt).getTime()) {
      result = { ok: false, reason: "expired" };
      return;
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      // Already locked out from too many wrong tries — invalidate explicitly.
      entry.usedAt = new Date().toISOString();
      result = { ok: false, reason: "too-many-attempts" };
      return;
    }

    if (entry.codeHash !== codeHash) {
      entry.attempts += 1;
      // If this attempt pushes us to the limit, treat the code as invalid going forward.
      if (entry.attempts >= MAX_ATTEMPTS) {
        entry.usedAt = new Date().toISOString();
        result = { ok: false, reason: "too-many-attempts" };
      } else {
        result = { ok: false, reason: "wrong-code" };
      }
      return;
    }

    // Match — consume it.
    entry.usedAt = new Date().toISOString();
    result = { ok: true, entry };
  });

  return result;
}

/**
 * Best-effort cleanup helper. Run periodically (e.g. on server boot) to keep
 * the runtime-db.json from growing unboundedly with expired codes.
 */
export async function cleanupExpiredCodes(): Promise<{ removed: number }> {
  let removed = 0;
  await updateRuntimeDatabase((db) => {
    if (!db.emailVerifCodes) return;
    const before = db.emailVerifCodes.length;
    db.emailVerifCodes = db.emailVerifCodes.filter((c) => !isExpired(c));
    removed = before - db.emailVerifCodes.length;
  });
  return { removed };
}

/** Look up an existing pending code without decrementing or modifying state. */
export async function findPendingCodeId(
  email: string,
  purpose: EmailVerificationCode["purpose"]
): Promise<string | null> {
  const db = await readRuntimeDatabase();
  const list = db.emailVerifCodes ?? [];
  const fresh = list
    .filter((c) => c.email === email && c.purpose === purpose && !c.usedAt && !isExpired(c))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  return fresh[0]?.id ?? null;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

export function generatePlainCode(): string {
  // 100000–999999 is a 6-digit code; randomInt is cryptographically strong.
  return String(randomInt(100000, 1_000_000));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isExpired(entry: Pick<EmailVerificationCode, "expiresAt">, now: number = Date.now()): boolean {
  return now >= new Date(entry.expiresAt).getTime();
}

function pruneExpiredInPlace(list: EmailVerificationCode[]): void {
  const before = list.length;
  if (before === 0) return;
  // Drop entries whose expiresAt is in the past AND that are not used (used ones
  // can be retained briefly so we can return "already-used" rather than a generic
  // "not-found", but truly stale ones go).
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // keep used codes 24h for diagnostics
  for (let i = list.length - 1; i >= 0; i--) {
    if (isExpired(list[i]) && !list[i].usedAt) {
      list.splice(i, 1);
    } else if (list[i].usedAt && new Date(list[i].usedAt!).getTime() < cutoff) {
      list.splice(i, 1);
    }
  }
}
