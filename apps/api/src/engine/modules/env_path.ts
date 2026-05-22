/**
 * env_path — 给用户的 shell 添加 PATH 或环境变量，跨 shell 兼容
 *
 * Args:
 *   name?: string             变量名（设 PATH 时填 PATH，加任意 export 时填变量名）
 *   value: string             变量值或要追加的 PATH 段
 *   mode?: "append" | "set"   append: 把 value 追加到现有变量后（仅 PATH 类）
 *                             set:    覆盖变量值（其它环境变量）
 *                             默认 append（更安全，几乎不会覆盖用户已有 PATH）
 *   scope?: "user" | "system" user: 写到 ~/.bashrc / ~/.zshenv / ~/.config/fish/config.fish
 *                             system: 写到 /etc/profile.d/<id>.sh（影响所有用户）
 *                             默认 user（安全）
 *   id?: string               用作 system 模式下的文件名 (/etc/profile.d/<id>.sh)
 *                             以及 user 模式下的"块标签"，方便后续修改/卸载。
 *                             例：id="golang" → /etc/profile.d/golang.sh
 *                             不填则从 name 推断（PATH+/usr/local/go/bin → "golang"
 *                             这种自动推断不准，建议显式填）
 *
 * 行为：
 *   - 幂等：同样的 (name, value) 重复运行不会重复追加
 *   - 跨 shell：bash 写 ~/.bashrc，zsh 写 ~/.zshenv，fish 写 ~/.config/fish/config.fish
 *     （仅当对应 shell 在目标机器存在时写——避免给没装 fish 的机器留垃圾）
 *   - 块标签注释：每段写入都有 "# managed by EnvForge: <id>" 前后包围，方便后续清理
 *
 * 例：
 *   - name: env_path
 *     module: env_path
 *     args:
 *       name: PATH
 *       value: /usr/local/go/bin
 *       mode: append
 *       scope: system
 *       id: golang
 *
 *   - name: env_path
 *     module: env_path
 *     args:
 *       name: NPM_CONFIG_REGISTRY
 *       value: https://registry.npmmirror.com
 *       mode: set
 *       scope: user
 *       id: npm-cn-mirror
 */

import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface EnvPathArgs {
  name?: string;
  value: string;
  mode?: "append" | "set";
  scope?: "user" | "system";
  id?: string;
}

// 安全：name 必须是合法环境变量名，value 不能含 \n（block 标签会被破坏）
const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALID_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** 生成一段带块标签的 shell 代码片段 */
function buildBlock(id: string, name: string, value: string, mode: "append" | "set", shellSyntax: "posix" | "fish"): string {
  if (shellSyntax === "fish") {
    // fish 语法不同：set -gx VAR value
    if (name === "PATH" && mode === "append") {
      return `# >>> envforge: ${id} >>>\nfish_add_path -g ${value}\n# <<< envforge: ${id} <<<`;
    }
    return `# >>> envforge: ${id} >>>\nset -gx ${name} ${value}\n# <<< envforge: ${id} <<<`;
  }
  // POSIX (bash / zsh / sh)
  if (name === "PATH" && mode === "append") {
    // 用 case 防止重复加
    return `# >>> envforge: ${id} >>>
case ":$PATH:" in
  *":${value}:"*) ;;
  *) export PATH="$PATH:${value}" ;;
esac
# <<< envforge: ${id} <<<`;
  }
  return `# >>> envforge: ${id} >>>
export ${name}=${shQuote(value)}
# <<< envforge: ${id} <<<`;
}

/** 简单的 shell 单引号转义。包住 value 防止注入。 */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * 在文件中替换或追加块。块的边界由 "# >>> envforge: <id> >>>" 和
 * "# <<< envforge: <id> <<<" 标记。如果旧块存在则就地替换；不存在则追加到末尾。
 */
async function upsertBlock(
  executor: SshExecutor,
  filePath: string,
  id: string,
  newBlock: string,
  needsSudo: boolean
): Promise<{ changed: boolean; created: boolean }> {
  // 拆成 test 和 cat 两步：避免 "&&"/"||" 导致 stdout 含 echo '' 残余、
  // 也让单元测试里基于子串匹配的 mock 能精确路由。
  const testCmd = needsSudo ? `sudo test -f ${filePath}` : `test -f ${filePath}`;
  const { exitCode: existsCode } = await executor.exec(testCmd);
  let existing = "";
  if (existsCode === 0) {
    const catCmd = needsSudo ? `sudo cat ${filePath}` : `cat ${filePath}`;
    const r = await executor.exec(catCmd);
    existing = r.stdout ?? "";
  }

  const startMark = `# >>> envforge: ${id} >>>`;
  const endMark = `# <<< envforge: ${id} <<<`;
  const existingHasBlock = existing.includes(startMark);

  let next: string;
  if (existingHasBlock) {
    // 替换块
    const re = new RegExp(`${escapeRe(startMark)}[\\s\\S]*?${escapeRe(endMark)}`, "g");
    next = existing.replace(re, newBlock);
    if (next === existing) {
      // 块内容已经一致，不变更
      return { changed: false, created: false };
    }
  } else {
    // 追加到末尾
    const sep = existing && !existing.endsWith("\n") ? "\n" : "";
    next = (existing || "") + sep + "\n" + newBlock + "\n";
  }

  // 写回。需要 sudo 时用 tee。
  // 用 base64 + cat 方式避免 quoting 问题
  const b64 = Buffer.from(next, "utf8").toString("base64");
  const writeCmd = needsSudo
    ? `echo '${b64}' | base64 -d | sudo tee ${filePath} > /dev/null`
    : `mkdir -p $(dirname ${filePath}) && echo '${b64}' | base64 -d > ${filePath}`;
  const r = await executor.exec(writeCmd);
  if (r.exitCode !== 0) throw new Error(`Failed to write ${filePath}: ${r.stderr || "unknown error"}`);

  return { changed: true, created: !existingHasBlock };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const envPathModule: AnsibleModule<EnvPathArgs> = {
  name: "env_path",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!args.value) return { changed: false, failed: true, msg: "value is required" };

    const name = args.name ?? "PATH";
    const mode = args.mode ?? "append";
    const scope = args.scope ?? "user";

    if (!VALID_NAME.test(name)) {
      return { changed: false, failed: true, msg: `Invalid env name: ${name}` };
    }
    if (args.value.includes("\n")) {
      return { changed: false, failed: true, msg: "value cannot contain newlines" };
    }
    const id = args.id ?? deriveId(name, args.value);
    if (!VALID_ID.test(id)) {
      return { changed: false, failed: true, msg: `Invalid id: ${id} (must match ${VALID_ID})` };
    }

    if (dryRun) {
      return {
        changed: true,
        msg: `[dry-run] Would ${mode} ${name}=${args.value} into ${scope} shell config (id=${id})`
      };
    }

    const writes: string[] = [];

    if (scope === "system") {
      // 写到 /etc/profile.d/<id>.sh — 所有 login shell 都会读
      const block = buildBlock(id, name, args.value, mode, "posix");
      const r = await upsertBlock(executor, `/etc/profile.d/${id}.sh`, id, block, /*sudo*/ true);
      if (r.changed) writes.push(`/etc/profile.d/${id}.sh${r.created ? " (created)" : " (updated)"}`);
    } else {
      // user scope: 写 bash + zsh + fish (仅当对应 shell 二进制存在)
      // 用 $HOME 而非 ~ ：远端 cat / test 不展开 ~，需要 shell 替换
      const posixBlock = buildBlock(id, name, args.value, mode, "posix");

      // bash → ~/.bashrc
      const r1 = await upsertBlock(executor, "$HOME/.bashrc", id, posixBlock, false);
      if (r1.changed) writes.push(`~/.bashrc${r1.created ? " (created)" : " (updated)"}`);

      // zsh: 检测 ~/.zshrc 或 zsh 二进制存在再写
      const { exitCode: hasZsh } = await executor.exec("command -v zsh >/dev/null 2>&1");
      if (hasZsh === 0) {
        // zsh 推荐用 ~/.zshenv（所有 zsh 调用都读，不依赖 interactive/login）
        const r2 = await upsertBlock(executor, "$HOME/.zshenv", id, posixBlock, false);
        if (r2.changed) writes.push(`~/.zshenv${r2.created ? " (created)" : " (updated)"}`);
      }

      // fish: 仅当装了 fish 才写
      const { exitCode: hasFish } = await executor.exec("command -v fish >/dev/null 2>&1");
      if (hasFish === 0) {
        const fishBlock = buildBlock(id, name, args.value, mode, "fish");
        const r3 = await upsertBlock(executor, "$HOME/.config/fish/config.fish", id, fishBlock, false);
        if (r3.changed) writes.push(`fish config${r3.created ? " (created)" : " (updated)"}`);
      }
    }

    if (writes.length === 0) {
      return { changed: false, msg: `No change — block "${id}" already up to date` };
    }
    return {
      changed: true,
      msg: `${mode} ${name} (${scope}) → ${writes.join(", ")}`
    };
  }
};

/** 从 name + value 推断一个 id；用户没填 id 时的兜底（不太精确，建议显式填） */
function deriveId(name: string, value: string): string {
  const last = value.split("/").filter(Boolean).pop() ?? "";
  const safe = (name + "-" + last).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return safe.replace(/^-+|-+$/g, "").slice(0, 40) || "envforge-env";
}
