/**
 * preflight.ts — 执行前快速检查（sudo / 磁盘空间 / 网络）
 *
 * 在 Playbook 执行前调用，给用户一个早期信号：
 *   - sudo 可用？是否要密码？
 *   - 根分区空闲空间？
 *   - 出网（apt repo / docker hub）？
 *   - 可能冲突的包管理锁？
 *
 * 失败不阻塞执行（除非 sudo 不可用且 Playbook 需要 root）；只把结果反馈给前端展示。
 */

import type { SshExecutor } from "./engine/types.js";

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface PreflightCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PreflightReport {
  ranAt: string;
  durationMs: number;
  checks: PreflightCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

/** Run lightweight preflight checks via SSH; never modifies the target. */
export async function runPreflight(executor: SshExecutor): Promise<PreflightReport> {
  const start = Date.now();
  const checks: PreflightCheck[] = [];

  // 1. sudo availability — passwordless preferred; warn if password required
  try {
    const { exitCode, stderr } = await executor.exec("sudo -n true 2>&1");
    if (exitCode === 0) {
      checks.push({
        id: "sudo",
        label: "sudo (passwordless)",
        status: "pass",
        detail: "sudo without password is available"
      });
    } else if (/password is required/i.test(stderr) || /a password is required/i.test(stderr)) {
      checks.push({
        id: "sudo",
        label: "sudo",
        status: "warn",
        detail: "sudo requires a password — Playbook tasks needing root may fail"
      });
    } else {
      checks.push({
        id: "sudo",
        label: "sudo",
        status: "fail",
        detail: stderr.trim() || "sudo not available"
      });
    }
  } catch (err) {
    checks.push({
      id: "sudo", label: "sudo", status: "fail",
      detail: err instanceof Error ? err.message : "check failed"
    });
  }

  // 2. Root partition free space
  try {
    const { stdout } = await executor.exec("df -BM --output=avail / 2>/dev/null | tail -1");
    const m = stdout.trim().match(/(\d+)M/);
    const freeMb = m ? parseInt(m[1], 10) : NaN;
    if (Number.isNaN(freeMb)) {
      checks.push({ id: "disk", label: "disk space", status: "warn", detail: "could not parse df output" });
    } else if (freeMb < 500) {
      checks.push({ id: "disk", label: "disk space", status: "fail", detail: `only ${freeMb} MB free on /` });
    } else if (freeMb < 2000) {
      checks.push({ id: "disk", label: "disk space", status: "warn", detail: `${freeMb} MB free on / (low)` });
    } else {
      const gb = (freeMb / 1024).toFixed(1);
      checks.push({ id: "disk", label: "disk space", status: "pass", detail: `${gb} GB free on /` });
    }
  } catch (err) {
    checks.push({ id: "disk", label: "disk space", status: "warn", detail: err instanceof Error ? err.message : "check failed" });
  }

  // 3. Internet reachability — try a fast DNS-only check
  try {
    const { exitCode } = await executor.exec("getent hosts archive.ubuntu.com 2>/dev/null >/dev/null || getent hosts deb.debian.org 2>/dev/null >/dev/null");
    if (exitCode === 0) {
      checks.push({ id: "network", label: "package mirrors reachable", status: "pass", detail: "DNS resolves" });
    } else {
      checks.push({ id: "network", label: "package mirrors", status: "warn", detail: "cannot resolve archive.ubuntu.com / deb.debian.org" });
    }
  } catch (err) {
    checks.push({ id: "network", label: "network", status: "warn", detail: err instanceof Error ? err.message : "check failed" });
  }

  // 4. Package manager lock
  try {
    const { stdout } = await executor.exec("test -f /var/lib/dpkg/lock-frontend && fuser /var/lib/dpkg/lock-frontend 2>/dev/null && echo busy || echo free");
    if (stdout.includes("busy")) {
      checks.push({
        id: "apt-lock",
        label: "apt lock",
        status: "warn",
        detail: "another package manager process is running (will block apt tasks)"
      });
    } else {
      checks.push({ id: "apt-lock", label: "apt lock", status: "pass", detail: "no apt lock contention" });
    }
  } catch (err) {
    checks.push({ id: "apt-lock", label: "apt lock", status: "skipped", detail: err instanceof Error ? err.message : "check failed" });
  }

  // 5. systemd available (most service modules need it)
  try {
    const { exitCode } = await executor.exec("command -v systemctl >/dev/null 2>&1 && echo yes");
    if (exitCode === 0) {
      checks.push({ id: "systemd", label: "systemd", status: "pass", detail: "systemctl available" });
    } else {
      checks.push({
        id: "systemd",
        label: "systemd",
        status: "warn",
        detail: "systemctl not found — service module will not work"
      });
    }
  } catch (err) {
    checks.push({ id: "systemd", label: "systemd", status: "warn", detail: err instanceof Error ? err.message : "check failed" });
  }

  // Tally
  const summary = checks.reduce(
    (acc, c) => ({
      pass: acc.pass + (c.status === "pass" ? 1 : 0),
      warn: acc.warn + (c.status === "warn" ? 1 : 0),
      fail: acc.fail + (c.status === "fail" ? 1 : 0)
    }),
    { pass: 0, warn: 0, fail: 0 }
  );

  return {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    checks,
    summary
  };
}
