/**
 * Tests for the catalog vars-schema module.
 *
 * Covers:
 *   - validateSchema (well-formed and broken inputs)
 *   - validateAndNormalise (form submission validation, defaults, password gen)
 *   - evalShowWhen (tiny conditional expression evaluator)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSchema,
  validateAndNormalise,
  evalShowWhen,
  type VarsSchema
} from "../../catalog-vars-schema.js";

// ─── validateSchema ────────────────────────────────────────────────────────

test("validateSchema: accepts a minimal well-formed schema", () => {
  const schema = {
    domain: { type: "string", label: "Domain" }
  };
  validateSchema(schema, "test"); // should not throw
});

test("validateSchema: rejects non-object root", () => {
  assert.throws(() => validateSchema([], "test"), /must be a JSON object/);
  assert.throws(() => validateSchema(null, "test"), /must be a JSON object/);
  assert.throws(() => validateSchema("string", "test"), /must be a JSON object/);
});

test("validateSchema: rejects bad var names", () => {
  assert.throws(() => validateSchema({ "1invalid": { type: "string", label: "X" } }, "test"), /invalid var name/);
  assert.throws(() => validateSchema({ "with-dash": { type: "string", label: "X" } }, "test"), /invalid var name/);
  assert.throws(() => validateSchema({ "with space": { type: "string", label: "X" } }, "test"), /invalid var name/);
});

test("validateSchema: rejects unknown field type", () => {
  assert.throws(
    () => validateSchema({ x: { type: "datetime", label: "X" } }, "test"),
    /invalid type/
  );
});

test("validateSchema: requires explicit default for boolean fields", () => {
  assert.throws(
    () => validateSchema({ flag: { type: "boolean", label: "Flag" } }, "test"),
    /must have explicit "default"/
  );
  // With default → ok
  validateSchema({ flag: { type: "boolean", label: "Flag", default: true } }, "test");
});

test("validateSchema: choice field requires non-empty options", () => {
  assert.throws(
    () => validateSchema({ x: { type: "choice", label: "X", options: [] } }, "test"),
    /requires non-empty/
  );
  validateSchema({ x: { type: "choice", label: "X", options: [{ value: "a", label: "A" }] } }, "test");
});

test("validateSchema: port default must be 1-65535", () => {
  assert.throws(
    () => validateSchema({ p: { type: "port", label: "Port", default: 0 } }, "test"),
    /out of range/
  );
  assert.throws(
    () => validateSchema({ p: { type: "port", label: "Port", default: 70000 } }, "test"),
    /out of range/
  );
  validateSchema({ p: { type: "port", label: "Port", default: 8080 } }, "test");
});

test("validateSchema: catches invalid validate regex", () => {
  assert.throws(
    () => validateSchema({ x: { type: "string", label: "X", validate: "(unclosed" } }, "test"),
    /invalid validate regex/
  );
});

test("validateSchema: requires label", () => {
  assert.throws(
    () => validateSchema({ x: { type: "string" } }, "test"),
    /missing required "label"/
  );
});

// ─── validateAndNormalise ──────────────────────────────────────────────────

test("validateAndNormalise: fills in defaults for missing fields", () => {
  const schema: VarsSchema = {
    domain: { type: "string", label: "Domain", default: "example.com" },
    port: { type: "port", label: "Port", default: 80 }
  };
  const result = validateAndNormalise(schema, {});
  assert.equal(result.ok, true);
  assert.equal(result.values.domain, "example.com");
  assert.equal(result.values.port, 80);
});

test("validateAndNormalise: user values override defaults", () => {
  const schema: VarsSchema = {
    domain: { type: "string", label: "Domain", default: "example.com" }
  };
  const result = validateAndNormalise(schema, { domain: "mysite.com" });
  assert.equal(result.values.domain, "mysite.com");
});

test("validateAndNormalise: required field with no value rejected", () => {
  const schema: VarsSchema = {
    domain: { type: "string", label: "Domain", required: true }
  };
  const result = validateAndNormalise(schema, {});
  assert.equal(result.ok, false);
  assert.match(result.errors.domain ?? "", /必填/);
});

test("validateAndNormalise: validate regex rejects bad value", () => {
  const schema: VarsSchema = {
    name: { type: "string", label: "Name", validate: "^[a-z]+$" }
  };
  const bad = validateAndNormalise(schema, { name: "ABC123" });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.name ?? "", /格式/);
  const good = validateAndNormalise(schema, { name: "abc" });
  assert.equal(good.ok, true);
});

test("validateAndNormalise: number min/max enforced", () => {
  const schema: VarsSchema = {
    threads: { type: "number", label: "Threads", min: 1, max: 100 }
  };
  assert.equal(validateAndNormalise(schema, { threads: 0 }).ok, false);
  assert.equal(validateAndNormalise(schema, { threads: 101 }).ok, false);
  assert.equal(validateAndNormalise(schema, { threads: 50 }).ok, true);
});

test("validateAndNormalise: port range enforced", () => {
  const schema: VarsSchema = { p: { type: "port", label: "P" } };
  assert.equal(validateAndNormalise(schema, { p: 0 }).ok, false);
  assert.equal(validateAndNormalise(schema, { p: 70000 }).ok, false);
  assert.equal(validateAndNormalise(schema, { p: 8080 }).ok, true);
});

test("validateAndNormalise: choice rejects values not in options", () => {
  const schema: VarsSchema = {
    size: {
      type: "choice", label: "Size",
      options: [{ value: "small", label: "S" }, { value: "large", label: "L" }]
    }
  };
  assert.equal(validateAndNormalise(schema, { size: "medium" }).ok, false);
  assert.equal(validateAndNormalise(schema, { size: "small" }).ok, true);
});

test("validateAndNormalise: password auto-generates when missing", () => {
  const schema: VarsSchema = {
    pw: { type: "password", label: "Password", generate_length: 32 }
  };
  const result = validateAndNormalise(schema, {});
  assert.equal(result.ok, true);
  assert.equal(typeof result.values.pw, "string");
  assert.equal((result.values.pw as string).length, 32);
});

test("validateAndNormalise: password user value preserved", () => {
  const schema: VarsSchema = { pw: { type: "password", label: "P" } };
  const result = validateAndNormalise(schema, { pw: "my-secret" });
  assert.equal(result.values.pw, "my-secret");
});

test("validateAndNormalise: hidden field via show_when is removed from values", () => {
  const schema: VarsSchema = {
    use_proxy: { type: "boolean", label: "Use Proxy", default: false },
    proxy_url: { type: "string", label: "Proxy URL", show_when: "use_proxy == true" }
  };
  const off = validateAndNormalise(schema, { use_proxy: false });
  assert.equal(off.ok, true);
  assert.equal("proxy_url" in off.values, false, "hidden field should be removed");

  const on = validateAndNormalise(schema, { use_proxy: true, proxy_url: "http://x" });
  assert.equal(on.ok, true);
  assert.equal(on.values.proxy_url, "http://x");
});

test("validateAndNormalise: hidden required field is NOT validated", () => {
  // Regression: a hidden required field shouldn't block submission, since the
  // user can't possibly fill it.
  const schema: VarsSchema = {
    use_proxy: { type: "boolean", label: "Use Proxy", default: false },
    proxy_url: { type: "string", label: "Proxy URL", show_when: "use_proxy == true", required: true }
  };
  const result = validateAndNormalise(schema, { use_proxy: false });
  assert.equal(result.ok, true);
  assert.equal(result.errors.proxy_url, undefined);
});

// ─── evalShowWhen ──────────────────────────────────────────────────────────

test("evalShowWhen: == with various rhs types", () => {
  assert.equal(evalShowWhen("flag == true", { flag: true }), true);
  assert.equal(evalShowWhen("flag == false", { flag: false }), true);
  assert.equal(evalShowWhen("port == 80", { port: 80 }), true);
  assert.equal(evalShowWhen("port == 80", { port: "80" }), true); // loose equality
  assert.equal(evalShowWhen("mode == 'dev'", { mode: "dev" }), true);
  assert.equal(evalShowWhen('mode == "prod"', { mode: "prod" }), true);
});

test("evalShowWhen: != negates the comparison", () => {
  assert.equal(evalShowWhen("flag != true", { flag: false }), true);
  assert.equal(evalShowWhen("flag != true", { flag: true }), false);
});

test("evalShowWhen: malformed expression returns true (fail-open)", () => {
  // Malformed expressions shouldn't hide fields by accident — better to render
  // a redundant field than to silently lose a required one.
  assert.equal(evalShowWhen("nonsense", { x: 1 }), true);
  assert.equal(evalShowWhen("a && b", { a: 1, b: 1 }), true);
});

test("evalShowWhen: missing var compared to bare token", () => {
  // The mini-parser treats unquoted non-numeric/non-bool tokens as plain strings,
  // so `missing == foo` compares undefined to "foo" → false.
  assert.equal(evalShowWhen("missing == foo", {}), false);
  assert.equal(evalShowWhen("missing == 'x'", {}), false);
});
