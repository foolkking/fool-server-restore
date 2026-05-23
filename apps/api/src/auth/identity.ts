/**
 * auth/identity.ts — UserIdentity CRUD + the `findOrCreateFromOAuth` function
 * that's the heart of every OAuth callback.
 *
 * Three flows in one place:
 *
 *   1. Existing identity → return its user
 *      (most common: returning user signs in via GitHub again)
 *
 *   2. New OAuth identity, OAuth email matches an existing local account
 *      → REJECT with `EmailConflict`
 *      (per spec D-1.1: don't auto-merge; user must first sign in with their
 *       local password and explicitly link the OAuth provider from settings —
 *       this prevents OAuth account takeover via email squatting)
 *
 *   3. Brand-new identity, brand-new email
 *      → create a new User + Identity row, return it
 *
 * Linking flow (existing user adding a new provider) does NOT go through
 * findOrCreateFromOAuth — it goes through `linkIdentityToUser` instead, which
 * is called from the callback when state.purpose === "link".
 */
import { createId, readRuntimeDatabase, updateRuntimeDatabase } from "../runtime-store.js";
import type { StoredUser, UserIdentity } from "../runtime-store.js";
import { generateUniqueUsername } from "../migrations/0004-multi-identity.js";
import { getConfig } from "../config.js";

export type IdentityProvider = "local" | "github" | "google";

/**
 * Error thrown when an OAuth login would clash with an existing local account
 * by email. The route layer catches this and renders a "please log in with
 * password and link from settings" hint page.
 */
export class EmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(`Email ${email} is already registered with a different login method.`);
    this.name = "EmailConflictError";
  }
}

export interface OAuthIdentityInput {
  provider: Exclude<IdentityProvider, "local">;
  /** Provider-immutable id (GitHub numeric / Google `sub`). */
  providerUserId: string;
  /** Verified email from the provider (lowercase). May be undefined. */
  email?: string;
  /** Snapshot of provider-supplied profile fields. */
  profile?: {
    avatarUrl?: string;
    displayName?: string;
    login?: string;
  };
}

export interface FindOrCreateResult {
  user: StoredUser;
  identity: UserIdentity;
  /** True when this call created a brand-new user (vs returning an existing one). */
  created: boolean;
}

/**
 * Look up the identity by (provider, providerUserId). If found, return its
 * user. If not, check for an email collision against any local user — if
 * matched, throw `EmailConflictError`. Otherwise create a brand-new user
 * + identity.
 */
export async function findOrCreateFromOAuth(input: OAuthIdentityInput): Promise<FindOrCreateResult> {
  // Step 1: identity lookup
  const existingIdent = await findIdentity(input.provider, input.providerUserId);
  if (existingIdent) {
    const db = await readRuntimeDatabase();
    const user = db.users.find((u) => u.id === existingIdent.userId && !u.deletedAt);
    if (!user) {
      // Stale identity row pointing at a deleted user — treat as missing.
      // Fall through to creation path below.
    } else {
      // Refresh profile snapshot + lastUsedAt
      await updateRuntimeDatabase((d) => {
        const ident = (d.identities ?? []).find((i) => i.id === existingIdent.id);
        if (ident) {
          ident.lastUsedAt = new Date().toISOString();
          if (input.profile) ident.providerData = { ...ident.providerData, ...input.profile };
          if (input.email) ident.providerEmail = input.email;
        }
      });
      return { user, identity: existingIdent, created: false };
    }
  }

  // Step 2: email collision check (only when we have an email to check against)
  if (input.email) {
    const db = await readRuntimeDatabase();
    const conflict = db.users.find((u) => u.email === input.email && !u.deletedAt);
    if (conflict) {
      throw new EmailConflictError(input.email);
    }
  }

  // Step 3: brand-new — create user + identity
  return await createUserFromOAuth(input);
}

/**
 * Link an OAuth identity to an EXISTING user (already authenticated). Used
 * when a logged-in user clicks "Connect GitHub" in account settings.
 *
 * Failure modes:
 *   - Identity already exists for a DIFFERENT user → `IdentityAlreadyLinkedError`
 *   - Identity already exists for THIS user → no-op (idempotent), refreshes data
 */
export class IdentityAlreadyLinkedError extends Error {
  constructor(public readonly provider: IdentityProvider) {
    super(`This ${provider} account is already linked to a different EnvForge user.`);
    this.name = "IdentityAlreadyLinkedError";
  }
}

export async function linkIdentityToUser(
  userId: string,
  input: OAuthIdentityInput
): Promise<UserIdentity> {
  const existing = await findIdentity(input.provider, input.providerUserId);
  if (existing) {
    if (existing.userId === userId) {
      // Already linked to this user — refresh profile, no-op otherwise
      await updateRuntimeDatabase((d) => {
        const ident = (d.identities ?? []).find((i) => i.id === existing.id);
        if (ident) {
          ident.lastUsedAt = new Date().toISOString();
          if (input.profile) ident.providerData = { ...ident.providerData, ...input.profile };
          if (input.email) ident.providerEmail = input.email;
        }
      });
      return existing;
    }
    // Linked to a different user — reject.
    throw new IdentityAlreadyLinkedError(input.provider);
  }

  // Create new identity row pointing at the existing user
  const now = new Date().toISOString();
  const newIdent: UserIdentity = {
    id: createId("ident"),
    userId,
    provider: input.provider,
    providerUserId: input.providerUserId,
    providerEmail: input.email,
    providerData: input.profile,
    createdAt: now,
    lastUsedAt: now
  };
  await updateRuntimeDatabase((d) => {
    if (!d.identities) d.identities = [];
    d.identities.push(newIdent);
  });
  return newIdent;
}

/**
 * Disconnect (unlink) an identity from a user. Refuses to remove the LAST
 * available login method — the user would lock themselves out. The caller
 * should surface that as a user-facing error.
 */
export class LastLoginMethodError extends Error {
  constructor() {
    super("Cannot remove the last login method. Set a password or link another provider first.");
    this.name = "LastLoginMethodError";
  }
}

export async function unlinkIdentity(userId: string, provider: IdentityProvider): Promise<void> {
  await updateRuntimeDatabase((d) => {
    const user = d.users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found.");

    const identities = d.identities ?? [];
    const userIdents = identities.filter((i) => i.userId === userId);
    const target = userIdents.find((i) => i.provider === provider);
    if (!target) {
      // Nothing to do — already unlinked
      return;
    }

    // Count remaining login methods if we remove this one:
    //   - other identities (any other OAuth provider OR a separate "local" entry)
    //   - the user's own passwordHash (counts as a login method)
    const remaining = userIdents.filter((i) => i.id !== target.id).length;
    const hasLocalPassword = !!user.passwordHash;
    const remainingLoginMethods = remaining + (hasLocalPassword && provider !== "local" ? 1 : 0);

    if (remainingLoginMethods === 0) {
      throw new LastLoginMethodError();
    }

    d.identities = identities.filter((i) => i.id !== target.id);
  });
}

/** Return all identities attached to a user. */
export async function listIdentities(userId: string): Promise<UserIdentity[]> {
  const db = await readRuntimeDatabase();
  return (db.identities ?? []).filter((i) => i.userId === userId);
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function findIdentity(provider: IdentityProvider, providerUserId: string): Promise<UserIdentity | undefined> {
  const db = await readRuntimeDatabase();
  return (db.identities ?? []).find(
    (i) => i.provider === provider && i.providerUserId === providerUserId
  );
}

/**
 * Create a brand-new user from OAuth profile data.
 *
 * Username: derived from login (preferred) or email local-part. Collisions
 * resolve via the same `_2/_3/...` suffix the migration uses.
 *
 * Role: admin if the email is in the configured admin allow-list.
 *
 * The user has NO local password — they're an "OAuth-only" account. They
 * can log in via the linked provider, or set a password later from settings.
 */
async function createUserFromOAuth(input: OAuthIdentityInput): Promise<FindOrCreateResult> {
  const cfg = getConfig();
  const now = new Date().toISOString();

  // Generate the user record outside the update closure so we can use the
  // username generator with the current set of taken usernames.
  let result!: FindOrCreateResult;

  await updateRuntimeDatabase((d) => {
    const taken = new Set<string>(
      d.users.map((u) => u.username).filter((u): u is string => typeof u === "string" && u.length > 0)
    );
    const usernameSeed = input.profile?.login || (input.email ? input.email.split("@")[0] : `oauth-${input.provider}`);
    const username = generateUniqueUsername(`${usernameSeed}@placeholder`, taken);

    const role: "user" | "admin" =
      input.email && cfg.adminEmails.includes(input.email) ? "admin" : "user";

    const user: StoredUser = {
      id: createId("user"),
      // Required fields kept for legacy compatibility (P1.11 will revisit profile).
      // `name` mirrors displayName for now; UI uses displayName when present.
      name: input.profile?.displayName || input.profile?.login || username,
      email: input.email ?? `${username}@no-email.envforge.local`,
      username,
      displayName: input.profile?.displayName || input.profile?.login || username,
      avatarUrl: validHttpsUrl(input.profile?.avatarUrl) ? input.profile?.avatarUrl : undefined,
      defaultSshUser: "ubuntu",
      role,
      // OAuth flow grants a verified email when the provider says so. We only
      // got `input.email` if it was a verified primary, so set the timestamp.
      emailVerifiedAt: input.email ? now : undefined,
      createdAt: now,
      updatedAt: now
    };

    const identity: UserIdentity = {
      id: createId("ident"),
      userId: user.id,
      provider: input.provider,
      providerUserId: input.providerUserId,
      providerEmail: input.email,
      providerData: input.profile,
      createdAt: now,
      lastUsedAt: now
    };

    d.users.push(user);
    if (!d.identities) d.identities = [];
    d.identities.push(identity);

    result = { user, identity, created: true };
  });

  return result;
}

function validHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}
