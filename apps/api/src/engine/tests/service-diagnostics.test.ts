/**
 * Tests for service module's failure diagnostics.
 *
 * When `systemctl start <name>` fails with the unhelpful generic message
 * "Job for X failed because the control process exited with error code",
 * we capture systemctl status + journalctl and try to identify the root cause
 * (port conflict, config syntax error, SELinux denial, missing file, etc).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { serviceModule } from "../modules/service.js";
import type { SshExecutor } from "../types.js";

function mockExec(answers: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>): SshExecutor {
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

test("diagnostics: nginx start failure with port 80 in use surfaces port conflict hint", async () => {
  const exec = mockExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v rpm": { exitCode: 0 },
    "systemctl cat nginx": { exitCode: 0 },
    "systemctl is-active --quiet nginx": { exitCode: 1 }, // not running
    "sudo systemctl start nginx": {
      exitCode: 1,
      stderr: "Job for nginx.service failed because the control process exited with error code."
    },
    "systemctl status nginx": {
      exitCode: 1,
      stdout: "● nginx.service - The nginx HTTP and reverse proxy server\n" +
              "   Active: failed (Result: exit-code)\n" +
              "   nginx[1234]: nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)\n"
    },
    "sudo journalctl -u nginx": {
      exitCode: 0,
      stdout: "May 22 15:30:01 host nginx[1234]: nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)\n" +
              "May 22 15:30:01 host nginx[1234]: nginx: [emerg] still could not bind()\n"
    }
  });

  const result = await serviceModule.run(exec, { name: "nginx", state: "started" }, false);
  assert.equal(result.failed, true);
  const msg = result.msg ?? "";
  // Should mention port conflict, port 80, and the actual journalctl line
  assert.ok(msg.includes("🔧"), `expected 🔧 prefix, got: ${msg}`);
  assert.ok(msg.includes("80"), `expected port 80 in hint, got: ${msg}`);
  assert.ok(msg.includes("ss -tlnp"), `expected ss command hint, got: ${msg}`);
  assert.ok(msg.includes("journalctl"), `expected journal section header, got: ${msg}`);
  assert.ok(msg.includes("Address already in use"), `expected raw journal line, got: ${msg}`);
});

test("diagnostics: nginx config syntax error surfaces the [emerg] line", async () => {
  const exec = mockExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v rpm": { exitCode: 0 },
    "systemctl cat nginx": { exitCode: 0 },
    "systemctl is-active --quiet nginx": { exitCode: 1 },
    "sudo systemctl start nginx": { exitCode: 1, stderr: "Job for nginx.service failed" },
    "systemctl status nginx": { exitCode: 1, stdout: "Active: failed" },
    "sudo journalctl -u nginx": {
      exitCode: 0,
      stdout: "nginx[2345]: nginx: [emerg] unknown directive \"servr_name\" in /etc/nginx/conf.d/default.conf:5\n"
    }
  });

  const result = await serviceModule.run(exec, { name: "nginx", state: "started" }, false);
  assert.equal(result.failed, true);
  const msg = result.msg ?? "";
  assert.ok(msg.includes("nginx -t"), `expected nginx -t hint, got: ${msg}`);
  assert.ok(msg.includes("emerg") || msg.includes("配置文件"), `expected config error hint, got: ${msg}`);
});

test("diagnostics: SELinux denial gets specific hint", async () => {
  const exec = mockExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v rpm": { exitCode: 0 },
    "systemctl cat httpd": { exitCode: 0 },
    "systemctl is-active --quiet httpd": { exitCode: 1 },
    "sudo systemctl start httpd": { exitCode: 1, stderr: "Job failed" },
    "systemctl status httpd": { exitCode: 1, stdout: "Active: failed" },
    "sudo journalctl -u httpd": {
      exitCode: 0,
      stdout: "audit: type=1400 audit(...): avc: denied { read } for ... permission denied (selinux)\n"
    }
  });

  const result = await serviceModule.run(exec, { name: "apache2", state: "started" }, false);
  assert.equal(result.failed, true);
  const msg = result.msg ?? "";
  assert.ok(msg.includes("SELinux") || msg.includes("setenforce"), `expected SELinux hint, got: ${msg}`);
});

test("diagnostics: when no known cause matched, still includes raw output for debugging", async () => {
  const exec = mockExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v rpm": { exitCode: 0 },
    "systemctl cat myapp": { exitCode: 0 },
    "systemctl is-active --quiet myapp": { exitCode: 1 },
    "sudo systemctl start myapp": { exitCode: 1, stderr: "Job failed" },
    "systemctl status myapp": { exitCode: 1, stdout: "Some status output" },
    "sudo journalctl -u myapp": { exitCode: 0, stdout: "Some opaque application error" }
  });

  const result = await serviceModule.run(exec, { name: "myapp", state: "started" }, false);
  assert.equal(result.failed, true);
  const msg = result.msg ?? "";
  // Even without a recognized cause, raw status + journalctl must be in the message
  assert.ok(msg.includes("Some status output"), `expected status output, got: ${msg}`);
  assert.ok(msg.includes("Some opaque application error"), `expected journal output, got: ${msg}`);
  assert.ok(msg.includes("systemctl status"), `expected status section header, got: ${msg}`);
});
