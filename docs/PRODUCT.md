# EnvForge — 产品定位与设计

最后更新：2026-05-25

> 本文合并自 PRODUCT_STRATEGY、PROJECT_BLUEPRINT、REVISED_PRODUCT_UNDERSTANDING、UI_AND_VM_MANAGEMENT、MARKET_MD_AND_MIGRATION_PLAN、PRIVACY_AND_RESTORE_STRATEGY、SYNC_MODEL 七篇旧文档，并补充了 2026-05 SQLite 数据库升级与社区配置生态子系统的最新架构与产品定义。

## 一、产品定位

**EnvForge** 是一个**自托管的 Linux 服务器配置管理网站**。

服务端是一个 Node.js + Fastify Web 应用，用户通过浏览器登录后，用 SSH 连接目标 Linux VM，在 Web UI 中：

- 浏览**配置市场**（72 个预置 Playbook：运行时 / 数据库 / 安全 / 网络 / 容器…）
- 一键安装 / 卸载软件，配置文件查看与编辑
- **环境保留**：从已连接 VM 反向生成可重建的 Playbook
- 多目标批量执行同一 Playbook，定时调度，漂移检测
- **社区化共建生态**：用户可以对市场中的软件进行评论、提议修改建议（附带 Playbook 和 Markdown 指南）或发起新增软件提议，由系统管理员统一审核并支持 Visual Diff 审阅，构建共建共享的自研配置运维生态。

### 不做的事

| 不做 | 原因 |
|------|------|
| 完整磁盘镜像备份 | 偏离配置管理定位（用 Restic / Borg） |
| 浏览器数据 / 密码库同步 | 安全风险高（用 1Password / Bitwarden） |
| Windows 目标机器支持 | Linux-only 已确立 |
| PTY 终端模拟器 | 用户要的是命令日志（已实现），不是交互 shell |
| 容器编排 (Kubernetes) | 用 Argo CD / Flux |
| 直接集成 Ansible（python 依赖） | 自建 Ansible-Compatible 引擎，详见架构文档 |
| GitHub 同步主流程 | 已弃用；EnvForge 是配置管理平台，不是配置仓库 |
| CLI bootstrap 工具 | Web 优先 + Docker 部署已替代 |

## 二、信息架构

主导航 5 个页面：

| 页面 | 内容 |
|------|------|
| **虚拟机管理** | 已保存的连接列表 + 连接详情（硬件摘要、软件清单、系统配置清单、配置文件、环境保留） |
| **配置市场** | 应用商店式卡片网格 + 分类筛选 + 影响范围预估 + 一键安装 + “新增配置提议” + 软件详情页 (文档/评论板/改进建议) |
| **Playbook** | 我的 Playbook 列表 + 编辑器 + 版本管理 + 多目标执行 |
| **高级设置** | 定时任务 / 漂移检测 / Webhooks / API tokens / 模块文档 / Catalog 管理（仅 admin） / 账号安全 (2FA + 绑定) |
| **我的空间** | 个人资料 + 已上传的 combo / vm-snapshot + 任务历史 + 站内邮箱 (Inbox) + 提议状态跟踪 |

视觉规范：

- 采用毛玻璃（Glassmorphism）与卡片式轻量级设计
- 背景 `#f6f8fa`（暗色模式下为 `#1e1e2e`），卡片白色 + 细灰边框，圆角 10-12px
- 主操作色 teal/emerald，警告 amber，错误 red，信息 blue
- 字体 Inter / system-ui
- 暗色模式跟随系统 `prefers-color-scheme`，前端具备一键切换开关
- 移动端单列响应式，头部内置站内信气泡下拉通知中心

## 三、用户角色（三级）

| 角色 | 标识 | 能力 |
|------|------|------|
| **guest** | 未登录 | 浏览 catalog 列表 / 查看公开 MD / 浏览只读评论 |
| **user** | 登录用户 | guest 全部 + 连接 VM + 安装 / 卸载 + 环境保留 + 提议修改/新增 + 发表评论与点赞/举报 + 个人站内信管理 |
| **admin** | `role = "admin"` | user 全部 + 审核社区建议/新增提议 (Visual Diff) + 处理被举报评论 + 管理 catalog (增删改) + 管理用户/监控全局队列 |

**Admin 提升规则**：
- 注册用户的邮箱在 `.env` 中 `ENVFORGE_ADMIN_EMAILS` 列表里，自动提升为 admin
- 历史用户名或当前注册名为 `fool` 的账户：启动时自动提升（见 ARCHITECTURE.md）

## 四、社区共建与审核生态 (Catalog Ecosystem)

为保证配置市场的长期活力，EnvForge 引入了社区驱动的配置共建体系：

### 1. 评论板与互动
*   每个市场软件/组合详情页中内置**评论看板**。支持发表纯文本评论，并应用高性能的 HTML 实体编码安全防御，杜绝 XSS 注入。
*   支持点赞 (Like) 切换与举报 (Report) 滥用行为。采用唯一性主键防护，杜绝恶意刷量。
*   **自动风控与隐藏 (Moderation Escalation)**：当某条评论累计被不同用户举报超过 **5 次** 时，其状态将自动流转为 `hidden_pending_review`，在普通用户界面瞬时隐藏并保留上下文，同时向全体管理员站内邮箱推送紧急风控通知，等待审核。

### 2. 改进建议 (Modification Suggestions)
*   用户发现现存配置有 Bug 或可以优化时，可针对该配置卡片提交**修改建议**。
*   提议内容包括：建议标题、问题描述、提议的 Playbook YAML 剧本片段和提议的 Markdown 指南。
*   管理员后台在审阅修改建议时，系统将自动加载 **Visual Diff 视图**，清晰对比原始文件与修改提议，支持“一键采纳”或“填写反馈拒绝”。

### 3. 新增配置提议 (New Package Proposals)
*   用户可以对市场中尚不存在的软件或组合提议新增。
*   提议内容强制包含：中文名称、英文名称、分类（如 Runtime/Database 等）、Playbook YAML、安装指南 Markdown 以及备注信息。
*   包含具体的包名或备注加上 playbook 的提议更易被管理员采纳。

### 4. 审核反馈与站内信通知机制
*   提议的处理流程完全由事务保证，具有绝对一致性：
    *   **被拒绝 (Rejected)**：状态变更为 `rejected`，系统向提议用户的**站内邮箱 (Inbox)** 推送一封详细的拒绝说明，包含管理员撰写的拒绝理由，不向外部真实邮箱发送垃圾邮件打扰用户。
    *   **被采纳 (Accepted)**：状态变更为 `accepted`。系统向用户站内邮箱发送 congratulation 通知，并同时触发 **SMTP 电子邮件通知**，使用户获得社区贡献荣誉感。

## 五、高鲁棒性 SQLite 存储层 (ACID Database Layer)

EnvForge 摒弃了不稳定的原始 JSON 文件写入设计，升级为 **SQLite Relational-Document 混合持久化架构**：
*   **核心配置**：采用极轻量级的 ACID 键值文档设计（`system_kv`），确保系统高内聚性和极致的向后兼容；
*   **交互数据**：针对评论、修改建议、举报、点赞、站内信和审计日志，开辟独立的 SQL 关系型表，搭配严苛的二级复合索引，实现高并发场景下的 sub-millisecond（亚毫秒级）极速拉取；
*   **运维保障**：后台集成专属 `BackgroundTaskScheduler`，负责每小时 WAL Checkpoint 物理落盘、每日数据库热备份（`VACUUM INTO`）、每周数据库物理碎片整理（`VACUUM; ANALYZE;`）以及过期数据的自动清理，为自托管用户提供全免运维的生产级数据库环境。
