import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getConfig } from "./config.js";
import { createId, readRuntimeDatabase, updateRuntimeDatabase, type StoredUser } from "./runtime-store.js";

const scrypt = promisify(scryptCallback);

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  authenticated: true;
  role: "user" | "admin";
  defaultSshUser?: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export async function registerUser(input: { name?: string; email?: string; password?: string }): Promise<AuthResult> {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const existing = (await readRuntimeDatabase()).users.find((user) => user.email === email);
  if (existing) {
    throw new Error("Email is already registered.");
  }

  const now = new Date().toISOString();
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);
  const cfg = getConfig();
  // Admin promotion is by email allow-list only. Username has no special meaning.
  const role: "user" | "admin" = cfg.adminEmails.includes(email) ? "admin" : "user";
  const user: StoredUser = {
    id: createId("user"),
    name,
    email,
    passwordHash,
    passwordSalt,
    defaultSshUser: "ubuntu",
    role,
    createdAt: now,
    updatedAt: now
  };

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();

  await updateRuntimeDatabase((database) => {
    database.users.push(user);
    database.sessions.push({ token, userId: user.id, createdAt: now, expiresAt });
  });

  return { token, user: toPublicUser(user) };
}

export async function loginUser(input: { email?: string; password?: string }): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const database = await readRuntimeDatabase();
  const user = database.users.find((candidate) => candidate.email === email);
  if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
    throw new Error("Email or password is incorrect.");
  }

  const now = new Date().toISOString();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();

  // Promote existing user on login only if their email matches the configured admin allow-list.
  // Username-based promotion has been removed — username carries no auth meaning.
  const cfg = getConfig();
  const shouldBeAdmin = cfg.adminEmails.includes(user.email);
  const needsPromotion = shouldBeAdmin && user.role !== "admin";

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

  if (needsPromotion) user.role = "admin";

  return { token, user: toPublicUser(user) };
}

export async function getUserByToken(token?: string): Promise<StoredUser | undefined> {
  if (!token) return undefined;
  const database = await readRuntimeDatabase();

  // Path 1: API token (CI/CD integration). These start with "envf_".
  if (token.startsWith("envf_")) {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    const apiToken = (database.apiTokens ?? []).find((t) => t.tokenHash === hash);
    if (!apiToken) return undefined;
    if (apiToken.expiresAt && new Date(apiToken.expiresAt).getTime() <= Date.now()) return undefined;
    // Update last-used (best-effort, non-blocking)
    void updateRuntimeDatabase((db) => {
      const t = (db.apiTokens ?? []).find((x) => x.id === apiToken.id);
      if (t) t.lastUsedAt = new Date().toISOString();
    });
    return database.users.find((user) => user.id === apiToken.userId);
  }

  // Path 2: session token (web login)
  const session = database.sessions.find((candidate) => candidate.token === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return undefined;
  return database.users.find((user) => user.id === session.userId);
}

export async function updateUserProfile(token: string | undefined, input: { name?: string; defaultSshUser?: string }): Promise<PublicUser | undefined> {
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
    ...toPublicUser(user),
    name,
    defaultSshUser
  };
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    authenticated: true,
    role: user.role ?? "user",
    defaultSshUser: user.defaultSshUser
  };
}

function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function getSessionTtlMs(): number {
  return getConfig().sessionTtlHours * 60 * 60 * 1000;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return derived.toString("hex");
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = Buffer.from(await hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeName(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Name is required.");
  if (trimmed.length > 80) throw new Error("Name is too long.");
  return trimmed;
}

function normalizeEmail(email?: string): string {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email is required.");
  }
  return normalized;
}

function normalizePassword(password?: string): string {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  return password;
}

function normalizeDefaultSshUser(defaultSshUser: string): string {
  const trimmed = defaultSshUser.trim();
  if (!trimmed) throw new Error("Default SSH user is required.");
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$/.test(trimmed)) {
    throw new Error("Default SSH user must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens.");
  }
  return trimmed;
}
