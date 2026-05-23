/**
 * P1.6 — auth/oauth/state.ts unit tests.
 *
 * Covers the 4 security properties OAuth state must satisfy:
 *   1. Round-trip: a freshly-created state verifies and yields the same payload
 *   2. Tamper resistance: changing payload OR signature → bad-signature
 *   3. Expiry: states older than 10 min → expired
 *   4. Single-use: re-verifying a consumed token → replayed
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createState,
  verifyState,
  _resetOAuthStateForTests
} from "../../auth/oauth/state.js";

// Master key needs to be set before deriveSubKey is called. .env is loaded by
// getConfig() but oauth/state imports crypto.ts directly. Set it here to be safe.
if (!process.env.ENVFORGE_MASTER_KEY) {
  // 32 bytes base64
  process.env.ENVFORGE_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
}

test("oauth-state: round-trip preserves purpose + userId + redirectTo", () => {
  _resetOAuthStateForTests();
  const token = createState({
    purpose: "link",
    userId: "u_123",
    redirectTo: "/account/identities"
  });
  const r = verifyState(token);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.purpose, "link");
    assert.equal(r.payload.userId, "u_123");
    assert.equal(r.payload.redirectTo, "/account/identities");
    assert.ok(typeof r.payload.nonce === "string" && r.payload.nonce.length >= 8);
    assert.ok(Math.abs(Date.now() - r.payload.ts) < 1000);
  }
});

test("oauth-state: login purpose without userId is allowed", () => {
  _resetOAuthStateForTests();
  const token = createState({ purpose: "login" });
  const r = verifyState(token);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.purpose, "login");
    assert.equal(r.payload.userId, undefined);
  }
});

test("oauth-state: link purpose without userId throws at create", () => {
  _resetOAuthStateForTests();
  assert.throws(() => createState({ purpose: "link" }), /requires userId/i);
});

test("oauth-state: tampered payload → bad-signature", () => {
  _resetOAuthStateForTests();
  const token = createState({ purpose: "login" });
  const dot = token.indexOf(".");
  // Replace payload's first character (still valid base64url)
  const tampered = (token[0] === "A" ? "B" : "A") + token.slice(1);
  const r = verifyState(tampered);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad-signature");
  // Original sig stays the same → mismatch
  void dot;
});

test("oauth-state: tampered signature → bad-signature", () => {
  _resetOAuthStateForTests();
  const token = createState({ purpose: "login" });
  const dot = token.indexOf(".");
  // Flip last char of sig
  const tampered = token.slice(0, -1) + (token.slice(-1) === "A" ? "B" : "A");
  const r = verifyState(tampered);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad-signature");
  void dot;
});

test("oauth-state: malformed token (no dot) → malformed", () => {
  _resetOAuthStateForTests();
  const r = verifyState("notavalidtoken");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "malformed");
});

test("oauth-state: empty token → malformed", () => {
  _resetOAuthStateForTests();
  assert.equal(verifyState("").ok, false);
  assert.equal(verifyState(undefined as unknown as string).ok, false);
});

test("oauth-state: malformed payload base64 → malformed", () => {
  _resetOAuthStateForTests();
  // Non-base64url payload → JSON.parse will fail in verifyState
  const r = verifyState("!!!.signature");
  assert.equal(r.ok, false);
});

test("oauth-state: replay → second verify rejected", () => {
  _resetOAuthStateForTests();
  const token = createState({ purpose: "login" });

  const r1 = verifyState(token);
  assert.equal(r1.ok, true);

  const r2 = verifyState(token);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.reason, "replayed");
});

test("oauth-state: expired token (ts > 10min ago) → expired", () => {
  _resetOAuthStateForTests();
  // Build a payload with a stale `ts` and re-sign it via the public API would
  // require monkey-patching Date.now. Instead, mock-construct a token by
  // signing manually using the same code path.
  // Simpler: time-travel via dependency injection isn't available, so we
  // exercise this via Date.now stub.
  const realNow = Date.now;
  try {
    // Build the token at "11 minutes ago"
    Date.now = () => realNow() - 11 * 60 * 1000;
    const oldToken = createState({ purpose: "login" });
    Date.now = realNow;

    const r = verifyState(oldToken);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "expired");
  } finally {
    Date.now = realNow;
  }
});

test("oauth-state: token from 9.5 min ago still valid", () => {
  _resetOAuthStateForTests();
  const realNow = Date.now;
  try {
    Date.now = () => realNow() - 9.5 * 60 * 1000;
    const token = createState({ purpose: "login" });
    Date.now = realNow;

    const r = verifyState(token);
    assert.equal(r.ok, true);
  } finally {
    Date.now = realNow;
  }
});

test("oauth-state: two separate creates yield different tokens (nonce randomization)", () => {
  _resetOAuthStateForTests();
  const a = createState({ purpose: "login" });
  const b = createState({ purpose: "login" });
  assert.notEqual(a, b, "nonces should differ between issuances");
});

test("oauth-state: token is URL-cookie safe (only base64url + dot)", () => {
  _resetOAuthStateForTests();
  const token = createState({
    purpose: "link",
    userId: "u_with_special_chars",
    redirectTo: "/path?query=1&other=2"
  });
  // base64url alphabet: A-Z a-z 0-9 - _ ; one literal dot separator
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "token must be cookie/URL-safe");
});
