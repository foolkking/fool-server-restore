/**
 * Migration 0004 — derive a `provider="local"` UserIdentity for every legacy user
 * with a passwordHash, and backfill profile fields (`username`, `displayName`).
 *
 * Idempotent. Safe to re-run on already-migrated databases:
 *   - Skips users that already have a local identity row.
 *   - Skips users that already have a username.
 *   - Schema version gate: returns early when schemaVersion >= 0.4.0.
 *
 * Bumps schemaVersion 0.3.0 → 0.4.0 once processing completes.
 *
 * The actual mutation logic is exposed as a pure function `applyMigration0004`
 * that takes a DB object and returns it modified, so tests can exercise it
 * without going through the runtime-store singleton.
 */

import { randomUUID } from "node:crypto";
import { updateRuntimeDatabase } from "../runtime-store.js";
import type { RuntimeDatabase, StoredUser, UserIdentity } from "../runtime-store.js";

export interface MigrationResult {
  identitiesCreated: number;
  usernamesAssigned: number;
  displayNamesAssigned: number;
  schemaVersionBumped: boolean;
}

/**
 * Generate a username from an email local-part.
 *
 * Rules:
 *   - lowercase
 *   - keep only [a-z0-9_-]; non-conforming chars become _
 *   - collapse repeated _ and trim leading/trailing _
 *   - if collisions exist in the existing user set, append `_2`, `_3`, ...
 *   - truncate to 32 chars before suffix
 *   - reject empty results (fallback to `user_<8-char-suffix>`)
 */
export function generateUniqueUsername(email: string, takenUsernames: Set<string>): string {
  const localPart = email.split("@")[0] ?? "";
  let base = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  if (!base) {
    // Email had no usable local part (e.g. "@x"); generate a random handle.
    base = `user_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  }

  if (!takenUsernames.has(base)) return base;

  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}_${i}`;
    if (!takenUsernames.has(candidate)) return candidate;
  }

  // Extreme fallback (1000+ collisions on the same base — never happens in practice)
  return `${base}_${randomUUID().replaceAll("-", "").slice(0, 6)}`;
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

/**
 * Pure function — mutates the given DB object in place and returns the result counts.
 * Tests can call this directly without going through the runtime-store singleton.
 */
export function applyMigration0004(db: RuntimeDatabase): MigrationResult {
  const result: MigrationResult = {
    identitiesCreated: 0,
    usernamesAssigned: 0,
    displayNamesAssigned: 0,
    schemaVersionBumped: false
  };

  // Version gate: if already on 0.4.0+, do nothing.
  if (compareSemver(db.schemaVersion, "0.4.0") >= 0) return result;

  // Ensure identities array exists on this in-memory copy
  if (!db.identities) db.identities = [];

  const identities = db.identities;
  const takenUsernames = new Set<string>(
    db.users.map((u) => u.username).filter((u): u is string => typeof u === "string" && u.length > 0)
  );

  // Index: which userIds already have which providers, to make idempotent skips O(1).
  const existingProviderByUser = new Map<string, Set<UserIdentity["provider"]>>();
  for (const ident of identities) {
    const set = existingProviderByUser.get(ident.userId) ?? new Set();
    set.add(ident.provider);
    existingProviderByUser.set(ident.userId, set);
  }

  for (const user of db.users) {
    backfillUser(user, takenUsernames, identities, existingProviderByUser, result);
  }

  // After processing all users, bump schemaVersion.
  db.schemaVersion = "0.4.0";
  result.schemaVersionBumped = true;

  return result;
}

/**
 * I/O wrapper used by the migration runner at server startup.
 * Reads the DB through the runtime-store singleton, applies the pure function, writes back.
 */
export async function runMigration0004MultiIdentity(): Promise<MigrationResult> {
  let result: MigrationResult = {
    identitiesCreated: 0,
    usernamesAssigned: 0,
    displayNamesAssigned: 0,
    schemaVersionBumped: false
  };
  await updateRuntimeDatabase((db) => {
    result = applyMigration0004(db);
  });
  return result;
}

function backfillUser(
  user: StoredUser,
  takenUsernames: Set<string>,
  identities: UserIdentity[],
  existingProviderByUser: Map<string, Set<UserIdentity["provider"]>>,
  result: MigrationResult
): void {
  // 1. Backfill username (idempotent — skip if already set)
  if (!user.username) {
    const u = generateUniqueUsername(user.email, takenUsernames);
    user.username = u;
    takenUsernames.add(u);
    result.usernamesAssigned += 1;
  }

  // 2. Backfill displayName (use legacy `name` if not set)
  if (!user.displayName && user.name) {
    user.displayName = user.name;
    result.displayNamesAssigned += 1;
  }

  // 3. Derive a local identity if user has a passwordHash and doesn't already have one.
  if (user.passwordHash) {
    const existing = existingProviderByUser.get(user.id);
    if (!existing?.has("local")) {
      identities.push({
        id: createId("ident"),
        userId: user.id,
        provider: "local",
        providerUserId: user.id,
        providerEmail: user.email,
        createdAt: user.createdAt
      });
      // Track for subsequent users in the same run (idempotency within batch).
      const set = existing ?? new Set<UserIdentity["provider"]>();
      set.add("local");
      existingProviderByUser.set(user.id, set);
      result.identitiesCreated += 1;
    }
  }
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b. Handles "0.3.0", "0.4.0" etc. */
function compareSemver(a: string, b: string): number {
  const parse = (s: string): number[] =>
    s.split(".").map((p) => Number.parseInt(p, 10) || 0).slice(0, 3);
  const [aa, ab = 0, ac = 0] = parse(a);
  const [ba, bb = 0, bc = 0] = parse(b);
  if (aa !== ba) return aa < ba ? -1 : 1;
  if (ab !== bb) return ab < bb ? -1 : 1;
  if (ac !== bc) return ac < bc ? -1 : 1;
  return 0;
}
