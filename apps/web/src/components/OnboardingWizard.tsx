/**
 * OnboardingWizard — one-time tour for new users.
 *
 * Triggers on first login when no connections exist yet. Stores `envforge_onboarded` in
 * localStorage so it shows at most once per browser.
 */
import React, { useState } from "react";
import type { Locale } from "../lib/types";

type Step = 1 | 2 | 3 | 4;

const COPY = {
  zh: {
    title: "欢迎使用 EnvForge",
    subtitle: "三步配置你的第一台虚拟机",
    skip: "跳过",
    next: "下一步",
    prev: "上一步",
    finish: "开始使用",
    s1Title: "1. 添加 SSH 连接",
    s1Body: "在「虚拟机管理」页面填写 host / port / 用户名 / 密码或私钥，连接到目标 Linux VM。私钥可以直接 Web 上传，加密存储在服务器。",
    s2Title: "2. 浏览配置市场",
    s2Body: "「配置市场」有 70+ 个预设 Playbook，覆盖运行时（Node/Python）、数据库（MySQL/Redis）、安全（Fail2Ban/UFW）等场景。点击卡片，勾选要安装的，点「一键安装」。",
    s3Title: "3. 查看终端日志",
    s3Body: "底部的终端面板会实时显示 SSH 命令和输出。任何时候都能拉伸、查看历史。任务支持「dry-run」预览不实际执行。",
    s4Title: "4. 进阶：定时 + Webhook + API",
    s4Body: "在「高级设置」页面：配置 cron-style 定时任务、Webhook 通知、API Token 接入 GitHub Actions。漂移检测帮你发现意外的软件变更。"
  },
  en: {
    title: "Welcome to EnvForge",
    subtitle: "Three steps to your first VM",
    skip: "Skip",
    next: "Next",
    prev: "Back",
    finish: "Get started",
    s1Title: "1. Add an SSH connection",
    s1Body: "On the VM Manager page, fill in host / port / username / password or private key. Private keys can be uploaded via the web — they're encrypted on disk.",
    s2Title: "2. Browse the Config Market",
    s2Body: "70+ presets cover runtimes (Node/Python), databases (MySQL/Redis), security (Fail2Ban/UFW), etc. Pick items, click Install — see real progress in the terminal.",
    s3Title: "3. Watch the terminal",
    s3Body: "The bottom panel streams SSH command output live. Resize it any time. Tasks support dry-run for safe previews.",
    s4Title: "4. Power-user: schedules, webhooks, API tokens",
    s4Body: "On the Settings page: cron-style schedules, webhook notifications, API tokens for GitHub Actions. Drift detection catches unexpected software changes."
  }
} as const;

export function OnboardingWizard({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const t = COPY[locale];
  const [step, setStep] = useState<Step>(1);
  const titles: Record<Step, string> = { 1: t.s1Title, 2: t.s2Title, 3: t.s3Title, 4: t.s4Title };
  const bodies: Record<Step, string> = { 1: t.s1Body, 2: t.s2Body, 3: t.s3Body, 4: t.s4Body };

  function dismiss() {
    try { localStorage.setItem("envforge_onboarded", "1"); } catch { /* ignore */ }
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <section className="onboarding-modal">
        <header>
          <p className="eyebrow">EnvForge</p>
          <h2>{t.title}</h2>
          <p className="onboarding-sub">{t.subtitle}</p>
          <button type="button" className="onboarding-skip" onClick={dismiss}>{t.skip} ✕</button>
        </header>
        <div className="onboarding-progress">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div key={s} className={`onboarding-dot ${s <= step ? "active" : ""}`} />
          ))}
        </div>
        <div className="onboarding-body">
          <h3>{titles[step]}</h3>
          <p>{bodies[step]}</p>
        </div>
        <footer>
          {step > 1 && (
            <button type="button" className="ghost-action" onClick={() => setStep((s) => (s - 1) as Step)}>{t.prev}</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 4 ? (
            <button type="button" className="primary-action" onClick={() => setStep((s) => (s + 1) as Step)}>{t.next}</button>
          ) : (
            <button type="button" className="primary-action" onClick={dismiss}>{t.finish}</button>
          )}
        </footer>
      </section>
    </div>
  );
}
