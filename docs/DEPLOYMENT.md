# Deployment Guide

更新时间：2026-05-19

本文档描述把 Fool Server Restore 部署到虚拟机前需要完成的本地准备、虚拟机安装步骤、启动方式和健康检查。

## 部署前状态

当前版本已经具备部署到单台虚拟机的基础条件：

- Node.js 20+ / npm 10+。
- Web 前端可构建为静态文件。
- API 可在同一个 Node.js 进程中托管 Web 静态文件。
- 本地账户、会话和连接档案写入 `FOOL_DATA_DIR` 下的运行时数据库。
- 快照默认写入 `FOOL_SNAPSHOT_DIR`，不再写入仓库源码目录。
- `.env` 支持由 API 自动读取。
- 提供部署前检查和冒烟测试脚本。

当前版本仍不启用真实远程 SSH/WinRM/Docker 命令执行。连接功能只保存脱敏连接档案。

## 虚拟机要求

- Linux 或 Windows Server 均可。
- Node.js `>=20.0.0`。
- npm `>=10.0.0`。
- 能访问项目仓库或项目压缩包。
- 运行目录需要可写入 `data/`。

## 环境变量

建议在虚拟机上复制 `.env.example` 为 `.env` 并按需修改：

```bash
cp .env.example .env
```

关键变量：

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
PUBLIC_BASE_URL=http://<your-vm-ip>:4000
FOOL_DATA_DIR=data
FOOL_RUNTIME_DB=data/runtime-db.json
FOOL_SNAPSHOT_DIR=data/snapshots
SERVE_WEB=1
WEB_DIST_DIR=apps/web/dist
SESSION_TTL_HOURS=168
```

生产部署时，`data/` 应该加入备份策略，但不应该提交进 Git。

## Linux 部署

```bash
git clone <repo-url> fool-server-restore
cd fool-server-restore
cp .env.example .env
npm ci
npm run preflight
npm run build
npm run start:prod
```

也可以使用封装脚本：

```bash
sh scripts/start-production.sh
```

## Windows 部署

```powershell
git clone <repo-url> fool-server-restore
cd fool-server-restore
Copy-Item .env.example .env
npm ci
npm run preflight
npm run build
npm run start:prod
```

也可以使用封装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-production.ps1
```

## 健康检查

启动后执行：

```bash
npm run smoke:test
```

或者手动访问：

```text
GET /api/health
GET /api/ready
```

`/api/ready` 会检查：

- `FOOL_DATA_DIR` 是否可写。
- `FOOL_SNAPSHOT_DIR` 是否可写。
- 运行时数据库父目录是否可写。
- 当 `SERVE_WEB=1` 时，`apps/web/dist/index.html` 是否存在。

## 后台运行建议

Linux 推荐使用 systemd 或 pm2。当前仓库暂不强绑定进程管理器。

systemd 示例：

```ini
[Unit]
Description=Fool Server Restore
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/fool-server-restore
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start:prod
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## 安全边界

部署前必须明确：

- 不要把 `.env`、`data/`、`logs/` 提交到仓库。
- 当前连接服务器功能不会执行真实远程命令。
- 如果将来启用真实远程执行，必须先加入命令白名单、权限隔离、审计日志、超时控制和危险操作二次确认。
- 面向公网部署时，需要反向代理 HTTPS、登录速率限制和更完整的会话管理。
