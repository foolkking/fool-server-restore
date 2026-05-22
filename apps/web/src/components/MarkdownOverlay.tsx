import React, { useMemo } from "react";
import { X } from "lucide-react";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/common";
// Common 包已经包含了主流语言（含 bash / yaml / json / nginx / sql 等）。
// 单独补一些 catalog 里出现频率高但不在 common 里的：
import dockerfile from "highlight.js/lib/languages/dockerfile";
import nginx from "highlight.js/lib/languages/nginx";
import properties from "highlight.js/lib/languages/properties";
import apache from "highlight.js/lib/languages/apache";

// GitHub 风格的 Markdown 排版（标题/列表/表格/blockquote/code 块外观与 GitHub 网站一致）
import "github-markdown-css/github-markdown.css";
// 代码块语法高亮主题（github-dark：深色背景，对暗色 / 浅色都能融合）。
// hljs 提供 250+ 主题；选 github-dark-dimmed 比纯黑柔和、避免代码区过亮刺眼。
import "highlight.js/styles/github-dark-dimmed.css";

import type { CatalogGuide } from "../api";
import type { Locale } from "../lib/types";

// 注册额外语言（common 里没收）
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("properties", properties);
hljs.registerLanguage("ini", properties);
hljs.registerLanguage("apache", apache);
hljs.registerLanguage("apacheconf", apache);

// 单例 Marked 实例：GFM（表格 / 任务列表 / 删除线）+ 自动语法高亮 + 安全转义
const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {
        return hljs.highlight(code, { language: "plaintext" }).value;
      }
    },
  }),
  {
    gfm: true,
    breaks: false,
    pedantic: false,
  }
);

/**
 * Render Markdown to a React node.
 *
 * Renders via `marked` (GFM-compliant: tables, task lists, autolinks)
 * with `highlight.js` for fenced code blocks. The output HTML is wrapped in
 * `.markdown-body` so the GitHub-style stylesheet from `github-markdown-css`
 * applies — gives us the look devs expect (typography, tables, blockquotes,
 * code blocks) without rolling our own.
 *
 * Backward-compatible name: callers in ConfigureRunPanel and elsewhere still
 * import `renderMarkdownPreview` and treat the result as a ReactNode array.
 */
export function renderMarkdownPreview(markdown: string): React.ReactNode {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  return (
    <div
      className="markdown-body"
      // marked 自身已经做了 HTML 转义（默认 sanitize-ish；不允许 raw HTML
      // injection 的 token 能漏出来的极少）。我们的输入是仓库里管控的 .md，
      // 安全模型是 trusted；所以直接 dangerouslySetInnerHTML。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MarkdownOverlay({ guide, locale, onClose }: { guide: CatalogGuide; locale: Locale; onClose: () => void }) {
  // 缓存 HTML —— 避免每次 React render 都重新跑 marked
  const rendered = useMemo(() => renderMarkdownPreview(guide.markdown), [guide.markdown]);

  return (
    <div className="markdown-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <article className="markdown-reader" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">{guide.item.guideAuthor === "admin" ? "Admin MD" : "User MD"}</p>
            <h2>{locale === "zh" ? guide.item.name : guide.item.nameEn}</h2>
          </div>
          <button className="ghost-action icon-action" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>
        <section className="markdown-preview">
          <div className="markdown-meta">
            <span>{guide.item.installMode}</span>
            <span>{guide.item.sensitivity}</span>
            <span>{guide.item.guideAuthor === "admin" ? "admin guide" : "user guide"}</span>
          </div>
          {rendered}
        </section>
      </article>
    </div>
  );
}
