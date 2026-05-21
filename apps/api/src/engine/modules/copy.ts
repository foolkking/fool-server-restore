/**
 * copy — 上传文件内容到目标（支持 sudo 写入系统路径）
 *
 * Args:
 *   content: string           文件内容（与 src 二选一）
 *   src?: string              本地文件路径（暂未实现，仅支持 content）
 *   dest: string              远程目标路径
 *   mode?: string             文件权限（八进制字符串，如 "0644"）
 *   backup?: boolean          覆盖前备份
 *
 * 幂等性：先比较远程现有文件内容，相同则不写入。
 * 权限：/etc/ /usr/ /var/ 路径自动使用 sudo。
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";
import crypto from "node:crypto";

interface CopyArgs {
  content?: string;
  src?: string;
  dest: string;
  mode?: string;
  backup?: boolean;
}

const SAFE_PATH = /^[~]?\/?[a-zA-Z0-9._/-]{1,200}$/;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function needsSudo(path: string): boolean {
  return path.startsWith("/etc/") || path.startsWith("/usr/") || path.startsWith("/var/");
}

export const copyModule: AnsibleModule<CopyArgs> = {
  name: "copy",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!SAFE_PATH.test(args.dest)) {
      return { changed: false, failed: true, msg: `Unsafe dest: ${args.dest}` };
    }
    if (args.content === undefined) {
      return { changed: false, failed: true, msg: "Currently only 'content' is supported (not 'src')" };
    }

    // Expand ~
    let dest = args.dest;
    if (dest.startsWith("~")) {
      const { stdout } = await executor.exec("echo $HOME");
      dest = dest.replace(/^~/, stdout.trim());
    }

    const sudo = needsSudo(dest);

    // Compare existing
    const { exitCode: existsCode } = await executor.exec(sudo ? `sudo test -f ${dest} && echo yes` : `test -f ${dest} && echo yes`);
    const exists = existsCode === 0;

    if (exists) {
      try {
        const { stdout } = await executor.exec(sudo ? `sudo cat ${dest}` : `cat ${dest}`);
        if (sha256(stdout) === sha256(args.content)) {
          return { changed: false, msg: `${dest} already has identical content` };
        }
      } catch {
        // proceed to overwrite
      }
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would write ${args.content.length} bytes to ${dest}` };
    }

    // Auto-backup before overwrite (stable .envforge.bak suffix; only writes once).
    if (args.backup !== false && exists) {
      const bakPath = `${dest}.envforge.bak`;
      const checkBakCmd = sudo ? `sudo test -f ${bakPath} && echo yes` : `test -f ${bakPath} && echo yes`;
      const { exitCode: bakExists } = await executor.exec(checkBakCmd);
      if (bakExists !== 0) {
        const cpCmd = sudo ? `sudo cp -p ${dest} ${bakPath}` : `cp -p ${dest} ${bakPath}`;
        await executor.exec(cpCmd);
      }
    }

    // Write content
    if (sudo) {
      // Use base64 encoding to safely transfer content via sudo
      const b64 = Buffer.from(args.content, "utf8").toString("base64");
      const { exitCode, stderr } = await executor.exec(`echo '${b64}' | base64 -d | sudo tee ${dest} > /dev/null`);
      if (exitCode !== 0) {
        return { changed: false, failed: true, msg: `Cannot write ${dest}: ${stderr || "permission denied"}` };
      }
    } else {
      try {
        await executor.putFile(dest, args.content, args.mode);
      } catch (err) {
        return { changed: false, failed: true, msg: `SFTP write failed: ${err instanceof Error ? err.message : err}` };
      }
    }

    if (args.mode) {
      await executor.exec(sudo ? `sudo chmod ${args.mode} ${dest}` : `chmod ${args.mode} ${dest}`);
    }

    return { changed: true, msg: `Wrote ${args.content.length} bytes to ${dest}` };
  }
};
