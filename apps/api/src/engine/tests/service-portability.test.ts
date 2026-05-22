/**
 * Tests for cross-distro service portability:
 *   - apparmor / ufw / snapd skipped on RHEL
 *   - apache2 → httpd, ssh → sshd renames on RHEL
 *   - missing units skipped silently when ignore_missing=true (default)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { serviceModule } from "../modules/service.js";
import type { SshExecutor } from "../types.js";

function mockExecutor(answers: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>): SshExecutor {
  return {
    async exec(cmd: string) {
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

test("service: apparmor is skipped on RHEL (no-op, no error)", async () => {
  const exec = mockExecutor({
    "command -v rpm": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 }, // RPM-based system
  });

  const result = await serviceModule.run(exec, { name: "apparmor", state: "started", enabled: true }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, false);
  assert.ok((result.msg ?? "").toLowerCase().includes("skip"), `got: ${result.msg}`);
});

test("service: apache2 → httpd on RHEL", async () => {
  const exec = mockExecutor({
    "command -v rpm": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 },
    "systemctl cat httpd": { exitCode: 0 }, // unit exists
    "systemctl is-active --quiet httpd": { exitCode: 1 }, // not active
    "systemctl is-enabled --quiet httpd": { exitCode: 1 }, // not enabled
    "sudo systemctl start httpd": { exitCode: 0 },
    "sudo systemctl enable httpd": { exitCode: 0 }
  });

  const result = await serviceModule.run(exec, { name: "apache2", state: "started", enabled: true }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, true);
  assert.ok((result.msg ?? "").includes("apache2 → httpd"), `expected rename note, got: ${result.msg}`);
});

test("service: missing unit skipped silently with ignore_missing=true (default)", async () => {
  const exec = mockExecutor({
    "command -v rpm": { exitCode: 1 }, // apt-based
    "command -v apt-get": { exitCode: 0 },
    "systemctl cat does-not-exist": { exitCode: 4, stderr: "No files found" },
  });

  const result = await serviceModule.run(exec, { name: "does-not-exist", state: "started" }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, false);
  assert.ok((result.msg ?? "").toLowerCase().includes("not installed"), `got: ${result.msg}`);
});

test("service: missing unit fails when ignore_missing=false", async () => {
  const exec = mockExecutor({
    "command -v rpm": { exitCode: 1 },
    "command -v apt-get": { exitCode: 0 },
    "systemctl cat does-not-exist": { exitCode: 4 },
  });

  const result = await serviceModule.run(exec, { name: "does-not-exist", state: "started", ignore_missing: false }, false);
  assert.equal(result.failed, true);
});

test("service: existing unit on apt unaffected by translation", async () => {
  const exec = mockExecutor({
    "command -v rpm": { exitCode: 1 }, // apt-based
    "command -v apt-get": { exitCode: 0 },
    "systemctl cat nginx": { exitCode: 0 },
    "systemctl is-active --quiet nginx": { exitCode: 1 },
    "sudo systemctl start nginx": { exitCode: 0 }
  });

  const result = await serviceModule.run(exec, { name: "nginx", state: "started" }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, true);
  assert.ok(!(result.msg ?? "").includes("renamed"), `should not rename on apt: ${result.msg}`);
});

test("service: ufw → firewalld on RHEL", async () => {
  const exec = mockExecutor({
    "command -v rpm": { exitCode: 0 },
    "command -v apt-get": { exitCode: 1 },
    "systemctl cat firewalld": { exitCode: 0 },
    "systemctl is-active --quiet firewalld": { exitCode: 0 }, // already active
    "systemctl is-enabled --quiet firewalld": { exitCode: 0 }, // already enabled
  });

  const result = await serviceModule.run(exec, { name: "ufw", state: "started", enabled: true }, false);
  assert.equal(result.failed, undefined);
  assert.equal(result.changed, false);
  assert.ok((result.msg ?? "").includes("ufw → firewalld"), `got: ${result.msg}`);
});
