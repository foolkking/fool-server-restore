/**
 * P1.4 — email/render.ts unit tests.
 *
 * Covers:
 *   - {{ var }} substitution
 *   - HTML escaping for HTML output (XSS guard)
 *   - Plain-text output is NOT escaped (newlines preserved literally)
 *   - Strict context — undefined vars throw
 *   - Subject extraction from "Subject: ..." first line of .txt template
 */
import test from "node:test";
import assert from "node:assert/strict";

import { renderString, renderTemplate } from "../../email/render.js";

test("renderString: substitutes simple {{ var }}", () => {
  const out = renderString("Hi {{ name }}!", { name: "Alice" }, false);
  assert.equal(out, "Hi Alice!");
});

test("renderString: escapes HTML when escape=true", () => {
  const out = renderString("Hi {{ name }}!", { name: "<script>alert('xss')</script>" }, true);
  assert.equal(out, "Hi &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;!");
});

test("renderString: does NOT escape when escape=false (plain text)", () => {
  // Plain text emails should preserve user input verbatim. Newlines and quotes are fine.
  const out = renderString("Code: {{ code }}\nBye.", { code: "ABC123" }, false);
  assert.equal(out, "Code: ABC123\nBye.");
});

test("renderString: throws on undefined variable (catch typos at runtime)", () => {
  assert.throws(
    () => renderString("Hi {{ missing }}!", { name: "Alice" }, false),
    /undefined variable.*missing/i
  );
});

test("renderString: number values stringified", () => {
  const out = renderString("Count: {{ n }}", { n: 42 }, false);
  assert.equal(out, "Count: 42");
});

test("renderString: same var used multiple times", () => {
  const out = renderString("{{ x }} and {{ x }}", { x: "bee" }, false);
  assert.equal(out, "bee and bee");
});

test("renderString: var name with underscores", () => {
  const out = renderString("Hi {{ display_name }}!", { display_name: "Alice" }, false);
  assert.equal(out, "Hi Alice!");
});

test("renderString: handles whitespace inside braces", () => {
  // Both `{{ name }}` and `{{name}}` should work
  const a = renderString("a {{ name }} b", { name: "X" }, false);
  const b = renderString("a {{name}} b", { name: "X" }, false);
  assert.equal(a, "a X b");
  assert.equal(b, "a X b");
});

test("renderTemplate: loads verify-register template and fills code + displayName", async () => {
  const rendered = await renderTemplate("verify-register", {
    displayName: "Alice",
    code: "123456",
    publicBaseUrl: "https://envforge.example.com"
  });

  // Subject extracted from first line
  assert.match(rendered.subject, /验证你的 EnvForge 账号/);

  // Plain text contains the literal code (not escaped)
  assert.ok(rendered.text.includes("123456"));
  assert.ok(rendered.text.includes("Alice"));

  // HTML contains the code; HTML version should escape Alice (no special chars here so identical)
  assert.ok(rendered.html.includes("123456"));
  assert.ok(rendered.html.includes("Alice"));
  assert.ok(rendered.html.includes("<!DOCTYPE html>"));
});

test("renderTemplate: HTML output escapes XSS attempts in display name", async () => {
  const rendered = await renderTemplate("verify-register", {
    displayName: "<script>alert(1)</script>",
    code: "999000",
    publicBaseUrl: "https://envforge.example.com"
  });

  // The HTML output must NOT contain a real <script> tag
  assert.ok(!rendered.html.includes("<script>alert"));
  // It SHOULD contain the escaped form
  assert.ok(rendered.html.includes("&lt;script&gt;alert"));

  // Plain text version is allowed to contain the literal (not interpreted by mail client)
  assert.ok(rendered.text.includes("<script>"));
});
