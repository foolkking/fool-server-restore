# Fool Server Restore

Fool Server Restore 是一个自托管的虚拟机/服务器软硬件配置管理网站。它提供 Node.js API、React Web 控制台和 React Native 移动端骨架，用于扫描、选择、上传、复用和恢复服务器软件与常见系统偏好配置。

当前产品主线不是 Git/GitHub 配置仓库管理，而是：用户登录网站后连接目标虚拟机，查看当前机器的软件、硬件资源和系统配置清单，从配置市场选择软件配置或热门组合配置，并在后续版本中安全地应用到目标虚拟机。

## 当前能力

- React Web 控制台，支持中文/英文切换。
- 三个主页面：虚拟机管理、配置市场、我的空间。
- 本地注册/登录，会话 token，密码加盐哈希保存。
- 连接服务器安全档案：支持 SSH Password、SSH Key、WinRM、Docker Context 字段校验和脱敏保存。
- 配置市场支持软件配置 / 热门组合配置切换。
- 每个市场条目绑定 Markdown 使用说明。
- 本机扫描和 snapshot 保存。
- API 可在生产模式下托管 Web 静态文件。
- 部署前检查和冒烟测试脚本。

当前连接服务器功能不执行真实 SSH/WinRM/Docker 命令，只保存脱敏连接档案。

## 开发命令

```powershell
npm install
npm run typecheck
npm run build
npm run dev:api
npm run dev:web
```

## 生产部署

```powershell
Copy-Item .env.example .env
npm ci
npm run preflight
npm run build
npm run start:prod
```

启动后访问：

```text
http://127.0.0.1:4000
```

健康检查：

```powershell
npm run smoke:test
```

更完整说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 重要目录

- `apps/api`：Fastify API 与生产静态 Web 托管。
- `apps/web`：React Web 控制台。
- `apps/mobile`：React Native / Expo 骨架。
- `packages/core`：manifest、policy、diff 等核心类型和逻辑。
- `packages/collectors`：非破坏性采集器。
- `packages/restorers`：dry-run restore plan。
- `configs/catalog`：配置市场 Markdown 说明。
- `docs`：持久化产品理解、实现状态和部署文档。
- `data`：本地运行时数据，默认不提交。

## 安全原则

- 密码不明文保存。
- `.env`、`data/`、`logs/` 不提交进仓库。
- 应用配置前必须先展示影响范围。
- 真实远程命令执行必须等权限隔离、命令白名单、审计日志和危险操作确认完成后再启用。
