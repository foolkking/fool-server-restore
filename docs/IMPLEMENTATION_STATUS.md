# 实现状态

更新时间：2026-05-20

项目名称：**EnvForge**（原名 fool-server-restore）
GitHub：https://github.com/foolkking/fool-server-restore

---

## 已完成功能

### 基础架构
- npm workspaces monorepo：`apps/api`、`apps/web`、`apps/mobile`、`apps/mock-agent`、`packages/core`、`packages/collectors`、`packages/restorers`、`packages/cli`
- GitHub Actions CI（已修复：先 build 再 typecheck，解决 @fool/cli 找不到依赖类型的问题）
- `.env.example`、`.gitignore`、preflight/smoke-test 脚本、systemd 示例服务文件
- 生产模式 API 托管 Web 静态文件（`SERVE_WEB=1`）

### 后端 API（Fastify）

| 接口 | 说明 |
|------|------|
| `GET /api/health` | 健康检查，返回 `service: "envforge-api"` |
| `GET /api/ready` | 就绪检查，验证数据目录和 web dist |
| `POST /api/scan` | 扫描本机并持久化 snapshot |
| `GET /api/snapshots` | 列出历史快照 |
| `GET /api/targets` | 列出当前用户已连接的机器 |
| `POST /api/targets/probe` | 向 mock-agent 探测真实系统数据 |
| `POST /api/targets/ping` | 检查 agent 是否在线 |
| `GET /api/catalog` | 配置市场官方条目 |
| `GET /api/catalog/:id/guide` | 配置市场 Markdown 说明 |
| `GET /api/catalog/all` | 官方 catalog + 用户公开发布的配置组合 |
| `GET /api/migration/strategies` | 迁移策略 |
| `GET /api/me` | 当前用户信息（游客） |
| `POST /api/auth/register` | 注册（scrypt 哈希） |
| `POST /api/auth/login` | 登录 |
| `GET /api/auth/session` | 会话验证 |
| `PATCH /api/auth/profile` | 编辑个人资料 |
| `POST /api/connections/connect` | 保存连接档案，支持真实 SSH 握手 + 系统数据采集 |
| `POST /api/connections/:id/reprobe` | 重新探测已保存连接 |
| `GET /api/connections` | 列出当前用户所有连接档案 |
| `PATCH /api/connections/:id` | 更新连接标签/agentUrl |
| `DELETE /api/connections/:id` | 删除连接档案 |
| `POST /api/connections/:id/upload-snapshot` | 从已连接机器生成私有运行环境快照 |
| `GET /api/connections/:id/extract-combo` | 从 probeSnapshot 提取热门组合草稿 |
| `POST /api/profiles` | 创建配置组合（权限校验） |
| `GET /api/profiles` | 列出当前用户可见的配置组合 |
| `GET /api/profiles/:id` | 获取单个配置组合 |
| `PATCH /api/profiles/:id` | 更新配置组合 |
| `DELETE /api/profiles/:id` | 删除配置组合 |
| `POST /api/execute` | 对已连接机器执行配置安装/应用（默认 dry-run） |
| `GET /api/tasks/:id` | 获取任务状态 |
| `GET /api/tasks/:id/stream` | SSE 实时任务日志流 |
| `POST /api/diff` | diff 两个 snapshot |
| `POST /api/restore/plan` | dry-run 还原计划 |

### 角色与权限（RBAC）
- `StoredUser.role: "user" | "admin"`，注册默认 `"user"`
- 设置管理员：编辑 `data/runtime-db.json`，将 `role` 改为 `"admin"`
- 普通用户：可上传热门组合（公开）、可上传虚拟机运行环境快照（私有）
- 管理员：额外可上传软件配置（公开）
- `apps/api/src/rbac.ts` 实现权限工具函数

### 连接状态体系
- `validated` — 字段格式合法，未做网络测试
- `ssh_failed` — SSH 握手失败（认证错误/超时/拒绝）
- `probed` — SSH 成功 + 采集到真实系统数据
- `unreachable` — agent HTTP 探测失败

### 真实 SSH 连接（`apps/api/src/ssh.ts`）
- 用 `ssh2` 库做真实 SSH 握手，连接超时 10 秒
- 握手成功后执行只读白名单脚本采集系统数据（hostname、uname、free、nproc、软件版本等）
- 错误分类：`auth_failed` / `timeout` / `refused` / `host_unreachable` / `key_not_found`
- SSH 私钥只从服务器本地文件路径读取

### 执行引擎（`apps/api/src/executor.ts`）
- 命令白名单：apt/yum/dnf/brew/npm/pip/winget 安装命令，systemctl 服务命令，环境变量写入
- 参数安全校验：包名/服务名只允许安全字符集，防止命令注入
- 任务模型：`ExecutionTask` + `TaskStep`，支持 dry-run 和真实执行
- SSE 实时推送任务日志

### 配置组合类型
- `software` — 软件配置，仅管理员可发布，公开
- `combo` — 热门组合，所有登录用户可发布，公开
- `vm-snapshot` — 虚拟机运行环境快照，所有登录用户可创建，强制私有

### 采集器（非破坏性）
- `system-info`、`node-env`、`git-config`、`env-vars`

### Web 前端（React + Vite）
- 三页面导航：虚拟机管理 / 配置市场 / 我的空间
- 中文/英文切换，品牌名 EnvForge
- 连接面板（SSH Password / SSH Key / WinRM / Docker Context）
- **连接详情面板**：点击 chip 展开，查看字段、编辑标签/agentUrl、重新探测、删除、查看采集数据摘要
- 连接成功后展示真实 CPU、内存、软件列表、配置清单
- **软件/配置清单可操作**：展开详情、预览安装（dry-run）、立即安装/应用、内联任务结果
- 扫描/上传按钮：需先登录 + 选中连接才能激活
- 上传运行环境快照模态框
- 配置市场大卡片布局，支持软件配置/热门组合切换，Markdown 阅读覆盖层
- 配置市场每张卡片有安装/应用按钮，任务日志面板实时展示
- 注册/登录/登出/编辑资料完整流程
- 我的空间：上传配置组合表单（按角色限制类型），已上传列表支持编辑/删除，"从当前配置提取"按钮

### mock-agent（`apps/mock-agent/src/index.js`）
- 跑在 4001 端口，模拟"目标虚拟机"
- 用 Node.js `os` 模块和 `execSync` 采集真实本机数据
- 端点：`/agent/health`、`/agent/info`、`/agent/system`、`/agent/software`、`/agent/config`

### 配置市场内容
- `configs/catalog/software/*.md`（docker、nginx、node、postgres、python）
- `configs/catalog/combos/*.md`（firewall-baseline、powershell-dev-profile、ssh-hardening）
- `configs/catalog/admin-notes/*.md`
- `configs/database/seed.json` 种子数据

### 运行时数据持久化
- `data/runtime-db.json` — 用户（含 role）、会话、连接档案（含 probeSnapshot）、配置组合（含 visibility）
- `data/snapshots/` — 本机扫描快照

---

## 当前未完成

### 高优先级

| 功能 | 说明 |
|------|------|
| 真实执行需重新认证 | 密码已脱敏，真实执行时需用户重新输入或改用 SSH Key |
| 运行环境快照一键部署 | 分层还原（软件→配置文件→环境变量→服务），需 SSH Key 方式 |
| SFTP 配置文件上传 | 通过 SFTP 将配置文件推送到目标机器 |

### 中优先级

| 功能 | 说明 |
|------|------|
| GitHub push/pull 同步 | 未实现 |
| snapshot 详情页和 diff 对比页面 | 有接口无前端页面 |
| restore plan 展示页面 | 有接口无前端页面 |
| 移动端 | 只有骨架 |
| 单元测试 | collector/restorer 均未覆盖 |

### 低优先级

| 功能 | 说明 |
|------|------|
| GitHub OAuth | 未实现 |
| 加密同步 | 未实现 |
| Windows 管理员权限采集 | winget/CIM/WMI 因权限问题暂未实现 |

---

## 启动命令

```powershell
# 终端 1 — mock-agent（模拟目标虚拟机，端口 4001）
cd e:\1project\myweb
node apps/mock-agent/src/index.js

# 终端 2 — 主服务（Web 控制台 + API，端口 4000）
cd e:\1project\myweb
# 首次需要：Copy-Item .env.example .env
node apps/api/dist/server.js
```

构建命令：
```powershell
npm run build
```

---

## 技术参考（运行环境快照一键部署）

- **chezmoi**（https://chezmoi.io）：声明式 dotfiles 管理，支持模板、加密、跨机器同步
- **Ansible**（https://ansible.com）：无 agent，通过 SSH 执行 YAML playbook，支持安装软件包、写配置文件、启动服务
- **rsync**：文件层面的批量同步，配合 SSH 可远程同步目录

本项目分层实现方案：
1. 软件层：通过 SSH 执行包管理器命令（已实现 dry-run，真实执行需 SSH Key）
2. 配置文件层：通过 SFTP 上传配置文件（待实现）
3. 环境变量层：通过 SSH 写入 `.bashrc`/`.zshrc`/`$PROFILE`（已实现 dry-run）
4. 服务层：通过 SSH 执行 systemctl/sc 命令（已实现 dry-run）
