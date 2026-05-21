/**
 * lineinfile — 幂等地编辑配置文件中的某一行
 *
 * Args:
 *   path: string              文件路径（例如 ~/.bashrc, /etc/ssh/sshd_config）
 *   line: string              目标行内容（必须）
 *   regexp?: string           匹配现有行的正则（用于替换）
 *   state?: "present" | "absent"   present = 确保行存在，absent = 删除匹配行
 *   create?: boolean          state=present 时，文件不存在则创建
 *   backup?: boolean          编辑前备份文件（.bak 后缀）
 *
 * 行为（state=present）：
 *   1. 读取文件内容（系统路径用 sudo cat）
 *   2. 如果文件不存在且 create=true，则创建只含 line 的文件
 *   3. 如果有 regexp，找到匹配行并替换为 line（如果已经相同则不变）
 *   4. 如果没有 regexp，且 line 已经存在则不变；否则追加到末尾
 *   5. 写回文件（系统路径用 sudo tee）
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface LineInFileArgs {
  path: string;
  line?: string;
  regexp?: string;
  state?: "present" | "absent";
  create?: boolean;
  backup?: boolean;
}

const SAFE_PATH = /^[~]?\/?[a-zA-Z0-9._/-]{1,200}$/;

/** Paths that require sudo to read/write */
function needsSudo(path: string): boolean {
  return path.startsWith("/etc/") || path.startsWith("/usr/") || path.startsWith("/var/");
}

function expandHome(path: string, home: string): string {
  if (path.startsWith("~/")) return `${home}${path.slice(1)}`;
  if (path === "~") return home;
  return path;
}

export const lineinfileModule: AnsibleModule<LineInFileArgs> = {
  name: "lineinfile",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    const state = args.state ?? "present";

    if (!SAFE_PATH.test(args.path)) {
      return { changed: false, failed: true, msg: `Unsafe path: ${args.path}` };
    }
    if (state === "present" && !args.line) {
      return { changed: false, failed: true, msg: "line is required when state=present" };
    }

    // Resolve ~ via remote $HOME
    let path = args.path;
    if (path.startsWith("~")) {
      const { stdout } = await executor.exec("echo $HOME");
      const home = stdout.trim();
      path = expandHome(path, home);
    }

    const sudo = needsSudo(path);

    // Check if file exists
    const { exitCode: existsCode } = await executor.exec(sudo ? `sudo test -f ${path} && echo yes` : `test -f ${path} && echo yes`);
    const exists = existsCode === 0;

    // Read existing content
    let content = "";
    if (exists) {
      const { stdout, exitCode } = await executor.exec(sudo ? `sudo cat ${path}` : `cat ${path}`);
      if (exitCode !== 0) {
        return { changed: false, failed: true, msg: `Cannot read ${path}: permission denied or error` };
      }
      content = stdout;
    } else if (state === "present" && !args.create) {
      return { changed: false, failed: true, msg: `File does not exist and create=false: ${path}` };
    } else if (state === "absent") {
      return { changed: false, msg: `File does not exist; nothing to remove: ${path}` };
    }

    const lines = content.length > 0 ? content.split(/\r?\n/) : [];
    // Remove trailing empty line from split if content ends with \n
    if (lines.length > 0 && lines[lines.length - 1] === "" && content.endsWith("\n")) {
      lines.pop();
    }
    const targetLine = args.line ?? "";
    let newLines = [...lines];
    let changed = false;

    if (state === "present") {
      if (args.regexp) {
        const re = new RegExp(args.regexp);
        let replaced = false;
        newLines = newLines.map((ln) => {
          if (!replaced && re.test(ln)) {
            replaced = true;
            if (ln !== targetLine) changed = true;
            return targetLine;
          }
          return ln;
        });
        if (!replaced) {
          // No match: append
          newLines.push(targetLine);
          changed = true;
        }
      } else {
        if (!lines.includes(targetLine)) {
          newLines.push(targetLine);
          changed = true;
        }
      }
    } else {
      // state=absent
      const re = args.regexp ? new RegExp(args.regexp) : null;
      const before = newLines.length;
      newLines = newLines.filter((ln) => re ? !re.test(ln) : ln !== targetLine);
      if (newLines.length !== before) changed = true;
    }

    if (!changed) {
      return { changed: false, msg: `${path} already in desired state` };
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would update ${path}` };
    }

    // Backup if requested
    if (args.backup && exists) {
      await executor.exec(sudo ? `sudo cp ${path} ${path}.bak` : `cp ${path} ${path}.bak`);
    }

    // Write new content using sudo tee for system paths, or direct SFTP for user paths
    const newContent = newLines.join("\n") + "\n";
    if (sudo) {
      // Use heredoc with sudo tee to write system files
      const escaped = newContent.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
      const { exitCode, stderr } = await executor.exec(`printf '%s' '${escaped}' | sudo tee ${path} > /dev/null`);
      if (exitCode !== 0) {
        return { changed: false, failed: true, msg: `Cannot write ${path}: ${stderr || "permission denied"}` };
      }
    } else {
      try {
        await executor.putFile(path, newContent);
      } catch (err) {
        return { changed: false, failed: true, msg: `Cannot write ${path}: ${err instanceof Error ? err.message : err}` };
      }
    }

    return { changed: true, msg: `Updated ${path}` };
  }
};
