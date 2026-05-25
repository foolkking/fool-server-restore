/**
 * advanced-modules.test.ts — Tests for template, file, user, ufw modules + impact estimator
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { templateModule } from "../modules/template.js";
import { renderTemplate } from "../template-parser.js";
import { fileModule } from "../modules/file.js";
import { userModule } from "../modules/user.js";
import { ufwModule } from "../modules/ufw.js";
import { estimateImpact } from "../impact.js";
import { parsePlaybook } from "../runner.js";
import type { SshExecutor } from "../types.js";

// ── Mock executor ─────────────────────────────────────────

function mockExec(responses: Record<string, { stdout: string; stderr: string; exitCode: number }> = {}): SshExecutor {
  return {
    async exec(cmd) {
      for (const [key, res] of Object.entries(responses)) {
        if (cmd.includes(key)) return res;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async putFile() {},
    async getFile() { return ""; },
    async pathExists() { return false; }
  };
}

// ── renderTemplate ────────────────────────────────────────

describe("renderTemplate", () => {
  test("substitutes simple variables", () => {
    const result = renderTemplate("Hello {{ name }}!", { name: "World" });
    assert.equal(result, "Hello World!");
  });

  test("removes comments", () => {
    const result = renderTemplate("before {# this is a comment #} after", {});
    assert.equal(result.trim(), "before  after");
  });

  test("handles if/endif blocks", () => {
    const result = renderTemplate(
      "{% if show %}visible{% endif %}",
      { show: true }
    );
    assert.equal(result.trim(), "visible");
  });

  test("hides false if blocks", () => {
    const result = renderTemplate(
      "{% if show %}visible{% endif %}",
      { show: false }
    );
    assert.equal(result.trim(), "");
  });

  test("handles for/endfor loops", () => {
    const result = renderTemplate(
      "{% for item in items %}{{ item }}{% endfor %}",
      { items: ["a", "b", "c"] }
    );
    assert.equal(result, "abc");
  });

  test("handles nested variable access", () => {
    const result = renderTemplate("{{ user.name }}", { user: { name: "Alice" } });
    assert.equal(result, "Alice");
  });

  test("returns empty string for undefined vars", () => {
    const result = renderTemplate("{{ undefined_var }}", {});
    assert.equal(result, "");
  });
});

// ── template module ───────────────────────────────────────

describe("template module", () => {
  test("dry-run returns changed=true", async () => {
    const executor = mockExec();
    const result = await templateModule.run(executor, {
      content: "Hello {{ name }}",
      dest: "/etc/test.conf",
      vars: { name: "World" }
    }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });

  test("rejects unsafe dest path", async () => {
    const executor = mockExec();
    const result = await templateModule.run(executor, {
      content: "test",
      dest: "/etc/../../../etc/passwd"
    }, false);
    assert.equal(result.failed, true);
  });

  test("skips write when content unchanged", async () => {
    const rendered = "Hello World";
    const executor: SshExecutor = {
      async exec(cmd) {
        if (cmd.includes("echo $HOME")) return { stdout: "/home/user", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      async putFile() {},
      async getFile() { return rendered; },
      async pathExists() { return true; }
    };
    const result = await templateModule.run(executor, {
      content: "Hello {{ name }}",
      dest: "~/test.conf",
      vars: { name: "World" }
    }, false);
    assert.equal(result.changed, false);
    assert.ok(result.msg.includes("identical"));
  });
});

// ── file module ───────────────────────────────────────────

describe("file module", () => {
  test("creates directory in dry-run", async () => {
    const executor = mockExec({ "echo $HOME": { stdout: "/home/user", stderr: "", exitCode: 0 } });
    const result = await fileModule.run(executor, { path: "/tmp/testdir", state: "directory" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });

  test("returns changed=false when directory already exists", async () => {
    const executor: SshExecutor = {
      async exec(cmd) {
        if (cmd.includes("test -d")) return { stdout: "", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists() { return true; }
    };
    const result = await fileModule.run(executor, { path: "/tmp/existing", state: "directory" }, false);
    assert.equal(result.changed, false);
  });

  test("absent returns changed=false when path doesn't exist", async () => {
    const executor = mockExec();
    const result = await fileModule.run(executor, { path: "/tmp/nonexistent", state: "absent" }, false);
    assert.equal(result.changed, false);
    assert.ok(result.msg.includes("already absent"));
  });

  test("rejects unsafe path", async () => {
    const executor = mockExec();
    const result = await fileModule.run(executor, { path: "/etc/../../../etc/shadow", state: "file" }, false);
    assert.equal(result.failed, true);
  });
});

// ── user module ───────────────────────────────────────────

describe("user module", () => {
  test("rejects unsafe username", async () => {
    const executor = mockExec();
    const result = await userModule.run(executor, { name: "user; rm -rf /" }, false);
    assert.equal(result.failed, true);
    assert.ok(result.msg.includes("Unsafe"));
  });

  test("dry-run create user", async () => {
    const executor = mockExec({ "id ": { stdout: "", stderr: "no such user", exitCode: 1 } });
    const result = await userModule.run(executor, { name: "deploy", state: "present" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });

  test("returns changed=false when user already exists", async () => {
    const executor = mockExec({ "id ": { stdout: "uid=1001(deploy)", stderr: "", exitCode: 0 } });
    const result = await userModule.run(executor, { name: "deploy", state: "present" }, false);
    assert.equal(result.changed, false);
  });
});

// ── ufw module ────────────────────────────────────────────

describe("ufw module", () => {
  test("rejects unsafe port", async () => {
    const executor = mockExec({ "command -v ufw": { stdout: "/usr/sbin/ufw", stderr: "", exitCode: 0 } });
    const result = await ufwModule.run(executor, { rule: "allow", port: "80; rm -rf /" as any }, false);
    assert.equal(result.failed, true);
  });

  test("dry-run enable UFW", async () => {
    const executor = mockExec({
      "command -v ufw": { stdout: "/usr/sbin/ufw", stderr: "", exitCode: 0 },
      "ufw status": { stdout: "Status: inactive", stderr: "", exitCode: 0 }
    });
    const result = await ufwModule.run(executor, { state: "enabled" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });

  test("returns changed=false when UFW already enabled", async () => {
    const executor = mockExec({
      "command -v ufw": { stdout: "/usr/sbin/ufw", stderr: "", exitCode: 0 },
      "ufw status": { stdout: "Status: active", stderr: "", exitCode: 0 }
    });
    const result = await ufwModule.run(executor, { state: "enabled" }, false);
    assert.equal(result.changed, false);
  });

  test("fails when UFW not installed", async () => {
    const executor = mockExec({ "command -v ufw": { stdout: "", stderr: "", exitCode: 1 } });
    const result = await ufwModule.run(executor, { rule: "allow", port: 80 }, false);
    assert.equal(result.failed, true);
    assert.ok(result.msg.includes("not installed"));
  });
});

// ── estimateImpact ────────────────────────────────────────

describe("estimateImpact", () => {
  test("estimates disk usage for package install", () => {
    const pb = parsePlaybook(`
name: Test
tasks:
  - name: Install nginx
    module: package
    args:
      name: nginx
      state: present
`);
    const report = estimateImpact(pb);
    assert.ok(report.totalDiskDeltaMb > 0);
    assert.equal(report.needsSudo, true);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0].kind, "package");
  });

  test("detects high risk for user deletion", () => {
    const pb = parsePlaybook(`
name: Test
tasks:
  - name: Delete user
    module: user
    args:
      name: deploy
      state: absent
`);
    const report = estimateImpact(pb);
    assert.equal(report.maxRisk, "high");
  });

  test("detects high risk for UFW reset", () => {
    const pb = parsePlaybook(`
name: Test
tasks:
  - name: Reset UFW
    module: ufw
    args:
      state: reset
`);
    const report = estimateImpact(pb);
    assert.equal(report.maxRisk, "high");
  });

  test("generates summary strings", () => {
    const pb = parsePlaybook(`
name: Test
tasks:
  - name: Install packages
    module: package
    args:
      name: [nginx, redis-server]
      state: present
  - name: Start nginx
    module: service
    args:
      name: nginx
      state: started
`);
    const report = estimateImpact(pb);
    assert.ok(report.summaryZh.length > 0);
    assert.ok(report.summaryEn.length > 0);
    assert.ok(report.estimatedSeconds > 0);
  });

  test("handles loop expansion", () => {
    const pb = parsePlaybook(`
name: Test
tasks:
  - name: Install {{ item }}
    module: package
    args:
      name: "{{ item }}"
      state: present
    loop:
      - git
      - curl
`);
    const report = estimateImpact(pb);
    assert.equal(report.items.length, 2);
  });
});
