import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../template-parser.js";

test("template-parser: basic variable substitution", () => {
  const tpl = "Hello {{ name }}! Port is {{ port }}.";
  const vars = { name: "Alice", port: 8080 };
  const res = renderTemplate(tpl, vars);
  assert.equal(res, "Hello Alice! Port is 8080.");
});

test("template-parser: nested variables and defaults", () => {
  const tpl = "Host: {{ db.host | default('localhost') }}, Port: {{ db.port | default(3306) }}";
  const vars = { db: { host: "127.0.0.1" } };
  const res = renderTemplate(tpl, vars);
  assert.equal(res, "Host: 127.0.0.1, Port: 3306");
});

test("template-parser: nested conditions", () => {
  const tpl = `
{% if outer %}
  outer is true
  {% if inner %}
    inner is true
  {% endif %}
  outer end
{% endif %}
`.trim();

  const vars = { outer: true, inner: true };
  const res = renderTemplate(tpl, vars);
  assert.equal(res.replace(/\s+/g, " ").trim(), "outer is true inner is true outer end");

  const vars2 = { outer: true, inner: false };
  const res2 = renderTemplate(tpl, vars2);
  assert.equal(res2.replace(/\s+/g, " ").trim(), "outer is true outer end");
});

test("template-parser: negated conditions with not and !", () => {
  const tpl = `
{% if not active %}
  inactive
{% endif %}
{% if !enabled %}
  disabled
{% endif %}
`.trim();

  const vars = { active: false, enabled: false };
  const res = renderTemplate(tpl, vars);
  assert.equal(res.replace(/\s+/g, " ").trim(), "inactive disabled");
});

test("template-parser: nested for loops", () => {
  const tpl = `
{% for group in groups %}
  Group: {{ group.name }}
  {% for user in group.users %}
    - {{ user }}
  {% endfor %}
{% endfor %}
`.trim();

  const vars = {
    groups: [
      { name: "Admins", users: ["Alice", "Bob"] },
      { name: "Users", users: ["Charlie"] }
    ]
  };

  const res = renderTemplate(tpl, vars);
  assert.equal(
    res.replace(/\s+/g, " ").trim(),
    "Group: Admins - Alice - Bob Group: Users - Charlie"
  );
});

test("template-parser: comments are completely ignored", () => {
  const tpl = "Hello {# this is a comment #}World!";
  const res = renderTemplate(tpl, {});
  assert.equal(res, "Hello World!");
});
