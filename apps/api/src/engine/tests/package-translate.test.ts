/**
 * Tests for package module's cross-distro name translation
 */
import test from "node:test";
import assert from "node:assert/strict";
import { packageModule } from "../modules/package.js";
import type { SshExecutor } from "../types.js";

/** Minimal mock executor that returns scripted answers per command. */
function mockExecutor(answers: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>): SshExecutor {
  return {
    async exec(cmd: string) {
      // Find the closest matching prefix
      const keys = Object.keys(answers).sort((a, b) => b.length - a.length);
      for (const k of keys) {
        if (cmd.includes(k)) {
          const a = answers[k];
          return { stdout: a.stdout ?? "", stderr: a.stderr ?? "", exitCode: a.exitCode ?? 0 };
        }
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    putFile: async () => undefined,
    getFile: async () => "",
    pathExists: async () => false
  } as unknown as SshExecutor;
}

test("package: translates Debian names to RHEL on dnf systems (redis-server → redis)", async () => {
  const exec = mockExecutor({
    "command -v dnf": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 },
    "rpm -q redis": { exitCode: 1 }, // not installed
    "sudo dnf install -y redis": { exitCode: 0, stdout: "installed redis" }
  });

  const result = await packageModule.run(exec, { name: "redis-server", state: "present" }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, true);
  // Message should mention the rename
  assert.ok((result.msg ?? "").includes("redis-server → redis"), `got: ${result.msg}`);
});

test("package: skips apt-only packages on dnf (apt-transport-https → no-op)", async () => {
  const exec = mockExecutor({
    "command -v dnf": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 }
  });

  const result = await packageModule.run(exec, { name: "apt-transport-https", state: "present" }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, false);
  assert.ok((result.msg ?? "").includes("skipped"), `got: ${result.msg}`);
});

test("package: passes through unaliased names unchanged on dnf", async () => {
  const exec = mockExecutor({
    "command -v dnf": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 },
    "rpm -q htop": { exitCode: 1 },
    "sudo dnf install -y htop": { exitCode: 0 }
  });

  const result = await packageModule.run(exec, { name: "htop", state: "present" }, false);
  assert.equal(result.changed, true);
  // No rename note since name is identical
  assert.ok(!(result.msg ?? "").includes("renamed"), `got: ${result.msg}`);
});

test("package: keeps original names on apt (no translation needed)", async () => {
  const exec = mockExecutor({
    "command -v apt-get": { exitCode: 0 },
    "dpkg-query -W": { exitCode: 1 }, // not installed
    "sudo apt-get update": { exitCode: 0 },
    "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server": { exitCode: 0 }
  });

  const result = await packageModule.run(exec, { name: "redis-server", state: "present" }, false);
  assert.equal(result.changed, true);
  // No translation note
  assert.ok(!(result.msg ?? "").includes("renamed"), `got: ${result.msg}`);
});

test("package: translates a list of packages, mixing renamed/unchanged/skipped", async () => {
  const exec = mockExecutor({
    "command -v dnf": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 },
    "rpm -q redis": { exitCode: 1 },
    "rpm -q htop": { exitCode: 1 },
    "sudo dnf install -y": { exitCode: 0 }
  });

  const result = await packageModule.run(
    exec,
    { name: ["redis-server", "htop", "apt-transport-https"], state: "present" },
    false
  );
  assert.equal(result.changed, true);
  const msg = result.msg ?? "";
  assert.ok(msg.includes("redis-server → redis"), `expected rename note, got: ${msg}`);
  assert.ok(msg.includes("apt-transport-https"), `expected skipped note, got: ${msg}`);
});
