/**
 * user — 幂等地管理 Linux 系统用户
 *
 * Args:
 *   name: string                  用户名
 *   state: "present" | "absent"
 *   shell?: string                登录 shell（如 /bin/bash）
 *   groups?: string[]             附加组（不含主组）
 *   home?: string                 主目录路径
 *   create_home?: boolean         是否创建主目录（默认 true）
 *   system?: boolean              是否为系统用户
 *   comment?: string              用户描述（GECOS）
 *
 * 行为：
 *   present — 用户不存在则创建，存在则检查属性是否需要更新
 *   absent  — 用户存在则删除（不删除主目录，除非 remove=true）
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface UserArgs {
  name: string;
  state?: "present" | "absent";
  shell?: string;
  groups?: string[];
  home?: string;
  create_home?: boolean;
  system?: boolean;
  comment?: string;
  remove?: boolean;
}

const SAFE_USERNAME = /^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$/;
const SAFE_SHELL = /^\/[a-zA-Z0-9/_-]{1,60}$/;
const SAFE_GROUP = /^[a-zA-Z0-9_-]{1,32}$/;
const SAFE_PATH = /^\/[a-zA-Z0-9._/ -]{1,200}$/;

async function userExists(executor: SshExecutor, name: string): Promise<boolean> {
  const { exitCode } = await executor.exec(`id ${name} >/dev/null 2>&1`);
  return exitCode === 0;
}

export const userModule: AnsibleModule<UserArgs> = {
  name: "user",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    const state = args.state ?? "present";

    if (!SAFE_USERNAME.test(args.name)) {
      return { changed: false, failed: true, msg: `Unsafe username: ${args.name}` };
    }
    if (args.shell && !SAFE_SHELL.test(args.shell)) {
      return { changed: false, failed: true, msg: `Unsafe shell: ${args.shell}` };
    }
    if (args.home && !SAFE_PATH.test(args.home)) {
      return { changed: false, failed: true, msg: `Unsafe home path: ${args.home}` };
    }
    if (args.groups) {
      for (const g of args.groups) {
        if (!SAFE_GROUP.test(g)) {
          return { changed: false, failed: true, msg: `Unsafe group name: ${g}` };
        }
      }
    }

    const exists = await userExists(executor, args.name);

    if (state === "absent") {
      if (!exists) return { changed: false, msg: `User ${args.name} already absent` };
      if (dryRun) return { changed: true, msg: `[dry-run] Would delete user ${args.name}` };
      const removeFlag = args.remove ? "-r" : "";
      const { exitCode, stderr } = await executor.exec(`sudo userdel ${removeFlag} ${args.name}`);
      if (exitCode !== 0) return { changed: false, failed: true, msg: `Failed to delete user ${args.name}`, stderr };
      return { changed: true, msg: `Deleted user ${args.name}` };
    }

    // state === "present"
    if (!exists) {
      if (dryRun) return { changed: true, msg: `[dry-run] Would create user ${args.name}` };

      const parts = ["sudo useradd"];
      if (args.system) parts.push("--system");
      if (args.shell) parts.push(`--shell ${args.shell}`);
      if (args.home) parts.push(`--home-dir ${args.home}`);
      if (args.create_home !== false) parts.push("--create-home");
      if (args.comment) parts.push(`--comment "${args.comment.replace(/"/g, "")}"`);
      if (args.groups?.length) parts.push(`--groups ${args.groups.join(",")}`);
      parts.push(args.name);

      const { exitCode, stderr } = await executor.exec(parts.join(" "));
      if (exitCode !== 0) return { changed: false, failed: true, msg: `Failed to create user ${args.name}`, stderr };
      return { changed: true, msg: `Created user ${args.name}` };
    }

    // User exists — check if groups need updating
    if (args.groups?.length) {
      if (dryRun) return { changed: true, msg: `[dry-run] Would update groups for ${args.name}` };
      const { exitCode, stderr } = await executor.exec(
        `sudo usermod --append --groups ${args.groups.join(",")} ${args.name}`
      );
      if (exitCode !== 0) return { changed: false, failed: true, msg: `Failed to update groups for ${args.name}`, stderr };
      return { changed: true, msg: `Updated groups for ${args.name}` };
    }

    return { changed: false, msg: `User ${args.name} already exists` };
  }
};
