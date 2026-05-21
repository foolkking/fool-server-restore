/**
 * SshExecutor — 封装 ssh2 Client，提供统一的 exec/putFile/getFile/pathExists 接口
 */

import { Client, type SFTPWrapper } from "ssh2";
import type { SshExecutor } from "./types.js";

export class Ssh2Executor implements SshExecutor {
  constructor(private readonly client: Client) {}

  async exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) { reject(err); return; }
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          stream.destroy();
          resolve({ stdout, stderr, exitCode: -1 });
        }, 60_000);
        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        stream.on("close", (code: number) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 0 });
        });
      });
    });
  }

  async putFile(remotePath: string, content: string | Buffer, mode?: string): Promise<void> {
    const sftp = await this.openSftp();
    try {
      await new Promise<void>((resolve, reject) => {
        const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
        const stream = sftp.createWriteStream(remotePath, { mode: mode ? parseInt(mode, 8) : 0o644 });
        stream.on("error", reject);
        stream.on("close", () => resolve());
        stream.end(buf);
      });
    } finally {
      sftp.end();
    }
  }

  async getFile(remotePath: string): Promise<string> {
    const sftp = await this.openSftp();
    try {
      return await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(remotePath);
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    } finally {
      sftp.end();
    }
  }

  async pathExists(remotePath: string): Promise<boolean> {
    const sftp = await this.openSftp();
    try {
      return await new Promise<boolean>((resolve) => {
        sftp.stat(remotePath, (err) => resolve(!err));
      });
    } finally {
      sftp.end();
    }
  }

  private async openSftp(): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }
}
