/**
 * Tests for sensitive-scan.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scanAndRedact, isPathBlacklisted } from "../../sensitive-scan.js";

test("sensitive-scan: redacts npmrc auth token", () => {
  const content = `
//registry.npmjs.org/:_authToken=npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456
registry=https://registry.npmjs.org/
`.trim();
  const { redactedContent, hits } = scanAndRedact("~/.npmrc", content);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, "npm-auth-token");
  assert.ok(redactedContent.includes("<REDACTED-NPM-TOKEN>"));
  assert.ok(!redactedContent.includes("npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456"));
  assert.ok(redactedContent.includes("registry=https://registry.npmjs.org/"));
});

test("sensitive-scan: redacts GitHub token", () => {
  const content = `export GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890`;
  const { hits, redactedContent } = scanAndRedact("~/.bashrc", content);
  assert.ok(hits.length >= 1);
  assert.ok(!redactedContent.includes("ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890"));
});

test("sensitive-scan: redacts AWS credentials", () => {
  const content = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`.trim();
  const { hits, redactedContent } = scanAndRedact("~/.aws/config", content);
  assert.ok(hits.length >= 2);
  assert.ok(!redactedContent.includes("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"));
  assert.ok(!redactedContent.includes("AKIAIOSFODNN7EXAMPLE"));
});

test("sensitive-scan: redacts JWT", () => {
  const content = `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSIsIm5hbWUiOiJBbGljZSJ9.signedhash123456`;
  const { hits, redactedContent } = scanAndRedact("~/.env", content);
  assert.ok(hits.length >= 1);
  assert.ok(!redactedContent.includes("signedhash123456"));
});

test("sensitive-scan: redacts private key block", () => {
  const content = `
some normal text
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdef
GHIJKLMNOPQRSTUVWXYZ
-----END RSA PRIVATE KEY-----
more normal text
`.trim();
  const { hits, redactedContent } = scanAndRedact("/etc/some-secret.key", content);
  assert.ok(hits.some((h) => h.rule === "private-key-block"));
  assert.ok(!redactedContent.includes("MIIEpAIBAAKCAQEA"));
  assert.ok(redactedContent.includes("REDACTED-PRIVATE-KEY"));
  assert.ok(redactedContent.includes("some normal text"));
  assert.ok(redactedContent.includes("more normal text"));
});

test("sensitive-scan: does NOT redact placeholders", () => {
  const content = `
api_key = your-api-key-here
password = changeme
token = xxxxxxx
secret = <your-secret>
`.trim();
  const { hits, redactedContent } = scanAndRedact("~/.config", content);
  // Placeholders should NOT be flagged
  assert.equal(hits.length, 0, `placeholders should be ignored, got hits: ${JSON.stringify(hits)}`);
  // Original content unchanged
  assert.ok(redactedContent.includes("changeme"));
});

test("sensitive-scan: does NOT trigger on legitimate config like 'bind 127.0.0.1'", () => {
  const content = `
bind 127.0.0.1
maxmemory 100mb
port 6379
`.trim();
  const { hits } = scanAndRedact("/etc/redis/redis.conf", content);
  assert.equal(hits.length, 0);
});

test("sensitive-scan: skips comments", () => {
  const content = `
# password = realsecretvalue123
api_key=actualtoken1234567890ABCDEFGH
`.trim();
  const { hits, redactedContent } = scanAndRedact("~/.config", content);
  // Only the non-comment line should be flagged
  assert.equal(hits.length, 1);
  assert.ok(redactedContent.includes("# password = realsecretvalue123"));
});

test("sensitive-scan: redacts generic password=value", () => {
  const content = `db_password=SuperSecret123!`;
  const { hits, redactedContent } = scanAndRedact("~/.env", content);
  assert.ok(hits.length >= 1);
  assert.ok(!redactedContent.includes("SuperSecret123!"));
});

test("isPathBlacklisted: blocks ssh private keys", () => {
  assert.equal(isPathBlacklisted("~/.ssh/id_rsa"), true);
  assert.equal(isPathBlacklisted("/root/.ssh/id_ed25519"), true);
  assert.equal(isPathBlacklisted("~/.aws/credentials"), true);
  assert.equal(isPathBlacklisted("/etc/shadow"), true);
});

test("isPathBlacklisted: allows safe paths", () => {
  assert.equal(isPathBlacklisted("~/.bashrc"), false);
  assert.equal(isPathBlacklisted("/etc/nginx/nginx.conf"), false);
  assert.equal(isPathBlacklisted("~/.ssh/config"), false); // ssh client config is OK
});
