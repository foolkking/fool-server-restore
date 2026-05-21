/**
 * shell — 执行任意 shell 命令（escape hatch）
 *
 * Args:
 *   cmd: string               要执行的命令
 *   creates?: string          如果该路径已存在，则跳过（实现幂等）
 *   removes?: string          如果该路径不存在，则跳过
 *
 * 警告：shell 模块是逃生口。优先使用 package/service/lineinfile/copy 等专用模块。
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface ShellArgs {
  cmd: string;
  creates?: string;
  removes?: string;
}

// 拒绝明显危险的命令片段
const DANGEROUS = [
  /rm\s+-rf\s+\/[\s$]/,         // rm -rf /
  /:\(\)\s*\{.*\|\s*&\}/,        // fork bomb
  /mkfs\./,                      // 格式化磁盘
  /dd\s+.*of=\/dev\//,           // dd 覆盖设备
];

export const shellModule: AnsibleModule<ShellArgs> = {
  name: "shell",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!args.cmd || typeof args.cmd !== "string") {
      return { changed: false, failed: true, msg: "cmd is required" };
    }
    for (const re of DANGEROUS) {
      if (re.test(args.cmd)) {
        return { changed: false, failed: true, msg: `Refused: command matches dangerous pattern (${re})` };
      }
    }

    // creates: 跳过条件
    if (args.creates) {
      const exists = await executor.pathExists(args.creates);
      if (exists) {
        return { changed: false, msg: `Skipped (creates ${args.creates} already exists)` };
      }
    }
    if (args.removes) {
      const exists = await executor.pathExists(args.removes);
      if (!exists) {
        return { changed: false, msg: `Skipped (removes ${args.removes} does not exist)` };
      }
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would run: ${args.cmd}` };
    }

    const { stdout, stderr, exitCode } = await executor.exec(args.cmd);
    if (exitCode !== 0) {
      return { changed: false, failed: true, msg: `Command failed (exit ${exitCode})`, stdout, stderr };
    }
    return { changed: true, msg: "Command executed", stdout, stderr };
  }
};
