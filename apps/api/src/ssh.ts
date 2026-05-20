/**
 * ssh.ts — 真实 SSH 连接测试与远程系统信息采集
 *
 * 安全边界：
 * - 只执行白名单内的只读命令（uname、free、df、which、node/git/docker --version 等）
 * - 不执行任何写操作或用户传入的任意命令
 * - 连接超时 10 秒，命令超时 8 秒
 * - SSH 私钥只从服务器本地文件系统读取，不接受客户端上传的私钥内容
 */

import { Client, type ConnectConfig } from "ssh2";
import fs from "node:fs/promises";
import type { StoredProbeSnapshot } from "./runtime-store.js";

export interface SshTestResult {
  ok: true;
  latencyMs: number;
  snapshot: StoredProbeSnapshot;
}

export interface SshTestFailure {
  ok: false;
  error: string;
  code: "auth_failed" | "timeout" | "refused" | "host_unreachable" | "key_not_found" | "unknown";
}

export type SshResult = SshTestResult | SshTestFailure;

const CONNECT_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 8_000;

/** 只读采集命令白名单 */
const COLLECT_SCRIPT = `
hostname 2>/dev/null || echo unknown;
uname -s 2>/dev/null || echo unknown;
uname -m 2>/dev/null || echo unknown;
uname -r 2>/dev/null || echo unknown;
nproc 2>/dev/null || echo 0;
cat /proc/cpuinfo 2>/dev/null | grep 'model name' | head -1 | cut -d: -f2 | xargs || echo unknown;
free -b 2>/dev/null | awk '/^Mem:/{print $2, $4}' || echo '0 0';
node --version 2>/dev/null || echo '';
npm --version 2>/dev/null || echo '';
git --version 2>/dev/null || echo '';
docker --version 2>/dev/null || echo '';
python3 --version 2>/dev/null || python --version 2>/dev/null || echo '';
systemctl is-active sshd 2>/dev/null || echo inactive;
env | wc -l 2>/dev/null || echo 0
`.trim();

export async function testSshConnection(
  host: string,
  port: number,
  username: string,
  auth: { type: "password"; password: string } | { type: "key"; privateKeyPath: string; passphrase?: string }
): Promise<SshResult> {
  const start = Date.now();

  // 读取私钥文件（仅服务器本地路径）
  let privateKey: Buffer | undefined;
  if (auth.type === "key") {
    try {
      privateKey = await fs.readFile(auth.privateKeyPath);
    } catch {
      return { ok: false, error: `Private key file not found: ${auth.privateKeyPath}`, code: "key_not_found" };
    }
  }

  return new Promise<SshResult>((resolve) => {
    const conn = new Client();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.destroy();
      resolve({ ok: false, error: "Connection timed out.", code: "timeout" });
    }, CONNECT_TIMEOUT_MS);

    function done(result: SshResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      resolve(result);
    }

    conn.on("error", (err: Error & { code?: string; level?: string }) => {
      let code: SshTestFailure["code"] = "unknown";
      const msg = err.message ?? "";
      if (err.level === "client-authentication" || msg.includes("Authentication")) code = "auth_failed";
      else if (err.code === "ECONNREFUSED") code = "refused";
      else if (err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") code = "host_unreachable";
      else if (err.code === "ETIMEDOUT") code = "timeout";
      done({ ok: false, error: msg, code });
    });

    conn.on("ready", () => {
      // SSH 握手成功，执行只读采集脚本
      conn.exec(COLLECT_SCRIPT, (err, stream) => {
        if (err) {
          done({ ok: false, error: err.message, code: "unknown" });
          return;
        }

        let stdout = "";
        let stderr = "";
        const cmdTimer = setTimeout(() => {
          stream.destroy();
          done({ ok: false, error: "Remote command timed out.", code: "timeout" });
        }, COMMAND_TIMEOUT_MS);

        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        stream.on("close", () => {
          clearTimeout(cmdTimer);
          const latencyMs = Date.now() - start;
          const snapshot = parseCollectOutput(stdout, host);
          done({ ok: true, latencyMs, snapshot });
        });
      });
    });

    const connectConfig: ConnectConfig = {
      host,
      port,
      username,
      readyTimeout: CONNECT_TIMEOUT_MS,
      ...(auth.type === "password"
        ? { password: auth.password }
        : { privateKey, passphrase: auth.passphrase })
    };

    conn.connect(connectConfig);
  });
}

function parseCollectOutput(raw: string, host: string): StoredProbeSnapshot {
  const lines = raw.split("\n").map((l) => l.trim());
  const get = (i: number) => lines[i] ?? "";

  const hostname = get(0) || host;
  const platform = get(1).toLowerCase() || "linux";
  const arch = get(2) || "x64";
  const release = get(3) || "";
  const cores = parseInt(get(4), 10) || 1;
  const cpuModel = get(5) || "unknown";
  const memParts = get(6).split(" ");
  const totalBytes = parseInt(memParts[0], 10) || 0;
  const freeBytes = parseInt(memParts[1], 10) || 0;

  const software: StoredProbeSnapshot["software"] = [];
  const addSoftware = (name: string, raw: string, source: "runtime" | "system" | "npm") => {
    const v = raw.replace(/^(node|npm|git version|Docker version|Python)\s*/i, "").split(/[\s,]/)[0];
    if (v) software.push({ name, version: v, source, status: "synced" });
  };

  if (get(7)) addSoftware("node", get(7), "runtime");
  if (get(8)) addSoftware("npm", get(8), "runtime");
  if (get(9)) addSoftware("git", get(9), "system");
  if (get(10)) addSoftware("docker", get(10), "system");
  if (get(11)) addSoftware("python", get(11), "system");

  const sshStatus = get(12) === "active" ? "healthy" : "warning";
  const envCount = parseInt(get(13), 10) || 0;

  const configChecklist: StoredProbeSnapshot["configChecklist"] = [
    { id: "ssh", label: "SSH service", category: "security", status: sshStatus, lastChanged: new Date().toISOString().slice(0, 10) },
    { id: "env-vars", label: `Environment variables (${envCount} set)`, category: "runtime", status: "healthy", lastChanged: new Date().toISOString().slice(0, 10) }
  ];

  return {
    agentId: `ssh:${host}`,
    collectedAt: new Date().toISOString(),
    system: {
      hostname,
      platform,
      arch,
      release,
      uptime: 0,
      cpu: { model: cpuModel, cores, speedMhz: 0 },
      memory: {
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
        totalGb: (totalBytes / 1024 ** 3).toFixed(1),
        freeGb: (freeBytes / 1024 ** 3).toFixed(1)
      }
    },
    software,
    configChecklist
  };
}
