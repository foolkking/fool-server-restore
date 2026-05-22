# EnvForge 产品策略与功能规划（v3 重构版）

更新时间：2026-05-22

## v3 修订摘要

本版本基于用户反馈做了三项重构：

1. **认证体系扩展**：原本仅支持邮箱+密码注册（无验证），扩展为：
   - **邮箱注册 + 邮箱验证码激活**
   - **GitHub OAuth 登录**
   - **保持登录 24h**（已实现）
2. **三级角色模型重新激活**：原本设计的 `admin / user / guest` 三级角色实际只用了 `admin / user`。重构为：
   - **guest（未登录）**：浏览市场、查看公开 catalog 详情；不能安装、不能保留环境
   - **user（登录用户）**：连接自己的 VM、安装/卸载、保留环境、上传 combo / vm-snapshot
   - **admin（系统管理员）**：用户全部能力 + 发布 software 配置 + 管理用户 + 审核用户上传的 combo
   - **首位 admin**：env var `ENVFORGE_ADMIN_EMAILS` 中列出的邮箱注册时自动为 admin。已存在的用户名为 `fool` 的账户通过启动时一次性数据库迁移设为 admin（不再基于用户名做运行时自动提升）
3. **并发控制（任务队列）**：
   - **同一 VM 同时只能运行一个 Playbook**（排队等候）
   - **同一用户可对多个 VM 并行运行同一 Playbook**（每 VM 独立队列，互不阻塞）
   - **跨用户冲突**：A 用户和 B 用户同时操作同一 VM → 后到的排队（基于 connectionId）
   - 队列状态在 UI 上显示：`排队中（前面 N 个任务）`

> v2 的所有内容继续有效，本版只在 v2 基础上叠加。下文 1–10 节保留，新增 11、12 节。

---

## 一至十节：原 v2 内容（保留）

（与 v2 完全相同 — 三大主导航、Ansible-Compatible 引擎、Catalog → Playbook、环境保留 → Playbook、Docker 部署、配置文件管理…全部已实现）

详见上一版历史。本节不再重复，下面只列**新增与变更**。

---

## 十一、认证体系扩展（v3 新增）

### 11.1 三级角色定义

| 角色 | 标识 | 能力 |
|------|------|------|
| **guest** | 未登录 | 浏览 catalog 列表 / 查看公开 MD / 查看 catalog 详情 |
| **user** | 登录用户（默认） | guest 全部 + 连接 VM + 安装 / 卸载 / 重启 / 重新探测 + 环境保留 + 上传 combo + 上传 vm-snapshot（私有）+ 创建 Playbook |
| **admin** | `role = "admin"` | user 全部 + 发布 software 类 catalog + 删除任意 combo + 管理用户列表 + 查看全局任务历史 |

### 11.2 admin 设定方案

**首次启动**：
- `.env` 中 `ENVFORGE_ADMIN_EMAILS=fool@example.com,admin@example.com`（逗号分隔）
- 列在该清单中的邮箱，注册后自动 `role = "admin"`
- 兼容方案：用户名为 `fool` 也自动为 admin（user 默认要求）

**运行时变更**：
- admin 可在 `/me` 页面看到「用户管理」入口（仅 admin 可见）
- 可以提升其他 user 为 admin / 降级 / 锁定账户

### 11.3 注册方式

#### A. 邮箱注册 + 验证码（增强）

当前实现：邮箱+密码直接注册，无验证。
增强方案：
1. 用户提交邮箱 + 密码
2. 后端生成 6 位数字验证码，存入 `data/email-codes.json`，TTL 10 分钟
3. SMTP 发送验证码邮件（用 nodemailer，配置在 `.env`：`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`）
4. 用户输入验证码，后端校验通过后才创建账户
5. 验证码错误 5 次锁定该邮箱 1 小时

**降级方案**（开发环境无 SMTP）：
- 当 `.env` 没有 `SMTP_HOST` 时，验证码直接 console.log 输出，便于本地调试
- 生产环境必须配置 SMTP

#### B. GitHub OAuth 登录（新增）

实现：
1. `.env` 配置 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_REDIRECT_URI`
2. 前端「使用 GitHub 登录」按钮 → `GET /api/auth/github` → 跳转 GitHub OAuth
3. 回调 `GET /api/auth/github/callback?code=...`：
   - 用 code 换 access token
   - 用 token 拉 GitHub 用户信息（`/user`、`/user/emails`）
   - 邮箱匹配已有账户 → 绑定 GitHub 身份并登录
   - 邮箱未注册 → 自动创建 user 账户（无需密码，标记 `oauthProvider: "github"`）
4. 用户资料里显示 GitHub 头像和用户名
5. GitHub 邮箱也参与 `ENVFORGE_ADMIN_EMAILS` 匹配

**实现库**：
- `nodemailer`（邮件发送）
- 不引入额外 OAuth 库，自己用 `node:fetch` 实现两次 HTTP 跳转（避免 passport 等大依赖）

### 11.4 数据模型变更

```typescript
// runtime-store.ts
export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;        // 可选：OAuth 用户没有
  passwordSalt?: string;
  oauthProvider?: "github";     // 新增
  oauthSubject?: string;        // GitHub user id
  avatarUrl?: string;           // 新增（来自 GitHub）
  emailVerified: boolean;       // 新增（邮箱注册必须为 true）
  role: "user" | "admin";       // 已有
  locked: boolean;              // 新增（admin 锁定）
  createdAt: string;
  updatedAt: string;
}

// 新增表
export interface EmailVerificationCode {
  email: string;
  code: string;
  expiresAt: string;
  attempts: number;
}
```

---

## 十二、并发控制 — 任务队列（v3 新增）

### 12.1 需求规则

- **互斥粒度 = connectionId**（一台 VM）
- **同一 VM**：最多一个 Playbook 在跑，其它进队列
- **不同 VM**：完全并行（不互相阻塞）
- **用户 A 锁住 VM X 时**：用户 B 的任务也得排队（防止两个用户同时改一台机器）
- **批量任务（一个 Playbook 跑多 VM）**：每个 VM 单独入队，互不阻塞

### 12.2 实现方案

**新模块：`apps/api/src/task-queue.ts`**

```typescript
interface QueueEntry {
  taskId: string;
  userId: string;
  connectionId: string;
  enqueuedAt: string;
  run: () => Promise<void>;
}

// 每个 connectionId 一个 FIFO 队列
const queues = new Map<string, QueueEntry[]>();
// 每个 connectionId 是否正在运行
const running = new Map<string, boolean>();

export async function enqueueTask(entry: QueueEntry): Promise<void> {
  const list = queues.get(entry.connectionId) ?? [];
  list.push(entry);
  queues.set(entry.connectionId, list);
  await drain(entry.connectionId);
}

async function drain(connectionId: string): Promise<void> {
  if (running.get(connectionId)) return; // already processing
  running.set(connectionId, true);
  try {
    const list = queues.get(connectionId) ?? [];
    while (list.length > 0) {
      const entry = list.shift()!;
      await entry.run().catch(() => { /* run handles its own errors */ });
    }
    queues.delete(connectionId);
  } finally {
    running.set(connectionId, false);
  }
}

export function getQueuePosition(connectionId: string, taskId: string): number {
  const list = queues.get(connectionId) ?? [];
  return list.findIndex((e) => e.taskId === taskId); // -1 if not in queue
}
```

**改造 executor.ts**：所有 `executeBatchCatalogTask` / `executePlaybookTask` 调用包裹在 `enqueueTask` 里。

### 12.3 任务状态扩展

```typescript
type TaskStatus = "queued" | "pending" | "running" | "succeeded" | "failed" | "cancelled";
```

新增 `queued` 状态，UI 上显示：
- `queued`：黄色徽标 + "排队中（前面 N 个任务）"
- `running`：绿色脉冲

SSE 流在状态变化时（包括从 `queued` → `running`）推送给前端。

### 12.4 一对多 Playbook（同用户多 VM）

`POST /api/multi-execute` 已经把 Playbook 拆成 N 个 connectionId 的子任务。每个子任务独立 enqueue 到自己 VM 的队列。所以：
- 用户 A 把 Playbook P 应用到 VM1 / VM2 / VM3 → 三个任务，分别进 VM1 / VM2 / VM3 的队列
- 三个队列空闲时，三个任务并行跑（用户 A 一次性看到三个 SSE 流）
- 如果 VM2 此时正被其他任务占用 → A 在 VM2 上的子任务排队，VM1 / VM3 上仍正常跑

### 12.5 取消语义

- 取消正在 running 的任务：照旧（设置 cancelFlag）
- 取消 queued 的任务：从队列里移除，状态 → `cancelled`，永远不会进入 running

---

## 十三、Roadmap（v3 排序）

### P0（立即做）
- [x] **task-queue 实现**（per-connectionId FIFO 队列）
- [x] **admin 邮箱白名单 + 现存 fool 用户一次性迁移为 admin**
- [x] **role 字段在 UI 上显示徽章**（admin / user / guest）

### P1（下一轮）
- [ ] **邮箱验证码注册**（nodemailer + 验证码表）
- [ ] **GitHub OAuth 登录**（手动实现两次 HTTP）
- [ ] **管理员后台**（`/admin`：用户列表 + 角色管理 + 锁定）

### P2（后续）
- [ ] **配置文件敏感扫描**（v2 P0 遗留）
- [ ] **冲突文件备份**（v2 P0 遗留）
- [ ] **Verify 阶段**（执行后 reprobe + diff）

---
