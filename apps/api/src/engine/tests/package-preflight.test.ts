/**
 * Tests for package module's PROACTIVE preflight phase on RHEL/Anolis systems.
 *
 * The preflight phase is the key fix for cross-distro compatibility on Aliyun
 * Anolis VMs where the captured Ubuntu Playbook needs:
 *   1. EPEL pre-installed for bat/btop/fd-find/etc.
 *   2. dnf module enable for nginx/redis/etc.
 *   3. --disableexcludes=all to bypass /etc/dnf/dnf.conf exclude= filter
 */
import test from "node:test";
import assert from "node:assert/strict";
import { packageModule } from "../modules/package.js";
import type { SshExecutor } from "../types.js";

/** Trace executor that records every command and returns scripted answers per prefix match. */
function traceExec(answers: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>) {
  const calls: string[] = [];
  const exec: SshExecutor = {
    async exec(cmd: string) {
      calls.push(cmd);
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
  };
  return { exec, calls };
}

test("preflight: detects Anolis 9 + dnf exclude config + auto-installs EPEL + enables nginx module", async () => {
  const { exec, calls } = traceExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 0 },
    // /etc/os-release for Anolis 9
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'ID="anolis"\nVERSION_ID="9.0"\nID_LIKE="rhel centos fedora"\n'
    },
    // exclude= line present in dnf.conf
    "grep -hE '^[[:space:]]*exclude": {
      exitCode: 0,
      stdout: "exclude=nginx*\n"
    },
    // EPEL not installed yet
    "rpm -q epel-release": { exitCode: 1 },
    // EPEL install succeeds via the EL9 URL
    "epel-release-latest-9": { exitCode: 0, stdout: "Installed epel-release" },
    // dnf module enable nginx succeeds
    "dnf module list": { exitCode: 0 },
    "dnf module enable -y nginx": { exitCode: 0, stdout: "Enabled" },
    // Existing rpm checks return 1 (not installed)
    "rpm -q ": { exitCode: 1 },
    // The batch dnf install with --disableexcludes=all succeeds
    "sudo dnf install -y --disableexcludes=all nginx bat": { exitCode: 0, stdout: "Installed nginx, bat" }
  });

  const result = await packageModule.run(exec, { name: ["nginx", "bat"], state: "present" }, false);
  assert.equal(result.failed, undefined, `unexpected failure: ${result.msg}`);
  assert.equal(result.changed, true);

  // Preflight log must mention all three actions
  const msg = result.msg ?? "";
  assert.ok(msg.includes("preflight:"), `expected preflight section, got: ${msg}`);
  assert.ok(msg.includes("anolis"), `expected anolis detected, got: ${msg}`);
  assert.ok(msg.includes("EPEL"), `expected EPEL line, got: ${msg}`);
  assert.ok(msg.includes("module nginx"), `expected nginx module enable, got: ${msg}`);
  assert.ok(msg.includes("disableexcludes"), `expected disableexcludes note, got: ${msg}`);

  // Verify the batch install passed --disableexcludes=all
  const installCmd = calls.find((c) => c.startsWith("sudo dnf install -y") && c.includes("nginx"));
  assert.ok(installCmd, "expected dnf install to run");
  assert.ok(installCmd!.includes("--disableexcludes=all"), `expected disableexcludes flag, got: ${installCmd}`);

  // Verify EPEL install URL chose v9 (not v8)
  const epelCmd = calls.find((c) => c.includes("epel-release") && c.includes("install"));
  assert.ok(epelCmd, "expected EPEL install attempt");
  assert.ok(epelCmd!.includes("latest-9"), `expected EL9 URL, got: ${epelCmd}`);
});

test("preflight: skips EPEL install when no package needs it", async () => {
  const { exec, calls } = traceExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 0 },
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'ID="anolis"\nVERSION_ID="9.0"\n'
    },
    "grep -hE '^[[:space:]]*exclude": { exitCode: 1 }, // no exclude
    "rpm -q git": { exitCode: 1 }, // not installed
    "rpm -q ": { exitCode: 1 },
    "sudo dnf install -y git": { exitCode: 0 }
  });

  const result = await packageModule.run(exec, { name: "git", state: "present" }, false);
  assert.equal(result.failed, undefined);
  // Should NOT have attempted EPEL install
  const epelCmd = calls.find((c) => c.includes("epel-release"));
  assert.equal(epelCmd, undefined, "should not install EPEL for git alone");
});

test("preflight: continues even when EPEL install fails (best-effort)", async () => {
  const { exec, calls } = traceExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 0 },
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'ID="anolis"\nVERSION_ID="9.0"\n'
    },
    "grep -hE '^[[:space:]]*exclude": { exitCode: 1 },
    "rpm -q epel-release": { exitCode: 1 }, // not installed
    // ALL EPEL install strategies fail
    "epel-release": { exitCode: 1, stderr: "Connection timed out" },
    "rpm -q bat": { exitCode: 1 },
    "rpm -q ": { exitCode: 1 },
    // Then bat install also fails because EPEL didn't get added
    "sudo dnf install -y bat": { exitCode: 1, stderr: "No match for argument: bat\nError: Unable to find a match: bat" }
  });

  const result = await packageModule.run(exec, { name: "bat", state: "present" }, false);
  // Should fail but with a useful diagnostic message
  assert.equal(result.failed, true);
  const msg = result.msg ?? "";
  assert.ok(msg.includes("EPEL"), `expected EPEL note in preflight, got: ${msg}`);
  assert.ok(msg.includes("preflight:"), `expected preflight section, got: ${msg}`);
});

test("preflight: skipped entirely on apt systems", async () => {
  const { exec, calls } = traceExec({
    "command -v apt-get": { exitCode: 0 },
    "dpkg-query": { exitCode: 1 },
    "sudo apt-get update": { exitCode: 0 },
    "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx": { exitCode: 0 }
  });

  const result = await packageModule.run(exec, { name: "nginx", state: "present" }, false);
  assert.equal(result.failed, undefined);
  // No /etc/os-release read, no preflight section
  const osCheck = calls.find((c) => c.includes("/etc/os-release"));
  assert.equal(osCheck, undefined, "apt path should not run distro detection");
  const msg = result.msg ?? "";
  assert.ok(!msg.includes("preflight:"), `apt should not show preflight section, got: ${msg}`);
});

test("preflight: does NOT add --disableexcludes=all when no exclude config detected", async () => {
  const { exec, calls } = traceExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 0 },
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'ID="rocky"\nVERSION_ID="9.3"\n'
    },
    "grep -hE '^[[:space:]]*exclude": { exitCode: 1 }, // NO exclude= line
    "rpm -q ": { exitCode: 1 },
    "sudo dnf install -y htop": { exitCode: 0 }
  });

  await packageModule.run(exec, { name: "htop", state: "present" }, false);
  const installCmd = calls.find((c) => c.startsWith("sudo dnf install -y") && c.includes("htop"));
  assert.ok(installCmd, "expected dnf install");
  assert.ok(!installCmd!.includes("--disableexcludes=all"), `should not add bypass flag without exclude config, got: ${installCmd}`);
});

test("preflight: full failure surfaces per-package reasons in result.msg", async () => {
  const { exec, calls } = traceExec({
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 0 },
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'ID="anolis"\nVERSION_ID="9.0"\n'
    },
    "grep -hE '^[[:space:]]*exclude": {
      exitCode: 0,
      stdout: "exclude=nginx*\n"
    },
    "rpm -q epel-release": { exitCode: 1 },
    "epel-release": { exitCode: 1, stderr: "no network" },
    "dnf module list": { exitCode: 0 },
    "dnf module enable -y nginx": { exitCode: 1 },
    "rpm -q ": { exitCode: 1 },
    "sudo dnf install -y --disableexcludes=all nginx bat": {
      exitCode: 1,
      stderr: "All matches were filtered out by exclude filtering for argument: nginx\nNo match for argument: bat"
    },
    // Per-package fallback also fails
    "sudo dnf install -y --disableexcludes=all nginx": { exitCode: 1, stderr: "No match for argument: nginx" },
    "sudo dnf install -y --disableexcludes=all bat": { exitCode: 1, stderr: "No match for argument: bat" }
  });

  const result = await packageModule.run(exec, { name: ["nginx", "bat"], state: "present" }, false);
  assert.equal(result.failed, true);
  const msg = result.msg ?? "";
  assert.ok(msg.includes("nginx"), `expected nginx in failure detail, got: ${msg}`);
  assert.ok(msg.includes("bat"), `expected bat in failure detail, got: ${msg}`);
  // Should include preflight info so user can see what we tried
  assert.ok(msg.includes("preflight:"), `expected preflight info, got: ${msg}`);
  // Should include per-package reason
  assert.ok(msg.includes("not in any enabled repo") || msg.includes("excluded by"), `expected reason, got: ${msg}`);
});
