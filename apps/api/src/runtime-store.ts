import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getConfig } from "./config.js";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  defaultSshUser?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredConnection {
  id: string;
  userId: string;
  method: "ssh-password" | "ssh-key" | "winrm" | "docker";
  label: string;
  status: "validated";
  fields: Record<string, string>;
  maskedSecrets: string[];
  realConnection: false;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeDatabase {
  schemaVersion: string;
  users: StoredUser[];
  sessions: StoredSession[];
  connections: StoredConnection[];
}

export async function readRuntimeDatabase(): Promise<RuntimeDatabase> {
  const absolutePath = getConfig().runtimeDatabasePath;
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    return normalizeRuntimeDatabase(JSON.parse(raw) as Partial<RuntimeDatabase>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const database = createRuntimeDatabase();
    await writeRuntimeDatabase(database);
    return database;
  }
}

export async function writeRuntimeDatabase(database: RuntimeDatabase): Promise<void> {
  const absolutePath = getConfig().runtimeDatabasePath;
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

export async function updateRuntimeDatabase<T>(mutate: (database: RuntimeDatabase) => T): Promise<T> {
  const database = await readRuntimeDatabase();
  const result = mutate(database);
  await writeRuntimeDatabase(database);
  return result;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function createRuntimeDatabase(): RuntimeDatabase {
  return {
    schemaVersion: "0.1.0",
    users: [],
    sessions: [],
    connections: []
  };
}

function normalizeRuntimeDatabase(database: Partial<RuntimeDatabase>): RuntimeDatabase {
  return {
    schemaVersion: database.schemaVersion ?? "0.1.0",
    users: database.users ?? [],
    sessions: database.sessions ?? [],
    connections: database.connections ?? []
  };
}
