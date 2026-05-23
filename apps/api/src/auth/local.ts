/**
 * local.ts — local-account registration and login (email + password).
 *
 * Registration is a TWO-STEP flow (added by auth-and-ecosystem spec P1.5):
 *
 *   Step 1: `startRegistration({ name, email, password })`
 *     - Validates inputs
 *     - Confirms email is not already taken
 *     - Pre-hashes the password (so the verify step is fast)
 *     - Issues a 6-digit verification code (auth/email-codes)
 *     - Persists a PendingRegistration row keyed by codeId
 *     - Enqueues a "verify-register" email
 *     - Returns { pendingId, message } — does NOT create the user yet
 *
 *   Step 2: `verifyRegistration({ pendingId, code })`
 *     - Looks up the PendingRegistration by id
 *     - Verifies the code matches (single-use; 5 attempts max)
 *     - Creates the StoredUser (with role from admin allow-list)
 *     - Issues a session token
 *     - Cleans up the pending row
 *
 * P1.10 will hook 2FA-pending session creation into `loginUser`.
 */
import { randomBytes } from "node:crypto";
import { getConfig } from "../config.js";
import {
  createId,
  readRuntimeDatabase,
  updateRuntimeDatabase,
  type StoredUser
} from "../runtime-store.js";
import { hashPassword, verifyPassword } from "./password.js";
import { normalizeName, normalizeEmail, normalizePassword } from "./normalize.js";
import {
  createSessionToken,
  getSessionTtlMs,
  TWOFA_PENDING_TTL_MS,
  ENROLLMENT_REQUIRED_TTL_MS
} from "./session.js";
import { toPublicUser, type PublicUser } from "./profile.js";
import { issueVerificationCode, verifyCode } from "./email-codes.js";
import { enqueueEmail } from "../email/index.js";

export interface AuthResult {
  token: string;
  user: PublicUser;
}

/**
 * Result of `loginUser` (auth-and-ecosystem spec P1.10).
 *
 * Three possible outcomes after a correct password:
 *   1. Regular session — `{ token, user }` ready for full access.
 *   2. 2FA-pending — user has TOTP enabled. Caller must surface a 2FA
 *      input UI; the intermediate token can ONLY call POST /api/auth/login/2fa.
 *      Shape: `{ needs2FA: true, intermediateToken, expiresAt, user }`.
 *   3. Enrollment-required — user is admin without 2FA configured. Caller
 *      must redirect to enrollment UI; the intermediate token can ONLY call
 *      /api/me/2fa/{status,enroll,confirm}. Shape:
 *      `{ needsEnrollment: true, intermediateToken, expiresAt, user }`.
 *
 * `user` is included in all branches so the SPA can show "Hi, Alice" while
 * the user types their TOTP — no need for a separate /me lookup.
 */
export type LoginResult =
  | (AuthResult & { needs2FA?: false; needsEnrollment?: false })
  | { needs2FA: true; intermediateToken: string; expiresAt: string; user: PublicUser }
  | { needsEnrollment: true; intermediateToken: string; expiresAt: string; user: PublicUser };

export interface StartRegistrationResult {
  pendingId: string;
  message: string;
  /**
   * In dev mode (NODE_ENV !== "production") we surface the code in the API
   * response so local development without configured SMTP still works. In
   * production this is always undefined; the user must read their email.
   */
  devCode?: string;
}

/**
 * Step 1: validate inputs, send verification code.
 *
 * Throws Error on validation failure (route layer renders as 400).
 */
export async function startRegistration(input: {
  name?: string;
  email?: string;
  password?: string;
}): Promise<StartRegistrationResult> {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);

  const db = await readRuntimeDatabase();
  if (db.users.some((u) => u.email === email && !u.deletedAt)) {
    throw new Error("Email is already registered.");
  }

  // Pre-hash so verify step is just a DB write.
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);

  const issued = await issueVerificationCode({ email, purpose: "register" });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // matches code TTL
  const pendingId = createId("pendreg");

  await updateRuntimeDatabase((d) => {
    if (!d.pendingRegistrations) d.pendingRegistrations = [];
    // Drop any prior pending entries for this email — only one in flight at a time.
    d.pendingRegistrations = d.pendingRegistrations.filter((p) => p.email !== email);
    d.pendingRegistrations.push({
      id: pendingId,
      email,
      name,
      passwordHash,
      passwordSalt,
      codeId: issued.codeId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString()
    });
  });

  // Enqueue the verification email. We await the enqueue (which is fast — it
  // only persists a "pending email" row); the actual SMTP send happens
  // asynchronously via the queue's setInterval drain. Awaiting the enqueue
  // ensures any DB writes it triggers (rate-limit decision, log entry) are
  // flushed before we return — important so callers reading the DB next see
  // a consistent state.
  await enqueueEmail({
    to: email,
    templateId: "verify-register",
    context: {
      displayName: name,
      code: issued.plainCode
    }
  });

  const result: StartRegistrationResult = {
    pendingId,
    message: "A verification code has been sent. Enter it within 10 minutes to complete registration."
  };

  // Dev convenience: in non-production, return the code so curl-based testing works
  // without configured SMTP. Production deployments must rely on email.
  if (getConfig().nodeEnv !== "production") {
    result.devCode = issued.plainCode;
  }

  return result;
}

/**
 * Step 2: verify the code and create the user account.
 *
 * Throws Error on any failure (route layer maps to 400/410 etc.). On success,
 * returns the same shape as the legacy single-step register path.
 */
export async function verifyRegistration(input: {
  pendingId?: string;
  code?: string;
}): Promise<AuthResult> {
  const pendingId = input.pendingId?.trim();
  const code = input.code?.trim();
  if (!pendingId) throw new Error("pendingId is required.");
  if (!code || !/^\d{6}$/.test(code)) throw new Error("Verification code must be 6 digits.");

  const db = await readRuntimeDatabase();
  const pending = (db.pendingRegistrations ?? []).find((p) => p.id === pendingId);
  if (!pending) {
    throw new Error("Registration request not found or already completed.");
  }
  if (Date.now() >= new Date(pending.expiresAt).getTime()) {
    throw new Error("Verification code has expired. Please start registration again.");
  }
  // Belt-and-braces: re-check email uniqueness in case someone else completed registration meanwhile.
  if (db.users.some((u) => u.email === pending.email && !u.deletedAt)) {
    throw new Error("Email is already registered.");
  }

  const verified = await verifyCode({ email: pending.email, purpose: "register", code });
  if (!verified.ok) {
    throw new Error(messageForVerifyFailure(verified.reason));
  }

  // Create the user, issue session, clean up pending row.
  const cfg = getConfig();
  const role: "user" | "admin" = cfg.adminEmails.includes(pending.email) ? "admin" : "user";
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: createId("user"),
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
    passwordSalt: pending.passwordSalt,
    defaultSshUser: "ubuntu",
    role,
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now
  };

  const token = createSessionToken();
  const sessionExpiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();

  await updateRuntimeDatabase((d) => {
    d.users.push(user);
    d.sessions.push({ token, userId: user.id, createdAt: now, expiresAt: sessionExpiresAt });
    if (d.pendingRegistrations) {
      d.pendingRegistrations = d.pendingRegistrations.filter((p) => p.id !== pendingId);
    }
  });

  return { token, user: toPublicUser(user) };
}

function messageForVerifyFailure(reason: "not-found" | "expired" | "wrong-code" | "already-used" | "too-many-attempts"): string {
  switch (reason) {
    case "wrong-code":
      return "Verification code is incorrect.";
    case "expired":
      return "Verification code has expired. Please start registration again.";
    case "too-many-attempts":
      return "Too many incorrect attempts. Please start registration again.";
    case "already-used":
      return "Verification code has already been used.";
    case "not-found":
    default:
      return "Verification code not found. Please start registration again.";
  }
}

export async function loginUser(input: { email?: string; password?: string }): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const database = await readRuntimeDatabase();
  const user = database.users.find((candidate) => candidate.email === email);
  // OAuth-only accounts (no local password) cannot use this login path. The
  // user must instead use the linked OAuth provider, or set a password first.
  if (!user || !user.passwordHash || !user.passwordSalt) {
    throw new Error("Email or password is incorrect.");
  }
  // Soft-deleted accounts are unable to log in.
  if (user.deletedAt) {
    throw new Error("Email or password is incorrect.");
  }
  if (!(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
    throw new Error("Email or password is incorrect.");
  }

  // Promote existing user on login only if their email matches the configured admin allow-list.
  // Username-based promotion has been removed — username carries no auth meaning.
  const cfg = getConfig();
  const shouldBeAdmin = cfg.adminEmails.includes(user.email);
  const needsPromotion = shouldBeAdmin && user.role !== "admin";
  if (needsPromotion) user.role = "admin";

  // 2FA branching (auth-and-ecosystem spec P1.10):
  //   - User has TOTP enabled  → 2fa-pending session (5 min)
  //   - User is admin without TOTP → enrollment-required session (15 min)
  //   - Otherwise → regular session
  const totpEnabled = !!user.totpEnabledAt;
  const needsEnrollment = user.role === "admin" && !totpEnabled;

  const now = new Date().toISOString();

  if (totpEnabled) {
    return await issueIntermediateSession(user, "twofa-pending", now, needsPromotion);
  }
  if (needsEnrollment) {
    return await issueIntermediateSession(user, "enrollment-required", now, needsPromotion);
  }

  // Standard full-access session.
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();

  await updateRuntimeDatabase((next) => {
    next.sessions = next.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
    next.sessions.push({ token, userId: user.id, createdAt: now, expiresAt });
    if (needsPromotion) {
      const target = next.users.find((u) => u.id === user.id);
      if (target) {
        target.role = "admin";
        target.updatedAt = now;
      }
    }
  });

  return { token, user: toPublicUser(user) };
}

/** Helper for the two restricted-session login branches. Keeps loginUser tidy. */
async function issueIntermediateSession(
  user: StoredUser,
  kind: "twofa-pending" | "enrollment-required",
  now: string,
  needsPromotion: boolean
): Promise<LoginResult> {
  const ttlMs = kind === "twofa-pending" ? TWOFA_PENDING_TTL_MS : ENROLLMENT_REQUIRED_TTL_MS;
  const intermediateToken = createSessionToken();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await updateRuntimeDatabase((next) => {
    next.sessions = next.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
    next.sessions.push({
      token: intermediateToken,
      userId: user.id,
      createdAt: now,
      expiresAt,
      ...(kind === "twofa-pending" ? { twofaPending: true } : { enrollmentRequired: true })
    });
    if (needsPromotion) {
      const target = next.users.find((u) => u.id === user.id);
      if (target) {
        target.role = "admin";
        target.updatedAt = now;
      }
    }
  });

  if (kind === "twofa-pending") {
    return { needs2FA: true, intermediateToken, expiresAt, user: toPublicUser(user) };
  }
  return { needsEnrollment: true, intermediateToken, expiresAt, user: toPublicUser(user) };
}

/**
 * Legacy single-step register kept as a compat shim — calls startRegistration
 * and surfaces a clear error so the old client knows to migrate to the
 * two-step flow. Will be removed after Phase 1 deploy.
 *
 * @deprecated Use startRegistration + verifyRegistration instead.
 */
export async function registerUser(input: {
  name?: string;
  email?: string;
  password?: string;
}): Promise<{ pending: true; pendingId: string; message: string; devCode?: string }> {
  const result = await startRegistration(input);
  return {
    pending: true,
    pendingId: result.pendingId,
    message: result.message,
    devCode: result.devCode
  };
}
