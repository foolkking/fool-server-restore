/**
 * account.ts — account-management operations beyond the basic profile patch
 * (auth-and-ecosystem spec P1.11).
 *
 * Three flows live here:
 *
 *   1. Email change (two-step: request → confirm)
 *      - request: validate new email, issue OTP to NEW address, persist
 *        PendingEmailChange row. Old email also receives a "your email is
 *        about to change" notice so the user can react if their session was
 *        hijacked.
 *      - confirm: verify code, update user.email, set emailVerifiedAt,
 *        delete pending row.
 *
 *   2. Password change
 *      - For users WITH a local password: must submit oldPassword + newPassword.
 *        Verify old, hash new, write. Existing sessions are NOT invalidated
 *        (parallel logins on phone/desktop should keep working); rotation is
 *        a separate explicit "log out everywhere" feature.
 *      - For OAuth-only accounts (no passwordHash): treated as "set initial
 *        password". Caller must have re-authenticated some other way (TOTP)
 *        before calling this; the route layer enforces.
 *
 *   3. Soft-delete (D-3.2 in design.md)
 *      - Sets user.deletedAt to now. Login is rejected (see auth/local.ts).
 *      - All sessions for the user are revoked.
 *      - Their content (comments, suggestions, drafts) is preserved with
 *        author shown as "[deleted]" — preserves discussion context.
 *      - Re-registration with the same email is BLOCKED for 30 days
 *        (prevents impersonation). After 30 days admin can hard-delete.
 *
 * The notification preferences helper also lives here for symmetry; routes
 * call `getNotificationPrefs(userId)` / `updateNotificationPrefs(userId, patch)`.
 */
import { randomBytes } from "node:crypto";
import {
  createId,
  readRuntimeDatabase,
  updateRuntimeDatabase,
  type NotificationPreference,
  type PendingEmailChange,
  type StoredUser
} from "../runtime-store.js";
import { hashPassword, verifyPassword } from "./password.js";
import { normalizeEmail, normalizePassword } from "./normalize.js";
import { issueVerificationCode, verifyCode } from "./email-codes.js";
import { enqueueEmail } from "../email/index.js";
import { getConfig } from "../config.js";

// ── Email change ───────────────────────────────────────────────────────────

export interface RequestEmailChangeResult {
  pendingId: string;
  message: string;
  /** Surfaced only in non-production for testing without configured SMTP. */
  devCode?: string;
}

/**
 * Step 1: validate new email, send code to it, persist pending row.
 *
 * Throws Error on validation failure. The route layer maps to 400.
 */
export async function requestEmailChange(
  userId: string,
  newEmailRaw: string
): Promise<RequestEmailChangeResult> {
  const newEmail = normalizeEmail(newEmailRaw);

  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found.");

  if (newEmail === user.email) {
    throw new Error("New email matches your current email.");
  }
  // Don't let users pick an email already taken by someone else.
  if (db.users.some((u) => u.id !== userId && u.email === newEmail && !u.deletedAt)) {
    throw new Error("That email is already in use.");
  }

  const issued = await issueVerificationCode({
    email: newEmail,
    purpose: "email-change",
    userId
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const pendingId = createId("pendechg");

  await updateRuntimeDatabase((d) => {
    if (!d.pendingEmailChanges) d.pendingEmailChanges = [];
    d.pendingEmailChanges = d.pendingEmailChanges.filter((p) => p.userId !== userId);
    d.pendingEmailChanges.push({
      id: pendingId,
      userId,
      oldEmail: user.email,
      newEmail,
      codeId: issued.codeId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString()
    });
  });

  // Email the verification code to the NEW address.
  await enqueueEmail({
    to: newEmail,
    userId,
    templateId: "verify-email-change",
    context: {
      displayName: user.displayName ?? user.name,
      newEmail,
      code: issued.plainCode
    }
  });

  // Best-effort: notify the OLD address with the dedicated change-notice
  // template. Failure here MUST NOT block the flow.
  try {
    await enqueueEmail({
      to: user.email,
      userId,
      templateId: "email-change-notice",
      context: {
        displayName: user.displayName ?? user.name,
        oldEmail: user.email,
        newEmail
      }
    });
  } catch {
    // ignore — the new-email side is the security-critical path
  }

  const result: RequestEmailChangeResult = {
    pendingId,
    message: "A verification code has been sent to the new address. Enter it within 10 minutes to complete the change."
  };
  if (getConfig().nodeEnv !== "production") {
    result.devCode = issued.plainCode;
  }
  return result;
}

export interface ConfirmEmailChangeResult {
  email: string;
  emailVerifiedAt: string;
}

/**
 * Step 2: verify the code, write the new email onto the user.
 *
 * Throws Error on failure (route layer maps to 400/410).
 */
export async function confirmEmailChange(input: {
  userId: string;
  pendingId: string;
  code: string;
}): Promise<ConfirmEmailChangeResult> {
  const { userId, pendingId, code } = input;
  if (!pendingId) throw new Error("pendingId is required.");
  if (!code || !/^\d{6}$/.test(code.trim())) {
    throw new Error("Verification code must be 6 digits.");
  }

  const db = await readRuntimeDatabase();
  const pending = (db.pendingEmailChanges ?? []).find((p) => p.id === pendingId);
  if (!pending || pending.userId !== userId) {
    throw new Error("Email-change request not found or already completed.");
  }
  if (Date.now() >= new Date(pending.expiresAt).getTime()) {
    throw new Error("Verification code has expired. Please start the change again.");
  }
  // Belt-and-braces: another user might have grabbed the new email meanwhile.
  if (db.users.some((u) => u.id !== userId && u.email === pending.newEmail && !u.deletedAt)) {
    throw new Error("That email is already in use.");
  }

  const verified = await verifyCode({
    email: pending.newEmail,
    purpose: "email-change",
    code: code.trim()
  });
  if (!verified.ok) {
    throw new Error(verifyCodeFailureMessage(verified.reason));
  }

  const now = new Date().toISOString();
  await updateRuntimeDatabase((d) => {
    const target = d.users.find((u) => u.id === userId);
    if (target) {
      target.email = pending.newEmail;
      target.emailVerifiedAt = now;
      target.updatedAt = now;
    }
    if (d.pendingEmailChanges) {
      d.pendingEmailChanges = d.pendingEmailChanges.filter((p) => p.id !== pendingId);
    }
  });

  return { email: pending.newEmail, emailVerifiedAt: now };
}

function verifyCodeFailureMessage(
  reason: "not-found" | "expired" | "wrong-code" | "already-used" | "too-many-attempts"
): string {
  switch (reason) {
    case "wrong-code":
      return "Verification code is incorrect.";
    case "expired":
      return "Verification code has expired. Please start the change again.";
    case "too-many-attempts":
      return "Too many incorrect attempts. Please start the change again.";
    case "already-used":
      return "Verification code has already been used.";
    case "not-found":
    default:
      return "Verification code not found. Please start the change again.";
  }
}

// ── Password change ────────────────────────────────────────────────────────

export interface ChangePasswordInput {
  userId: string;
  oldPassword?: string;
  newPassword: string;
  /** When true, treat as "set initial password" — no oldPassword required. */
  isInitialSet?: boolean;
}

/**
 * Change a user's password. For users with an existing password, oldPassword
 * is REQUIRED and verified. For OAuth-only accounts setting their first
 * password, isInitialSet=true bypasses the old-password check (route layer
 * MUST have re-authenticated by some other means — e.g. TOTP or fresh OAuth).
 *
 * Throws Error on validation / wrong-password (route → 400/401).
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const newPassword = normalizePassword(input.newPassword);

  const db = await readRuntimeDatabase();
  const user = db.users.find((u) => u.id === input.userId);
  if (!user) throw new Error("User not found.");

  if (input.isInitialSet) {
    if (user.passwordHash) {
      throw new Error("Password is already set; supply oldPassword to change it.");
    }
  } else {
    if (!user.passwordHash || !user.passwordSalt) {
      throw new Error("This account has no local password. Set one via the initial-password flow.");
    }
    const oldPlain = input.oldPassword ?? "";
    if (!(await verifyPassword(oldPlain, user.passwordSalt, user.passwordHash))) {
      throw new Error("Current password is incorrect.");
    }
    // Block trivial "old == new" change.
    if (oldPlain === newPassword) {
      throw new Error("New password must differ from the old one.");
    }
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(newPassword, passwordSalt);
  const now = new Date().toISOString();

  await updateRuntimeDatabase((d) => {
    const target = d.users.find((u) => u.id === input.userId);
    if (!target) return;
    target.passwordHash = passwordHash;
    target.passwordSalt = passwordSalt;
    target.updatedAt = now;
  });
}

// ── Soft-delete ────────────────────────────────────────────────────────────

/**
 * Soft-delete a user account (D-3.2).
 *
 * - Sets `deletedAt` to now → login rejected by auth/local.ts
 * - Revokes ALL sessions for this user
 * - Clears 2FA enrollment state (so an admin can hard-recover later if needed)
 * - User-authored content (comments, drafts, etc.) stays — author display
 *   becomes "[deleted]" in the UI
 *
 * Returns the same user (now with deletedAt set) for the route to confirm.
 */
export async function softDeleteUser(userId: string): Promise<StoredUser | undefined> {
  const now = new Date().toISOString();
  let result: StoredUser | undefined;

  await updateRuntimeDatabase((d) => {
    const target = d.users.find((u) => u.id === userId);
    if (!target) return;

    target.deletedAt = now;
    target.updatedAt = now;
    // Defensive: clear sensitive state so a leaked DB snapshot can't reactivate.
    delete target.totpSecretEnc;
    delete target.totpEnabledAt;
    delete target.totpRecoveryCodesHashed;

    // Drop all sessions belonging to this user.
    d.sessions = d.sessions.filter((s) => s.userId !== userId);
    // Drop pending TOTP enrollments + email changes too.
    if (d.pendingTotpEnrollments) {
      d.pendingTotpEnrollments = d.pendingTotpEnrollments.filter((p) => p.userId !== userId);
    }
    if (d.pendingEmailChanges) {
      d.pendingEmailChanges = d.pendingEmailChanges.filter((p) => p.userId !== userId);
    }

    result = target;
  });

  return result;
}

// ── Notification preferences ──────────────────────────────────────────────

export const DEFAULT_NOTIFICATION_PREFS = {
  emailMentions: true,
  emailComments: false,
  emailSuggestionStatus: true,
  emailPublishStatus: true
} as const;

/**
 * Read a user's notification preferences. Returns defaults if no row exists
 * yet (P3.1 will write a migration that backfills, but until then we surface
 * sensible defaults so the UI works).
 */
export async function getNotificationPrefs(userId: string): Promise<NotificationPreference> {
  const db = await readRuntimeDatabase();
  const existing = (db.notificationPrefs ?? []).find((p) => p.userId === userId);
  if (existing) return existing;
  return {
    userId,
    ...DEFAULT_NOTIFICATION_PREFS,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Update notification preferences. Supplied fields override stored values;
 * any missing field is left at its previous value (or default if no row).
 *
 * Returns the resulting full preference row.
 */
export async function updateNotificationPrefs(
  userId: string,
  patch: Partial<Omit<NotificationPreference, "userId" | "updatedAt">>
): Promise<NotificationPreference> {
  const updatedAt = new Date().toISOString();
  let result: NotificationPreference | undefined;

  await updateRuntimeDatabase((d) => {
    if (!d.notificationPrefs) d.notificationPrefs = [];
    const idx = d.notificationPrefs.findIndex((p) => p.userId === userId);
    const base: NotificationPreference =
      idx >= 0
        ? d.notificationPrefs[idx]
        : { userId, ...DEFAULT_NOTIFICATION_PREFS, updatedAt };

    const merged: NotificationPreference = {
      ...base,
      ...patch,
      userId,
      updatedAt
    };
    if (idx >= 0) {
      d.notificationPrefs[idx] = merged;
    } else {
      d.notificationPrefs.push(merged);
    }
    result = merged;
  });

  return result!;
}

// ── Activity summary ───────────────────────────────────────────────────────

export interface UserActivity {
  /** Connections owned by user. */
  connections: number;
  /** User-uploaded profiles. */
  uploadedProfiles: number;
  /** Saved playbooks. */
  playbooks: number;
  /** Tasks executed (succeeded + failed + cancelled). */
  tasksExecuted: number;
  /** OAuth identities currently linked (excluding virtual local). */
  identitiesLinked: number;
  /** API tokens issued. */
  apiTokens: number;
}

/**
 * Aggregate activity counters for the user's settings dashboard. Cheap —
 * just iterates the in-memory database snapshot once.
 */
export async function getUserActivity(userId: string): Promise<UserActivity> {
  const db = await readRuntimeDatabase();
  return {
    connections: db.connections.filter((c) => c.userId === userId).length,
    uploadedProfiles: db.userProfiles.filter((p) => p.userId === userId).length,
    playbooks: (db.playbooks ?? []).filter((p) => p.userId === userId).length,
    tasksExecuted: (db.tasks ?? []).filter((t) => t.userId === userId).length,
    identitiesLinked: (db.identities ?? []).filter(
      (i) => i.userId === userId && i.provider !== "local"
    ).length,
    apiTokens: (db.apiTokens ?? []).filter((t) => t.userId === userId).length
  };
}
