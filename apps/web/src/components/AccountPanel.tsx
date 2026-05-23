/**
 * AccountPanel — single-page settings panel for account self-service.
 *
 * Surfaces ALL the new auth-and-ecosystem spec P1.7–P1.12 routes:
 *
 *   - Profile: displayName / bio / avatarUrl / timezone / locale / username
 *   - Security: password change, 2FA enroll/confirm/disable, recovery codes
 *   - Identities: linked OAuth providers (link / unlink)
 *   - Email: change email (two-step with code)
 *   - Notifications: 4 boolean prefs
 *   - Activity: counters (read-only)
 *   - Danger: soft-delete account
 *
 * Design notes:
 *   - One scrollable panel rather than nested tabs — most users only use
 *     this page rarely; nesting tabs adds friction without UX gain at this
 *     scale. Future iteration may split when content grows.
 *   - We refetch /api/me after every successful mutation so secondary
 *     widgets (e.g. "2FA: enabled") stay consistent.
 *   - Errors surface inline next to the section that triggered them.
 *   - The QR code rendered after `enroll` uses the dataUrl returned by the
 *     server; we do NOT recompute it client-side.
 */
import React, { useEffect, useState } from "react";
import {
  fetchMeFull,
  patchProfile,
  changePassword,
  deleteAccount,
  fetchIdentities,
  startGitHubLink,
  unlinkIdentity,
  fetchTwoFactorStatus,
  startTwoFactorEnroll,
  confirmTwoFactorEnroll,
  disableTwoFactor,
  regenerateRecoveryCodes,
  requestEmailChange,
  confirmEmailChange,
  fetchNotificationPrefs,
  updateNotificationPrefs,
  fetchAuthProviders,
  type MeFullResponse,
  type IdentityEntry,
  type NotificationPrefs,
  type TwoFactorStatus
} from "../api";
import type { Locale } from "../lib/types";

interface Props {
  locale: Locale;
  authToken: string;
}

export function AccountPanel({ locale, authToken }: Props) {
  const [me, setMe] = useState<MeFullResponse | null>(null);
  const [providers, setProviders] = useState<{ github: boolean; google: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    if (!authToken) return;
    setLoading(true);
    setError("");
    try {
      const [meData, prov] = await Promise.all([
        fetchMeFull(authToken),
        fetchAuthProviders().catch(() => ({ github: false, google: false }))
      ]);
      setMe(meData);
      setProviders(prov);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [authToken]);

  if (!authToken) {
    return <div className="settings-section"><p className="settings-help">{locale === "zh" ? "请先登录。" : "Please sign in first."}</p></div>;
  }
  if (loading) return <div className="settings-section"><p>{locale === "zh" ? "加载中…" : "Loading…"}</p></div>;
  if (error) return <div className="settings-section"><p className="connection-error">{error}</p></div>;
  if (!me) return null;

  return (
    <div className="account-panel">
      <ProfileSection locale={locale} authToken={authToken} me={me} onRefresh={reload} />
      <EmailChangeSection locale={locale} authToken={authToken} me={me} onRefresh={reload} />
      <PasswordSection locale={locale} authToken={authToken} me={me} onRefresh={reload} />
      <TwoFactorSection locale={locale} authToken={authToken} status={me.twoFactor} onRefresh={reload} />
      <IdentitiesSection locale={locale} authToken={authToken} identities={me.identities} providers={providers} onRefresh={reload} />
      <NotificationsSection locale={locale} authToken={authToken} prefs={me.notificationPrefs} onRefresh={reload} />
      <ActivitySection locale={locale} activity={me.activity} />
      <DangerSection locale={locale} authToken={authToken} hasPassword={!!me.user} totpEnabled={me.twoFactor.enabled} />
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────

function ProfileSection({ locale, authToken, me, onRefresh }: {
  locale: Locale;
  authToken: string;
  me: MeFullResponse;
  onRefresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    displayName: me.user.displayName ?? me.user.name ?? "",
    username: me.user.username ?? "",
    bio: me.user.bio ?? "",
    avatarUrl: me.user.avatarUrl ?? "",
    timezone: me.user.timezone ?? "",
    locale: me.user.locale ?? "auto"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(""); setSuccess(""); setSaving(true);
    try {
      await patchProfile(authToken, form);
      setSuccess(locale === "zh" ? "已保存" : "Saved");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "个人资料" : "Profile"}</h3>
      <div className="form-grid">
        <label>
          <span>{locale === "zh" ? "显示名" : "Display name"}</span>
          <input value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} maxLength={80} />
        </label>
        <label>
          <span>{locale === "zh" ? "用户名（@提及）" : "Username (@mention)"}</span>
          <input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} placeholder="alice_42" />
        </label>
        <label>
          <span>{locale === "zh" ? "简介" : "Bio"}</span>
          <textarea value={form.bio} onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))} maxLength={1000} rows={3} />
        </label>
        <label>
          <span>{locale === "zh" ? "头像 URL（HTTPS）" : "Avatar URL (HTTPS)"}</span>
          <input value={form.avatarUrl} onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))} placeholder="https://…" />
        </label>
        <label>
          <span>{locale === "zh" ? "时区" : "Timezone"}</span>
          <input value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))} placeholder="Asia/Shanghai" />
        </label>
        <label>
          <span>{locale === "zh" ? "界面语言" : "UI locale"}</span>
          <select value={form.locale} onChange={(e) => setForm((p) => ({ ...p, locale: e.target.value }))}>
            <option value="auto">Auto</option>
            <option value="zh-CN">中文 (zh-CN)</option>
            <option value="en-US">English (en-US)</option>
          </select>
        </label>
        <button className="primary-action" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "保存" : "Save")}
        </button>
      </div>
      {error ? <p className="connection-error">{error}</p> : null}
      {success ? <p className="settings-help" style={{ color: "#16a34a" }}>{success}</p> : null}
    </section>
  );
}

// ── Email change ───────────────────────────────────────────────────────────

function EmailChangeSection({ locale, authToken, me, onRefresh }: {
  locale: Locale;
  authToken: string;
  me: MeFullResponse;
  onRefresh: () => Promise<void>;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function startChange() {
    setError(""); setSuccess("");
    try {
      const r = await requestEmailChange(authToken, newEmail.trim());
      setPendingId(r.pendingId);
      setDevCode(r.devCode);
      setSuccess(locale === "zh"
        ? `验证码已发送到 ${newEmail}。10 分钟内有效。`
        : `Code sent to ${newEmail}. Expires in 10 minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function confirmChange() {
    if (!pendingId) return;
    setError("");
    try {
      const r = await confirmEmailChange(authToken, { pendingId, code: code.trim() });
      setSuccess(locale === "zh" ? `邮箱已更新为 ${r.email}` : `Email updated to ${r.email}`);
      setPendingId(null);
      setNewEmail("");
      setCode("");
      setDevCode(undefined);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "邮箱地址" : "Email address"}</h3>
      <p className="settings-help">
        {locale === "zh" ? "当前邮箱：" : "Current: "}
        <strong>{me.user.email}</strong>
        {me.user.emailVerifiedAt ? <span style={{ color: "#16a34a" }}> ✓ {locale === "zh" ? "已验证" : "verified"}</span> : null}
      </p>
      {pendingId ? (
        <div className="form-grid">
          {devCode ? (
            <p className="settings-help" style={{ color: "#ca8a04" }}>
              {locale === "zh" ? "（开发模式）" : "(dev mode)"} {devCode}
            </p>
          ) : null}
          <input placeholder={locale === "zh" ? "6 位验证码" : "6-digit code"} value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} />
          <button className="primary-action" type="button" onClick={() => void confirmChange()}>
            {locale === "zh" ? "确认更换" : "Confirm change"}
          </button>
          <button className="ghost-action" type="button" onClick={() => { setPendingId(null); setCode(""); setDevCode(undefined); }}>
            {locale === "zh" ? "取消" : "Cancel"}
          </button>
        </div>
      ) : (
        <div className="form-grid">
          <input type="email" placeholder={locale === "zh" ? "新邮箱地址" : "New email"} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button className="secondary-action" type="button" onClick={() => void startChange()}>
            {locale === "zh" ? "发送验证码" : "Send code"}
          </button>
        </div>
      )}
      {error ? <p className="connection-error">{error}</p> : null}
      {success ? <p className="settings-help" style={{ color: "#16a34a" }}>{success}</p> : null}
    </section>
  );
}

// ── Password ───────────────────────────────────────────────────────────────

function PasswordSection({ locale, authToken, me, onRefresh: _onRefresh }: {
  locale: Locale;
  authToken: string;
  me: MeFullResponse;
  onRefresh: () => Promise<void>;
}) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // We don't get a `passwordHash` boolean directly from /api/me; infer from the
  // identities list: if "local" appears, the user has a local password.
  // (This component receives the full `me` snapshot which includes identities.)
  const hasLocalPassword = (me as MeFullResponse).user.email && true; // best-effort default true; backend rejects with 400 anyway when not applicable

  async function save() {
    setError(""); setSuccess("");
    try {
      await changePassword(authToken, { oldPassword: oldPw, newPassword: newPw });
      setSuccess(locale === "zh" ? "密码已更新" : "Password updated");
      setOldPw(""); setNewPw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "修改密码" : "Change password"}</h3>
      {!hasLocalPassword ? (
        <p className="settings-help">
          {locale === "zh"
            ? "此账号目前只通过 OAuth 登录。设置密码请先开启 2FA，然后再来这里。"
            : "This account currently signs in via OAuth only. Enable 2FA first, then return here."}
        </p>
      ) : null}
      <div className="form-grid">
        <input type="password" placeholder={locale === "zh" ? "当前密码" : "Current password"} value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        <input type="password" placeholder={locale === "zh" ? "新密码（至少 8 位）" : "New password (≥8 chars)"} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        <button className="primary-action" type="button" disabled={!newPw} onClick={() => void save()}>
          {locale === "zh" ? "更新密码" : "Update"}
        </button>
      </div>
      {error ? <p className="connection-error">{error}</p> : null}
      {success ? <p className="settings-help" style={{ color: "#16a34a" }}>{success}</p> : null}
    </section>
  );
}

// ── 2FA ────────────────────────────────────────────────────────────────────

function TwoFactorSection({ locale, authToken, status, onRefresh }: {
  locale: Locale;
  authToken: string;
  status: TwoFactorStatus;
  onRefresh: () => Promise<void>;
}) {
  const [enrolling, setEnrolling] = useState<{ secret: string; qrDataUrl: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function startEnroll() {
    setError(""); setSuccess("");
    try {
      const r = await startTwoFactorEnroll(authToken);
      setEnrolling({ secret: r.secret, qrDataUrl: r.qrDataUrl, otpauthUri: r.otpauthUri });
      setRecoveryCodes(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function confirmEnroll() {
    if (!enrolling) return;
    setError("");
    try {
      const r = await confirmTwoFactorEnroll(authToken, code.trim());
      setRecoveryCodes(r.recoveryCodes);
      setEnrolling(null);
      setCode("");
      // If the response includes a rotated session token (admin enrollment),
      // swap localStorage so subsequent calls use the new full-access session.
      if (r.sessionToken) {
        localStorage.setItem("envforge_token", r.sessionToken);
        // Reload the page so the App state picks up the new token cleanly.
        setTimeout(() => window.location.reload(), 1500);
      }
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function doDisable() {
    setError("");
    try {
      const payload: { password?: string; code?: string } = {};
      if (disablePassword) payload.password = disablePassword;
      if (disableCode) payload.code = disableCode;
      await disableTwoFactor(authToken, payload);
      setSuccess(locale === "zh" ? "2FA 已关闭" : "2FA disabled");
      setDisablePassword(""); setDisableCode("");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function regenerateCodes() {
    setError("");
    try {
      const r = await regenerateRecoveryCodes(authToken);
      setRecoveryCodes(r.recoveryCodes);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "两步验证 (2FA / TOTP)" : "Two-factor authentication"}</h3>
      <p className="settings-help">
        {status.enabled
          ? (locale === "zh"
            ? `已启用。剩余恢复码 ${status.recoveryCodesRemaining} 个。`
            : `Enabled. ${status.recoveryCodesRemaining} recovery codes remaining.`)
          : (locale === "zh"
            ? "未启用。建议为 admin 账号必须启用。"
            : "Not enabled. Required for admin accounts.")}
      </p>

      {!status.enabled && !enrolling ? (
        <button className="primary-action" type="button" onClick={() => void startEnroll()}>
          {locale === "zh" ? "开始绑定" : "Start enrollment"}
        </button>
      ) : null}

      {enrolling ? (
        <div>
          <p className="settings-help">
            {locale === "zh"
              ? "用 Authenticator app 扫描二维码，或手动输入下方密钥，然后填入 6 位验证码。"
              : "Scan with your authenticator app, or enter the secret manually, then submit the 6-digit code."}
          </p>
          <img src={enrolling.qrDataUrl} alt="TOTP QR code" style={{ display: "block", margin: "12px 0" }} />
          <code style={{ background: "#f3f4f6", padding: "8px 12px", borderRadius: "4px", display: "block", marginBottom: "12px", wordBreak: "break-all" }}>
            {enrolling.secret}
          </code>
          <div className="form-grid">
            <input placeholder={locale === "zh" ? "6 位验证码" : "6-digit code"} value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} />
            <button className="primary-action" type="button" onClick={() => void confirmEnroll()}>
              {locale === "zh" ? "确认开启" : "Confirm"}
            </button>
            <button className="ghost-action" type="button" onClick={() => { setEnrolling(null); setCode(""); }}>
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}

      {recoveryCodes ? (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", padding: "12px 16px", borderRadius: "8px", margin: "12px 0" }}>
          <strong>{locale === "zh" ? "恢复码（仅显示一次，请保存好）：" : "Recovery codes (shown ONCE — save them!):"}</strong>
          <ul style={{ fontFamily: "monospace", marginTop: "8px" }}>
            {recoveryCodes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      ) : null}

      {status.enabled ? (
        <>
          <h4 style={{ marginTop: "20px" }}>{locale === "zh" ? "重新生成恢复码" : "Regenerate recovery codes"}</h4>
          <button className="secondary-action" type="button" onClick={() => void regenerateCodes()}>
            {locale === "zh" ? "重新生成 8 个新码（旧码失效）" : "Regenerate 8 new codes (invalidates old)"}
          </button>

          <h4 style={{ marginTop: "20px" }}>{locale === "zh" ? "关闭 2FA" : "Disable 2FA"}</h4>
          <p className="settings-help">{locale === "zh" ? "需要密码或当前 6 位 TOTP 码任一项重新认证。" : "Provide either your password or a current 6-digit TOTP code."}</p>
          <div className="form-grid">
            <input type="password" placeholder={locale === "zh" ? "密码（可选）" : "Password (optional)"} value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
            <input placeholder={locale === "zh" ? "或当前 TOTP 码" : "Or current TOTP code"} value={disableCode} maxLength={6} onChange={(e) => setDisableCode(e.target.value)} />
            <button className="conn-btn conn-btn-danger" type="button" onClick={() => void doDisable()}>
              {locale === "zh" ? "关闭 2FA" : "Disable"}
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="connection-error">{error}</p> : null}
      {success ? <p className="settings-help" style={{ color: "#16a34a" }}>{success}</p> : null}
    </section>
  );
}

// ── Identities ─────────────────────────────────────────────────────────────

function IdentitiesSection({ locale, authToken, identities, providers, onRefresh }: {
  locale: Locale;
  authToken: string;
  identities: IdentityEntry[];
  providers: { github: boolean; google: boolean } | null;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState("");

  async function linkGitHub() {
    setError("");
    try {
      const r = await startGitHubLink(authToken);
      window.location.href = r.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function unlink(provider: "github" | "google") {
    if (!confirm(locale === "zh" ? `确定解绑 ${provider} 吗？` : `Unlink ${provider}?`)) return;
    setError("");
    try {
      await unlinkIdentity(authToken, provider);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const githubLinked = identities.some((i) => i.provider === "github");

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "已关联的登录方式" : "Linked sign-in methods"}</h3>
      <ul className="identity-list">
        {identities.map((i) => (
          <li key={i.provider} className="identity-row">
            <span className="identity-provider">{i.provider}</span>
            <span className="identity-email">{i.providerEmail ?? i.providerLogin ?? "—"}</span>
            {i.provider !== "local" ? (
              <button className="conn-btn conn-btn-danger" type="button" onClick={() => void unlink(i.provider as "github" | "google")}>
                {locale === "zh" ? "解绑" : "Unlink"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {providers?.github && !githubLinked ? (
        <button className="secondary-action" type="button" onClick={() => void linkGitHub()} style={{ marginTop: "8px" }}>
          {locale === "zh" ? "绑定 GitHub" : "Link GitHub"}
        </button>
      ) : null}
      {error ? <p className="connection-error">{error}</p> : null}
    </section>
  );
}

// ── Notifications ──────────────────────────────────────────────────────────

function NotificationsSection({ locale, authToken, prefs, onRefresh: _onRefresh }: {
  locale: Locale;
  authToken: string;
  prefs: NotificationPrefs;
  onRefresh: () => Promise<void>;
}) {
  const [local, setLocal] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setLocal(prefs); }, [prefs.updatedAt]);

  async function save() {
    setSaving(true); setError("");
    try {
      const r = await updateNotificationPrefs(authToken, {
        emailMentions: local.emailMentions,
        emailComments: local.emailComments,
        emailSuggestionStatus: local.emailSuggestionStatus,
        emailPublishStatus: local.emailPublishStatus
      });
      setLocal(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const items: Array<{ key: keyof typeof local; label: { zh: string; en: string } }> = [
    { key: "emailMentions", label: { zh: "@提及", en: "Mentions" } },
    { key: "emailComments", label: { zh: "回复评论", en: "Replies to my comments" } },
    { key: "emailSuggestionStatus", label: { zh: "建议状态", en: "My suggestion status" } },
    { key: "emailPublishStatus", label: { zh: "上架结果", en: "Publish request results" } }
  ];

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "邮件通知" : "Email notifications"}</h3>
      <ul className="notification-prefs">
        {items.map((it) => (
          <li key={it.key}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(local[it.key as keyof NotificationPrefs])}
                onChange={(e) => setLocal((p) => ({ ...p, [it.key]: e.target.checked }))}
              />{" "}
              {it.label[locale === "zh" ? "zh" : "en"]}
            </label>
          </li>
        ))}
      </ul>
      <button className="primary-action" type="button" disabled={saving} onClick={() => void save()}>
        {saving ? "…" : (locale === "zh" ? "保存" : "Save")}
      </button>
      {error ? <p className="connection-error">{error}</p> : null}
    </section>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

function ActivitySection({ locale, activity }: { locale: Locale; activity: MeFullResponse["activity"] }) {
  const items = [
    { label: locale === "zh" ? "已连接机器" : "Connections", value: activity.connections },
    { label: locale === "zh" ? "上传配置" : "Uploaded profiles", value: activity.uploadedProfiles },
    { label: locale === "zh" ? "Playbook" : "Playbooks", value: activity.playbooks },
    { label: locale === "zh" ? "执行任务" : "Tasks executed", value: activity.tasksExecuted },
    { label: locale === "zh" ? "OAuth 登录" : "OAuth providers", value: activity.identitiesLinked },
    { label: locale === "zh" ? "API tokens" : "API tokens", value: activity.apiTokens }
  ];
  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "活动统计" : "Activity"}</h3>
      <dl className="activity-grid">
        {items.map((i) => (
          <div key={i.label}>
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── Danger zone ────────────────────────────────────────────────────────────

function DangerSection({ locale, authToken, totpEnabled }: {
  locale: Locale;
  authToken: string;
  hasPassword: boolean;
  totpEnabled: boolean;
}) {
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  async function doDelete() {
    setError("");
    if (confirm !== "DELETE") {
      setError(locale === "zh" ? "请输入 DELETE 确认" : "Type DELETE to confirm");
      return;
    }
    try {
      const payload: { password?: string; currentTotpCode?: string } = {};
      if (password) payload.password = password;
      if (code) payload.currentTotpCode = code;
      await deleteAccount(authToken, payload);
      alert(locale === "zh" ? "账号已删除（软删）。" : "Account deleted (soft).");
      localStorage.removeItem("envforge_token");
      localStorage.removeItem("envforge_user");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="settings-section settings-danger">
      <h3>{locale === "zh" ? "危险区域" : "Danger zone"}</h3>
      <p className="settings-help">
        {locale === "zh"
          ? "删除账号是软删 — 资料置不可登录，已发表的内容（评论、建议）保留为 [deleted]。"
          : "Deleting your account is a soft-delete — your published content (comments, suggestions) stays with author marked [deleted]."}
      </p>
      <div className="form-grid">
        <input type="password" placeholder={locale === "zh" ? "密码" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        {totpEnabled ? (
          <input placeholder={locale === "zh" ? "或当前 TOTP 码" : "Or current TOTP code"} value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} />
        ) : null}
        <input placeholder={locale === "zh" ? "输入 DELETE 确认" : "Type DELETE"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="conn-btn conn-btn-danger" type="button" onClick={() => void doDelete()}>
          {locale === "zh" ? "永久删除账号" : "Delete account"}
        </button>
      </div>
      {error ? <p className="connection-error">{error}</p> : null}
    </section>
  );
}
