/**
 * shell — 执行任意 shell 命令（escape hatch）
 *
 * Args:
 *   cmd: string               要执行的命令
 *   creates?: string          如果该路径已存在，则跳过（实现幂等）
 *   removes?: string          如果该路径不存在，则跳过
 *   login?: boolean           默认 false（向后兼容）。设 true 时命令在 `bash -l -c`
 *                             下执行，自动 source /etc/profile + ~/.profile + ~/.bashrc
 *                             + /etc/profile.d/*，让用户写过的 PATH / 环境变量在 cmd 里可见。
 *
 * 警告：shell 模块是逃生口。优先使用 package/service/lineinfile/copy 等专用模块。
 *
 * 关于 login shell（重要）：
 *   普通 SSH 命令（ssh user@host 'cmd'）跑的是 non-login non-interactive shell——
 *   /etc/profile 和 ~/.bashrc 都不会被 source。这导致：
 *     1. 装完 nvm/cargo/go 后，下一个 task 仍然找不到对应命令
 *     2. 用户在 ~/.bashrc 设的环境变量在 task 里看不到
 *
 *   遇到这种场景时，给 task 加 `login: true`，shell 模块会用 `bash -l -c` 启动，
 *   bash 会读 /etc/profile，而 /etc/profile（在 Ubuntu）又会触发 ~/.profile → ~/.bashrc 的链式加载。
 *
 *   不默认 true 是为了向后兼容：旧 Playbook 可能依赖 non-login 环境的纯净状态。
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface ShellArgs {
  cmd: string;
  creates?: string;
  removes?: string;
  login?: boolean;
}

// 拒绝明显危险的命令片段
const DANGEROUS = [
  /rm\s+-rf\s+\/[\s$]/,         // rm -rf /
  /:\(\)\s*\{.*\|\s*&\}/,        // fork bomb
  /mkfs\./,                      // 格式化磁盘
  /dd\s+.*of=\/dev\//,           // dd 覆盖设备
];

/**
 * 包装命令为 login shell 调用。把 cmd 编码为 base64 然后让 bash -l -c
 * 解码再执行，避免 cmd 内的引号/特殊字符冲突。
 *
 * 用 base64 而不是直接 'bash -lc "..."' 是因为用户的 cmd 可能含任意单/双引号、
 * heredoc、$、反引号等，任何字符串拼接都有 quoting 地狱。
 */
function wrapAsLoginShell(cmd: string): string {
  const b64 = Buffer.from(cmd, "utf8").toString("base64");
  // bash -l -c 启用 login 行为；外层 sh -c 让 bash 命令本身能在最少假设下执行。
  // 写法：先用 base64 -d 还原，再 pipe 给 bash -l 执行。
  return `bash -l -c "$(echo ${b64} | base64 -d)"`;
}

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

    // login 默认 false（向后兼容）：显式 login: true 才包装为 login shell
    const useLogin = args.login === true;
    const finalCmd = useLogin ? wrapAsLoginShell(args.cmd) : args.cmd;

    const { stdout, stderr, exitCode } = await executor.exec(finalCmd);
    if (exitCode !== 0) {
      return { changed: false, failed: true, msg: `Command failed (exit ${exitCode})`, stdout, stderr };
    }
    return { changed: true, msg: "Command executed", stdout, stderr };
  }
};
