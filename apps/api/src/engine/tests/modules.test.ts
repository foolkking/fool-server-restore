/**
 * modules.test.ts — Unit tests for individual engine modules
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { packageModule } from "../modules/package.js";
import { serviceModule } from "../modules/service.js";
import { shellModule } from "../modules/shell.js";
import type { SshExecutor } from "../types.js";

// ── Mock executor factory ─────────────────────────────────

function mockExec(responses: Record<string, { stdout: string; stderr: string; exitCode: number }>): SshExecutor {
  const calls: string[] = [];
  return {
    async exec(cmd) {
      calls.push(cmd);
      for (const [key, res] of Object.entries(responses)) {
        if (cmd.includes(key)) return res;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async putFile() {},
    async getFile() { return ""; },
    async pathExists() { return false; },
    getCalls: () => calls
  } as SshExecutor & { getCalls: () => string[] };
}

// ── package module ────────────────────────────────────────

describe("package module", () => {
  test("returns changed=false when package already installed (apt)", async () => {
    const executor = mockExec({
      "command -v apt-get": { stdout: "/usr/bin/apt-get", stderr: "", exitCode: 0 },
      "dpkg-query": { stdout: "install ok installed", stderr: "", exitCode: 0 }
    });

    const result = await packageModule.run(executor, { name: "nginx", state: "present" }, false);
    assert.equal(result.changed, false);
    assert.equal(result.failed, undefined);
  });

  test("returns changed=true in dry-run when package not installed", async () => {
    const executor = mockExec({
      "command -v apt-get": { stdout: "/usr/bin/apt-get", stderr: "", exitCode: 0 },
      "dpkg-query": { stdout: "", stderr: "not found", exitCode: 1 }
    });

    const result = await packageModule.run(executor, { name: "nginx", state: "present" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });

  test("rejects unsafe package names", async () => {
    const executor = mockExec({});
    const result = await packageModule.run(executor, { name: "nginx; rm -rf /", state: "present" }, false);
    assert.equal(result.failed, true);
    assert.ok(result.msg.includes("Unsafe"));
  });

  test("handles array of package names", async () => {
    const executor = mockExec({
      "command -v apt-get": { stdout: "/usr/bin/apt-get", stderr: "", exitCode: 0 },
      "dpkg-query": { stdout: "", stderr: "not found", exitCode: 1 }
    });

    const result = await packageModule.run(executor, { name: ["git", "curl"], state: "present" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("git"));
    assert.ok(result.msg.includes("curl"));
  });
});

// ── service module ────────────────────────────────────────

describe("service module", () => {
  test("returns changed=false when service already active", async () => {
    const executor = mockExec({
      "systemctl is-active": { stdout: "active", stderr: "", exitCode: 0 },
      "systemctl is-enabled": { stdout: "enabled", stderr: "", exitCode: 0 }
    });

    const result = await serviceModule.run(executor, { name: "nginx", state: "started", enabled: true }, false);
    assert.equal(result.changed, false);
  });

  test("rejects unsafe service names", async () => {
    const executor = mockExec({});
    const result = await serviceModule.run(executor, { name: "nginx; rm -rf /" }, false);
    assert.equal(result.failed, true);
  });

  test("always executes restart", async () => {
    const executor = mockExec({
      "systemctl restart": { stdout: "", stderr: "", exitCode: 0 }
    }) as SshExecutor & { getCalls: () => string[] };

    const result = await serviceModule.run(executor, { name: "nginx", state: "restarted" }, false);
    assert.equal(result.changed, true);
  });

  test("dry-run returns changed=true without executing", async () => {
    const executor = mockExec({
      "systemctl is-active": { stdout: "", stderr: "", exitCode: 1 } // not active
    });

    const result = await serviceModule.run(executor, { name: "nginx", state: "started" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });
});

// ── shell module ──────────────────────────────────────────

describe("shell module", () => {
  test("executes command and returns output", async () => {
    const executor = mockExec({
      "echo hello": { stdout: "hello\n", stderr: "", exitCode: 0 }
    });

    const result = await shellModule.run(executor, { cmd: "echo hello" }, false);
    assert.equal(result.changed, true);
    assert.equal(result.stdout, "hello\n");
  });

  test("skips when creates path exists", async () => {
    const executor: SshExecutor = {
      async exec() { return { stdout: "", stderr: "", exitCode: 0 }; },
      async putFile() {},
      async getFile() { return ""; },
      async pathExists(path) { return path === "/usr/bin/pm2"; }
    };

    const result = await shellModule.run(executor, { cmd: "npm install -g pm2", creates: "/usr/bin/pm2" }, false);
    assert.equal(result.changed, false);
    assert.ok(result.msg.includes("Skipped"));
  });

  test("rejects dangerous commands", async () => {
    const executor = mockExec({});
    const result = await shellModule.run(executor, { cmd: "rm -rf / --no-preserve-root" }, false);
    assert.equal(result.failed, true);
    assert.ok(result.msg.includes("Refused"));
  });

  test("dry-run returns changed=true without executing", async () => {
    const executor = mockExec({});
    const result = await shellModule.run(executor, { cmd: "echo test" }, true);
    assert.equal(result.changed, true);
    assert.ok(result.msg.includes("[dry-run]"));
  });

  test("returns failed=true on non-zero exit", async () => {
    const executor = mockExec({
      "failing-cmd": { stdout: "", stderr: "error output", exitCode: 1 }
    });

    const result = await shellModule.run(executor, { cmd: "failing-cmd" }, false);
    assert.equal(result.failed, true);
  });
});
