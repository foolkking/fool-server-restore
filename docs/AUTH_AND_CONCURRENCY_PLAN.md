# 认证 / 角色 / 并发控制 设计与进度

更新时间：2026-05-22

## 一、当前进度

### ✅ 已完成（本次提交）

1. **三级角色模型激活**
   - `guest`（未登录）/ `user`（默认登录）/ `admin`（系统管理员）
   - 角色徽章在 MePage 显示（🛡️ 系统管理员 / 普通用户）
2. **Admin 设定方案**
   - 邮箱在 `ENVFORGE_ADMIN_EMAILS` 列表里的，注册时自动为 admin
   - **登录时也会重新检查**：已存在的用户邮箱后来被加入清单时，登录时自动 promote
   - 通过 `.env` 配置，可运行时调整
   - **历史用户名为 fool 的账户**：服务器启动时通过一次性数据库迁移（`migrations.ts`）将其设为 admin。这是一次性操作，新注册的"fool"不会自动成为 admin。
3. **任务并发控制（Per-VM FIFO 队列）**
   - 模块：`apps/api/src/task-queue.ts`
   - 同一 connectionId 同时只能有一个 Playbook 运行
   - 不同 connectionId 完全并行（一个用户可以同时对 N 台 VM 跑同一个 Playbook）
   - 跨用户在同一 VM 上的任务也会排队，避免冲突
   - UI 显示「任务排队中 · 前面还有 N 个任务」
   - 取消队列中的任务（不会进 running） vs 取消正在跑的任务（设 cancelFlag）
   - 5 个新测试覆盖 FIFO / 并行 / 取消 / 队列快照场景，全部通过
4. **管理员监控接口**
   - `GET /api/admin/queues` → 当前所有连接的队列状态（仅 admin）

### ⏳ 待实现（按优先级）

#### P1 — GitHub OAuth 登录

```
GET /api/auth/github            → 重定向到 GitHub authorize
GET /api/auth/github/callback   → 用 code 换 token，登录或自动注册
```

实现步骤：
1. `.env` 添加 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_REDIRECT_URI`
2. 在 GitHub 开发者后台注册 OAuth App
3. 后端用 `node:fetch`（不引入 passport）实现 OAuth 流程：
   - state 参数防 CSRF
   - 用 access token 拉 `/user` 和 `/user/emails`
   - 邮箱已有账户 → 绑定 `oauthProvider: "github"` 后登录
   - 邮箱未注册 → 新建账户（无密码，标记 OAuth 来源）
4. 前端添加「使用 GitHub 登录」按钮
5. `StoredUser` 扩展 `oauthProvider`、`oauthSubject`、`avatarUrl`

#### P1 — 邮箱注册验证码

```
POST /api/auth/email/send-code   → 发送 6 位验证码到邮箱
POST /api/auth/email/verify      → 验证码正确后才创建账户
```

实现步骤：
1. `.env` 添加 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`
2. 安装 `nodemailer`
3. 验证码存储：`data/email-codes.json`（邮箱、码、过期时间、尝试次数）
4. 验证码 TTL 10 分钟，错误 5 次锁定该邮箱 1 小时
5. 开发降级：`.env` 没设 SMTP 时直接 `console.log` 输出验证码
6. 前端注册流程改成两步：填表 → 输入验证码

#### P2 — 管理员后台

`/admin` 页面（仅 admin 可见）：
- 用户列表（id / name / email / role / locked / createdAt）
- 操作：提升为 admin / 降级 / 锁定 / 解锁
- 全局任务历史
- 全局队列监控（实时刷新 `/api/admin/queues`）
- 用户上传的 combo 审核

---

## 二、并发控制 — 详细设计

### 2.1 互斥粒度

```
┌─────────────────────────────────────────┐
│ 用户 A 把 Playbook P 应用到 VM1 / VM2 / VM3 │
│ → 三个独立任务进入三个独立队列              │
│ → 三个 VM 上的队列都是空的 → 三个并行执行    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 用户 A 触发 PlaybookP1 → VM1（running）  │
│ 用户 A 又触发 PlaybookP2 → VM1（queued） │
│ 用户 B 同时触发 PlaybookP3 → VM1（queued）│
│ → VM1 队列：[P1 running] [P2 queued] [P3 queued] │
│ → P1 完成后跑 P2，P2 完成后跑 P3          │
└─────────────────────────────────────────┘
```

### 2.2 数据结构

```typescript
// queues: Map<connectionId, QueueEntry[]>
// 每个 connectionId 维护自己的 FIFO 队列
// draining: Map<connectionId, boolean>
// 标志该 connection 是否在 drain（防止并发 drain）
```

### 2.3 任务状态流转

```
created → registerBatchTask
       → enqueueTask
       → 队列前面有任务 → status = "queued", queuePosition = N
       → 队列空 → 立即开始
       → onStart() → status = "running"
       → run() → status = "succeeded" | "failed" | "cancelled"
```

### 2.4 取消语义

| 状态 | cancelTask 行为 |
|------|----------------|
| queued | 从队列移除 + status = "cancelled" + 永远不会跑 |
| running | 设 cancelFlag，任务在下一个 yield 点检测后退出 |
| 其它 | 无操作 |

---

## 三、未来扩展（不在本轮范围）

- 跨进程任务队列（用 Redis 锁）—— 当前是单进程内存锁
- 优先级队列（admin 任务优先）
- 队列长度限制（防止恶意刷任务）
- 任务超时强制中断
