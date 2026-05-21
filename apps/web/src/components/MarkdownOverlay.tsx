import React from "react";
import { X } from "lucide-react";
import type { CatalogGuide } from "../api";
import type { Locale } from "../lib/types";

export function renderMarkdownPreview(markdown: string): React.ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  function flushList() {
    if (!list.length) return;
    const items = list;
    list = [];
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
      </ul>
    );
  }

  function flushCode() {
    if (!code.length) return;
    const content = code.join("\n");
    code = [];
    nodes.push(<pre key={`code-${nodes.length}`}><code>{content}</code></pre>);
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      if (level === 1) nodes.push(<h1 key={`h-${nodes.length}`}>{content}</h1>);
      else if (level === 2) nodes.push(<h2 key={`h-${nodes.length}`}>{content}</h2>);
      else nodes.push(<h3 key={`h-${nodes.length}`}>{content}</h3>);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    nodes.push(<p key={`p-${nodes.length}`}>{line}</p>);
  }

  flushList();
  flushCode();
  return nodes;
}

export function MarkdownOverlay({ guide, locale, onClose }: { guide: CatalogGuide; locale: Locale; onClose: () => void }) {
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
          {renderMarkdownPreview(guide.markdown)}
        </section>
      </article>
    </div>
  );
}
