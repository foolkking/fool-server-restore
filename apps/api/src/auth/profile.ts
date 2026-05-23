/**
 * profile.ts — public-facing user projection + profile updates.
 *
 * `PublicUser` is the shape sent back over HTTP — never includes credentials,
 * 2FA secrets, or other sensitive fields. Extended in P1.11 with the new
 * profile fields (displayName, bio, avatarUrl, timezone, locale, etc.) and
 * the 2FA status flag the SPA needs to render the security page.
 */
import { updateRuntimeDatabase, type StoredUser } from "../runtime-store.js";
import { getUserByToken } from "./session.js";
import {
  normalizeName,
  normalizeDefaultSshUser,
  normalizeDisplayName,
  normalizeBio,
  normalizeAvatarUrl,
  normalizeTimezone,
  normalizeLocale,
  normalizeUsername
} from "./normalize.js";

export interface PublicUser {
  id: string;
  /** Legacy field — equals displayName when displayName is set, else original `name`. */
  name: string;
  email: string;
  authenticated: true;
  role: "user" | "admin";
  defaultSshUser?: string;

  // Extended profile fields (P1.11)
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  timezone?: string;
  locale?: string;
  emailVerifiedAt?: string;
  /** True if user has finished 2FA enrollment. */
  totpEnabled: boolean;
  /** Set when account is soft-deleted; UI uses to show "deleted" badge. */
  deletedAt?: string;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    // Surface displayName as `name` for backward compatibility with UI code
    // that still reads `user.name`. The original DB field is preserved
    // separately in case we need to migrate code over time.
    name: user.displayName ?? user.name,
    email: user.email,
    authenticated: true,
    role: user.role ?? "user",
    defaultSshUser: user.defaultSshUser,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    locale: user.locale,
    emailVerifiedAt: user.emailVerifiedAt,
    totpEnabled: !!user.totpEnabledAt,
    deletedAt: user.deletedAt
  };
}

/**
 * Legacy update path — pre-P1.11 callers used this for `{ name, defaultSshUser }`
 * only. Kept as a thin wrapper around the new updateMyProfile() so old tests
 * and routes continue to work.
 *
 * @deprecated Prefer `updateMyProfile` for new code; this helper does NOT
 *   accept the new profile fields.
 */
export async function updateUserProfile(
  token: string | undefined,
  input: { name?: string; defaultSshUser?: string }
): Promise<PublicUser | undefined> {
  const user = await getUserByToken(token);
  if (!user) return undefined;

  const name = normalizeName(input.name ?? user.name);
  const defaultSshUser = normalizeDefaultSshUser(input.defaultSshUser ?? user.defaultSshUser ?? "ubuntu");
  const updatedAt = new Date().toISOString();

  await updateRuntimeDatabase((database) => {
    const target = database.users.find((candidate) => candidate.id === user.id);
    if (!target) return;
    target.name = name;
    target.defaultSshUser = defaultSshUser;
    target.updatedAt = updatedAt;
  });

  return {
    ...toPublicUser({ ...user, name, defaultSshUser }),
  };
}

/**
 * Patch the authenticated user's profile.
 *
 * All fields are optional; missing fields are left alone. Pass an empty
 * string to clear an optional field (bio / avatarUrl / timezone / locale).
 * `displayName` and `username` cannot be cleared — they're required.
 *
 * Username uniqueness is enforced at write time (case-insensitive).
 */
export async function updateMyProfile(
  userId: string,
  input: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    timezone?: string;
    locale?: string;
    username?: string;
    defaultSshUser?: string;
  }
): Promise<PublicUser> {
  const updatedAt = new Date().toISOString();

  // Pre-normalize all fields BEFORE the DB write so we throw on bad input
  // without entering the mutate() callback.
  const patch: Partial<Pick<StoredUser,
    "displayName" | "bio" | "avatarUrl" | "timezone" | "locale" | "username" | "defaultSshUser" | "updatedAt"
  >> = { updatedAt };

  if (input.displayName !== undefined) {
    patch.displayName = normalizeDisplayName(input.displayName);
  }
  if (input.bio !== undefined) {
    patch.bio = normalizeBio(input.bio);
  }
  if (input.avatarUrl !== undefined) {
    patch.avatarUrl = normalizeAvatarUrl(input.avatarUrl);
  }
  if (input.timezone !== undefined) {
    patch.timezone = normalizeTimezone(input.timezone);
  }
  if (input.locale !== undefined) {
    patch.locale = normalizeLocale(input.locale);
  }
  if (input.defaultSshUser !== undefined) {
    patch.defaultSshUser = normalizeDefaultSshUser(input.defaultSshUser);
  }
  if (input.username !== undefined) {
    patch.username = normalizeUsername(input.username);
  }

  let result: StoredUser | undefined;
  await updateRuntimeDatabase((db) => {
    const target = db.users.find((u) => u.id === userId);
    if (!target) return;

    // Username uniqueness: case-insensitive match against other users.
    if (patch.username && patch.username !== target.username) {
      const taken = db.users.some(
        (u) => u.id !== userId && (u.username ?? "").toLowerCase() === patch.username!.toLowerCase()
      );
      if (taken) {
        throw new Error("Username is already taken.");
      }
    }

    Object.assign(target, patch);
    // Apply "clear" semantics for optional fields when normalizer returned undefined.
    if (input.bio !== undefined && patch.bio === undefined) delete target.bio;
    if (input.avatarUrl !== undefined && patch.avatarUrl === undefined) delete target.avatarUrl;
    if (input.timezone !== undefined && patch.timezone === undefined) delete target.timezone;
    if (input.locale !== undefined && patch.locale === undefined) delete target.locale;

    result = target;
  });

  if (!result) throw new Error("User not found.");
  return toPublicUser(result);
}
