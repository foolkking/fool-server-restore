/**
 * Tests for the verify: block — post-run smoke tests in Playbook YAML.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook, runPlaybook } from "../runner.js";
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

test("verify: passing checks are reported as such and don't change ok", async () => {
  const yaml = `
name: smoke test
hosts: all
tasks:
  - name: noop
    module: shell
    args:
      cmd: "true"
verify:
  - name: nginx is reachable
    cmd: "curl -fsS http://localhost"
  - name: port 80 is open
    cmd: "ss -tln | grep :80"
`;
  const pb = parsePlaybook(yaml);
  const exec = mockExec({
    "true": { exitCode: 0 },
    "curl -fsS": { exitCode: 0, stdout: "<html>nginx</html>" },
    "ss -tln": { exitCode: 0, stdout: "LISTEN 0 511 *:80 *:*" }
  });
  const result = await runPlaybook(pb, exec, { dryRun: false });
  assert.equal(result.ok, true);
  assert.equal(result.verifyResults?.length, 2);
  assert.equal(result.verifyResults?.every((v) => v.passed), true);
  assert.equal(result.verifyFailed, undefined);
});

test("verify: failing checks are reported but ok stays true", async () => {
  const yaml = `
name: smoke test
hosts: all
tasks:
  - name: noop
    module: shell
    args:
      cmd: "true"
verify:
  - name: nginx is reachable
    cmd: "curl -fsS http://localhost"
    hint: "Make sure port 80 isn't blocked by firewall"
`;
  const pb = parsePlaybook(yaml);
  const exec = mockExec({
    "true": { exitCode: 0 },
    "curl -fsS": { exitCode: 7, stderr: "curl: (7) Failed to connect" }
  });
  const result = await runPlaybook(pb, exec, { dryRun: false });
  // Install succeeded → ok stays true
  assert.equal(result.ok, true);
  assert.equal(result.verifyResults?.length, 1);
  assert.equal(result.verifyResults?.[0].passed, false);
  assert.equal(result.verifyResults?.[0].hint, "Make sure port 80 isn't blocked by firewall");
  assert.equal(result.verifyFailed, 1);
});

test("verify: expect_stdout substring check", async () => {
  const yaml = `
name: smoke test
hosts: all
tasks:
  - name: noop
    module: shell
    args:
      cmd: "true"
verify:
  - name: version is correct
    cmd: "/usr/local/go/bin/go version"
    expect_stdout: "go1.22"
`;
  const pb = parsePlaybook(yaml);
  // Wrong version reported → fails despite exit 0
  const wrongExec = mockExec({
    "true": { exitCode: 0 },
    "go version": { exitCode: 0, stdout: "go version go1.20.5 linux/amd64" }
  });
  const wrong = await runPlaybook(pb, wrongExec, { dryRun: false });
  assert.equal(wrong.verifyResults?.[0].passed, false);

  const correctExec = mockExec({
    "true": { exitCode: 0 },
    "go version": { exitCode: 0, stdout: "go version go1.22.4 linux/amd64" }
  });
  const correct = await runPlaybook(pb, correctExec, { dryRun: false });
  assert.equal(correct.verifyResults?.[0].passed, true);
});

test("verify: skipped entirely on dry-run", async () => {
  const yaml = `
name: smoke test
hosts: all
tasks:
  - name: noop
    module: shell
    args:
      cmd: "true"
verify:
  - name: x
    cmd: "echo y"
`;
  const pb = parsePlaybook(yaml);
  const exec = mockExec({});
  const result = await runPlaybook(pb, exec, { dryRun: true });
  assert.equal(result.verifyResults, undefined);
});

test("verify: skipped when prior tasks failed", async () => {
  const yaml = `
name: smoke test
hosts: all
tasks:
  - name: doomed
    module: shell
    args:
      cmd: "exit 1"
verify:
  - name: should not run
    cmd: "echo y"
`;
  const pb = parsePlaybook(yaml);
  const exec = mockExec({ "exit 1": { exitCode: 1, stderr: "boom" } });
  const result = await runPlaybook(pb, exec, { dryRun: false });
  assert.equal(result.ok, false);
  assert.equal(result.verifyResults, undefined);
});

test("verify: substitutes vars into cmd", async () => {
  const yaml = `
name: smoke test
hosts: all
vars:
  port: 8080
tasks:
  - name: noop
    module: shell
    args:
      cmd: "true"
verify:
  - name: port reachable
    cmd: "curl -fsS http://localhost:{{ port }}/health"
`;
  const pb = parsePlaybook(yaml);
  const calls: string[] = [];
  const exec: SshExecutor = {
    async exec(cmd: string) {
      calls.push(cmd);
      return { stdout: "ok", stderr: "", exitCode: 0 };
    },
    putFile: async () => undefined,
    getFile: async () => "",
    pathExists: async () => false
  };
  const result = await runPlaybook(pb, exec, { dryRun: false });
  assert.equal(result.verifyResults?.[0].passed, true);
  // The verify cmd should have had {{ port }} replaced
  assert.ok(calls.some((c) => c.includes("localhost:8080")), `expected port 8080 in calls: ${JSON.stringify(calls)}`);
});
