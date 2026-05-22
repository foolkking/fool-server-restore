# EnvForge — 产品定位与设计

最后更新：2026-05-22

> 本文合并自 PRODUCT_STRATEGY、PROJECT_BLUEPRINT、REVISED_PRODUCT_UNDERSTANDING、UI_AND_VM_MANAGEMENT、MARKET_MD_AND_MIGRATION_PLAN、PRIVACY_AND_RESTORE_STRATEGY、SYNC_MODEL 七篇旧文档。

## 一、产品定位

**EnvForge** 是一个**自托管的 Linux 服务器配置管理网站**。

服务端是一个 Node.js + Fastify Web 应用，用户通过浏览器登录后，用 SSH 连接目标 Linux VM，在 Web UI 中：

- 浏览**配置市场**（72 个预置 Playbook：运行时 / 数据库 / 安全 / 网络 / 容器…）
- 一键安装 / 卸载软件，配置文件查看与编辑
- **环境保留**：从已连接 VM 反向生成可重建的 Playbook
- 多目标批量执行同一 Playbook，定时调度，漂移检测

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
| **配置市场** | 应用商店式卡片网格 + 分类筛选 + 影响范围预估 + 一键安装 |
| **Playbook** | 我的 Playbook 列表 + 编辑器 + 版本管理 + 多目标执行 |
| **高级设置** | 定时任务 / 漂移检测 / Webhooks / API tokens / 模块文档 / Catalog 管理（仅 admin） |
| **我的空间** | 个人资料 + 已上传的 combo / vm-snapshot + 任务历史 |

视觉规范：

- 背景 `#f6f8fa`，卡片白色 + 细灰边框，圆角 10-12px
- 主操作色 teal/emerald，警告 amber，错误 red，信息 blue
- 字体 Inter / system-ui
- 暗色模式跟随 `prefers-color-scheme`
- 移动端单列响应式

## 三、用户角色（三级）

| 角色 | 标识 | 能力 |
|------|------|------|
| **guest** | 未登录 | 浏览 catalog 列表 / 查看公开 MD |
| **user** | 登录用户（默认） | guest 全部 + 连接 VM + 安装 / 卸载 + 环境保留 + 上传 combo + 上传 vm-snapshot（私有）+ 创建 Playbook |
| **admin** | `role = "admin"` | user 全部 + 管理 catalog（增删改）+ 管理用户 + 全局任务历史 |

**Admin 提升规则**：
- 邮箱在 `ENVFORGE_ADMIN_EMAILS` 列表里，注册或登录时自动 promote
- 历史用户名为 `fool` 的账户：服务器启动时通过一次性数据库迁移设为 admin（见 ARCHITECTURE.md migrations 章节）

## 四、配置市场（catalog）三种类型

### 1. software（仅 admin 发布）
对应一个软件或运行环境。元数据 + Playbook YAML + 安装说明 Markdown。

### 2. combo（所有登录用户可发布）
一组软件 + 系统偏好 + alias + registry + shell profile 的组合。

### 3. vm-snapshot（用户创建，强制私有）
来源：从已连接 VM 自动生成的完整快照。**不出现在公开市场**，仅本人可见。

支持四阶段 dry-run 部署：
1. **software** — 包安装
2. **configs** — 配置文件 SFTP 上传
3. **env** — 环境变量写入
4. **services** — 服务启停

### 影响范围预估
选中 catalog 项后展示：磁盘占用、服务变更、是否需要 sudo、预估时间、最高风险等级。

### 部署模式
catalog 项可声明 `deployModes: ["system", "docker"]`：
- `system`：apt 直装 + systemctl 管理
- `docker`：返回 docker-compose 片段，让用户复制使用

## 五、隐私与还原策略（4 层模型）

| 层 | 内容 | 默认行为 |
|----|------|---------|
| 1. 软件安装层 | 软件名 / 版本 / 安装命令 / 包管理器来源 | guest 也可看，user 可执行 |
| 2. 用户偏好层 | alias / shell profile / git config / npm registry / 服务启动偏好 | 可上传，逐项选择，上传前敏感字段扫描 |
| 3. 应用数据层 | 数据库数据 / 应用工作目录 / 缓存 | 默认不上传不共享，未来通过加密包 + 二次确认实现 |
| 4. 凭据层 | SSH 私钥 / API token / 密码 / Cookie | **绝对禁止**明文上传，黑名单永久屏蔽 |

### 敏感字段扫描（已实现）
`apps/api/src/sensitive-scan.ts` 13 条规则：
- PEM 私钥块（多行）
- npm `_authToken` / GitHub `ghp_*` / GitLab `glpat-*` / AWS `AKIA*` / OpenAI `sk-*`
- JWT、`Authorization: Bearer`、`*password=` / `*token=` / `*api_key=`
- env 风格 `API_KEY=` / `SECRET=` / `TOKEN=`
- 智能跳过占位符（`changeme` / `xxxxxx` / `<your-token>` / `${VAR}`）

### 路径黑名单（永远不采集）
`/etc/shadow` / `/etc/ssh/ssh_host_*` / `~/.ssh/id_*` / `~/.aws/credentials` / `~/.docker/config.json` / `~/.kube/config` / `~/.netrc`

### 冲突文件备份
`lineinfile` / `copy` 模块在第一次写入前自动创建 `<path>.envforge.bak`（保留权限），支持配置文件 diff 对比。

## 六、并发控制 — 任务队列

- **互斥粒度 = connectionId**（一台 VM）
- 同一 VM：FIFO 串行；不同 VM：并行
- 跨用户也按 connectionId 互斥（防止 A 和 B 同时改一台机器）
- 一对多 Playbook：每 VM 独立入队
- 队列状态在 UI 上显示：「排队中（前面 N 个任务）」
- 取消语义：queued → 立即移除；running → 设 cancelFlag

## 七、Roadmap

### 已完成（2026-05 全部交付）

- ✅ SSH 连接（密码 / 密钥 / Web 上传，AES-256-GCM 加密存储）
- ✅ 全面系统采集（25+ 来源，`comm -23` 排除 Ubuntu 预装包）
- ✅ Ansible-Compatible 引擎（13 模块）：package / service / lineinfile / copy / shell / template / user / file / ufw / cron / systemd_unit / sysctl / acme
- ✅ 配置市场（72 个 Playbook）+ 三种 kind + 部署模式 + 影响预估
- ✅ 一键安装 / 卸载（真实 SSE 进度 + 可取消）
- ✅ 环境保留 → 重建 Playbook（含敏感字段扫描）
- ✅ 配置文件管理（list / read / write / diff / 模板变量）
- ✅ Playbook 编辑器 + 版本管理（最多 20）+ 上传 YAML
- ✅ 多目标执行（按 connectionIds 或 tags）
- ✅ 任务历史持久化（最近 200 条）
- ✅ 三级角色（guest / user / admin）+ per-VM 任务队列
- ✅ Admin catalog 管理（add / edit / hide / reset，`data/catalog-overrides/` overlay）
- ✅ 定时任务（cron-style + 自写解析器，无外部依赖）
- ✅ 漂移检测（baseline + check）
- ✅ Webhooks（HMAC-SHA256，4 种事件）
- ✅ API tokens（CI/CD 集成，`envf_*` 前缀）
- ✅ Preflight 检查（sudo / 磁盘 / 网络 / apt lock / systemd）
- ✅ Verify 阶段（执行后 reprobe + diff）
- ✅ 安全审计清单（SSH 加固 / UFW / Fail2Ban / 自动更新 / 开放端口）
- ✅ 暗色模式 + 响应式
- ✅ Docker 化部署 + Docker compose demo（含一台 sandbox VM）
- ✅ 首次启动向导（4 步引导）
- ✅ 模块文档浏览器
- ✅ 90 个引擎单元测试

### 待用户提供凭据后实施

- ⏳ **GitHub OAuth 登录**（需 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`）
- ⏳ **邮箱注册验证码**（需 SMTP 服务器：nodemailer + 6 位验证码 + 10 分钟 TTL）
- ⏳ **`/admin` 用户管理后台**（前两项就位后做：用户列表 + 角色管理 + 锁定 + 全局队列监控）
