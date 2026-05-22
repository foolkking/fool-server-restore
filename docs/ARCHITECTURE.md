# EnvForge — 工程架构与设计

最后更新：2026-05-22

> 本文合并自 PROJECT_STRUCTURE、AUTH_AND_CONCURRENCY_PLAN、ADMIN_CATALOG_PLAN、BUILD_AND_RESTORE_FLOW、DEPLOYMENT 五篇旧文档。

## 一、技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js 20+ / Fastify / TypeScript |
| 前端 | React 18 / Vite / TypeScript / lucide-react |
| 引擎 | Ansible-Compatible TypeScript 原生执行器（无 Python 依赖） |
| SSH | `ssh2` library + SFTP |
| 存储 | JSON 文件（`SafeJsonStore`：原子写 + .bak 备份 + 写锁 + 读缓存） |
| 加密 | scrypt（密码 hash）+ AES-256-GCM（凭据加密，master key 来自 `.env`） |
| YAML | `yaml` package（不手工拼接，所有序列化走库） |

## 二、目录结构

```
EnvForge/
├── apps/
│   ├── api/                   Node.js Fastify 后端
│   │   └── src/
│   │       ├── server.ts      入口（启动 fastify + scheduler + migrations）
│   │       ├── routes.ts      所有 HTTP 路由
│   │       ├── auth.ts        scrypt 密码哈希 + 会话 token + API token
│   │       ├── config.ts      .env 解析（含 ENVFORGE_ADMIN_EMAILS）
│   │       ├── runtime-store.ts   主数据库（users / connections / playbooks / schedules / ...）
│   │       ├── migrations.ts  启动时一次性数据迁移
│   │       ├── connections.ts SSH 连接档案 + 加密存储
│   │       ├── ssh.ts         SSH 连接测试 + 探测
│   │       ├── ssh-pool.ts    SSH 客户端构造助手（keepalive 30s）
│   │       ├── collectors/
│   │       │   └── remote-collector.ts  25+ 来源系统采集（apt-mark showmanual + initial-status.gz 过滤）
│   │       ├── capture.ts     环境保留：反向生成 Playbook
│   │       ├── sensitive-scan.ts  13 条敏感字段扫描规则
│   │       ├── snapshot-deploy.ts vm-snapshot 四阶段拆分
│   │       ├── catalog.ts     基线 catalog（72 项静态硬编码）
│   │       ├── catalog-overrides.ts  admin overlay（merge / Playbook YAML / Markdown）
│   │       ├── database.ts    catalog 读取（baseline + override merge）
│   │       ├── config-files.ts  远程配置文件 list/read/write/diff
│   │       ├── preflight.ts   执行前检查（sudo/磁盘/网络/apt lock/systemd）
│   │       ├── drift.ts       漂移检测：setBaseline / runDriftCheck
│   │       ├── scheduler.ts   cron-style 任务调度器（30s tick）
│   │       ├── cron.ts        手写 5 字段 cron 解析器（无依赖）
│   │       ├── webhooks.ts    HMAC-SHA256 签名 + 5s 超时 + 并行投递
│   │       ├── task-queue.ts  per-connectionId FIFO 互斥队列
│   │       ├── executor.ts    任务执行器（包装 enqueueTask）
│   │       ├── profiles.ts    用户上传的 combo / vm-snapshot
│   │       ├── rbac.ts        三级角色 + canUploadKind
│   │       ├── crypto.ts      AES-256-GCM 凭据加密
│   │       ├── key-store.ts   SSH 密钥加密存储（data/keys/）
│   │       └── engine/
│   │           ├── index.ts            Playbook 引擎入口
│   │           ├── runner.ts           runPlaybook + 模块注册表（13 模块）
│   │           ├── ssh-executor.ts     ssh2 适配器（exec / putFile / getFile）
│   │           ├── module-docs.ts      自描述模块文档（前端模块浏览器用）
│   │           ├── errors.ts           错误分类 + 中英文修复建议
│   │           ├── impact.ts           影响范围预估
│   │           ├── modules/
│   │           │   ├── package.ts      apt/yum/dnf 幂等安装
│   │           │   ├── service.ts      systemctl 幂等管理
│   │           │   ├── lineinfile.ts   配置文件单行编辑（含 .envforge.bak 备份）
│   │           │   ├── copy.ts         SFTP 上传（含备份）
│   │           │   ├── shell.ts        逃生口（creates/removes 实现幂等）
│   │           │   ├── template.ts     Jinja2-lite 渲染
│   │           │   ├── user.ts         系统用户管理
│   │           │   ├── file.ts         文件 / 目录 mode/owner
│   │           │   ├── ufw.ts          防火墙规则
│   │           │   ├── cron.ts         crontab 管理
│   │           │   ├── systemd_unit.ts 创建 .service 单元
│   │           │   ├── sysctl.ts       内核参数
│   │           │   └── acme.ts         Let's Encrypt 证书签发
│   │           └── tests/              90 个单元测试
│   └── web/                   React + Vite 前端
│       └── src/
│           ├── main.tsx       根组件 + 导航 + 全局状态
│           ├── api.ts         所有 fetch 包装
│           ├── styles.css     全局样式
│           ├── pages/
│           │   ├── MachinePage.tsx     虚拟机管理
│           │   ├── MarketPage.tsx      配置市场（含 Preflight + 安装后 Markdown 弹窗）
│           │   ├── PlaybookPage.tsx    Playbook 编辑器
│           │   ├── SettingsPage.tsx    高级设置（5 个标签页 + admin Catalog）
│           │   └── MePage.tsx          我的空间
│           ├── components/
│           │   ├── TerminalPanel.tsx   底部终端日志（可拉伸）
│           │   ├── ConfigFilesPanel.tsx 配置文件 view/edit/diff/template
│           │   ├── InventoryPanel.tsx  软件清单（含批量卸载）
│           │   ├── ConnectionDetailPanel.tsx
│           │   ├── PreflightPanel.tsx  执行前检查报告
│           │   ├── PlaybookEditor.tsx
│           │   ├── MarkdownOverlay.tsx
│           │   ├── ComponentPreview.tsx
│           │   ├── OnboardingWizard.tsx 4 步首次启动向导
│           │   ├── CatalogAdminPanel.tsx admin catalog 管理
│           │   └── InfoPair.tsx
│           └── lib/types.ts   Locale / Page / navItems / text 字典
├── configs/
│   └── catalog/
│       ├── playbooks/<id>.yaml  72 个基线 Playbook
│       ├── software/<id>.md     软件说明
│       ├── combos/<id>.md       组合说明
│       ├── docker/<id>.yaml     docker-compose 片段
│       └── admin-notes/         管理员备选 MD
├── data/                      运行时数据（不入 git）
│   ├── runtime-db.json        主数据库（users / connections / playbooks / schedules / webhooks / tokens / catalogOverrides ...）
│   ├── snapshots/             历史采集快照
│   ├── keys/<userId>/<keyId>.enc  加密的 SSH 私钥
│   └── catalog-overrides/     admin 修改的 catalog 内容
│       ├── playbooks/<id>.yaml
│       └── guides/<id>.md
├── docs/
│   ├── PRODUCT.md             产品定位与设计
│   ├── ARCHITECTURE.md        本文（工程架构与流程）
│   └── STATUS.md              当前实现状态 + 部署 + 测试
├── scripts/
│   ├── preflight.mjs          npm run preflight
│   ├── start-production.sh    Linux 启动脚本
│   └── start-production.ps1   Windows 启动脚本
├── docker-compose.yml         生产部署
├── docker-compose.demo.yml    沙盒（含一台 Ubuntu sandbox VM）
├── Dockerfile                 多阶段构建
├── .env.example               环境变量模板
└── package.json
```

## 三、Ansible-Compatible 引擎

### 数据模型

```typescript
interface Playbook {
  name: string;
  hosts: "all" | string;
  vars?: Record<string, unknown>;
  tasks: Task[];
}

interface Task {
  name: string;
  module: string;            // package / service / lineinfile / ...
  args: Record<string, unknown>;
  when?: string;
  tags?: string[];
  register?: string;
  loop?: unknown[];
}

interface AnsibleModule<Args> {
  name: string;
  run(executor: SshExecutor, args: Args, dryRun: boolean): Promise<ModuleResult>;
}

interface ModuleResult {
  changed: boolean;
  failed?: boolean;
  msg?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}
```

每个模块自带幂等性：先 check 当前状态，再决定是否 apply。`shell` 模块用 `creates` / `removes` 实现幂等。

### YAML ↔ JS 序列化

**绝对不要手工拼接 YAML**。所有 Playbook 生成走 `yaml.stringify(obj)`，避免 `'\''` 等 shell 转义被 YAML 解析为非法 escape。

## 四、并发控制 — 任务队列

```
模块：apps/api/src/task-queue.ts
```

```typescript
// queues: Map<connectionId, QueueEntry[]>
// draining: Map<connectionId, boolean>
```

任务状态流转：

```
created
  → registerBatchTask
  → enqueueTask
  → 队列前面有任务 → status = "queued", queuePosition = N
  → 队列空 → 立即开始
  → onStart() → status = "running"
  → run() → "succeeded" | "failed" | "cancelled"
```

| 取消语义 | 行为 |
|---------|------|
| queued | 从队列移除 + status = cancelled，永远不会跑 |
| running | 设 cancelFlag，任务在下一个 yield 点退出 |
| 其它 | 无操作 |

## 五、认证体系

### 三种 token

| 类型 | 前缀 | 用途 | 存储 |
|------|------|------|------|
| Session token | base64url 32 字节 | Web 登录 | `runtime-db.sessions[]`，TTL 24h |
| API token | `envf_*` | CI/CD 集成 | `runtime-db.apiTokens[]`，存 SHA-256 hash |
| OAuth token | （未实现） | GitHub OAuth | 未实现 |

`auth.ts` 的 `getUserByToken` 同时识别 session 和 `envf_*` 前缀。

### 一次性数据迁移

`apps/api/src/migrations.ts` 在启动时执行（幂等）。当前一条迁移：把 `users` 中所有 `name.toLowerCase() === "fool"` 的账户提升为 `role = "admin"`。

未来添加新迁移：在 `MIGRATIONS[]` 数组里追加 `{ id, description, run }`，系统会自动跑。

### 待实现：GitHub OAuth

```
GET /api/auth/github            → 重定向到 GitHub authorize（含 state 防 CSRF）
GET /api/auth/github/callback   → 用 code 换 token，登录或自动注册
```

实现要点：
- `.env` 加 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_REDIRECT_URI`
- 用 `node:fetch`（不引入 passport），自己实现两次跳转
- 邮箱已有账户 → 绑定 `oauthProvider: "github"` 后登录
- 邮箱未注册 → 新建账户（无密码）
- `StoredUser` 扩展 `oauthProvider` / `oauthSubject` / `avatarUrl`

### 待实现：邮箱验证码

```
POST /api/auth/email/send-code   → 发送 6 位验证码到邮箱
POST /api/auth/email/verify      → 验证码正确后才创建账户
```

- `.env` 加 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`
- 引入 `nodemailer`
- 验证码存 `data/email-codes.json`（TTL 10 分钟，错误 5 次锁邮箱 1 小时）
- 开发降级：无 SMTP 时 console.log 输出验证码

## 六、Admin Catalog 管理 — overlay 模式

### 数据布局

```
configs/catalog/playbooks/<id>.yaml  ← 基线 Playbook（只读，72 项随代码发布）
configs/catalog/software/<id>.md     ← 基线说明（只读）
data/catalog-overrides/playbooks/<id>.yaml  ← admin override Playbook
data/catalog-overrides/guides/<id>.md       ← admin override 说明
runtime-db.catalogOverrides[]               ← 元数据 override + hidden 标记
```

### 4 种状态

| 状态 | 来源 |
|------|------|
| **baseline** | 仅基线，无 override |
| **modified** | 有元数据或文件 override |
| **added** | 完全 user-added（无 baseId） |
| **hidden** | 基线项被设 `hidden: true`，市场不再显示 |

### 加载顺序

`loadPlaybookFromCatalog(id)`：
1. `data/catalog-overrides/playbooks/<id>.yaml` 优先
2. fallback `configs/catalog/playbooks/<id>.yaml`
3. 都没有：404

`readCatalogGuide(id)`：同样的双层 fallback。

`listCatalogFromDatabase()`：基线 + override 元数据合并（`mergeCatalog`），过滤掉 hidden。

### 为什么不直接改基线？

- 升级 EnvForge 时基线代码新增的 catalog 自然出现，不需要数据迁移
- admin 可以「重置为基线」恢复
- 改动集中在 `data/`，备份 / 迁移容易

### 安全护栏

- 严格 id 正则 `^[a-z0-9][a-z0-9-]{0,59}$` 防路径注入
- 保存前服务端 `parsePlaybook(yaml)` 校验
- API 端点全部要 `role === "admin"`，否则 403

## 七、构建与部署

### 本地开发 / 生产部署

```bash
npm install
echo "ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" > .env
npm run build
node apps/api/dist/server.js     # 或 npm run start:prod
```

### Docker 部署（推荐）

```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```

### 沙盒演示（含一台 Ubuntu target VM）

```bash
docker compose -f docker-compose.demo.yml up -d
# 访问 http://localhost:5173
# VM Manager 添加连接：host=sandbox-vm port=22 user=demo password=demo
```

### 健康检查

```bash
GET /api/health   # 简单 ping
GET /api/ready    # 检查数据目录可写、web 静态文件存在
npm run smoke:test
```

### 关键 .env 变量

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=5173
ENVFORGE_MASTER_KEY=<base64 32 字节>     # 必填，凭据加密
SESSION_TTL_HOURS=24
SERVE_WEB=1
WEB_DIST_DIR=apps/web/dist
ENVFORGE_ADMIN_EMAILS=admin@example.com  # 可选，admin 邮箱白名单（逗号分隔）
# 待实现：
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# SMTP_HOST=
# SMTP_PORT=
```

### 部署安全边界

- `data/` 加入备份策略，**不入 git**
- 公网部署需要反向代理 HTTPS、登录速率限制
- Master key 一旦丢失，所有加密的 SSH 密码 / 密钥无法解密
- 推荐 systemd 或 pm2 做进程管理

## 八、关键设计决策

| 决策 | 理由 |
|------|------|
| 自建引擎而非集成 Ansible | 避免 Python 依赖；YAML 格式兼容，用户随时可迁移 |
| JSON 文件 + SafeJsonStore 而非 SQLite | 减少 native 编译依赖，部署简单；写锁 + 原子写已足够 |
| 手写 cron 解析器而非 node-schedule | 减少依赖，5 字段语义足够，8 个测试覆盖 |
| Catalog overlay 而非可写 catalog | 升级时基线新项自动出现；可重置 |
| Per-connectionId 互斥而非全局锁 | 多 VM 并行 + 同 VM 串行，符合实际工作负载 |
| Ansible 兼容的 YAML 格式 | 用户学到的就是 Ansible，不锁定 |
| TypeScript 全栈而非分语言 | 单一团队心智，类型穿透前后端 |
