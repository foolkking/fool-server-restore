/**
 * auth/index.ts — public surface for the auth module.
 *
 * Existing callers `import { ... } from "./auth.js"` continue to work because
 * the legacy auth.ts file at the parent level re-exports from here.
 *
 * Future spec phases add to this barrel file:
 *   - P1.5 email verification codes (auth/email-codes.ts)
 *   - P1.6 OAuth state HMAC (auth/oauth/state.ts)
 *   - P1.7 GitHub OAuth provider (auth/oauth/github.ts)
 *   - P1.8 identity link/unlink (auth/identity.ts)
 *   - P1.9 TOTP enrollment + verification (auth/totp.ts)
 *   - P1.10 2FA-pending session middleware (auth/middleware.ts)
 *   - P1.12 password reset (auth/password-reset.ts)
 */
export { registerUser, startRegistration, verifyRegistration, loginUser } from "./local.js";
export type { AuthResult, StartRegistrationResult, LoginResult } from "./local.js";

export { login2FA, cleanupExpiredIntermediateSessions, Login2FAError } from "./login-2fa.js";
export type { Login2FAResult, Login2FAFailReason } from "./login-2fa.js";

export { issueVerificationCode, verifyCode, cleanupExpiredCodes, findPendingCodeId } from "./email-codes.js";
export type { IssuedCode, VerifyResult } from "./email-codes.js";

export { createState, verifyState, _resetOAuthStateForTests } from "./oauth/state.js";
export type { StatePayload, CreateStateInput, VerifyResult as OAuthStateVerifyResult } from "./oauth/state.js";

export { getAuthorizeUrl, exchangeCodeForToken, fetchProfile, DEFAULT_SCOPES } from "./oauth/github.js";
export type { GitHubProfile } from "./oauth/github.js";

export { getAuthorizeUrl as getGoogleAuthorizeUrl, exchangeCodeForToken as exchangeGoogleCode, fetchProfile as fetchGoogleProfile } from "./oauth/google.js";
export type { GoogleProfile } from "./oauth/google.js";

export {
  findOrCreateFromOAuth,
  linkIdentityToUser,
  unlinkIdentity,
  listIdentities,
  EmailConflictError,
  IdentityAlreadyLinkedError,
  LastLoginMethodError
} from "./identity.js";
export type { OAuthIdentityInput, FindOrCreateResult, IdentityProvider } from "./identity.js";

export {
  getUserByToken,
  resolveSession,
  rotateSession,
  createSessionToken,
  getSessionTtlMs,
  TWOFA_PENDING_TTL_MS,
  ENROLLMENT_REQUIRED_TTL_MS
} from "./session.js";
export type { GetUserOptions, ResolvedSession } from "./session.js";

export { toPublicUser, updateUserProfile, updateMyProfile } from "./profile.js";
export type { PublicUser } from "./profile.js";

export {
  requestEmailChange,
  confirmEmailChange,
  changePassword,
  softDeleteUser,
  getNotificationPrefs,
  updateNotificationPrefs,
  getUserActivity,
  DEFAULT_NOTIFICATION_PREFS
} from "./account.js";
export type {
  RequestEmailChangeResult,
  ConfirmEmailChangeResult,
  ChangePasswordInput,
  UserActivity
} from "./account.js";

export {
  requestPasswordReset,
  confirmPasswordReset,
  cleanupExpiredResetRequests,
  signToken as signPasswordResetToken,
  verifyToken as verifyPasswordResetToken,
  PasswordResetError
} from "./password-reset.js";
export type {
  RequestResetResult,
  ConfirmResetResult,
  ConfirmResetFailReason
} from "./password-reset.js";

export {
  enroll as enrollTotp,
  confirm as confirmTotp,
  verify as verifyTotp,
  consumeRecoveryCode as consumeTotpRecoveryCode,
  disable as disableTotp,
  regenerateRecoveryCodes as regenerateTotpRecoveryCodes,
  getStatus as getTotpStatus,
  TotpError
} from "./totp.js";
export type {
  EnrollResult as TotpEnrollResult,
  ConfirmResult as TotpConfirmResult,
  VerifyResult as TotpVerifyResult,
  TotpStatus
} from "./totp.js";
