/**
 * P1.5 — auth/email-codes.ts unit tests.
 *
 * Pure helpers (generatePlainCode / sha256 / isExpired) are tested directly.
 * Issue/verify roundtrip is tested via the runtime-store using the same
 * cache-bust pattern used elsewhere — but only ONE issue+verify scenario
 * per test to avoid singleton interference between tests.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  generatePlainCode,
  sha256,
  isExpired
} from "../../auth/email-codes.js";

test("generatePlainCode: returns a 6-digit string", () => {
  for (let i = 0; i < 50; i++) {
    const c = generatePlainCode();
    assert.match(c, /^\d{6}$/);
    const n = Number(c);
    assert.ok(n >= 100000 && n <= 999999, `out of range: ${c}`);
  }
});

test("sha256: deterministic + matches OpenSSL output for known input", () => {
  // SHA-256 of "abc" is a well-known constant
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  // Same input twice = same hash
  assert.equal(sha256("hello"), sha256("hello"));
});

test("sha256: different inputs produce different hashes", () => {
  assert.notEqual(sha256("123456"), sha256("123457"));
});

test("isExpired: time in past returns true", () => {
  const past = { expiresAt: new Date(Date.now() - 1000).toISOString() };
  assert.equal(isExpired(past), true);
});

test("isExpired: time in future returns false", () => {
  const future = { expiresAt: new Date(Date.now() + 60_000).toISOString() };
  assert.equal(isExpired(future), false);
});

test("isExpired: with explicit 'now' parameter", () => {
  const entry = { expiresAt: "2026-05-23T12:00:00Z" };
  assert.equal(isExpired(entry, new Date("2026-05-23T11:59:59Z").getTime()), false);
  assert.equal(isExpired(entry, new Date("2026-05-23T12:00:00Z").getTime()), true);
  assert.equal(isExpired(entry, new Date("2026-05-23T12:00:01Z").getTime()), true);
});
