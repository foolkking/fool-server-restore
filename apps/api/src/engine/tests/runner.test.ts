/**
 * runner.test.ts — Unit tests for the Playbook runner
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook, runPlaybook } from "../runner.js";
import type { SshExecutor } from "../types.js";

// ── Mock SSH Executor ─────────────────────────────────────

function createMockExecutor(responses: Record<string, { stdout: string; stderr: string; exitCode: number }>): SshExecutor {
  return {
    async exec(command: string) {
      // Find matching response by prefix
      for (const [key, response] of Object.entries(responses)) {
        if (command.includes(key)) return response;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async putFile(_path: string, _content: string | Buffer) { /* no-op */ },
    async getFile(_path: string) { return ""; },
    async pathExists(_path: string) { return false; }
  };
}

// ── Tests ─────────────────────────────────────────────────

describe("parsePlaybook", () => {
  test("parses a simple playbook", () => {
    const yaml = `
name: Test playbook
hosts: all
tasks:
  - name: Install nginx
    module: package
    args:
      name: nginx
      state: present
`;
    const pb = parsePlaybook(yaml);
    assert.equal(pb.name, "Test playbook");
    assert.equal(pb.tasks.length, 1);
    assert.equal(pb.tasks[0].name, "Install nginx");
    assert.equal(pb.tasks[0].module, "package");
  });

  test("parses a playbook with vars", () => {
    const yaml = `
name: Vars test
vars:
  port: 8080
tasks:
  - name: Echo port
    module: shell
    args:
      cmd: "echo {{ port }}"
`;
    const pb = parsePlaybook(yaml);
    assert.equal(pb.vars?.port, 8080);
  });

  test("throws on empty playbook", () => {
    assert.throws(() => parsePlaybook("[]"), /Empty playbook/);
  });
});

describe("runPlaybook — dry-run", () => {
  test("dry-run returns changed=true without executing", async () => {
    const yaml = `
name: Dry run test
tasks:
  - name: Install test-pkg
    module: package
    args:
      name: test-pkg
      state: present
`;
    const pb = parsePlaybook(yaml);
    const executor = createMockExecutor({
      // dpkg-query returns non-zero (not installed)
      "dpkg-query": { stdout: "", stderr: "dpkg-query: no packages found", exitCode: 1 },
      // apt-get detection
      "command -v apt-get": { stdout: "", stderr: "", exitCode: 0 }
    });

    const result = await runPlaybook(pb, executor, { dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.changed, 1);
    assert.ok(result.logs[0].result?.msg.includes("[dry-run]"));
  });

  test("dry-run skips when condition is false", async () => {
    const yaml = `
name: Conditional test
tasks:
  - name: Conditional step
    module: shell
    args:
      cmd: "echo hello"
    when: "false_var"
`;
    const pb = parsePlaybook(yaml);
    const executor = createMockExecutor({});
    const result = await runPlaybook(pb, executor, { dryRun: true });
    assert.equal(result.skipped, 1);
    assert.equal(result.changed, 0);
  });
});

describe("runPlaybook — variable substitution", () => {
  test("substitutes {{ item }} in loop", async () => {
    const yaml = `
name: Loop test
tasks:
  - name: Install {{ item }}
    module: shell
    args:
      cmd: "echo {{ item }}"
    loop:
      - git
      - curl
`;
    const pb = parsePlaybook(yaml);
    const commands: string[] = [];
    const executor: SshExecutor = {
      async exec(cmd) { commands.push(cmd); return { stdout: "ok", stderr: "", exitCode: 0 }; },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists() { return false; }
    };

    const result = await runPlaybook(pb, executor, { dryRun: false });
    assert.equal(result.ok, true);
    assert.equal(result.totalTasks, 2);
    assert.ok(commands.some((c) => c.includes("git")));
    assert.ok(commands.some((c) => c.includes("curl")));
  });

  test("substitutes playbook vars", async () => {
    const yaml = `
name: Vars substitution
vars:
  greeting: hello
tasks:
  - name: Echo greeting
    module: shell
    args:
      cmd: "echo {{ greeting }}"
`;
    const pb = parsePlaybook(yaml);
    const commands: string[] = [];
    const executor: SshExecutor = {
      async exec(cmd) { commands.push(cmd); return { stdout: "hello", stderr: "", exitCode: 0 }; },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists() { return false; }
    };

    await runPlaybook(pb, executor, { dryRun: false });
    assert.ok(commands.some((c) => c.includes("hello")));
  });
});

describe("runPlaybook — register and when", () => {
  test("register captures result and when uses it", async () => {
    const yaml = `
name: Register test
tasks:
  - name: Check something
    module: shell
    args:
      cmd: "echo changed"
    register: check_result

  - name: Conditional on register
    module: shell
    args:
      cmd: "echo conditional"
    when: "check_result.changed"
`;
    const pb = parsePlaybook(yaml);
    const commands: string[] = [];
    const executor: SshExecutor = {
      async exec(cmd) { commands.push(cmd); return { stdout: "changed", stderr: "", exitCode: 0 }; },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists() { return false; }
    };

    const result = await runPlaybook(pb, executor, { dryRun: false });
    assert.equal(result.ok, true);
    assert.equal(result.totalTasks, 2);
    assert.ok(commands.some((c) => c.includes("conditional")));
  });
});

describe("runPlaybook — error handling", () => {
  test("stops on first failure by default", async () => {
    const yaml = `
name: Error test
tasks:
  - name: Failing step
    module: shell
    args:
      cmd: "exit 1"

  - name: Should not run
    module: shell
    args:
      cmd: "echo should-not-run"
`;
    const pb = parsePlaybook(yaml);
    const commands: string[] = [];
    const executor: SshExecutor = {
      async exec(cmd) {
        commands.push(cmd);
        if (cmd.includes("exit 1")) return { stdout: "", stderr: "error", exitCode: 1 };
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists() { return false; }
    };

    const result = await runPlaybook(pb, executor, { dryRun: false });
    assert.equal(result.ok, false);
    assert.equal(result.failed, 1);
    assert.ok(!commands.some((c) => c.includes("should-not-run")));
  });

  test("ignore_errors continues on failure", async () => {
    const yaml = `
name: Ignore errors test
tasks:
  - name: Failing step
    module: shell
    args:
      cmd: "exit 1"
    ignore_errors: true

  - name: Should still run
    module: shell
    args:
      cmd: "echo still-running"
`;
    const pb = parsePlaybook(yaml);
    const commands: string[] = [];
    const executor: SshExecutor = {
      async exec(cmd) {
        commands.push(cmd);
        if (cmd.includes("exit 1")) return { stdout: "", stderr: "error", exitCode: 1 };
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists() { return false; }
    };

    const result = await runPlaybook(pb, executor, { dryRun: false });
    assert.equal(result.ok, true);
    assert.equal(result.failed, 1);
    assert.ok(commands.some((c) => c.includes("still-running")));
  });
});
