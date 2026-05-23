/**
 * P1.8 — HTTP integration tests for /api/me/identities/* routes.
 *
 * Uses Fastify's `app.inject()` to exercise the full request → handler → DB
 * stack without binding to a real port. Each test:
 *   1. Creates a temp DB seeded with a user + session
 *   2. Builds a Fastify app and mounts our routes
 *   3. Issues HTTP requests with the user's bearer token
 *   4. Asserts on responses + DB state
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify from "fastify";

import { _resetStoreForTests } from "../../runtime-store.js";
import { registerRoutes } from "../../routes.js";

interface TestEnv {
  dbPath: string;
  tmpDir: string;
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
  /** A valid session token belonging to the seeded user. */
  sessionToken: string;
  userId: string;
}

async function setupApp(opts?: {
  hasLocalPassword?: boolean;
  extraIdentities?: Array<Record<string, unknown>>;
  githubConfigured?: boolean;
}): Promise<TestEnv> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envforge-routes-identities-"));
  const dbPath = path.join(tmpDir, "runtime-db.json");

  const userId = "u_test";
  const sessionToken = "test-session-token-123456";
  const seed = {
    schemaVersion: "0.4.0",
    users: [{
      id: userId,
      name: "Tester",
      email: "test@example.com",
      username: "tester",
      role: "user",
      passwordHash: opts?.hasLocalPassword === false ? undefined : "h",
      passwordSalt: opts?.hasLocalPassword === false ? undefined : "s",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }],
    identities: opts?.extraIdentities ?? [],
    sessions: [{
      token: sessionToken,
      userId,
      createdAt: "2026-05-23T00:00:00Z",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    }],
    connections: [],
    userProfiles: []
  };
  await fs.writeFile(dbPath, JSON.stringify(seed));

  process.env.FOOL_RUNTIME_DB = dbPath;
  process.env.FOOL_DATA_DIR = tmpDir;
  process.env.PUBLIC_BASE_URL = "https://envforge.test";
  delete process.env.ENVFORGE_ADMIN_EMAILS;

  if (opts?.githubConfigured !== false) {
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    process.env.GITHUB_REDIRECT_URI = "https://envforge.test/auth/github/callback";
  } else {
    process.env.GITHUB_CLIENT_ID = "";
    process.env.GITHUB_CLIENT_SECRET = "";
    process.env.GITHUB_REDIRECT_URI = "";
  }
  if (!process.env.ENVFORGE_MASTER_KEY) {
    process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  }

  _resetStoreForTests();

  // Silent logger to keep test output clean.
  const app = Fastify({ logger: false });
  await registerRoutes(app);

  return {
    dbPath,
    tmpDir,
    app,
    sessionToken,
    userId,
    cleanup: async () => {
      await app.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
}

const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

// ── GET /api/me/identities ──────────────────────────────────────────────────

test("GET /api/me/identities: requires auth", async () => {
  const env = await setupApp();
  try {
    const res = await env.app.inject({ method: "GET", url: "/api/me/identities" });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me/identities: user with passwordHash gets a virtual local entry", async () => {
  const env = await setupApp({ hasLocalPassword: true });
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/identities",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { identities: Array<{ provider: string; providerEmail?: string }> };
    assert.equal(body.identities.length, 1);
    assert.equal(body.identities[0].provider, "local");
    assert.equal(body.identities[0].providerEmail, "test@example.com");
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me/identities: returns persisted github + virtual local", async () => {
  const env = await setupApp({
    hasLocalPassword: true,
    extraIdentities: [{
      id: "i_gh",
      userId: "u_test",
      provider: "github",
      providerUserId: "999",
      providerEmail: "test@example.com",
      providerData: {
        login: "tester-gh",
        avatarUrl: "https://avatars.githubusercontent.com/u/999",
        displayName: "Tester GH"
      },
      createdAt: "2026-05-01T00:00:00Z",
      lastUsedAt: "2026-05-23T00:00:00Z"
    }]
  });
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/identities",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { identities: Array<{ provider: string; providerLogin?: string }> };
    assert.equal(body.identities.length, 2);
    // Local should come first
    assert.equal(body.identities[0].provider, "local");
    assert.equal(body.identities[1].provider, "github");
    assert.equal(body.identities[1].providerLogin, "tester-gh");
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me/identities: oauth-only user (no passwordHash) does NOT get virtual local", async () => {
  const env = await setupApp({
    hasLocalPassword: false,
    extraIdentities: [{
      id: "i_gh",
      userId: "u_test",
      provider: "github",
      providerUserId: "999",
      createdAt: "2026-05-01T00:00:00Z"
    }]
  });
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/identities",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { identities: Array<{ provider: string }> };
    assert.equal(body.identities.length, 1);
    assert.equal(body.identities[0].provider, "github");
  } finally {
    await env.cleanup();
  }
});

test("GET /api/me/identities: existing local row is NOT duplicated by virtual entry", async () => {
  const env = await setupApp({
    hasLocalPassword: true,
    extraIdentities: [{
      id: "i_local",
      userId: "u_test",
      provider: "local",
      providerUserId: "u_test",
      providerEmail: "test@example.com",
      createdAt: "2026-05-01T00:00:00Z"
    }]
  });
  try {
    const res = await env.app.inject({
      method: "GET",
      url: "/api/me/identities",
      headers: authHeader(env.sessionToken)
    });
    const body = res.json() as { identities: Array<{ provider: string }> };
    assert.equal(body.identities.length, 1, "no duplicate local entry");
    assert.equal(body.identities[0].provider, "local");
  } finally {
    await env.cleanup();
  }
});

// ── POST /api/me/identities/github/connect ──────────────────────────────────

test("POST /api/me/identities/github/connect: returns authorize URL with link state", async () => {
  const env = await setupApp({ githubConfigured: true });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/identities/github/connect",
      headers: authHeader(env.sessionToken),
      payload: {}
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { authorizeUrl: string };
    assert.match(body.authorizeUrl, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);

    // Decode the state to confirm it carries link purpose + this user's id
    const url = new URL(body.authorizeUrl);
    const state = url.searchParams.get("state")!;
    const payloadB64 = state.split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    assert.equal(payload.purpose, "link");
    assert.equal(payload.userId, env.userId);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/identities/github/connect: 503 when GitHub not configured", async () => {
  const env = await setupApp({ githubConfigured: false });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/identities/github/connect",
      headers: authHeader(env.sessionToken),
      payload: {}
    });
    assert.equal(res.statusCode, 503);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/identities/github/connect: requires auth", async () => {
  const env = await setupApp({ githubConfigured: true });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/identities/github/connect",
      payload: {}
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

test("POST /api/me/identities/github/connect: redirectTo is preserved in state", async () => {
  const env = await setupApp({ githubConfigured: true });
  try {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/me/identities/github/connect",
      headers: authHeader(env.sessionToken),
      payload: { redirectTo: "/account/identities?from=settings" }
    });
    const body = res.json() as { authorizeUrl: string };
    const state = new URL(body.authorizeUrl).searchParams.get("state")!;
    const payload = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
    assert.equal(payload.redirectTo, "/account/identities?from=settings");
  } finally {
    await env.cleanup();
  }
});

// ── DELETE /api/me/identities/:provider ────────────────────────────────────

test("DELETE /api/me/identities/github: ok when local password also exists", async () => {
  const env = await setupApp({
    hasLocalPassword: true,
    extraIdentities: [{
      id: "i_gh",
      userId: "u_test",
      provider: "github",
      providerUserId: "999",
      createdAt: "2026-05-01T00:00:00Z"
    }]
  });
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me/identities/github",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true });

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.identities.length, 0);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me/identities/github: 409 when it would leave user without any login method", async () => {
  // OAuth-only user with only github linked
  const env = await setupApp({
    hasLocalPassword: false,
    extraIdentities: [{
      id: "i_gh",
      userId: "u_test",
      provider: "github",
      providerUserId: "999",
      createdAt: "2026-05-01T00:00:00Z"
    }]
  });
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me/identities/github",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 409);

    const after = JSON.parse(await fs.readFile(env.dbPath, "utf8"));
    assert.equal(after.identities.length, 1, "identity preserved on rejection");
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me/identities/local: 400 (use password settings instead)", async () => {
  const env = await setupApp({ hasLocalPassword: true });
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me/identities/local",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string };
    assert.match(body.error, /password settings/);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me/identities/unknown: 400", async () => {
  const env = await setupApp();
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me/identities/discord",
      headers: authHeader(env.sessionToken)
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await env.cleanup();
  }
});

test("DELETE /api/me/identities/github: requires auth", async () => {
  const env = await setupApp();
  try {
    const res = await env.app.inject({
      method: "DELETE",
      url: "/api/me/identities/github"
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await env.cleanup();
  }
});

// ── GET /api/auth/providers (also added in P1.7 — covered here) ────────────

test("GET /api/auth/providers: github=true when configured", async () => {
  const env = await setupApp({ githubConfigured: true });
  try {
    const res = await env.app.inject({ method: "GET", url: "/api/auth/providers" });
    const body = res.json() as { github: boolean; google: boolean };
    assert.equal(body.github, true);
    assert.equal(body.google, false);
  } finally {
    await env.cleanup();
  }
});

test("GET /api/auth/providers: github=false when not configured", async () => {
  const env = await setupApp({ githubConfigured: false });
  try {
    const res = await env.app.inject({ method: "GET", url: "/api/auth/providers" });
    const body = res.json() as { github: boolean };
    assert.equal(body.github, false);
  } finally {
    await env.cleanup();
  }
});
