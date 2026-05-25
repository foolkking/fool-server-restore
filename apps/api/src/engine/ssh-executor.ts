/**
 * SshExecutor — 封装 ssh2 Client，提供统一的 exec/putFile/getFile/pathExists 接口
 *
 * 优化点：
 *   1. 增加 SFTP 管道复用缓存 (sftpPromise)，避免每次调用 get/put/exists 重复建立连接
 *   2. 支持动态 timeout（未指定时默认为极安全的 10 分钟 600,000ms，取代原硬编码 60s）
 *   3. 自动注入 DEBIAN_FRONTEND=noninteractive 防止包管理器交互式 prompt 挂起
 */

import { Client, type SFTPWrapper } from "ssh2";
import type { SshExecutor } from "./types.js";

export class Ssh2Executor implements SshExecutor {
  private sftpPromise: Promise<SFTPWrapper> | null = null;

  constructor(private readonly client: Client) {}

  async exec(command: string, timeout?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // 注入非交互式环境参数防止包安装等卡在交互界面
    let finalCommand = command;
    if (command.includes("apt ") || command.includes("apt-get ")) {
      finalCommand = `DEBIAN_FRONTEND=noninteractive ${command}`;
    }

    const execTimeout = timeout ?? 600_000; // 默认 10 分钟

    return new Promise((resolve, reject) => {
      this.client.exec(finalCommand, (err, stream) => {
        if (err) { reject(err); return; }
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          stream.destroy();
          resolve({ stdout, stderr, exitCode: -1 });
        }, execTimeout);

        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        stream.on("close", (code: number) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 0 });
        });
      });
    });
  }

  private getSftp(): Promise<SFTPWrapper> {
    if (!this.sftpPromise) {
      this.sftpPromise = new Promise((resolve, reject) => {
        this.client.sftp((err, sftp) => {
          if (err) reject(err);
          else resolve(sftp);
        });
      });
    }
    return this.sftpPromise;
  }

  async putFile(remotePath: string, content: string | Buffer, mode?: string): Promise<void> {
    const sftp = await this.getSftp();
    await new Promise<void>((resolve, reject) => {
      const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
      const stream = sftp.createWriteStream(remotePath, { mode: mode ? parseInt(mode, 8) : 0o644 });
      stream.on("error", reject);
      stream.on("close", () => resolve());
      stream.end(buf);
    });
  }

  async getFile(remotePath: string): Promise<string> {
    const sftp = await this.getSftp();
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }

  async pathExists(remotePath: string): Promise<boolean> {
    const sftp = await this.getSftp();
    return await new Promise<boolean>((resolve) => {
      sftp.stat(remotePath, (err) => resolve(!err));
    });
  }

  /**
   * 关闭释放缓存的 SFTP 连接通道
   */
  async close(): Promise<void> {
    if (this.sftpPromise) {
      try {
        const sftp = await this.sftpPromise;
        sftp.end();
      } catch {
        // 忽略关闭时的异常
      }
      this.sftpPromise = null;
    }
  }
}
