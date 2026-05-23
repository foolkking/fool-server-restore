/**
 * P1.7 — auth/oauth/github.ts HTTP layer tests.
 *
 * We stub `globalThis.fetch` to mock GitHub's three endpoints (token, /user,
 * /user/emails). Tests cover:
 *   - getAuthorizeUrl produces a properly-formed URL with state + scope
 *   - exchangeCodeForToken extracts access_token from JSON
 *   - exchangeCodeForToken throws on error response
 *   - fetchProfile combines /user + /user/emails to yield primary email
 *   - fetchProfile falls back to /user.email when /user/emails fails
 *   - fetchProfile returns no email when neither path has one
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  fetchProfile
} from "../../auth/oauth/github.js";

// Set GitHub config so getConfig().github has values
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
process.env.GITHUB_REDIRECT_URI = "https://envforge.test/auth/github/callback";
// Master key for state HMAC
if (!process.env.ENVFORGE_MASTER_KEY) {
  process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
}

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;
const realFetch = globalThis.fetch;

function withMockFetch<T>(handler: FetchHandler, fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    return handler(url, init);
  }) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = realFetch;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ── getAuthorizeUrl ────────────────────────────────────────────────────────

test("github: getAuthorizeUrl includes client_id, redirect_uri, scope, state", () => {
  const url = getAuthorizeUrl({ purpose: "login" });
  assert.match(url, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  const u = new URL(url);
  assert.equal(u.searchParams.get("client_id"), "test-client-id");
  assert.equal(u.searchParams.get("redirect_uri"), "https://envforge.test/auth/github/callback");
  assert.equal(u.searchParams.get("scope"), "read:user user:email");
  const state = u.searchParams.get("state");
  assert.ok(state && state.length > 0, "state present");
  assert.match(state!, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "state is HMAC token");
});

test("github: getAuthorizeUrl with link purpose embeds userId in state", () => {
  const url = getAuthorizeUrl({ purpose: "link", userId: "u_42" });
  const u = new URL(url);
  const state = u.searchParams.get("state")!;
  // Decode the payload from the state token to confirm userId is in there
  const payloadB64 = state.split(".")[0];
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  assert.equal(payload.purpose, "link");
  assert.equal(payload.userId, "u_42");
});

test("github: getAuthorizeUrl throws when client_id missing", () => {
  const saved = process.env.GITHUB_CLIENT_ID;
  process.env.GITHUB_CLIENT_ID = "";
  try {
    assert.throws(() => getAuthorizeUrl({ purpose: "login" }), /GITHUB_CLIENT_ID/);
  } finally {
    process.env.GITHUB_CLIENT_ID = saved;
  }
});

// ── exchangeCodeForToken ───────────────────────────────────────────────────

test("github: exchangeCodeForToken returns access_token from successful response", async () => {
  await withMockFetch(
    async (url) => {
      assert.equal(url, "https://github.com/login/oauth/access_token");
      return jsonResponse({ access_token: "ghp_abc123", token_type: "bearer", scope: "read:user,user:email" });
    },
    async () => {
      const token = await exchangeCodeForToken("test-code");
      assert.equal(token, "ghp_abc123");
    }
  );
});

test("github: exchangeCodeForToken throws when GitHub returns error", async () => {
  await withMockFetch(
    async () => jsonResponse({ error: "bad_verification_code", error_description: "The code expired." }),
    async () => {
      await assert.rejects(exchangeCodeForToken("bad-code"), /bad_verification_code/);
    }
  );
});

test("github: exchangeCodeForToken throws on HTTP non-OK", async () => {
  await withMockFetch(
    async () => new Response("internal error", { status: 500 }),
    async () => {
      await assert.rejects(exchangeCodeForToken("any"), /HTTP 500/);
    }
  );
});

test("github: exchangeCodeForToken throws when response has no access_token", async () => {
  await withMockFetch(
    async () => jsonResponse({}),
    async () => {
      await assert.rejects(exchangeCodeForToken("any"), /no access_token/i);
    }
  );
});

// ── fetchProfile ───────────────────────────────────────────────────────────

test("github: fetchProfile combines /user + /user/emails for primary verified email", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "https://api.github.com/user") {
        return jsonResponse({
          id: 12345,
          login: "alicedev",
          name: "Alice Smith",
          email: null,
          avatar_url: "https://avatars.githubusercontent.com/u/12345"
        });
      }
      if (url === "https://api.github.com/user/emails") {
        return jsonResponse([
          { email: "alice-secondary@example.com", primary: false, verified: true },
          { email: "alice@example.com", primary: true, verified: true },
          { email: "alice-old@example.com", primary: false, verified: false }
        ]);
      }
      throw new Error(`unexpected url ${url}`);
    },
    async () => {
      const profile = await fetchProfile("ghp_test");
      assert.equal(profile.id, "12345");
      assert.equal(profile.login, "alicedev");
      assert.equal(profile.email, "alice@example.com");
      assert.equal(profile.displayName, "Alice Smith");
      assert.equal(profile.avatarUrl, "https://avatars.githubusercontent.com/u/12345");
    }
  );
});

test("github: fetchProfile uses /user.email when present (no need for /user/emails)", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "https://api.github.com/user") {
        return jsonResponse({
          id: 67890,
          login: "bob",
          name: "Bob",
          email: "BOB@EXAMPLE.COM", // intentionally uppercase to test lowercasing
          avatar_url: "https://avatars.githubusercontent.com/u/67890"
        });
      }
      if (url === "https://api.github.com/user/emails") {
        // not strictly needed but should be tolerated
        return jsonResponse([]);
      }
      throw new Error(`unexpected url ${url}`);
    },
    async () => {
      const profile = await fetchProfile("ghp_test");
      assert.equal(profile.email, "bob@example.com", "email lowercased");
    }
  );
});

test("github: fetchProfile returns no email when /user.email is null and /user/emails has none verified", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "https://api.github.com/user") {
        return jsonResponse({ id: 99, login: "ghosted", email: null });
      }
      if (url === "https://api.github.com/user/emails") {
        return jsonResponse([
          { email: "unverified@example.com", primary: true, verified: false }
        ]);
      }
      throw new Error("unexpected");
    },
    async () => {
      const profile = await fetchProfile("ghp_test");
      assert.equal(profile.email, undefined);
      assert.equal(profile.id, "99");
      assert.equal(profile.login, "ghosted");
    }
  );
});

test("github: fetchProfile tolerates /user/emails 404 (insufficient scope) and falls back to /user.email", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "https://api.github.com/user") {
        return jsonResponse({ id: 100, login: "scopeless", email: "scope@example.com" });
      }
      if (url === "https://api.github.com/user/emails") {
        return new Response("forbidden", { status: 403 });
      }
      throw new Error("unexpected");
    },
    async () => {
      const profile = await fetchProfile("ghp_test");
      assert.equal(profile.email, "scope@example.com");
    }
  );
});

test("github: fetchProfile throws on /user HTTP failure", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "https://api.github.com/user") {
        return new Response("rate-limited", { status: 429 });
      }
      return jsonResponse([]);
    },
    async () => {
      await assert.rejects(fetchProfile("ghp_test"), /HTTP 429/);
    }
  );
});

test("github: fetchProfile drops empty/whitespace displayName to undefined", async () => {
  await withMockFetch(
    async (url) => {
      if (url === "https://api.github.com/user") {
        return jsonResponse({ id: 1, login: "x", name: "   ", email: "x@example.com" });
      }
      return jsonResponse([]);
    },
    async () => {
      const profile = await fetchProfile("any");
      assert.equal(profile.displayName, undefined);
    }
  );
});
