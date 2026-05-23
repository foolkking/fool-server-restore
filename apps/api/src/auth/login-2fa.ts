/**
 * login-2fa.ts — second-factor verification step in the login flow
 * (auth-and-ecosystem spec P1.10).
 *
 * Flow:
 *   1. User submits password → loginUser detects user.totpEnabledAt
 *      → returns { needs2FA: true, intermediateToken } (a 2fa-pending session)
 *   2. User enters their TOTP code or recovery code on /login/2fa
 *   3. Frontend POSTs { intermediateToken, code } to /api/auth/login/2fa
 *   4. This module verifies the code and rotates the session token to a
 *      regular full-access session.
 *
 * This module is also used to upgrade a 2fa-pending session created by the
 * GitHub OAuth callback (when an account has TOTP enabled).
 *
 * The "code" input may be either:
 *   - 6-digit TOTP code  (e.g. "123456")  — verified via auth/totp.verify
 *   - 16-char recovery   (e.g. "ABCD1234-EFGH5678") — verified via
 *     auth/totp.consumeRecoveryCode
 *   - we sniff which one based on the input shape.
 */
import {
  readRuntimeDatabase,
  updateRuntimeDatabase,
  type StoredSession
} from "../runtime-store.js";
import { rotateSession } from "./session.js";
import { toPublicUser, type PublicUser } from "./profile.js";
import { verify as verifyTotp, consumeRecoveryCode } from "./totp.js";

export interface Login2FAResult {
  /** Fresh full-access session token. */
  token: string;
  expiresAt: string;
  user: PublicUser;
  /**
   * Set when the user's verification consumed a recovery code instead of a
   * TOTP code. The frontend should warn them with their remaining count.
   */
  usedRecoveryCode?: boolean;
  recoveryCodesRemaining?: number;
}

export type Login2FAFailReason =
  | "session-not-found"
  | "session-expired"
  | "not-pending"
  | "wrong-code";

export class Login2FAError extends Error {
  constructor(public readonly reason: Login2FAFailReason) {
    super(reason);
    this.name = "Login2FAError";
  }
}

const TOTP_CODE_RX = /^\d{6}$/;
/** Recovery code: 16 base32 chars, optionally split with one or more hyphens. */
const RECOVERY_CODE_RX = /^[A-Z2-7]{4,}(?:-?[A-Z2-7]+)*$/i;

/**
 * Upgrade a 2fa-pending session to a regular session.
 *
 * `intermediateToken` is the value returned by `loginUser` (or the OAuth
 * callback) when it set `needs2FA: true`. `code` is the TOTP digits or the
 * recovery code the user entered.
 *
 * On success the intermediate session is destroyed and a new full-access
 * token is issued. On wrong-code we DO NOT burn the intermediate session —
 * the user can retry within the 5-minute window. (TOTP itself is the rate
 * limit: each step is 30 s; brute-forcing is impractical.)
 *
 * Throws Login2FAError on every failure branch — caller maps to HTTP code.
 */
export async function login2FA(input: {
  intermediateToken?: string;
  code?: string;
}): Promise<Login2FAResult> {
  const token = input.intermediateToken?.trim();
  const code = input.code?.trim() ?? "";
  if (!token) throw new Login2FAError("session-not-found");
  if (code.length === 0) throw new Login2FAError("wrong-code");

  const db = await readRuntimeDatabase();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) throw new Login2FAError("session-not-found");
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new Login2FAError("session-expired");
  }
  if (!session.twofaPending) throw new Login2FAError("not-pending");

  const user = db.users.find((u) => u.id === session.userId);
  if (!user) throw new Login2FAError("session-not-found");

  // Try TOTP first if shape matches; recovery otherwise.
  let usedRecoveryCode = false;
  if (TOTP_CODE_RX.test(code)) {
    const result = await verifyTotp(user.id, code);
    if (result !== "ok") throw new Login2FAError("wrong-code");
  } else if (RECOVERY_CODE_RX.test(code)) {
    const consumed = await consumeRecoveryCode(user.id, code);
    if (!consumed) throw new Login2FAError("wrong-code");
    usedRecoveryCode = true;
  } else {
    throw new Login2FAError("wrong-code");
  }

  const rotated = await rotateSession(token);
  if (!rotated) {
    // Race: session was deleted between read and write. Treat as wrong-code
    // so the client retries once; if it persists they'll re-login.
    throw new Login2FAError("session-not-found");
  }

  // Re-read to find latest recovery count after possible consumption.
  const refreshed = await readRuntimeDatabase();
  const refreshedUser = refreshed.users.find((u) => u.id === user.id) ?? user;

  const result: Login2FAResult = {
    token: rotated.token,
    expiresAt: rotated.expiresAt,
    user: toPublicUser(refreshedUser)
  };
  if (usedRecoveryCode) {
    result.usedRecoveryCode = true;
    result.recoveryCodesRemaining = (refreshedUser.totpRecoveryCodesHashed ?? []).length;
  }
  return result;
}

/**
 * Drop expired intermediate sessions. Run at boot + periodically. Keeps
 * the sessions table from growing with abandoned 2fa-pending / enrollment
 * rows.
 */
export async function cleanupExpiredIntermediateSessions(): Promise<{ removed: number }> {
  let removed = 0;
  await updateRuntimeDatabase((db) => {
    const before = db.sessions.length;
    db.sessions = db.sessions.filter((s: StoredSession) => {
      if (!s.twofaPending && !s.enrollmentRequired) return true;
      return new Date(s.expiresAt).getTime() > Date.now();
    });
    removed = before - db.sessions.length;
  });
  return { removed };
}
