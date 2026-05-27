import React, { useEffect, useMemo, useState } from "react";
import { Flag, Heart, MessageSquare, Send, X } from "lucide-react";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import nginx from "highlight.js/lib/languages/nginx";
import properties from "highlight.js/lib/languages/properties";
import apache from "highlight.js/lib/languages/apache";
import "github-markdown-css/github-markdown.css";
import "highlight.js/styles/github-dark-dimmed.css";

import {
  fetchCatalogComments,
  postCatalogComment,
  reportCatalogComment,
  submitSuggestion,
  toggleCommentLike,
  type CatalogComment,
  type CatalogGuide,
  type CommentCursor
} from "../api";
import type { Locale } from "../lib/types";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("properties", properties);
hljs.registerLanguage("ini", properties);
hljs.registerLanguage("apache", apache);
hljs.registerLanguage("apacheconf", apache);

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    }
  }),
  { gfm: true, breaks: false, pedantic: false }
);

const allowedProtocols = new Set(["http:", "https:", "mailto:"]);

function filterMarkdownLinks(html: string) {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const anchor of Array.from(doc.querySelectorAll("a"))) {
    const raw = anchor.getAttribute("href") ?? "";
    try {
      const url = new URL(raw, window.location.origin);
      if (!allowedProtocols.has(url.protocol)) anchor.setAttribute("href", "#");
    } catch {
      anchor.setAttribute("href", "#");
    }
    anchor.setAttribute("rel", "noopener noreferrer");
    anchor.setAttribute("target", "_blank");
  }
  return doc.body.innerHTML;
}

export function renderMarkdownPreview(markdown: string): React.ReactNode {
  const html = filterMarkdownLinks(marked.parse(markdown ?? "", { async: false }) as string);
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MarkdownOverlay({
  guide,
  locale,
  authToken,
  onClose
}: {
  guide: CatalogGuide;
  locale: Locale;
  authToken?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"guide" | "comments" | "suggest">("guide");
  const rendered = useMemo(() => renderMarkdownPreview(guide.markdown), [guide.markdown]);

  return (
    <div className="markdown-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <article className="markdown-reader community-reader" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">{guide.item.guideAuthor === "admin" ? "Admin MD" : "User MD"}</p>
            <h2>{locale === "zh" ? guide.item.name : guide.item.nameEn}</h2>
          </div>
          <button className="ghost-action icon-action" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>
        <nav className="markdown-tabs" aria-label={locale === "zh" ? "文档协作" : "Document collaboration"}>
          <button className={tab === "guide" ? "active" : ""} type="button" onClick={() => setTab("guide")}>MD</button>
          <button className={tab === "comments" ? "active" : ""} type="button" onClick={() => setTab("comments")}><MessageSquare aria-hidden />{locale === "zh" ? "评论" : "Comments"}</button>
          <button className={tab === "suggest" ? "active" : ""} type="button" onClick={() => setTab("suggest")}><Send aria-hidden />{locale === "zh" ? "建议" : "Suggest"}</button>
        </nav>

        {tab === "guide" ? (
          <section className="markdown-preview">
            <div className="markdown-meta">
              <span>{guide.item.installMode}</span>
              <span>{guide.item.sensitivity}</span>
              <span>{guide.item.guideAuthor === "admin" ? "admin guide" : "user guide"}</span>
            </div>
            {rendered}
          </section>
        ) : null}
        {tab === "comments" ? <CommentsPane guide={guide} locale={locale} authToken={authToken} /> : null}
        {tab === "suggest" ? <SuggestionPane guide={guide} locale={locale} authToken={authToken} /> : null}
      </article>
    </div>
  );
}

function CommentsPane({ guide, locale, authToken }: { guide: CatalogGuide; locale: Locale; authToken?: string }) {
  const [comments, setComments] = useState<CatalogComment[]>([]);
  const [cursor, setCursor] = useState<CommentCursor | undefined>();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load(next?: CommentCursor) {
    setLoading(true);
    setMessage("");
    try {
      const result = await fetchCatalogComments(guide.item.id, authToken, next);
      setComments((prev) => next ? [...prev, ...result.comments] : result.comments);
      setCursor(result.nextCursor);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [guide.item.id, authToken]);

  async function post() {
    if (!authToken || !content.trim()) return;
    setLoading(true);
    try {
      const created = await postCatalogComment(authToken, guide.item.id, content.trim());
      setComments((prev) => [created, ...prev]);
      setContent("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Post failed");
    } finally {
      setLoading(false);
    }
  }

  async function like(comment: CatalogComment) {
    if (!authToken) return;
    const result = await toggleCommentLike(authToken, comment.id);
    setComments((prev) => prev.map((item) => item.id === comment.id ? { ...item, likedByMe: result.liked, likesCount: result.likesCount } : item));
  }

  async function report(comment: CatalogComment) {
    if (!authToken) return;
    const reason = window.prompt(locale === "zh" ? "举报原因" : "Report reason", "spam");
    if (!reason) return;
    await reportCatalogComment(authToken, comment.id, reason);
    setMessage(locale === "zh" ? "已提交举报。" : "Report submitted.");
  }

  return (
    <section className="community-pane">
      <div className="comment-composer">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={4} disabled={!authToken} placeholder={authToken ? (locale === "zh" ? "留下使用经验、兼容性说明或修正文档的线索" : "Share usage notes, compatibility findings, or doc corrections") : (locale === "zh" ? "登录后参与评论" : "Sign in to comment")} />
        <button className="primary-action" type="button" disabled={!authToken || loading || !content.trim()} onClick={() => void post()}>{locale === "zh" ? "发布评论" : "Post comment"}</button>
      </div>
      <div className="comment-list">
        {comments.map((comment) => (
          <article key={comment.id} className="comment-card">
            <div className="comment-avatar">{(comment.displayName || comment.username || "?").slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="comment-meta"><strong>{comment.displayName || comment.username}</strong><span>{new Date(comment.createdAt).toLocaleString()}</span></div>
              <p>{comment.content}</p>
              <div className="comment-actions">
                <button type="button" onClick={() => void like(comment)}><Heart aria-hidden />{comment.likesCount}</button>
                <button type="button" onClick={() => void report(comment)}><Flag aria-hidden />{locale === "zh" ? "举报" : "Report"}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {cursor ? <button className="ghost-action" type="button" disabled={loading} onClick={() => void load(cursor)}>{locale === "zh" ? "加载更多" : "Load more"}</button> : null}
      {message ? <p className="settings-help">{message}</p> : null}
    </section>
  );
}

function SuggestionPane({ guide, locale, authToken }: { guide: CatalogGuide; locale: Locale; authToken?: string }) {
  const [remark, setRemark] = useState("");
  const [playbookYaml, setPlaybookYaml] = useState("");
  const [guideMarkdown, setGuideMarkdown] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!authToken) {
      setMessage(locale === "zh" ? "登录后才能提交建议。" : "Sign in to submit suggestions.");
      return;
    }
    setSaving(true);
    try {
      await submitSuggestion(authToken, {
        catalogId: guide.item.id,
        type: "modify",
        nameZh: guide.item.name,
        nameEn: guide.item.nameEn,
        category: guide.item.category,
        remark,
        playbookYaml,
        guideMarkdown
      });
      setMessage(locale === "zh" ? "建议已提交，等待管理员审核。" : "Suggestion submitted for review.");
      setRemark("");
      setPlaybookYaml("");
      setGuideMarkdown("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="community-pane suggestion-pane">
      <div className="suggestion-copy compact">
        <h3>{locale === "zh" ? "针对当前条目提出修改" : "Suggest a change for this item"}</h3>
        <p>{locale === "zh" ? "适合提交更好的安装步骤、变量默认值、文档说明或兼容性补充。" : "Use this for install steps, variable defaults, docs, or compatibility notes."}</p>
      </div>
      <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={4} placeholder={locale === "zh" ? "修改原因和预期效果" : "Reason and expected outcome"} />
      <textarea value={playbookYaml} onChange={(e) => setPlaybookYaml(e.target.value)} rows={8} placeholder="playbook.yaml patch (optional)" />
      <textarea value={guideMarkdown} onChange={(e) => setGuideMarkdown(e.target.value)} rows={8} placeholder="guide.md patch (optional)" />
      <button className="primary-action" type="button" disabled={saving || !authToken} onClick={() => void submit()}>{saving ? (locale === "zh" ? "提交中..." : "Submitting...") : (locale === "zh" ? "提交条目建议" : "Submit item suggestion")}</button>
      {message ? <p className="settings-help">{message}</p> : null}
    </section>
  );
}
