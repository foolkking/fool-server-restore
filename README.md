<!--
 * @Author: fool
 * @Date: 2026-05-19 21:03:39
 * @LastEditors: fool
 * @LastEditTime: 2026-05-23 18:13:15
 * @FilePath: \EnvForge\README.md
 * @Description:  
 * @Note:  
-->
# EnvForge

自托管的 Linux 服务器配置管理平台。通过 SSH 连接虚拟机，一键安装软件、管理配置、保留环境，把整套系统状态变成可重用的 Playbook。

> 项目仓库：<https://github.com/foolkking/envforge>

## 核心能力

- **SSH 连接管理** — 密码 / 密钥（Web 上传，AES-256-GCM 加密存储），连接标签分组
- **配置市场** — 100 软件 + 15 组合 = **115 个预置 Playbook**（运行时 / 数据库 / 安全 / 网络 / 容器 / 服务等），admin 可增改
- **Ansible-Compatible 引擎** — 13 个内置模块（package / service / lineinfile / copy / template / user / file / ufw / shell / cron / systemd_unit / sysctl / acme），TypeScript 原生，无 Python 依赖
- **环境保留** — 从已连接 VM 反向生成完整重建 Playbook（含敏感字段自动脱敏）
- **配置文件管理** — 查看 / 编辑 / diff 对比 / 模板变量替换 / `.envforge.bak` 自动备份
- **多目标 + 定时调度** — 一个 Playbook 同时跑多 VM；cron-style 调度
- **漂移检测** — 设基线后定时 diff，发现意外变更时触发 Webhook
- **任务并发控制** — Per-VM FIFO 队列：同 VM 串行，多 VM 并行
- **API token** — CI/CD 集成（GitHub Actions / Jenkins）
- **三级角色** — guest / user / admin（admin 可管理 catalog）
- **首次启动向导 + 模块文档浏览器 + 中英双语 + 暗色模式**

## 快速开始（本地）

```bash
git clone https://github.com/foolkking/envforge.git
cd envforge
npm install

# 生成 master key（用于 AES-256-GCM 加密 SSH 凭据，丢失 = 所有保存的密码不可解）
echo "ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" >> .env

npm run build
node apps/api/dist/server.js
```

访问 http://127.0.0.1:5173

## Docker 部署

```bash
git clone https://github.com/foolkking/envforge.git
cd envforge

# 生成并保存 master key（**离线备份这个值**）
echo "ENVFORGE_MASTER_KEY=$(openssl rand -base64 32)" > .env

docker compose up -d
# 访问 http://localhost:5173
```

> 完整的从零部署步骤（Docker 安装、HTTPS 反代、systemd 自启、备份恢复、升级、卸载、排错）见
> **[docs/DEPLOY.md](./docs/DEPLOY.md)**。
>
> 已经有一台运行中的 EnvForge，想用它来部署**另一台**新的 EnvForge 服务器？见
> **[docs/DEPLOY_SELF.md](./docs/DEPLOY_SELF.md)**——用现成 catalog Playbook 完成新实例的基础设施 + HTTPS + 防火墙，13-15 分钟。

## 沙盒演示（含一台 Ubuntu target VM，免买 VPS）

```bash
docker compose -f docker-compose.demo.yml up -d
# 访问 http://localhost:5173
# VM Manager 添加连接：host=sandbox-vm port=22 user=demo password=demo
```

## 文档

| 文档 | 内容 |
|------|------|
| [docs/PRODUCT.md](./docs/PRODUCT.md) | 产品定位、信息架构、用户角色、隐私模型、Roadmap |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 工程架构、目录结构、引擎设计、测试、关键决策 |
| [docs/CATALOG.md](./docs/CATALOG.md) | 100 软件 + 15 组合 = 115 项 catalog 完整清单（按 category 分组） |
| [docs/CATALOG_AUTHORING.md](./docs/CATALOG_AUTHORING.md) | 新增 / 修改 catalog 项的统一规范（md / yaml / vars.json / catalog.ts） |
| [docs/CATALOG_EXPAND_PROMPT.md](./docs/CATALOG_EXPAND_PROMPT.md) | 给 LLM 的扩展建议 prompt（粘贴整段拿到值得新增的清单） |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Docker 从零部署：依赖、HTTPS、systemd、备份、升级、排错 |
| [docs/DEPLOY_SELF.md](./docs/DEPLOY_SELF.md) | 用现有 EnvForge 部署一台新的 EnvForge 服务器（多区域 / 蓝绿升级 / 给客户复制） |
| [docs/CROSS_DISTRO_STRATEGY.md](./docs/CROSS_DISTRO_STRATEGY.md) | 跨发行版兼容策略：包名/服务名翻译、preflight、compatibility 声明 |

## 技术栈

- **前端**：React 18 + TypeScript + Vite + lucide-react
- **后端**：Fastify + TypeScript + ssh2
- **引擎**：Ansible-Compatible Playbook 执行器（无 Python）
- **存储**：JSON 文件（`SafeJsonStore`：原子写 + 写锁 + 自动备份）
- **加密**：scrypt（密码）+ AES-256-GCM（凭据）

## 测试

```bash
npm run build --workspace @fool/api
node --test apps/api/dist/engine/tests/*.test.js
```

100+ 个引擎单元测试覆盖：runner / 模块（package / service / shell / lineinfile / cron / systemd / sysctl / etc）/ 任务队列 / 敏感扫描 / migrations / catalog overrides / 跨发行版翻译 / preflight 阶段。

## License

MIT
