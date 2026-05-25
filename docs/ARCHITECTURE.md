# EnvForge — 工程架构与设计

最后更新：2026-05-25

> 本文合并自 PROJECT_STRUCTURE、AUTH_AND_CONCURRENCY_PLAN、ADMIN_CATALOG_PLAN、BUILD_AND_RESTORE_FLOW、DEPLOYMENT 五篇旧文档，并全面同步了 2026-05 引入的 SQLite 高鲁棒性混合持久化架构及社区生态组件设计。

## 一、技术栈

| 层 | 技术 |
|----|------|
| **后端** | Node.js 20+ / Fastify / TypeScript |
| **前端** | React 18 / Vite / TypeScript / lucide-react |
| **引擎** | Ansible-Compatible TypeScript 原生执行器（无 Python 依赖） |
| **SSH** | `ssh2` library + SFTP |
| **存储** | **SQLite 混合型持久化引擎**（基于 `better-sqlite3`：WAL 模式 + 延迟/即时事务控制 + 物理写锁重试 + 语句预编译缓存） |
| **安全过滤** | AST 级禁止 HTML 解析（`marked` html=false） + 链接 URI Whitelist 协议校验 + 极速后端 HTML 实体字符实体编码 |
| **加密** | scrypt（密码 hash）+ AES-256-GCM（凭据加密，master key 来自 `.env`） |
| **YAML** | `yaml` package（不手工拼接，所有序列化走库） |

---

## 二、目录结构

```
EnvForge/
├── apps/
│   ├── api/                   Node.js Fastify 后端
│   │   └── src/
│   │       ├── server.ts      入口（启动 fastify + scheduler + migrations）
│   │       ├── routes.ts      所有 HTTP 路由 (评论、提议、站内信、审核、被举报处理)
│   │       ├── auth/          鉴权、2FA 模块 (OAuth / MFA / 密码策略)
│   │       ├── config.ts      .env 解析（包含 SMTP 及三方 OAuth 配置）
│   │       ├── db-sqlite.ts   核心 SQLite 引擎（连接池、PRAGMA、StatementRegistry、SHA-256校验迁移）
│   │       ├── db-store.ts    数据库存储兼容网桥（路由 SafeJsonStore 读写）
│   │       ├── runtime-store.ts   数据仓储与接口层（CommentRepository, QueueProvider, SearchProvider）
│   │       ├── scheduler.ts   WorkerRuntime 调度引擎（WAL Checkpoint, VACUUM, Data Retention 清洗）
│   │       ├── migrations.ts  升级迁移控制脚本
│   │       └── engine/        Ansible-Compatible Playbook 核心解析与执行器
│   └── web/                   React 18 + Vite 前端
│       └── src/
│           ├── api.ts         前端 HTTP 请求客户端（Cursor 评论分页）
│           ├── main.tsx       路由入口、头部 Inbox 站内信气泡下拉面板
│           ├── components/    AccountPanel (2FA提示), AdminPanel (Diff视图建议审核), MarkdownOverlay (三栏详情)
│           └── pages/         MachinePage, MarketPage (新增提议弹窗), SettingsPage
├── configs/                   内置基线配置与 Playbook
├── data/                      运行时本地持久化目录（不入 Git）
│   ├── envforge.db            主 SQLite 数据库文件
│   ├── envforge.db-wal        SQLite WAL 日志文件
│   ├── keys/                  加密保存的目标 VM 私钥
│   └── archives/              按年自动压缩归档的审计与风控历史记录
└── docs/                      工程与产品说明文档
```

---

## 三、系统解耦 ── 模块化边界设计

为了保障系统的长期可扩展性并防止 SQLite 发生“职责过度承载”的危机，EnvForge 引入了 **Repository & Provider 抽象边界模式**。业务控制器仅能通过标准抽象接口与数据源交互，禁止任何 SQL 穿透：

```
+-----------------------------------------------------------------------------------+
|                                Fastify Controllers                                |
+-----------------------------------------------------------------------------------+
       |                    |                    |                   |
       v                    v                    v                   v
+--------------+     +--------------+     +--------------+    +--------------+
| Persistence  |     |   Comment    |     |    Queue     |    |    Search    |
|  Subsystem   |     |  Subsystem   |     |  Subsystem   |    |  Subsystem   |
| (JSON Store) |     | (Relational) |     | (Async Jobs) |    |  (FTS / SQL) |
+--------------+     +--------------+     +--------------+    +--------------+
```

1.  **Persistence Subsystem** (存储配置子系统)：采用 ACID 键值文档设计（`system_kv`），确保系统高内聚性和极致的向后兼容；
2.  **Comment Subsystem** (评论交互子系统)：管理评论、点赞、被举报风控状态，使用专门的关系型 SQL 表；
3.  **Queue Subsystem** (异步任务队列子系统)：引入 `NotificationQueueProvider` 接口，当前由 `SQLiteQueueProvider` 执行，未来可平滑升级至 **Redis (bullmq)**；
4.  **Search Subsystem** (搜索子系统)：引入 `SearchProvider` 接口，当前版本对中文搜索采用索引友好的 SQL `LIKE` 模糊查询，英文搜索则结合 FTS5 虚拟表。长远可无缝切至 **Meilisearch**；
5.  **Moderation Subsystem** (社区风控子系统)：利用 `ModerationProvider` 处理自动阈值隐藏及告警升级。

---

## 四、混合型 SQLite 数据库设计

### 1. 表结构 DDL 定义

*   **`system_kv`**：核心系统配置表（Document Store）
    *   `key` (TEXT PRIMARY KEY) / `value` (TEXT NOT NULL, 存放 RuntimeDatabase JSON 字符串)
*   **`schema_migrations`**：迁移历史与文件完整性校验表
    *   `version` (INTEGER PRIMARY KEY) / `checksum` (TEXT NOT NULL, SHA-256 签名) / `applied_at` (TEXT)
*   **`users_cache_mirror`**：Lookup 外键约束专用用户元数据缓存表（只读 Cache 镜像，最终一致性同步）
    *   `id` (TEXT PRIMARY KEY) / `username` (TEXT) / `display_name` (TEXT) / `avatar_url` (TEXT) / `role` (TEXT) / `deleted_at` (TEXT)
*   **`catalog_comments`**：paginated 关系评论表
    *   `id` (TEXT PRIMARY KEY) / `catalog_id` (TEXT) / `user_id` (TEXT) / `username` (TEXT) / `display_name` (TEXT) / `avatar_url` (TEXT) / `content` (TEXT) / `visibility` (TEXT, 默认 'public') / `created_at` (TEXT)
    *   *索引设计*：`idx_comments_page ON catalog_comments(catalog_id, visibility, created_at DESC, id DESC)`（极致紧凑复合游标分页索引，**剔除了 text 列以防 B-Tree 严重膨胀**）。
*   **`comment_likes`** 与 **`comment_reports`**：高频点赞/举报表
    *   点赞主键：`PRIMARY KEY (user_id, comment_id)`（利用引擎级联合索引，完全杜绝重复点赞）。
    *   举报唯一性约束：`UNIQUE(user_id, comment_id)`。
*   **`catalog_suggestions`**：修改建议与提案表
    *   `id` (TEXT PRIMARY KEY) / `catalog_id` (TEXT NULL) / `user_id` (TEXT) / `type` (TEXT) / `name_zh` / `name_en` / `playbook_yaml` / `guide_markdown` / `remark` / `status` (TEXT, 'pending'|'accepted'|'rejected') / `feedback` / `processed_by` / `processed_at` / `created_at` / `updated_at`
*   **`admin_audit_logs`**：管理员不可篡改单向审计日志表
    *   `id` (TEXT PRIMARY KEY) / `admin_id` / `action` / `target_id` / `old_value` / `new_value` / `feedback` / `timestamp`
    *   *不可篡改铁律*：在 `admin_audit_logs` 上部署 SQLite `BEFORE UPDATE` 和 `BEFORE DELETE` 级联触发器，强行抛出 `ABORT` 阻断一切修改与删除尝试。
*   **`notification_queue`** 与 **`fts_sync_queue`**：可靠后台工作队列表
    *   包含 `status` ('pending'|'processing'|'failed'|'done'|'dead_letter')，`attempts`（重试次数，最大 5 次），`next_retry_at`（基于指数退避的时间戳），`last_error` 字段，提供 At-Least-Once (至少一次) 强力投递保障与死信丢弃。

### 2. PRAGMA 与并发优化配置

```typescript
db.pragma("journal_mode = WAL");          // 启用 Write-Ahead Logging 提升读写并行度
db.pragma("synchronous = NORMAL");         // WAL 下 NORMAL 级即可提供极致安全性与磁盘吞吐力
db.pragma("foreign_keys = ON");           // 激活关系表物理外键关联，杜绝僵尸数据
db.pragma("busy_timeout = 5000");          // 设定 5000ms 写锁等待超时，防止 SQLITE_BUSY
db.pragma("wal_autocheckpoint = 1000");    // 设定 1000 page 自动 Checkpoint 阀值
```

### 3. 锁策略分级 (Graduated Locking)

*   **Deferred Lock (延迟锁 - `BEGIN`)**：高频、轻量级日常操作（创建评论、点赞、举报）。允许多个读取连接并行，仅在实际执行 INSERT 写入时才升级为写锁，极大提高吞吐量，减少锁争抢。
*   **Immediate Lock (即时写锁 - `BEGIN IMMEDIATE`)**：复杂、多步骤的事务（建议处理、管理员审核、结构迁移）。在事务开启瞬间即索取排它写锁，确保数据一致，防范并发升级死锁。

### 4. 语句句柄编译缓存 (StatementRegistry)

为了免除每次 Fastify 请求频繁 parse SQL 所浪费的 CPU 算力，`db-sqlite.ts` 引入了 `StatementRegistry`：
```typescript
class StatementRegistry {
  private cache = new Map<string, any>();
  constructor(private db: any) {}
  get(sql: string) {
    if (!this.cache.has(sql)) {
      this.cache.set(sql, this.db.prepare(sql));
    }
    return this.cache.get(sql);
  }
}
```

---

## 五、异步运行时与生命周期调度 (WorkerRuntime)

为了确保自托管环境的免运维特征，EnvForge 引入了统一的 **`WorkerRuntime` 异步生命周期管理引擎**，统一收拢所有后台定时作业，防止 cron 散落：

### 1. 任务调度管理
由 `BackgroundTaskScheduler` 调度四类后台微任务，运行指标（状态、耗时、最近执行时间、错误日志）均实时上报至 `background_tasks` 系统表中：
*   **Hourly Checkpoint**：每小时整点调用 `PRAGMA wal_checkpoint(PASSIVE);` 强制合并 WAL 日志，防范日志无限膨胀；
*   **Daily Hot Backup**：每日凌晨 03:00 自动调用 SQLite 级 `db.backup()` 安全热备份；
*   **Weekly Vacuum & Defragmentation**：每周日凌晨 04:00 调用 `VACUUM; ANALYZE;` 重整碎片并重新收集索引树规划器统计数据；
*   **Event Retention Policy**：定时根据保留策略清理过期数据（Notification queue 保留 7 天，已读 Inbox 保留 180 天）。

### 2. 平滑关机序列 (Graceful Shutdown)
全局拦截系统的 `SIGTERM` 与 `SIGINT` 终止信号：
1.  **挂起 Worker**：后台队列状态即刻标为 `'paused'`，拒绝消费新事件；
2.  **缓冲退出**：阻塞主进程退出最大 `5000ms`，静待当前执行中的发送任务/FTS 同步原子执行完毕；
3.  **最终 Checkpoint**：调用 `PRAGMA wal_checkpoint(TRUNCATE);` 将 WAL 更改强制物理同步回 `envforge.db`；
4.  **安全 Close**：干净地关闭 SQLite 句柄并调用 `process.exit(0)`，保证零脏页和零数据损毁。

---

## 六、可观测性与运维边界

### 1. 慢查询日志追踪
在 `StatementRegistry` 执行中注入高频高精度计时器：
```typescript
const start = performance.now();
const result = stmt.run(...);
const duration = performance.now() - start;
if (duration > 100) {
  log.warn({ sql, duration }, "Slow query detected (>100ms)");
}
```

### 2. 容量极限与 PostgreSQL 迁移阈值

自托管 SQLite 运行模式建议遵守如下最大容量边界。一旦实际运维数据穿透阈值，应自动使用 `docs/future_plan.md` 提供的预置脚本平滑平移至 PostgreSQL / Redis：
*   **社区评论总容量**：最大 **1,000,000** 条记录；
*   **每日事务量**：最大 **50,000** 次写 / 天；
*   **瞬时并发写**：最大 **50** 事务 / 秒；
*   **异步队列堆积**：最大 **100,000** 条 pending。
