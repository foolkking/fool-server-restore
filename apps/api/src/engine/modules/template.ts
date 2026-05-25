/**
 * template — 渲染 Jinja2-lite 模板并上传到目标机器
 *
 * Args:
 *   content: string               模板内容（与 src 二选一）
 *   src?: string                  本地模板文件路径（暂未实现）
 *   dest: string                  远程目标路径
 *   vars?: Record<string, unknown> 模板变量（补充 playbook vars）
 *   mode?: string                 文件权限
 *   backup?: boolean              覆盖前备份
 *
 * 模板语法（Jinja2-lite 子集）：
 *   {{ var_name }}                变量替换
 *   {% if condition %}...{% endif %} 条件块（简单布尔）
 *   {% for item in list %}...{% endfor %} 循环
 *   {# comment #}                 注释（渲染时删除）
 *
 * 幂等性：先比较渲染后的内容与远程文件，相同则不写入。
 */

import crypto from "node:crypto";
import type { AnsibleModule, ModuleResult, SshExecutor } from "../types.js";

interface TemplateArgs {
  content?: string;
  src?: string;
  dest: string;
  vars?: Record<string, unknown>;
  mode?: string;
  backup?: boolean;
}

const SAFE_PATH = /^[~]?\/?[a-zA-Z0-9._/ -]{1,200}$/;

function isPathSafe(path: string): boolean {
  if (!SAFE_PATH.test(path)) return false;
  // Reject path traversal
  if (path.includes("..")) return false;
  return true;
}

import { renderTemplate } from "../template-parser.js";


function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

export const templateModule: AnsibleModule<TemplateArgs> = {
  name: "template",
  async run(executor, args, dryRun): Promise<ModuleResult> {
    if (!isPathSafe(args.dest)) {
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

    // Render template
    const rendered = renderTemplate(args.content, args.vars ?? {});

    const sudo = dest.startsWith("/etc/") || dest.startsWith("/usr/") || dest.startsWith("/var/");

    // Compare with existing
    let exists = false;
    let existingContent = "";
    if (sudo) {
      const { exitCode } = await executor.exec(`sudo test -f ${dest} && echo yes`);
      exists = exitCode === 0;
      if (exists) {
        const { stdout } = await executor.exec(`sudo cat ${dest}`);
        existingContent = stdout;
      }
    } else {
      exists = await executor.pathExists(dest);
      if (exists) {
        try { existingContent = await executor.getFile(dest); } catch { /* proceed */ }
      }
    }

    if (exists && sha256(existingContent) === sha256(rendered)) {
      return { changed: false, msg: `${dest} already has identical rendered content` };
    }

    if (dryRun) {
      return { changed: true, msg: `[dry-run] Would write rendered template (${rendered.length} bytes) to ${dest}` };
    }

    if (args.backup && exists) {
      await executor.exec(sudo ? `sudo cp ${dest} ${dest}.bak` : `cp ${dest} ${dest}.bak`);
    }

    if (sudo) {
      const b64 = Buffer.from(rendered, "utf8").toString("base64");
      const { exitCode, stderr } = await executor.exec(`echo '${b64}' | base64 -d | sudo tee ${dest} > /dev/null`);
      if (exitCode !== 0) {
        return { changed: false, failed: true, msg: `Cannot write ${dest}: ${stderr || "permission denied"}` };
      }
    } else {
      try {
        await executor.putFile(dest, rendered, args.mode);
      } catch (err) {
        return { changed: false, failed: true, msg: `SFTP write failed: ${err instanceof Error ? err.message : err}` };
      }
    }

    if (args.mode) {
      await executor.exec(sudo ? `sudo chmod ${args.mode} ${dest}` : `chmod ${args.mode} ${dest}`);
    }

    return { changed: true, msg: `Rendered and wrote template to ${dest} (${rendered.length} bytes)` };
  }
};
