# EnvForge

EnvForge 是一个自托管的虚拟机/服务器配置管理平台。用户登录后可以通过 SSH、WinRM 或 Docker Context 连接目标虚拟机，查看软硬件配置清单，从配置市场选择软件配置或热门组合，并将其安装/应用到目标机器。

GitHub 仓库：https://github.com/foolkking/envforge

## 当前能力

- React Web 控制台，支持中文/英文切换。
- 三个主页面：虚拟机管理、配置市场、我的空间。
- 本地注册/登录，会话 token，密码加盐哈希保存。
- 真实 SSH 连接测试：握手验证 + 远程系统数据采集（只读白名单命令）。
- 连接档案管理：查看详情、编辑标签/agentUrl、重新探测、删除。
- 软件信息/系统配置清单：展开详情、预览安装（dry-run）、立即安装/应用。
- 配置市场：软件配置（管理员发布）/ 热门组合（用户发布），支持 Markdown 说明阅读。
- 配置市场一键安装/应用：通过 SSH 在目标机器执行命令，实时日志展示。
- 从当前连接机器提取热门组合草稿。
- 角色权限：普通用户可发布热门组合，管理员可发布软件配置。
- 私有运行环境快照：保存当前虚拟机完整环境，仅自己可见。
- mock-agent（端口 4001）：模拟目标虚拟机，返回真实本机系统数据。
- API 可在生产模式下托管 Web 静态文件。

## 开发命令

```powershell
npm install
npm run build
npm run typecheck
```

## 启动服务

```powershell
# 终端 1 — mock-agent（模拟目标虚拟机，端口 4001）
node apps/mock-agent/src/index.js

# 终端 2 — 主服务（Web 控制台 + API，端口 4000）
# 首次需要：Copy-Item .env.example .env
node apps/api/dist/server.js
```

访问：http://127.0.0.1:4000

## 生产部署

```powershell
Copy-Item .env.example .env
npm ci
npm run build
npm run preflight
npm run start:prod
```

健康检查：

```powershell
npm run smoke:test
```

## 重要目录

- `apps/api` — Fastify API 与生产静态 Web 托管。
- `apps/web` — React Web 控制台。
- `apps/mobile` — React Native / Expo 骨架。
- `apps/mock-agent` — 模拟目标虚拟机的轻量 HTTP agent。
- `packages/core` — manifest、policy、diff 等核心类型和逻辑。
- `packages/collectors` — 非破坏性采集器。
- `packages/restorers` — dry-run restore plan。
- `configs/catalog` — 配置市场 Markdown 说明。
- `docs` — 持久化产品理解、实现状态和部署文档。
- `data` — 本地运行时数据，默认不提交。

## 角色说明

| 角色 | 权限 |
|------|------|
| 游客 | 浏览配置市场 |
| 普通用户 | 连接虚拟机、发布热门组合、保存私有快照 |
| 管理员 | 额外可发布软件配置 |

设置管理员：编辑 `data/runtime-db.json`，将对应用户的 `"role": "user"` 改为 `"role": "admin"`。

## 安全原则

- 密码不明文保存（scrypt 哈希）。
- SSH 私钥不持久化，密码连接后脱敏存储。
- `.env`、`data/`、`logs/` 不提交进仓库。
- 远程命令执行使用白名单控制，不允许任意命令注入。
- 应用配置前必须先展示影响范围（dry-run）。
