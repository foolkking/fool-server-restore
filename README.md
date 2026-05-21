# EnvForge

EnvForge 是一个自托管的 Linux 服务器配置管理平台。用户通过 Web 控制台登录后，可以用 SSH 连接目标 Linux 虚拟机，从配置市场选择软件或组合配置一键安装，并通过 Ansible-Compatible Playbook 引擎实现可重复的环境配置。

GitHub 仓库：https://github.com/foolkking/envforge

## 核心能力

### 连接管理
- SSH 密码 / SSH Key 两种认证方式
- Web 上传 SSH 私钥（AES-256-GCM 加密存储）
- 连接档案管理：查看详情、编辑标签、重新探测、删除
- 连接标签（dev/staging/prod）用于多目标分组

### 配置市场
- **15 个软件配置**：Node.js、Docker、Nginx、PostgreSQL、Python、Redis、MySQL、Go、Java/OpenJDK、Rust、Git、Certbot SSL、Fail2Ban、Prometheus、Grafana
- **8 个热门组合**：SSH 安全加固、防火墙基线、LAMP、LEMP、Node.js 生产部署、Docker + Compose、安全基线
- 每个配置都有详细 Markdown 说明
- 支持系统安装（apt）和 Docker 部署两种模式
- 选中配置后自动显示影响范围预估（磁盘占用、服务变更、sudo 需求、预估时间）
- 多选后一键批量安装（一次 SSH 连接，SSE 实时进度）

### Ansible-Compatible 执行引擎
- 9 个内置模块：`package`、`service`、`lineinfile`、`copy`、`shell`、`template`、`user`、`file`、`ufw`
- 每个模块都是幂等的（跑两次结果一样）
- 支持 dry-run 预览
- 与 Ansible Playbook YAML 格式兼容（可导出后用 ansible-playbook 执行）

### Playbook 管理
- 创建、编辑、保存用户自定义 Playbook
- 版本历史（最多 20 个版本），支持恢复历史版本
- 内置 YAML 编辑器（行号、语法验证、Tab 缩进）
- 多目标执行：按标签或连接 ID 批量部署到多台服务器

### 环境保留
- 从已连接 VM 反向生成 Playbook（采集 apt 包、systemctl 服务、bashrc 配置）
- 生成的 Playbook 可下载、编辑、重新应用到新机器

### 任务历史
- 所有执行任务持久化到本地数据库
- 我的空间页面展示任务历史（状态、步骤、耗时）
- 全局终端面板（左下角）实时显示执行日志

### 用户系统
- 本地注册/登录（scrypt 密码哈希）
- RBAC 角色权限（user / admin）
- 会话 token，7 天有效期

## 快速开始

### 直接运行

```powershell
# 克隆并安装
git clone https://github.com/foolkking/envforge
cd envforge
npm install

# 配置环境变量
Copy-Item .env.example .env

# 构建并启动（端口 5173）
npm run build
node apps/api/dist/server.js
```

访问：http://127.0.0.1:5173

### Docker 部署

```bash
# 生成加密密钥
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 启动
docker compose up -d
```

访问：http://localhost:5173

## 开发命令

```powershell
npm run build              # 构建所有 workspace
npm run build:server       # 只构建后端
npm run dev:web            # 启动前端开发服务器（Vite HMR）
npm run typecheck          # TypeScript 类型检查
npm test --workspace @fool/api  # 运行引擎单元测试（56 个测试）
```

## 目录结构

```text
apps/
  api/          Fastify API 服务（端口 5173）
  web/          React + Vite Web 控制台
packages/
  core/         共享类型和 manifest schema
  collectors/   本机采集器
  restorers/    还原计划生成器
  cli/          命令行工具
configs/
  catalog/
    software/   软件配置 Markdown 说明
    combos/     热门组合 Markdown 说明
    playbooks/  Ansible-Compatible Playbook YAML（22 个）
    docker/     Docker Compose 文件（8 个）
  policies/     同步策略
data/           运行时数据（不提交 Git）
docs/           产品策略和实现文档
```

## 角色说明

| 角色 | 权限 |
|------|------|
| 游客 | 浏览配置市场 |
| 普通用户 | 连接虚拟机、发布热门组合、保存私有快照、管理 Playbook |
| 管理员 | 额外可发布软件配置 |

设置管理员：编辑 `data/runtime-db.json`，将对应用户的 `"role": "user"` 改为 `"role": "admin"`。

## 安全原则

- 密码 scrypt 哈希，SSH 密码 AES-256-GCM 加密存储
- SSH 私钥加密存储在 `data/keys/`，不写入数据库
- 远程命令执行使用白名单控制（Ansible 模块），不允许任意命令注入
- 应用配置前必须先展示影响范围（dry-run）
- `.env`、`data/`、`logs/` 不提交仓库

## 健康检查

```bash
curl http://localhost:5173/api/health
curl http://localhost:5173/api/ready
```
