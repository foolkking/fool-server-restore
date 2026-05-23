# 身份系统与 Catalog 生态

本文覆盖 EnvForge 的多 provider 登录、两步验证、密码重置、个人资料、邮件通知等功能。配置 / 部署见 `docs/DEPLOY.md`，开发约定见 `docs/CATALOG_AUTHORING.md`。

> 适用版本：Phase 1 (auth-and-ecosystem spec v0.4.x)。Phase 2/3（Catalog 上架审核 + 评论）后续补充。

---

## 1. 登录方式

EnvForge 支持两条独立但可互绑的登录路径：

| 方式 | 适合谁 | 必填 | 备注 |
|------|--------|------|------|
| 本地账号（邮箱 + 密码） | 所有用户 | 邮箱 + 8 位以上密码 | 注册需邮箱验证码 |
| GitHub OAuth | 信任 GitHub 的用户 | 在 GitHub 开发者中心建 OAuth App | 一键登录，邮箱来自 GitHub |

一个内部账号可以**同时**绑定多种登录方式（design D-1.1）。在 `Settings → Account → Identities` 里可以增减。

**约束**：至少要保留一种登录方式 —— 解绑最后一个会被后端拒绝（409）。

### 1.1 邮箱碰撞规则

如果用户用 GitHub 登录，但 GitHub 账号的邮箱在系统里已经被某个本地账号占用：**自动登录被拒**。系统不会自动 merge 两个账号（防止账号被劫持）。处理方法：

1. 先用本地账号登录
2. 在 `Settings → Account → Identities` 点 "Link GitHub"
3. OAuth 回调把 GitHub identity 绑到当前账号上

界面会显示提示：`The email X is already registered. Sign in with your password first, then link GitHub from settings.`

---

## 2. 注册流程（两步）

```
[输入名 / 邮箱 / 密码] → POST /api/auth/register/start
    ↓
[收到 6 位验证码] → 后端发邮件
    ↓
[输入验证码] → POST /api/auth/register/verify
    ↓
[创建 user + 颁发 session]
```

- 验证码 10 分钟内有效，5 次错误锁定（必须重新 start）
- 同邮箱第二次 start 会替换前一个 pending（only one in-flight）
- 邮箱必须未被注册（防重）
- `ENVFORGE_ADMIN_EMAILS` 中列出的邮箱注册时直接拿到 admin 角色

**dev 模式**：`NODE_ENV !== "production"` 时，`/start` 的 response 会含 `devCode` 字段直接显示验证码，方便没配 SMTP 的本地开发。生产环境绝不会暴露。

---

## 3. 两步验证（2FA / TOTP）

### 3.1 启用

UI: `Settings → Account → Two-factor`

```
[Start enrollment] → POST /api/me/2fa/enroll
    ↓
[扫描 QR 或手抄 secret 进 Authenticator]
    ↓
[输入 6 位 TOTP 码] → POST /api/me/2fa/confirm
    ↓
[显示 8 个 recovery codes —— 仅一次！请保存]
```

- secret 用 master key AES-256-GCM 加密落盘
- recovery codes 仅 SHA-256 hash 落盘，明文只在 confirm 那一刻返回
- 兼容 Google Authenticator / 1Password / Bitwarden / Microsoft Authenticator / Authy

### 3.2 登录时

启用 2FA 的账号登录时：

```
[输入邮箱 + 密码] → /api/auth/login
    ↓
[后端返 needs2FA: true + intermediateToken (5 分钟有效)]
    ↓
[输入 6 位 TOTP 或 16 位 recovery code] → /api/auth/login/2fa
    ↓
[正式 session token]
```

- 6 位数字 → 走 TOTP（±30 秒容差）
- 16 位 base32 + 中点 hyphen → 走 recovery（一次性消费）
- intermediate token 只能调 `/api/auth/login/2fa`，**不能**调任何业务路由

### 3.3 admin 强制 2FA

`role=admin` 但未启用 2FA 的用户登录时，后端不发常规 session，而是发 `enrollment-required` token（15 分钟）。这个 token：

- 能调 `/api/me/2fa/{status,enroll,confirm}` 完成 enrollment
- **不能**调任何业务路由
- 完成 confirm 后 response 会带 `sessionToken` 字段，前端用它替换原 token，自动升级为正式 session

UI 会自动跳到 `Settings → Account` 提示 admin 完成 enrollment。

### 3.4 关闭 / 重新生成

UI: `Settings → Account → Two-factor → Disable / Regenerate`

- 关闭：必须 password 或当前 TOTP 码任一项 re-auth
- 重新生成 8 个 recovery codes：旧的全部失效

---

## 4. 改邮箱

UI: `Settings → Account → Email address`

```
[输入新邮箱] → POST /api/me/email-change/request
    ↓
[新邮箱收到 6 位验证码 + 老邮箱收到变更通知]
    ↓
[输入验证码] → POST /api/me/email-change/confirm
    ↓
[user.email 更新 + emailVerifiedAt 刷新]
```

**安全设计**：

- 验证码发到**新**邮箱 —— 防止 session 被劫持后悄悄迁走账号
- 老邮箱同时收到一封"你的邮箱即将变更"通知（带加红的安全提示），让真主人能反应
- 同用户同时只允许一个 in-flight，新 request 替换旧的

---

## 5. 改密码

UI: `Settings → Account → Change password`

- **有本地密码的账号**：必须输入当前密码 + 新密码（>=8 位，新旧不能一样）
- **OAuth-only 账号**：必须先开启 2FA，然后用当前 TOTP 码 re-auth 设置初始密码（fair price for 不可逆操作）

变更后**不会**撤销现有 sessions（手机 + 桌面并行登录继续可用）。需要"全设备登出"功能时，请用 [Section 6](#6-忘记密码) 的密码重置。

---

## 6. 忘记密码

UI: 登录页 → `忘记密码？`

```
[输入邮箱] → POST /api/auth/password-reset/request
    ↓
[收到含一次性链接的邮件 (20 分钟有效)]
    ↓
[点链接进 SPA，输新密码]
    ↓
POST /api/auth/password-reset/confirm
    ↓
[新密码生效 + 该用户所有 sessions 被撤销]
```

**反枚举**：未知邮箱 / OAuth-only 账号 / 软删账号 / 格式错的邮箱 —— 全都返回同一条 generic 消息（`If an account with that email exists, a password reset link is on its way.`）。攻击者无法用这个端点探测哪些邮箱注册过。

**强制全设备登出**：与 voluntary password change 不同，password reset 假设旧密码已泄漏，所以会撤销该用户**所有** sessions。

dev 模式下 response 会含 `devResetUrl`，直接跳过邮件验证调试。

---

## 7. 个人资料字段

UI: `Settings → Account → Profile`

| 字段 | 必填 | 限制 | 说明 |
|------|------|------|------|
| displayName | ✓ | ≤ 80 字符，无控制字符 | 展示名 |
| username | ✓ | 3-32 字符，`a-z 0-9 _ -`，须以字母开头 | @提及用，全局唯一（case-insensitive） |
| bio | | ≤ 1000 字符，允许换行 | 简介，按 plain text 渲染（HTML 转义） |
| avatarUrl | | **必须 https://**，≤ 500 字符 | 拒绝 `data:` / `file:` / `http:` |
| timezone | | IANA 格式（如 `Asia/Shanghai`） | 用 Intl.DateTimeFormat 校验 |
| locale | | `auto` / `zh-CN` / `en-US` | UI 语言 |
| defaultSshUser | | `[a-zA-Z_][a-zA-Z0-9_-]{0,31}` | 连接默认 SSH 用户名 |

留空字符串清空字段（除了 displayName/username 必填）。

---

## 8. 通知偏好

UI: `Settings → Account → Email notifications`

| 字段 | 默认 | 说明 |
|------|------|------|
| emailMentions | true | @ 提及 |
| emailComments | false | 我的评论被回复（busy item 上可能很吵） |
| emailSuggestionStatus | true | 我提的建议状态变化 |
| emailPublishStatus | true | 我提的上架请求结果 |

**事务邮件不可关**：注册验证码、密码重置、admin-forced 2FA disable 等关键安全邮件**不**受这些 flag 影响 —— 必发。

---

## 9. 软删账号

UI: `Settings → Account → Danger zone`

要求：

1. password 或当前 TOTP 码 re-auth
2. 字面输入 "DELETE" 确认（防误点）
3. **不能删除唯一的 admin**（系统失去管理员的不变量）

执行后：

- `user.deletedAt` 设为当前时间，登录被拒
- 所有 sessions 被撤销
- TOTP secret + recovery codes 清空
- 所有 pending 行（注册 / 邮箱变更 / TOTP enrollment / password reset）清掉
- **保留**用户已发表的内容（评论、建议、drafts）；UI 显示作者为 "[deleted]"

---

## 10. 配置 GitHub OAuth

### 10.1 在 GitHub 创建 OAuth App

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. 填：
   - Application name: `EnvForge`（或自定义）
   - Homepage URL: `https://envforge.example.com`
   - Authorization callback URL: **`https://envforge.example.com/auth/github/callback`**（**必须**与下面 `.env` 一致，包括 https 和路径）
3. 创建后保存 `Client ID` 和 `Client Secret`

### 10.2 配置 `.env`

```bash
# 必填三项，缺一会让登录页不显示 GitHub 按钮 + OAuth 路由 503
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REDIRECT_URI=https://envforge.example.com/auth/github/callback
PUBLIC_BASE_URL=https://envforge.example.com
```

### 10.3 验证

```bash
curl https://envforge.example.com/api/auth/providers
# 期望：{"github":true,"google":false}
```

如果 `github: false`，检查 .env 是否完整 + 是否重启了 API。

### 10.4 安全要点

- callback URL 严格匹配（防 redirect_uri 攻击）
- state 用 HMAC-SHA256（10 分钟 TTL，单次使用，从 master key 派生独立子 key）
- access_token 仅用于本次 callback 取 profile，不持久化
- session token 通过 URL fragment 回传 SPA（fragment 不进 server log）

---

## 11. 配置 SMTP

### 11.1 Gmail（推荐，免费）

1. 在 Gmail 账号开启**两步验证**（Account → Security → 2-Step Verification）
2. 生成**应用专用密码**：Account → Security → App passwords → 选 "Mail" + 设备名 → 16 位密码
3. 配 `.env`：

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx     # 应用专用密码（16 位含 hyphen）
SMTP_FROM=EnvForge <you@gmail.com>
```

### 11.2 自建 / 商用 SMTP

```bash
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=465                       # 465 implicit TLS / 587 STARTTLS
SMTP_USER=envforge@your-domain.com
SMTP_PASS=your-password
SMTP_FROM=EnvForge <envforge@your-domain.com>
```

`SMTP_FROM` 留空时自动用 `noreply@<host of PUBLIC_BASE_URL>`。

### 11.3 不配 SMTP

API 会进入 **stdout fallback**：所有"该发的邮件"内容打印到容器日志。**仅适合本地开发**；生产部署务必配真实 SMTP，否则用户收不到验证码 / 密码重置 link。

### 11.4 速率限制

`EMAIL_RATE_PER_USER_PER_HOUR` 默认 30 —— 防滥用 + 避免触发上游 SMTP 商的速率限制。超限自动 drop + 写日志（用户看不到）。需要时可调高。

---

## 12. 安全检查清单（部署前）

- [ ] `ENVFORGE_MASTER_KEY` 已生成并离线备份（丢失 = 所有加密凭据 + TOTP secret 全部解不开）
- [ ] `ENVFORGE_ADMIN_EMAILS` 至少有一个真实邮箱
- [ ] `PUBLIC_BASE_URL` 是真实 https URL（影响 OAuth callback、生成的链接）
- [ ] 配了 SMTP 或明确接受 stdout fallback（仅开发）
- [ ] GitHub OAuth callback URL 与 `.env` 完全一致（含 https / 路径）
- [ ] admin 账号已开 2FA（首次登录会强制）
- [ ] `.env` 文件权限 0600，不要 commit 进 git
- [ ] 反代层强制 https，不要 expose http://*:5173 直对公网

---

## 13. 数据迁移

| 版本 | 文件 | 改动 |
|------|------|------|
| 0.3.0 → 0.4.0 | `migrations/0004-multi-identity.ts` | 给每个有 passwordHash 的用户派生 `provider="local"` UserIdentity，生成 username（从邮箱 local-part），复制 displayName |
| 0.4.0 → ... | （未来） `0005-catalog-restructure` | Phase 2 增加 catalog 生态字段 |

升级 schemaVersion 是**单向**的；运行迁移前请用 `npm run backup:db` 备份。

```bash
# 备份当前 runtime-db.json
node scripts/backup-runtime-db.mjs

# 启动 API（自动跑迁移）
npm run start:server
# 或 docker compose up -d
```

迁移幂等 —— 二次运行不会重复创建行。日志会显示 `[migrations] 0004-multi-identity: nothing to do`。

---

## 14. 故障排查

### 注册收不到邮件

1. 检查 `/api/health` 是否 200
2. 容器日志看 `[email]` 行：
   - `stdout-fallback` 表示没配 SMTP，验证码会直接打到日志
   - `giving up after 3 attempts` 表示 SMTP 错（账号 / 密码 / 端口 / TLS）
   - 没有任何 `[email]` 行 → enqueue 没被调用，检查 `/api/auth/register/start` 的返回
3. dev 模式（`NODE_ENV !== "production"`）API 直接在 response 返 `devCode`，可绕过 SMTP

### 登录 reports `Email or password is incorrect.`

- 该账号被软删（user.deletedAt 非空）
- 该账号是 OAuth-only（无 passwordHash）— 用 GitHub 登录或先 reset 密码
- 用户名 / 邮箱拼写错（注意大小写：邮箱被自动小写化）

### TOTP 码总是错

- 客户端时钟不同步（差 30 秒以上）— 用 `ntpdate` / Windows time sync 校时
- 用错了 issuer / account label —— 重新 enroll 一次

### admin 登录总跳到 enrollment

正常行为：admin 强制 2FA。完成 enrollment 后会自动升级为正式 session。

### `/auth/github/callback` 总返回 `oauth_error=invalid_state`

- state token 过期（10 分钟 TTL）— 重新点 "Sign in with GitHub"
- 双 tab 都点了登录 —— 后一个 state 把前一个 invalidate 掉了
- 服务器时钟漂移过大

---

## 15. 进一步阅读

- 数据模型与 API 路由：`.kiro/specs/auth-and-ecosystem/design.md`
- 任务清单与决策日志：`.kiro/specs/auth-and-ecosystem/tasks.md`
- Catalog 生态（Phase 2/3 规划中）：`.kiro/specs/auth-and-ecosystem/requirements.md`
