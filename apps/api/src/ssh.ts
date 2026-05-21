/**
 * ssh.ts — 真实 SSH 连接测试与远程系统信息采集
 *
 * 安全边界：
 * - 只执行白名单内的只读命令
 * - 不执行任何写操作或用户传入的任意命令
 * - 连接超时 10 秒
 * - SSH 私钥支持两种方式：服务器本地文件路径 OR 用户通过 Web 上传（加密存储在 data/keys/）
 *
 * 采集方式：使用 remote-collector.ts 的全面采集脚本（dpkg/rpm/snap/flatpak/npm/pip/gem/cargo/
 * /usr/local/bin//opt/nvm/pyenv/rbenv/asdf/docker/systemd 等）
 */

import { Client, type ConnectConfig } from "ssh2";
import fs from "node:fs/promises";
import type { StoredProbeSnapshot } from "./runtime-store.js";
import { collectRemoteSnapshot, type FullSystemSnapshot } from "./collectors/remote-collector.js";

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

/**
 * 测试 SSH 连接并采集全面的系统信息。
 * 使用 remote-collector 的 ===SECTION=== 分隔符方式，一次 exec 采集所有数据。
 */
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
      // SSH 握手成功，使用全面采集器
      collectRemoteSnapshot(conn, host)
        .then((fullSnapshot) => {
          const latencyMs = Date.now() - start;
          const snapshot = fullSnapshotToStored(fullSnapshot);
          done({ ok: true, latencyMs, snapshot });
        })
        .catch((err) => {
          done({ ok: false, error: err instanceof Error ? err.message : "Collection failed", code: "unknown" });
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

/**
 * 使用内存中的私钥内容进行 SSH 连接测试（用于 Web 上传的密钥）
 */
export async function testSshConnectionWithContent(
  host: string,
  port: number,
  username: string,
  privateKeyContent: string,
  passphrase?: string
): Promise<SshResult> {
  const start = Date.now();

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
      collectRemoteSnapshot(conn, host)
        .then((fullSnapshot) => {
          const latencyMs = Date.now() - start;
          const snapshot = fullSnapshotToStored(fullSnapshot);
          done({ ok: true, latencyMs, snapshot });
        })
        .catch((err) => {
          done({ ok: false, error: err instanceof Error ? err.message : "Collection failed", code: "unknown" });
        });
    });

    const cfg: ConnectConfig = {
      host,
      port,
      username,
      readyTimeout: CONNECT_TIMEOUT_MS,
      privateKey: Buffer.from(privateKeyContent, "utf8"),
      ...(passphrase ? { passphrase } : {})
    };

    conn.connect(cfg);
  });
}

/**
 * 将 FullSystemSnapshot 转换为 StoredProbeSnapshot（兼容现有存储格式）
 */
function fullSnapshotToStored(full: FullSystemSnapshot): StoredProbeSnapshot {
  return {
    agentId: full.agentId,
    collectedAt: full.collectedAt,
    system: full.system,
    software: full.software.map((s) => ({
      name: s.name,
      version: s.version,
      source: s.source,
      status: s.status
    })),
    configChecklist: full.configChecklist,
    counts: full.counts
  };
}
