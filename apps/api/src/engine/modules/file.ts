/**
 * file — 幂等地管理远程文件和目录
 *
 * Args:
 *   path: string                  目标路径
 *   state: "directory" | "file" | "absent" | "touch"
 *   mode?: string                 权限（八进制字符串，如 "0755"）
 *   owner?: string                文件所有者
 *   recurse?: boolean             state=directory 时递归创建
 *
 * 行为：
 *   directory — 确保目录存在（mkdir -p）
 *   file      — 确保文件存在（touch，不修改内容）
 *   absent    — 确保路径不存在（rm -rf）
 *   touch     — 更新 mtime（touch）
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface FileArgs {
  path: string;
  state: "directory" | "file" | "absent" | "touch";
  mode?: string;
  owner?: string;
  recurse?: boolean;
}

const SAFE_PATH = /^[~]?\/?[a-zA-Z0-9._/ -]{1,200}$/;

function isPathSafe(path: string): boolean {
  if (!SAFE_PATH.test(path)) return false;
  if (path.includes("..")) return false;
  return true;
}
const SAFE_MODE = /^[0-7]{3,4}$/;
const SAFE_OWNER = /^[a-zA-Z0-9._-]{1,32}$/;

export const fileModule: AnsibleModule<FileArgs> = {
  name: "file",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!isPathSafe(args.path)) {
      return { changed: false, failed: true, msg: `Unsafe path: ${args.path}` };
    }
    if (args.mode && !SAFE_MODE.test(args.mode)) {
      return { changed: false, failed: true, msg: `Invalid mode: ${args.mode}` };
    }
    if (args.owner && !SAFE_OWNER.test(args.owner)) {
      return { changed: false, failed: true, msg: `Invalid owner: ${args.owner}` };
    }

    // Expand ~
    let path = args.path;
    if (path.startsWith("~")) {
      const { stdout } = await executor.exec("echo $HOME");
      path = path.replace(/^~/, stdout.trim());
    }

    const sudo = path.startsWith("/etc/") || path.startsWith("/usr/") || path.startsWith("/var/") || path.startsWith("/opt/");

    const exists = await executor.pathExists(path);

    if (args.state === "absent") {
      if (!exists) return { changed: false, msg: `${path} already absent` };
      if (dryRun) return { changed: true, msg: `[dry-run] Would remove ${path}` };
      const { exitCode, stderr } = await executor.exec(sudo ? `sudo rm -rf ${path}` : `rm -rf ${path}`);
      if (exitCode !== 0) return { changed: false, failed: true, msg: `Failed to remove ${path}`, stderr };
      return { changed: true, msg: `Removed ${path}` };
    }

    if (args.state === "directory") {
      if (exists) {
        const { exitCode } = await executor.exec(`test -d ${path}`);
        if (exitCode === 0) {
          if (args.mode || args.owner) {
            if (!dryRun) await applyModeOwner(executor, path, args.mode, args.owner, sudo);
          }
          return { changed: false, msg: `Directory ${path} already exists` };
        }
      }
      if (dryRun) return { changed: true, msg: `[dry-run] Would create directory ${path}` };
      const { exitCode, stderr } = await executor.exec(sudo ? `sudo mkdir -p ${path}` : `mkdir -p ${path}`);
      if (exitCode !== 0) return { changed: false, failed: true, msg: `Failed to create directory ${path}`, stderr };
      if (args.mode || args.owner) await applyModeOwner(executor, path, args.mode, args.owner, sudo);
      return { changed: true, msg: `Created directory ${path}` };
    }

    if (args.state === "file" || args.state === "touch") {
      if (exists && args.state === "file") {
        if (args.mode || args.owner) {
          if (!dryRun) await applyModeOwner(executor, path, args.mode, args.owner, sudo);
        }
        return { changed: false, msg: `File ${path} already exists` };
      }
      if (dryRun) return { changed: true, msg: `[dry-run] Would touch ${path}` };
      const { exitCode, stderr } = await executor.exec(sudo ? `sudo touch ${path}` : `touch ${path}`);
      if (exitCode !== 0) return { changed: false, failed: true, msg: `Failed to touch ${path}`, stderr };
      if (args.mode || args.owner) await applyModeOwner(executor, path, args.mode, args.owner, sudo);
      return { changed: true, msg: `Touched ${path}` };
    }

    return { changed: false, failed: true, msg: `Unknown state: ${args.state}` };
  }
};

async function applyModeOwner(executor: SshExecutor, path: string, mode?: string, owner?: string, sudo?: boolean): Promise<void> {
  const s = sudo ? "sudo " : "";
  if (mode) await executor.exec(`${s}chmod ${mode} ${path}`);
  if (owner) await executor.exec(`sudo chown ${owner} ${path}`);
}
