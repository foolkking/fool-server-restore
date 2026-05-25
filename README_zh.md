# EnvForge — 自托管 Linux 服务器配置管理平台

自托管的 Linux 服务器配置管理平台。通过 SSH 连接虚拟机，一键安装软件、管理配置、保留环境，把整套系统状态变成可重用的 Playbook。

> 项目主页及代码仓库：<https://github.com/foolkking/envforge>

---

## 核心能力

*   **SSH 连接管理** — 密码 / 密钥（Web 上传，AES-256-GCM 加密存储），连接标签分组。
*   **配置市场** — 100 软件 + 15 组合 = **115 个预置 Playbook**（运行时 / 数据库 / 安全 / 网络 / 容器 / 服务等），系统管理员可增改。
*   **高鲁棒性 SQLite 存储** — 升级为 SQLite Relational-Document 混合持久化引擎。采用 WAL 模式、StatementRegistry 语句编译缓存、分级写锁与 busy_timeout 并发保护、在线热备以及优雅停机 Checkpoint 机制，彻底告别单文件 JSON 并发损坏隐患。
*   **社区共建生态 (Ecosystem)** —
    *   **评论系统**：配置卡片支持发表纯文本评论、点赞互动与举报机制（具备唯一性约束防刷）。
    *   **改进建议 (Suggestions)**：用户可对已有配置在线提交改进，包含 Playbook YAML 及 MD 指导，管理员后台通过 **Visual Diff 视图**进行审查。
    *   **新增配置提案**：支持中文包名、英文包名、分类、Playbook 及 MD 指南的完整提交与审核流。
    *   **站内邮箱与精准通知**：内置 Inbox 站内信通知中心。审批采纳触发 **邮件+站内信** 双重通知，审批拒绝仅触发 **站内信+详细反馈理由**，避免邮件打扰。
    *   **软隐藏风控 (Moderation)**：被举报超过 5 次的评论自动流转至 `'hidden_pending_review'` 挂起审核，保障社区健康度。
*   **Ansible-Compatible 引擎** — 13 个内置模块（package / service / lineinfile / copy / template / user / file / ufw / shell / cron / systemd_unit / sysctl / acme），TypeScript 原生，无 Python 依赖。
*   **环境保留** — 从已连接 VM 反向生成完整重建 Playbook（含敏感字段自动脱敏）。
*   **配置文件管理** — 查看 / 编辑 / diff 对比 / 模板变量替换 / `.envforge.bak` 自动备份。
*   **多目标 + 定时调度** — 一个 Playbook 同时跑多 VM；内置 `BackgroundTaskScheduler` 进行定时 cron 任务与日常 Vacuum/备份运维调度。
*   **漂移检测** — 设基线后定时 diff，发现意外变更时触发 Webhook。
*   **任务并发控制** — Per-VM FIFO 队列：同 VM 串行，多 VM 并行。
*   **API token** — CI/CD 集成（GitHub Actions / Jenkins）。
*   **三级角色** — guest / user / admin。

---

## 工程文档指南

| 文档 | 描述 |
| :--- | :--- |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | 产品定位、信息架构、用户角色、安全审计、隐私模型、Roadmap |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 工程架构、解耦边界、SQLite混合数据表定义、WAL 刷盘策略、WorkerRuntime 生命周期 |
| [docs/future_plan.md](./docs/future_plan.md) | 长期分布式演进蓝图、解耦接口定义、系统容量极限、运维 SOP 故障预案手册 |
| [docs/CATALOG.md](./docs/CATALOG.md) | 100 软件 + 15 组合 = 115 项 catalog 完整清单（按 category 分组） |
| [docs/CATALOG_AUTHORING.md](./docs/CATALOG_AUTHORING.md) | 新增 / 修改 catalog 项 of 统一规范（md / yaml / vars.json / catalog.ts） |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Docker 从零部署：依赖、HTTPS、systemd、备份、升级、排错 |
| [docs/DEPLOY_SELF.md](./docs/DEPLOY_SELF.md) | 用现有 EnvForge 部署一台新的 EnvForge 服务器（多区域 / 蓝绿升级 / 给客户复制） |
| [docs/CROSS_DISTRO_STRATEGY.md](./docs/CROSS_DISTRO_STRATEGY.md) | 跨发行版兼容策略：包名/服务名翻译、preflight、compatibility 声明 |
| [docs/AUTH.md](./docs/AUTH.md) | 多 provider 登录、2FA、密码重置、个人资料、邮件配置、安全检查清单 |

---

## 技术栈

*   **前端**：React 18 + TypeScript + Vite + lucide-react (毛玻璃与卡片式轻量级设计)
*   **后端**：Fastify + TypeScript + ssh2
*   **引擎**：Ansible-Compatible Playbook 执行器（无 Python）
*   **存储**：SQLite 混合持久化数据库 (`better-sqlite3` 驱动)
*   **加密**：scrypt（密码）+ AES-256-GCM（凭据）

---

## 测试

```bash
npm run build --workspace @fool/api
node --test apps/api/dist/engine/tests/*.test.js
```

100+ 个引擎单元测试覆盖：runner / 模块（package / service / shell / lineinfile / cron / systemd / sysctl / etc）/ 任务队列 / 敏感扫描 / migrations / catalog overrides / 跨发行版翻译 / preflight 阶段 / SQLite 压测与崩溃回滚。

## 许可证

MIT
