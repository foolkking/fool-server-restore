import React, { useEffect, useState } from "react";
import {
  changePassword,
  confirmEmailChange,
  confirmTwoFactorEnroll,
  deleteAccount,
  disableTwoFactor,
  fetchAuthProviders,
  fetchMeFull,
  patchProfile,
  regenerateRecoveryCodes,
  requestEmailChange,
  sendNotificationTest,
  startGitHubLink,
  startGoogleLink,
  startTwoFactorEnroll,
  unlinkIdentity,
  updateNotificationPrefs,
  type IdentityEntry,
  type MeFullResponse,
  type NotificationPrefs
} from "../api";
import type { Locale } from "../lib/types";

interface Props {
  locale: Locale;
  authToken: string;
}

export function AccountPanel({ locale, authToken }: Props) {
  const [me, setMe] = useState<MeFullResponse | null>(null);
  const [providers, setProviders] = useState<{ github: boolean; google: boolean }>({ github: false, google: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    if (!authToken) return;
    setLoading(true);
    setError("");
    try {
      const [account, providerStatus] = await Promise.all([
        fetchMeFull(authToken),
        fetchAuthProviders().catch(() => ({ github: false, google: false }))
      ]);
      setMe(account);
      setProviders(providerStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [authToken]);

  if (!authToken) return <p className="empty-hint">{locale === "zh" ? "请先登录以访问高级设置。" : "Login to access settings."}</p>;
  if (loading) return <p className="empty-hint">{locale === "zh" ? "正在加载账号设置..." : "Loading account settings..."}</p>;
  if (error) return <p className="connection-error">{error}</p>;
  if (!me) return null;

  return (
    <div className="account-settings-grid">
      <ProfileSection locale={locale} authToken={authToken} me={me} onRefresh={reload} />
      <EmailSection locale={locale} authToken={authToken} me={me} onRefresh={reload} />
      <SecuritySection locale={locale} authToken={authToken} me={me} onRefresh={reload} />
      <IdentitiesSection locale={locale} authToken={authToken} identities={me.identities} providers={providers} onRefresh={reload} />
      <NotificationsSection locale={locale} authToken={authToken} prefs={me.notificationPrefs} />
      <ActivitySection locale={locale} activity={me.activity} />
      <DangerSection locale={locale} authToken={authToken} onRefresh={reload} />
    </div>
  );
}

function ProfileSection({ locale, authToken, me, onRefresh }: {
  locale: Locale;
  authToken: string;
  me: MeFullResponse;
  onRefresh: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(me.user.displayName ?? "");
  const [username, setUsername] = useState(me.user.username ?? "");
  const [bio, setBio] = useState(me.user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(me.user.avatarUrl ?? "");
  const [defaultSshUser, setDefaultSshUser] = useState(me.user.defaultSshUser ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await patchProfile(authToken, { displayName, username, bio, avatarUrl, defaultSshUser });
      setMessage(locale === "zh" ? "资料已保存。" : "Profile saved.");
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <h3>{locale === "zh" ? "个人资料" : "Profile"}</h3>
          <p>{locale === "zh" ? "用于配置市场、评论和建议中的公开身份。" : "Public identity used in catalog comments and suggestions."}</p>
        </div>
      </div>
      <div className="settings-form-grid">
        <label>{locale === "zh" ? "显示名" : "Display name"}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>{locale === "zh" ? "用户名" : "Username"}<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>{locale === "zh" ? "头像 URL" : "Avatar URL"}<input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} /></label>
        <label>{locale === "zh" ? "默认 SSH 用户" : "Default SSH user"}<input value={defaultSshUser} onChange={(e) => setDefaultSshUser(e.target.value)} /></label>
      </div>
      <label className="settings-full-field">{locale === "zh" ? "简介" : "Bio"}<textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} /></label>
      <button className="primary-action" type="button" disabled={saving} onClick={() => void save()}>{saving ? "..." : locale === "zh" ? "保存资料" : "Save profile"}</button>
      {message ? <p className="settings-note">{message}</p> : null}
    </section>
  );
}

function EmailSection({ locale, authToken, me, onRefresh }: {
  locale: Locale;
  authToken: string;
  me: MeFullResponse;
  onRefresh: () => Promise<void>;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  async function requestChange() {
    setMessage("");
    try {
      const result = await requestEmailChange(authToken, newEmail.trim());
      setPendingId(result.pendingId);
      setMessage(result.devCode ? `Dev code: ${result.devCode}` : (locale === "zh" ? "验证码已发送。" : "Verification code sent."));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    }
  }

  async function confirmChange() {
    setMessage("");
    try {
      const result = await confirmEmailChange(authToken, { pendingId, code: code.trim() });
      setMessage(locale === "zh" ? `邮箱已更新为 ${result.email}` : `Email updated to ${result.email}`);
      setNewEmail("");
      setPendingId("");
      setCode("");
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Confirm failed");
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <h3>{locale === "zh" ? "邮箱地址" : "Email address"}</h3>
          <p><strong>{me.user.email}</strong>{me.user.emailVerifiedAt ? ` · ${locale === "zh" ? "已验证" : "verified"}` : ""}</p>
        </div>
      </div>
      <div className="settings-inline-form">
        <input type="email" placeholder={locale === "zh" ? "新邮箱地址" : "New email"} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <button className="secondary-action" type="button" onClick={() => void requestChange()}>{locale === "zh" ? "发送验证码" : "Send code"}</button>
      </div>
      {pendingId ? (
        <div className="settings-inline-form">
          <input placeholder={locale === "zh" ? "验证码" : "Code"} value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="primary-action" type="button" onClick={() => void confirmChange()}>{locale === "zh" ? "确认变更" : "Confirm change"}</button>
        </div>
      ) : null}
      {message ? <p className="settings-note">{message}</p> : null}
    </section>
  );
}

function SecuritySection({ locale, authToken, me, onRefresh }: {
  locale: Locale;
  authToken: string;
  me: MeFullResponse;
  onRefresh: () => Promise<void>;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [enroll, setEnroll] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  async function savePassword() {
    setMessage("");
    try {
      await changePassword(authToken, { oldPassword, newPassword, currentTotpCode: totpCode || undefined });
      setOldPassword("");
      setNewPassword("");
      setTotpCode("");
      setMessage(locale === "zh" ? "密码已更新。" : "Password updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Password update failed");
    }
  }

  async function startEnroll() {
    setMessage("");
    const result = await startTwoFactorEnroll(authToken);
    setEnroll({ secret: result.secret, qrDataUrl: result.qrDataUrl });
  }

  async function confirmEnroll() {
    setMessage("");
    try {
      const result = await confirmTwoFactorEnroll(authToken, totpCode.trim());
      setRecoveryCodes(result.recoveryCodes);
      setEnroll(null);
      setTotpCode("");
      setMessage(locale === "zh" ? "2FA 已开启，请保存恢复码。" : "2FA enabled. Save your recovery codes.");
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "2FA confirm failed");
    }
  }

  async function disable() {
    setMessage("");
    try {
      await disableTwoFactor(authToken, { password: oldPassword || undefined, code: totpCode || undefined });
      setMessage(locale === "zh" ? "2FA 已关闭。" : "2FA disabled.");
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Disable failed");
    }
  }

  async function regenerate() {
    const result = await regenerateRecoveryCodes(authToken);
    setRecoveryCodes(result.recoveryCodes);
  }

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <h3>{locale === "zh" ? "账号安全" : "Account security"}</h3>
          <p>{locale === "zh" ? `双因素认证：${me.twoFactor.enabled ? "已开启" : "未开启"}` : `Two-factor authentication: ${me.twoFactor.enabled ? "enabled" : "disabled"}`}</p>
        </div>
      </div>
      <div className="settings-form-grid">
        <label>{locale === "zh" ? "当前密码" : "Current password"}<input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} /></label>
        <label>{locale === "zh" ? "新密码" : "New password"}<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <label>{locale === "zh" ? "2FA/恢复码" : "2FA/recovery code"}<input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} /></label>
      </div>
      <div className="settings-actions-row">
        <button className="primary-action" type="button" onClick={() => void savePassword()}>{locale === "zh" ? "更新密码" : "Update password"}</button>
        {me.twoFactor.enabled ? (
          <>
            <button className="secondary-action" type="button" onClick={() => void regenerate()}>{locale === "zh" ? "重置恢复码" : "Regenerate codes"}</button>
            <button className="danger-action" type="button" onClick={() => void disable()}>{locale === "zh" ? "关闭 2FA" : "Disable 2FA"}</button>
          </>
        ) : (
          <button className="secondary-action" type="button" onClick={() => void startEnroll()}>{locale === "zh" ? "开启 2FA" : "Enable 2FA"}</button>
        )}
      </div>
      {enroll ? (
        <div className="twofa-enroll-box">
          <img src={enroll.qrDataUrl} alt="2FA QR" />
          <code>{enroll.secret}</code>
          <button className="primary-action" type="button" onClick={() => void confirmEnroll()}>{locale === "zh" ? "用验证码确认" : "Confirm with code"}</button>
        </div>
      ) : null}
      {recoveryCodes.length > 0 ? <pre className="recovery-codes">{recoveryCodes.join("\n")}</pre> : null}
      {message ? <p className="settings-note">{message}</p> : null}
    </section>
  );
}

function IdentitiesSection({ locale, authToken, identities, providers, onRefresh }: {
  locale: Locale;
  authToken: string;
  identities: IdentityEntry[];
  providers: { github: boolean; google: boolean };
  onRefresh: () => Promise<void>;
}) {
  const linked = new Set(identities.map((identity) => identity.provider));
  const [message, setMessage] = useState("");

  async function link(provider: "github" | "google") {
    setMessage("");
    try {
      const result = provider === "github" ? await startGitHubLink(authToken) : await startGoogleLink(authToken);
      window.location.href = result.authorizeUrl;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Link failed");
    }
  }

  async function unlink(provider: "github" | "google") {
    setMessage("");
    try {
      await unlinkIdentity(authToken, provider);
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unlink failed");
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <h3>{locale === "zh" ? "登录方式" : "Sign-in methods"}</h3>
          <p>{locale === "zh" ? "绑定外部账号后可用 OAuth 登录。" : "Link external identities for OAuth sign-in."}</p>
        </div>
      </div>
      <div className="identity-list">
        {identities.map((identity) => (
          <div className="identity-row" key={identity.provider}>
            <strong>{identity.provider}</strong>
            <span className="identity-email">{identity.providerEmail ?? identity.providerLogin ?? "-"}</span>
            {identity.provider !== "local" ? <button className="secondary-action" type="button" onClick={() => void unlink(identity.provider)}>{locale === "zh" ? "解绑" : "Unlink"}</button> : null}
          </div>
        ))}
      </div>
      <div className="settings-actions-row">
        {providers.github && !linked.has("github") ? <button className="secondary-action" type="button" onClick={() => void link("github")}>{locale === "zh" ? "绑定 GitHub" : "Link GitHub"}</button> : null}
        {providers.google && !linked.has("google") ? <button className="secondary-action" type="button" onClick={() => void link("google")}>{locale === "zh" ? "绑定 Google" : "Link Google"}</button> : null}
      </div>
      {message ? <p className="settings-note">{message}</p> : null}
    </section>
  );
}

function NotificationsSection({ locale, authToken, prefs }: {
  locale: Locale;
  authToken: string;
  prefs: NotificationPrefs;
}) {
  const [local, setLocal] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setLocal(prefs), [prefs.updatedAt]);

  const items: Array<{ key: keyof NotificationPrefs; label: string; desc: string }> = [
    { key: "emailMentions", label: locale === "zh" ? "@提及" : "Mentions", desc: locale === "zh" ? "有人在评论或建议中提到你。" : "Someone mentions you in comments or suggestions." },
    { key: "emailComments", label: locale === "zh" ? "评论回复" : "Comment replies", desc: locale === "zh" ? "自己的评论收到回复。" : "Your comments receive replies." },
    { key: "emailSuggestionStatus", label: locale === "zh" ? "建议状态" : "Suggestion status", desc: locale === "zh" ? "建议被采纳、拒绝或需要补充。" : "Suggestion accepted, rejected, or needs changes." },
    { key: "emailPublishStatus", label: locale === "zh" ? "发布结果" : "Publish results", desc: locale === "zh" ? "配置市场发布或审核完成。" : "Catalog publishing or moderation completes." }
  ];

  const visibleItems: Array<{ key: keyof NotificationPrefs; label: string; desc: string }> = [
    { key: "emailMentions", label: locale === "zh" ? "@提及" : "Mentions", desc: locale === "zh" ? "有人在评论或建议中提到你。" : "Someone mentions you in comments or suggestions." },
    { key: "emailComments", label: locale === "zh" ? "评论回复" : "Comment replies", desc: locale === "zh" ? "自己的评论收到回复。" : "Your comments receive replies." },
    { key: "emailSuggestionStatus", label: locale === "zh" ? "建议状态" : "Suggestion status", desc: locale === "zh" ? "建议被采纳、拒绝或需要补充。" : "Suggestion accepted, rejected, or needs changes." },
    { key: "emailPublishStatus", label: locale === "zh" ? "发布结果" : "Publish results", desc: locale === "zh" ? "配置市场发布或审核完成。" : "Catalog publishing or moderation completes." }
  ];

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const result = await updateNotificationPrefs(authToken, {
        emailMentions: local.emailMentions,
        emailComments: local.emailComments,
        emailSuggestionStatus: local.emailSuggestionStatus,
        emailPublishStatus: local.emailPublishStatus
      });
      setLocal(result);
      setMessage(locale === "zh" ? "通知偏好已保存。" : "Notification preferences saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function testNotification() {
    setTesting(true);
    setMessage("");
    try {
      const result = await sendNotificationTest(authToken);
      if (result.emailEnabled && result.emailQueued) {
        setMessage(locale === "zh" ? "测试站内信已发送，邮件也已加入发送队列。" : "Test inbox message sent; email was queued.");
      } else if (result.emailEnabled) {
        setMessage(locale === "zh" ? "测试站内信已发送，但邮件受限或队列未接受。" : "Test inbox message sent, but email was not queued.");
      } else {
        setMessage(locale === "zh" ? "测试站内信已发送。当前未开启邮件通知。" : "Test inbox message sent. Email notifications are currently off.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Notification test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="settings-section notification-settings">
      <div className="settings-section-heading">
        <div>
          <h3>{locale === "zh" ? "邮件通知" : "Email notifications"}</h3>
          <p>{locale === "zh" ? "站内信会始终保留重要事件；这里控制是否额外发送邮件。" : "Important events remain in the in-app inbox; these toggles control extra email delivery."}</p>
        </div>
      </div>
      <ul className="notification-prefs">
        {visibleItems.map((item) => (
          <li key={item.key}>
            <label className="notification-pref-row">
              <input
                type="checkbox"
                checked={Boolean(local[item.key])}
                onChange={(event) => setLocal((current) => ({ ...current, [item.key]: event.target.checked }))}
              />
              <span>
                <strong>{item.label}</strong>
                <small>{item.desc}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="settings-action-row">
        <button className="primary-action" type="button" disabled={saving} onClick={() => void save()}>{saving ? "..." : locale === "zh" ? "保存通知设置" : "Save notifications"}</button>
        <button className="secondary-action" type="button" disabled={testing} onClick={() => void testNotification()}>{testing ? "..." : locale === "zh" ? "发送测试通知" : "Send test"}</button>
      </div>
      {message ? <p className="settings-note">{message}</p> : null}
    </section>
  );
}

function ActivitySection({ locale, activity }: { locale: Locale; activity: MeFullResponse["activity"] }) {
  const items = [
    { label: locale === "zh" ? "已连接机器" : "Connections", value: activity.connections },
    { label: locale === "zh" ? "上传配置" : "Uploaded profiles", value: activity.uploadedProfiles },
    { label: "Playbook", value: activity.playbooks },
    { label: locale === "zh" ? "执行任务" : "Tasks executed", value: activity.tasksExecuted },
    { label: locale === "zh" ? "OAuth 登录" : "OAuth providers", value: activity.identitiesLinked },
    { label: "API tokens", value: activity.apiTokens }
  ];

  return (
    <section className="settings-section">
      <h3>{locale === "zh" ? "活动统计" : "Activity"}</h3>
      <dl className="activity-grid">
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DangerSection({ locale, authToken, onRefresh }: {
  locale: Locale;
  authToken: string;
  onRefresh: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  async function removeAccount() {
    if (!confirm(locale === "zh" ? "确认删除账号？此操作会停用当前账号。" : "Delete this account? This will deactivate the current account.")) return;
    try {
      await deleteAccount(authToken, { password: password || undefined, currentTotpCode: code || undefined });
      setMessage(locale === "zh" ? "账号已删除。" : "Account deleted.");
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <section className="settings-section danger-zone">
      <h3>{locale === "zh" ? "危险操作" : "Danger zone"}</h3>
      <div className="settings-form-grid">
        <label>{locale === "zh" ? "密码" : "Password"}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>{locale === "zh" ? "2FA/恢复码" : "2FA/recovery code"}<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
      </div>
      <button className="danger-action" type="button" onClick={() => void removeAccount()}>{locale === "zh" ? "删除账号" : "Delete account"}</button>
      {message ? <p className="settings-note">{message}</p> : null}
    </section>
  );
}
