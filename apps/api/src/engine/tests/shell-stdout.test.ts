/**
 * Quick test to verify shell module returns stdout and runner passes it through onProgress
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook, runPlaybook } from "../runner.js";
import type { SshExecutor, TaskExecutionLog } from "../types.js";

test("shell module stdout is passed through onProgress", async () => {
  const executor: SshExecutor = {
    async exec(cmd) {
      if (cmd === 'echo "Hello from EnvForge"') {
        return { stdout: "Hello from EnvForge\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async putFile() {},
    async getFile() { return ""; },
    async pathExists() { return false; }
  };

  const playbook = parsePlaybook(`
name: Test echo
hosts: all
tasks:
  - name: Example task
    module: shell
    args:
      cmd: 'echo "Hello from EnvForge"'
`);

  const logs: TaskExecutionLog[] = [];
  const result = await runPlaybook(playbook, executor, {
    dryRun: false,
    onProgress: (log) => { logs.push({ ...log, result: log.result ? { ...log.result } : undefined }); }
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, 1);

  // Find the completed log (not the "running" one)
  const completedLog = logs.find((l) => l.status === "changed" || l.status === "ok");
  assert.ok(completedLog, "Should have a completed log");
  assert.ok(completedLog!.result, "Completed log should have result");
  assert.equal(completedLog!.result!.stdout, "Hello from EnvForge\n", "stdout should contain echo output");
  assert.equal(completedLog!.result!.msg, "Command executed");
  assert.ok(completedLog!.command, "Should have command field");
  assert.ok(completedLog!.command!.includes("echo"), "Command should contain the actual shell command");

  console.log("✓ Shell stdout is correctly passed through onProgress");
  console.log("  command:", completedLog!.command);
  console.log("  stdout:", completedLog!.result!.stdout);
});
