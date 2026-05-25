import React, { useState, useEffect } from "react";
import {
  Edit3,
  Lock,
  LogIn,
  LogOut,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";
import {
  createProfile,
  deleteProfile,
  extractCombo,
  fetchTaskHistory,
  fetchAuthProviders,
  loginAccount,
  loginVerify2FA,
  startRegistration,
  verifyRegistration,
  requestPasswordReset,
  type AuthUser,
  type CreateProfileInput,
  type CurrentUser,
  type MigrationStrategy,
  type ProfileComponent,
  type TaskHistoryEntry,
  type UserProfile
} from "../api";
import type { Locale } from "../lib/types";
import { InfoPair } from "../components/InfoPair";

const text = {
  zh: {
    appName: "EnvForge",
    subtitle: "虚拟机软硬件配置管理",
    machine: "虚拟机管理",
    market: "配置市场",
    me: "我的空间",
    search: "搜索可加入虚拟机的软件、配置、系统策略",
    filter: "筛选",
    connectTitle: "连接至远程服务器",
    connectHint: "成功连接后才展示完整系统信息；未连接时仅可选择连接方式和凭据。",
    runScan: "扫描当前虚拟机",
    upload: "上传当前虚拟机配置",
    selected: "已选择",
    software: "软件信息",
    configs: "系统配置清单",
    addToVm: "加入虚拟机",
    guest: "游客",
    login: "登录",
    register: "注册",
    logout: "登出",
    editProfile: "编辑资料",
    profile: "个人信息",
    uploads: "我上传的虚拟机配置",
    language: "中文",
    locked: "连接成功后显示",
    connection: "连接状态",
    connected: "已连接",
    disconnected: "未连接",
    connectBtn: "连接",
    privacyNote: "未登录时不能执行安装；环境保留只对虚拟机执行只读采集，生成的重建 Playbook 仅保存在你的账户下。",
    installCommand: "安装命令",
    packageAlias: "包与 alias 偏好",
    agentUrl: "Agent URL（可选，如 http://127.0.0.1:4001）",
    agentProbe: "探测真实数据",
    agentOnline: "Agent 在线",
    agentOffline: "Agent 离线",
    probing: "探测中…",
    realData: "真实数据（来自 mock-agent）"
  },
  en: {
    appName: "EnvForge",
    subtitle: "VM software and hardware configuration manager",
    machine: "VM Manager",
    market: "Config Market",
    me: "My Space",
    search: "Search software, configs, and system policies",
    filter: "Filter",
    connectTitle: "Connect remote server",
    connectHint: "Full system information is visible only after a successful connection.",
    runScan: "Scan current VM",
    upload: "Upload current VM profile",
    selected: "Selected",
    software: "Software",
    configs: "System configs",
    addToVm: "Add to VM",
    guest: "Guest",
    login: "Login",
    register: "Register",
    logout: "Logout",
    editProfile: "Edit profile",
    profile: "Profile",
    uploads: "My uploaded VM profiles",
    language: "English",
    locked: "Visible after connection",
    connection: "Connection",
    connected: "Connected",
    disconnected: "Disconnected",
    connectBtn: "Connect",
    privacyNote: "Login required to install; environment capture is read-only and the generated rebuild Playbook is saved to your account only.",
    installCommand: "Install command",
    packageAlias: "Packages and alias preferences",
    agentUrl: "Agent URL (optional, e.g. http://127.0.0.1:4001)",
    agentProbe: "Probe real data",
    agentOnline: "Agent online",
    agentOffline: "Agent offline",
    probing: "Probing…",
    realData: "Live data (from mock-agent)"
  }
};

export function ProfileEditModal({
  user,
  locale,
  onClose,
  onSave
}: {
  user: AuthUser;
  locale: Locale;
  onClose: () => void;
  onSave: (input: { name: string; defaultSshUser: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: user.name
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      // defaultSshUser is deprecated but kept in API for backward compat
      await onSave({ name: form.name, defaultSshUser: user.defaultSshUser ?? "ubuntu" });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <section className="profile-modal">
        <header>
          <div>
            <p className="eyebrow">{locale === "zh" ? "账户设置" : "Account settings"}</p>
            <h2>{locale === "zh" ? "编辑资料" : "Edit profile"}</h2>
          </div>
          <button className="ghost-action icon-action" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>
        <div className="profile-edit-summary">
          <div className="profile-avatar small">{(form.name || user.name).slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{form.name || user.name}</strong>
            <span>{user.email}</span>
          </div>
        </div>
        <div className="modal-form">
          <label>
            <span>{locale === "zh" ? "昵称" : "Display name"}</span>
            <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} />
          </label>
          <label>
            <span>{locale === "zh" ? "邮箱（暂不可在此修改）" : "Email (read-only here)"}</span>
            <input value={user.email} disabled />
          </label>
        </div>
        {error ? <p className="connection-error">{error}</p> : null}
        <footer>
          <button className="secondary-action" type="button" onClick={onClose}>{locale === "zh" ? "取消" : "Cancel"}</button>
          <button className="primary-action" type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? (locale === "zh" ? "保存中" : "Saving") : (locale === "zh" ? "保存修改" : "Save changes")}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function MePage({
  t,
  locale,
  user,
  authUser,
  authToken,
  strategies,
  userProfiles,
  onAuthSuccess,
  onUpdateProfile,
  onLogout,
  onProfilesChange,
  activeConnectionId
}: {
  t: typeof text.zh;
  locale: Locale;
  user: CurrentUser | null;
  authUser: AuthUser | null;
  authToken: string;
  strategies: MigrationStrategy[];
  userProfiles: UserProfile[];
  /**
   * Auth-and-ecosystem spec P1.5/P1.10/P1.13: instead of receiving fully-baked
   * onLogin / onRegister handlers, MePage now calls the API client directly
   * (so it can render multi-step flows like 2FA verification + email-code
   * registration) and only bubbles up the final session via this callback.
   */
  onAuthSuccess: (result: { token: string; user: AuthUser }) => void;
  onUpdateProfile: (input: { name: string; defaultSshUser: string }) => Promise<void>;
  onLogout: () => void;
  onProfilesChange: (profiles: UserProfile[]) => void;
  activeConnectionId: string | null;
}) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  // P1.5 — two-step registration: after step-1 we keep pendingId + show code input.
  const [pendingRegistration, setPendingRegistration] = useState<{ pendingId: string; devCode?: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  // P1.10 — 2FA-pending session: after login, if backend says needs2FA, we capture
  // the intermediate token and render a 6-digit / recovery-code input step.
  const [pending2FA, setPending2FA] = useState<{ intermediateToken: string; user?: AuthUser } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  // P1.7 — provider availability (decides whether to render the GitHub button).
  const [providers, setProviders] = useState<{ github: boolean; google: boolean } | null>(null);
  // P1.12 — anonymous password-reset flow.
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotDevUrl, setForgotDevUrl] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load task history when user opens the section
  useEffect(() => {
    if (showHistory && authToken) {
      setLoadingHistory(true);
      fetchTaskHistory(authToken)
        .then(setTaskHistory)
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [showHistory, authToken]);

  const emptyForm = (): CreateProfileInput => ({
    kind: "combo",
    name: "",
    nameEn: "",
    category: "developer",
    summary: "",
    summaryEn: "",
    sensitivity: "safe",
    components: [],
    installMode: "skip-existing",
    guideMarkdown: ""
  });
  const [uploadForm, setUploadForm] = useState<CreateProfileInput>(emptyForm());
  const [componentDraft, setComponentDraft] = useState({ type: "software" as ProfileComponent["type"], label: "", labelEn: "", detail: "" });

  const authenticated = Boolean(authUser);
  const displayName = authUser?.name ?? t.guest;

  // Provider check on mount (so we know whether to show GitHub button).
  useEffect(() => {
    fetchAuthProviders().then(setProviders).catch(() => setProviders({ github: false, google: false }));
    const oauth2faToken = localStorage.getItem("envforge_pending_2fa");
    if (oauth2faToken) {
      setPending2FA({ intermediateToken: oauth2faToken });
      localStorage.removeItem("envforge_pending_2fa");
    }
  }, []);

  async function submitAuth(mode: "login" | "register") {
    setAuthError("");
    try {
      if (mode === "login") {
        const result = await loginAccount({ email: authForm.email, password: authForm.password });
        if ("needs2FA" in result && result.needs2FA) {
          setPending2FA({ intermediateToken: result.intermediateToken, user: result.user });
          return;
        }
        if ("needsEnrollment" in result && result.needsEnrollment) {
          // Admin who hasn't set up 2FA yet — enrollment flow currently lives
          // in the SettingsPage Account panel. We treat the intermediate token
          // as a regular session so the SPA can call the 2FA enroll routes;
          // the backend rejects business routes for it but allows
          // /api/me/2fa/{status,enroll,confirm}. After confirm, the response
          // includes a new full-access sessionToken that replaces this one.
          onAuthSuccess({ token: result.intermediateToken, user: result.user });
          // Hint: caller should redirect to security panel. For now we just
          // surface a message; full UX comes when SettingsPage adds the
          // Account panel (P1.13 next iteration).
          setAuthError(locale === "zh"
            ? "管理员账号需要先开启 2FA。请前往 设置 → Account 完成。"
            : "Admin accounts must enable 2FA. Open Settings → Account to complete.");
          return;
        }
        // Now must be the regular AuthResponse branch.
        onAuthSuccess(result as { token: string; user: AuthUser });
      } else {
        // P1.5 two-step registration
        const start = await startRegistration({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password
        });
        setPendingRegistration({ pendingId: start.pendingId, devCode: start.devCode });
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    }
  }

  async function submitVerifyRegistration() {
    if (!pendingRegistration) return;
    setAuthError("");
    try {
      const result = await verifyRegistration({
        pendingId: pendingRegistration.pendingId,
        code: verifyCode.trim()
      });
      onAuthSuccess(result);
      setPendingRegistration(null);
      setVerifyCode("");
      setAuthForm({ name: "", email: "", password: "" });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Verification failed");
    }
  }

  async function submit2FA() {
    if (!pending2FA) return;
    setAuthError("");
    try {
      const result = await loginVerify2FA({
        intermediateToken: pending2FA.intermediateToken,
        code: twoFactorCode.trim()
      });
      onAuthSuccess({ token: result.token, user: result.user });
      setPending2FA(null);
      setTwoFactorCode("");
      if (result.usedRecoveryCode) {
        // Best-effort, friendly post-login warning.
        // eslint-disable-next-line no-alert
        alert(locale === "zh"
          ? `恢复码已使用。剩余 ${result.recoveryCodesRemaining ?? 0} 个，请在安全设置里重新生成。`
          : `Recovery code used. ${result.recoveryCodesRemaining ?? 0} remaining — regenerate from security settings.`);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "2FA verification failed");
    }
  }

  async function startGitHubLogin() {
    // Browser does the redirect — server's GET /api/auth/github replies 302.
    window.location.href = "/api/auth/github";
  }

  async function startGoogleLogin() {
    // Browser does the redirect — server's GET /api/auth/google replies 302.
    window.location.href = "/api/auth/google";
  }

  async function submitForgotPassword() {
    setForgotMessage("");
    setForgotDevUrl("");
    try {
      const result = await requestPasswordReset(forgotEmail.trim());
      setForgotMessage(result.message);
      if (result.devResetUrl) setForgotDevUrl(result.devResetUrl);
    } catch (error) {
      setForgotMessage(error instanceof Error ? error.message : "Request failed");
    }
  }

  function addComponent() {
    if (!componentDraft.label.trim()) return;
    setUploadForm((prev) => ({
      ...prev,
      components: [...prev.components, { ...componentDraft, label: componentDraft.label.trim(), labelEn: componentDraft.labelEn.trim() || componentDraft.label.trim() }]
    }));
    setComponentDraft({ type: "software", label: "", labelEn: "", detail: "" });
  }

  function removeComponent(index: number) {
    setUploadForm((prev) => ({ ...prev, components: prev.components.filter((_, i) => i !== index) }));
  }

  async function submitUpload() {
    setUploadError("");
    setUploadSaving(true);
    try {
      const profile = await createProfile(authToken, uploadForm);
      onProfilesChange([profile, ...userProfiles]);
      setUploadForm(emptyForm());
      setShowUploadForm(false);
      setEditingProfileId(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setUploadSaving(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      await deleteProfile(authToken, id);
      onProfilesChange(userProfiles.filter((p) => p.id !== id));
    } catch {
      // 静默处理
    }
  }

  function startEdit(profile: UserProfile) {
    setUploadForm({
      kind: profile.kind,
      name: profile.name,
      nameEn: profile.nameEn,
      category: profile.category,
      summary: profile.summary,
      summaryEn: profile.summaryEn,
      sensitivity: profile.sensitivity,
      components: profile.components,
      installMode: profile.installMode,
      guideMarkdown: profile.guideMarkdown ?? ""
    });
    setEditingProfileId(profile.id);
    setShowUploadForm(true);
  }

  const categoryOptions: Array<{ value: UserProfile["category"]; label: string; labelEn: string }> = [
    { value: "runtime", label: "运行时", labelEn: "Runtime" },
    { value: "developer", label: "开发工具", labelEn: "Developer" },
    { value: "database", label: "数据库", labelEn: "Database" },
    { value: "container", label: "容器", labelEn: "Container" },
    { value: "security", label: "安全", labelEn: "Security" },
    { value: "network", label: "网络", labelEn: "Network" },
    { value: "service", label: "服务", labelEn: "Service" }
  ];

  const sensitivityLabels: Record<UserProfile["sensitivity"], string> = {
    safe: locale === "zh" ? "安全" : "Safe",
    review: locale === "zh" ? "需审查" : "Review",
    privileged: locale === "zh" ? "需权限" : "Privileged"
  };

  const componentTypeLabels: Record<ProfileComponent["type"], string> = {
    software: locale === "zh" ? "软件" : "Software",
    "system-command": locale === "zh" ? "命令" : "Command",
    "system-config": locale === "zh" ? "配置" : "Config"
  };

  return (
    <div className="page-stack">
      {/* 顶部 hero */}
      <section className="profile-hero">
        <div className="profile-avatar">{authUser ? authUser.name.slice(0, 1).toUpperCase() : locale === "zh" ? "游" : "G"}</div>
        <div>
          <p className="eyebrow">{authenticated ? t.profile : t.guest}</p>
          <h1>{displayName}</h1>
          <p>{authenticated
            ? (locale === "zh" ? "已登录，可管理上传配置和复用自己的虚拟机配置资产。" : "Signed in. You can manage uploaded VM profiles.")
            : (locale === "zh" ? "登录后可以管理个人资料、上传配置和复用自己的虚拟机配置资产。" : "Login to manage your profile, uploaded configs, and reusable VM assets.")}
          </p>
        </div>
        <div className="profile-actions">
          {authenticated ? (
            <>
              <button className="primary-action" type="button" onClick={() => setEditingProfile(true)}><Edit3 aria-hidden />{t.editProfile}</button>
              <button className="ghost-action" type="button" onClick={onLogout}><LogOut aria-hidden />{t.logout}</button>
            </>
          ) : (
            <>
              <button className={authMode === "login" ? "primary-action" : "secondary-action"} type="button" onClick={() => setAuthMode("login")}><LogIn aria-hidden />{t.login}</button>
              <button className={authMode === "register" ? "primary-action" : "secondary-action"} type="button" onClick={() => setAuthMode("register")}><UserRound aria-hidden />{t.register}</button>
            </>
          )}
        </div>
      </section>

      {/* 登录/注册表单 */}
      {!authenticated ? (
        <section className="panel-large auth-panel">
          <div className="panel-heading">
            <h2>
              {pending2FA
                ? (locale === "zh" ? "两步验证" : "Two-factor verification")
                : pendingRegistration
                  ? (locale === "zh" ? "邮箱验证" : "Email verification")
                  : showForgot
                    ? (locale === "zh" ? "重置密码" : "Reset password")
                    : authMode === "login" ? t.login : t.register}
            </h2>
            <span>{locale === "zh" ? "本地账户" : "Local account"}</span>
          </div>

          {/* P1.10 — 2FA-pending step: enter TOTP / recovery code */}
          {pending2FA ? (
            <div className="form-grid">
              <p className="settings-help">
                {locale === "zh"
                  ? "请输入 6 位验证码，或一个 16 位恢复码（XXXXXXXX-XXXXXXXX）。"
                  : "Enter a 6-digit code or a 16-character recovery code (XXXXXXXX-XXXXXXXX)."}
              </p>
              <input
                placeholder={locale === "zh" ? "验证码" : "Verification code"}
                value={twoFactorCode}
                autoComplete="one-time-code"
                onChange={(e) => setTwoFactorCode(e.target.value)}
              />
              <button className="primary-action" type="button" onClick={() => void submit2FA()}>
                {locale === "zh" ? "验证并登录" : "Verify and sign in"}
              </button>
              <button className="ghost-action" type="button" onClick={() => { setPending2FA(null); setTwoFactorCode(""); setAuthError(""); }}>
                {locale === "zh" ? "取消" : "Cancel"}
              </button>
            </div>
          ) : pendingRegistration ? (
            /* P1.5 — register step-2: enter emailed 6-digit code */
            <div className="form-grid">
              <p className="settings-help">
                {locale === "zh"
                  ? `已向 ${authForm.email} 发送验证码，10 分钟内有效。`
                  : `A 6-digit code was sent to ${authForm.email}. It expires in 10 minutes.`}
              </p>
              {pendingRegistration.devCode ? (
                <p className="settings-help" style={{ color: "#ca8a04" }}>
                  {locale === "zh" ? "（开发模式）验证码：" : "(dev mode) code:"} <strong>{pendingRegistration.devCode}</strong>
                </p>
              ) : null}
              <input
                placeholder={locale === "zh" ? "6 位验证码" : "6-digit code"}
                value={verifyCode}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                onChange={(e) => setVerifyCode(e.target.value)}
              />
              <button className="primary-action" type="button" onClick={() => void submitVerifyRegistration()}>
                {locale === "zh" ? "完成注册" : "Complete registration"}
              </button>
              <button className="ghost-action" type="button" onClick={() => { setPendingRegistration(null); setVerifyCode(""); setAuthError(""); }}>
                {locale === "zh" ? "返回" : "Back"}
              </button>
            </div>
          ) : showForgot ? (
            /* P1.12 — forgot password */
            <div className="form-grid">
              <p className="settings-help">
                {locale === "zh"
                  ? "输入注册邮箱，我们会发送重置链接（20 分钟内有效）。"
                  : "Enter your account email; we'll send a reset link valid for 20 minutes."}
              </p>
              <input
                placeholder={locale === "zh" ? "邮箱" : "Email"}
                value={forgotEmail}
                type="email"
                onChange={(e) => setForgotEmail(e.target.value)}
              />
              <button className="primary-action" type="button" onClick={() => void submitForgotPassword()}>
                {locale === "zh" ? "发送重置邮件" : "Send reset email"}
              </button>
              <button className="ghost-action" type="button" onClick={() => { setShowForgot(false); setForgotEmail(""); setForgotMessage(""); setForgotDevUrl(""); }}>
                {locale === "zh" ? "返回登录" : "Back to login"}
              </button>
              {forgotMessage ? <p className="settings-help" style={{ color: "#16a34a" }}>{forgotMessage}</p> : null}
              {forgotDevUrl ? (
                <p className="settings-help" style={{ color: "#ca8a04", wordBreak: "break-all" }}>
                  {locale === "zh" ? "（开发模式）重置链接：" : "(dev mode) reset URL:"}{" "}
                  <a href={forgotDevUrl}>{forgotDevUrl}</a>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="form-grid">
              {authMode === "register" ? (
                <input placeholder={locale === "zh" ? "昵称" : "Display name"} value={authForm.name} onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))} />
              ) : null}
              <input placeholder={locale === "zh" ? "邮箱" : "Email"} value={authForm.email} onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} />
              <input placeholder={locale === "zh" ? "密码（至少 8 位）" : "Password (at least 8 characters)"} type="password" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} />
              <button className="primary-action" type="button" onClick={() => void submitAuth(authMode)}>
                {authMode === "login" ? <LogIn aria-hidden /> : <UserRound aria-hidden />}
                {authMode === "login" ? t.login : t.register}
              </button>
              {/* P1.7 — GitHub OAuth button (only when configured) */}
              {providers?.github ? (
                <button className="secondary-action" type="button" onClick={() => void startGitHubLogin()}>
                  {locale === "zh" ? "使用 GitHub 登录" : "Sign in with GitHub"}
                </button>
              ) : null}
              {providers?.google ? (
                <button className="secondary-action" type="button" onClick={() => void startGoogleLogin()}>
                  {locale === "zh" ? "使用 Google 登录" : "Sign in with Google"}
                </button>
              ) : null}
              {authMode === "login" ? (
                <button className="ghost-action" type="button" onClick={() => { setShowForgot(true); setAuthError(""); }}>
                  {locale === "zh" ? "忘记密码？" : "Forgot password?"}
                </button>
              ) : null}
            </div>
          )}

          {authError ? <p className="connection-error">{authError}</p> : null}
        </section>
      ) : null}

      {/* 我上传的配置组合 */}
      {authenticated ? (
        <section className="panel-large">
          <div className="panel-heading">
            <h2>{t.uploads}</h2>
            <button className="primary-action" type="button" onClick={() => { setShowUploadForm((v) => !v); setEditingProfileId(null); setUploadForm(emptyForm()); }}>
              <UploadCloud aria-hidden />
              {showUploadForm ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "上传配置组合" : "Upload profile")}
            </button>
            {activeConnectionId && authToken ? (
              <button className="secondary-action" type="button" onClick={async () => {
                try {
                  const draft = await extractCombo(authToken, activeConnectionId);
                  setUploadForm((prev) => ({ ...prev, ...draft, kind: "combo" } as CreateProfileInput));
                  setShowUploadForm(true);
                  setEditingProfileId(null);
                } catch (err) {
                  // 静默处理
                }
              }}>
                {locale === "zh" ? "从当前配置提取" : "Extract from current VM"}
              </button>
            ) : null}
          </div>

          {/* 上传/编辑表单 */}
          {showUploadForm ? (
            <div className="upload-form">
              <div className="upload-form-grid">
                <label>
                  <span>{locale === "zh" ? "名称（中文）" : "Name (Chinese)"}</span>
                  <input value={uploadForm.name} onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))} placeholder={locale === "zh" ? "例：Node.js 开发环境" : "e.g. Node.js dev env"} />
                </label>
                <label>
                  <span>{locale === "zh" ? "名称（英文）" : "Name (English)"}</span>
                  <input value={uploadForm.nameEn} onChange={(e) => setUploadForm((p) => ({ ...p, nameEn: e.target.value }))} placeholder="e.g. Node.js dev env" />
                </label>
                <label>
                  <span>{locale === "zh" ? "类型" : "Kind"}</span>
                  <select value={uploadForm.kind} onChange={(e) => setUploadForm((p) => ({ ...p, kind: e.target.value as "software" | "combo" | "vm-snapshot" }))}>
                    <option value="combo">{locale === "zh" ? "热门组合" : "Combo"}</option>
                    {authUser?.role === "admin" ? (
                      <option value="software">{locale === "zh" ? "软件配置" : "Software"}</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  <span>{locale === "zh" ? "分类" : "Category"}</span>
                  <select value={uploadForm.category} onChange={(e) => setUploadForm((p) => ({ ...p, category: e.target.value as UserProfile["category"] }))}>
                    {categoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{locale === "zh" ? opt.label : opt.labelEn}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{locale === "zh" ? "敏感度" : "Sensitivity"}</span>
                  <select value={uploadForm.sensitivity} onChange={(e) => setUploadForm((p) => ({ ...p, sensitivity: e.target.value as UserProfile["sensitivity"] }))}>
                    <option value="safe">{sensitivityLabels.safe}</option>
                    <option value="review">{sensitivityLabels.review}</option>
                    <option value="privileged">{sensitivityLabels.privileged}</option>
                  </select>
                </label>
                <label>
                  <span>{locale === "zh" ? "安装模式" : "Install mode"}</span>
                  <select value={uploadForm.installMode} onChange={(e) => setUploadForm((p) => ({ ...p, installMode: e.target.value as UserProfile["installMode"] }))}>
                    <option value="skip-existing">{locale === "zh" ? "跳过已有" : "Skip existing"}</option>
                    <option value="replace-existing">{locale === "zh" ? "覆盖已有" : "Replace existing"}</option>
                  </select>
                </label>
              </div>

              <label className="upload-full-label">
                <span>{locale === "zh" ? "简介（中文）" : "Summary (Chinese)"}</span>
                <textarea value={uploadForm.summary} onChange={(e) => setUploadForm((p) => ({ ...p, summary: e.target.value }))} rows={2} placeholder={locale === "zh" ? "一句话描述这个配置组合的用途" : "One-line description"} />
              </label>
              <label className="upload-full-label">
                <span>{locale === "zh" ? "简介（英文）" : "Summary (English)"}</span>
                <textarea value={uploadForm.summaryEn} onChange={(e) => setUploadForm((p) => ({ ...p, summaryEn: e.target.value }))} rows={2} placeholder="One-line description in English" />
              </label>

              {/* 组件列表 */}
              <div className="upload-components">
                <p className="upload-section-label">{locale === "zh" ? "组件列表" : "Components"}</p>
                {uploadForm.components.length > 0 ? (
                  <div className="component-list">
                    {uploadForm.components.map((comp, i) => (
                      <div className="component-row" key={i}>
                        <span className={`comp-type-badge ${comp.type}`}>{componentTypeLabels[comp.type]}</span>
                        <span>{comp.label}</span>
                        {comp.detail ? <span className="comp-detail">{comp.detail}</span> : null}
                        <button type="button" className="ghost-action icon-action" onClick={() => removeComponent(i)} aria-label="Remove"><X aria-hidden /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="component-draft">
                  <select value={componentDraft.type} onChange={(e) => setComponentDraft((p) => ({ ...p, type: e.target.value as ProfileComponent["type"] }))}>
                    <option value="software">{componentTypeLabels.software}</option>
                    <option value="system-command">{componentTypeLabels["system-command"]}</option>
                    <option value="system-config">{componentTypeLabels["system-config"]}</option>
                  </select>
                  <input value={componentDraft.label} onChange={(e) => setComponentDraft((p) => ({ ...p, label: e.target.value }))} placeholder={locale === "zh" ? "标签（中文）" : "Label"} />
                  <input value={componentDraft.labelEn} onChange={(e) => setComponentDraft((p) => ({ ...p, labelEn: e.target.value }))} placeholder="Label (EN)" />
                  <input value={componentDraft.detail} onChange={(e) => setComponentDraft((p) => ({ ...p, detail: e.target.value }))} placeholder={locale === "zh" ? "详情" : "Detail"} />
                  <button type="button" className="secondary-action" onClick={addComponent}>{locale === "zh" ? "+ 添加" : "+ Add"}</button>
                </div>
              </div>

              {/* Markdown 说明 */}
              <label className="upload-full-label">
                <span>{locale === "zh" ? "使用说明（Markdown，可选）" : "Guide (Markdown, optional)"}</span>
                <textarea value={uploadForm.guideMarkdown} onChange={(e) => setUploadForm((p) => ({ ...p, guideMarkdown: e.target.value }))} rows={6} placeholder={locale === "zh" ? "## 安装步骤\n\n```bash\nnpm install ...\n```" : "## Installation\n\n```bash\nnpm install ...\n```"} className="code-textarea" />
              </label>

              {uploadError ? <p className="connection-error">{uploadError}</p> : null}
              <div className="upload-actions">
                <button className="primary-action" type="button" onClick={() => void submitUpload()} disabled={uploadSaving}>
                  <UploadCloud aria-hidden />
                  {uploadSaving ? (locale === "zh" ? "保存中…" : "Saving…") : (editingProfileId ? (locale === "zh" ? "保存修改" : "Save changes") : (locale === "zh" ? "发布配置组合" : "Publish profile"))}
                </button>
                <button className="ghost-action" type="button" onClick={() => { setShowUploadForm(false); setUploadForm(emptyForm()); setEditingProfileId(null); }}>
                  {locale === "zh" ? "取消" : "Cancel"}
                </button>
              </div>
            </div>
          ) : null}

          {/* 已上传的配置组合列表 */}
          <div className="profile-list">
            {userProfiles.length === 0 ? (
              <p className="empty-hint">{locale === "zh" ? "还没有上传任何配置组合。" : "No profiles uploaded yet."}</p>
            ) : userProfiles.map((profile) => (
              <article className="profile-row" key={profile.id}>
                <div>
                  <strong>{locale === "zh" ? profile.name : profile.nameEn}</strong>
                  <span>
                    {locale === "zh"
                      ? categoryOptions.find((c) => c.value === profile.category)?.label
                      : categoryOptions.find((c) => c.value === profile.category)?.labelEn}
                    {" · "}
                    {profile.kind === "vm-snapshot"
                      ? (locale === "zh" ? "🔒 私有快照" : "🔒 Private snapshot")
                      : profile.kind === "combo"
                      ? (locale === "zh" ? "热门组合" : "Combo")
                      : (locale === "zh" ? "软件配置" : "Software")}
                    {" · "}{sensitivityLabels[profile.sensitivity]}
                    {" · "}{profile.components.length} {locale === "zh" ? "个组件" : "components"}
                    {" · "}{new Date(profile.updatedAt).toLocaleDateString()}
                  </span>
                  {profile.summary ? <span className="profile-summary">{locale === "zh" ? profile.summary : profile.summaryEn}</span> : null}
                </div>
                <div className="profile-row-actions">
                  <button className="secondary-action" type="button" onClick={() => startEdit(profile)}><Edit3 aria-hidden />{locale === "zh" ? "编辑" : "Edit"}</button>
                  <button className="ghost-action" type="button" onClick={() => void handleDeleteProfile(profile.id)}><X aria-hidden />{locale === "zh" ? "删除" : "Delete"}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* 迁移方法 */}
      <section className="panel-large">
        <div className="panel-heading">
          <h2>{locale === "zh" ? "完整迁移方法" : "Full migration methods"}</h2>
          <span>{strategies.length}</span>
        </div>
        <div className="profile-list">
          {strategies.map((strategy) => (
            <article className="profile-row" key={strategy.id}>
              <div>
                <strong>{strategy.name}</strong>
                <span>{strategy.source} · {strategy.useCase}</span>
              </div>
              <button className="secondary-action" type="button">skip / replace</button>
            </article>
          ))}
        </div>
      </section>

      {/* 个人信息只读展示 */}
      {authenticated ? (
        <section className="panel-large profile-locked">
          <div className="panel-heading">
            <h2>{t.profile}</h2>
            <Lock aria-hidden />
          </div>
          <div className="readonly-profile">
            <InfoPair label={locale === "zh" ? "昵称" : "Display name"} value={displayName} />
            <InfoPair label={locale === "zh" ? "邮箱" : "Email"} value={authUser?.email ?? ""} />
            <InfoPair
              label={locale === "zh" ? "角色" : "Role"}
              value={
                authUser?.role === "admin"
                  ? (locale === "zh" ? "🛡️ 系统管理员" : "🛡️ Admin")
                  : (locale === "zh" ? "普通用户" : "User")
              }
            />
            <InfoPair label={locale === "zh" ? "资料可见性" : "Profile visibility"} value={locale === "zh" ? "仅自己可见" : "Private"} />
          </div>
        </section>
      ) : null}

      {editingProfile && authUser ? (
        <ProfileEditModal
          user={authUser}
          locale={locale}
          onClose={() => setEditingProfile(false)}
          onSave={async (input) => { await onUpdateProfile(input); setEditingProfile(false); }}
        />
      ) : null}

      {/* 任务历史 */}
      {authenticated ? (
        <section className="panel-large" style={{ marginTop: 0 }}>
          <div className="panel-heading">
            <h2>{locale === "zh" ? "任务历史" : "Task History"}</h2>
            <button
              className="ghost-action"
              type="button"
              style={{ fontSize: 13, minHeight: 34 }}
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "展开" : "Expand")}
            </button>
          </div>
          {showHistory ? (
            loadingHistory ? (
              <div style={{ padding: "16px 0", color: "#64748b", fontSize: 14 }}>
                <span className="spinning">↻</span> {locale === "zh" ? "加载中…" : "Loading…"}
              </div>
            ) : taskHistory.length === 0 ? (
              <p className="empty-hint">{locale === "zh" ? "暂无任务记录" : "No task history yet"}</p>
            ) : (
              <div className="task-history-list">
                {taskHistory.map((entry) => (
                  <div key={entry.id} className={`task-history-entry status-${entry.status}`}>
                    <div className="task-history-header">
                      <span className={`task-history-status status-${entry.status}`}>
                        {entry.status === "succeeded" ? "✓"
                          : entry.status === "failed" ? "✗"
                          : entry.status === "cancelled" ? "✕"
                          : "⏳"}
                      </span>
                      <span className="task-history-source">{entry.source}</span>
                      <span className="task-history-meta">
                        {entry.dryRun ? (
                          <span className="task-history-badge dry-run">dry-run</span>
                        ) : null}
                        <span className="task-history-time">
                          {new Date(entry.startedAt).toLocaleString()}
                        </span>
                        {entry.completedAt ? (
                          <span className="task-history-duration">
                            {Math.round((new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000)}s
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {entry.error ? (
                      <div className="task-history-error">{entry.error}</div>
                    ) : null}
                    <div className="task-history-steps">
                      {entry.steps.slice(0, 5).map((step, i) => (
                        <span key={i} className={`task-history-step step-${step.status}`}>
                          {step.status === "ok" || step.status === "changed" ? "✓"
                            : step.status === "failed" ? "✗"
                            : step.status === "skipped" ? "—"
                            : "○"}
                          {" "}{step.name}
                        </span>
                      ))}
                      {entry.steps.length > 5 ? (
                        <span className="task-history-step" style={{ color: "#94a3b8" }}>
                          +{entry.steps.length - 5} {locale === "zh" ? "步" : "more"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
