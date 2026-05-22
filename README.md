<!--
 * @Author: fool
 * @Date: 2026-05-19 21:03:39
 * @LastEditors: fool
 * @LastEditTime: 2026-05-22 15:06:44
 * @FilePath: \EnvForge\README.md
 * @Description:  
 * @Note:  
-->
# EnvForge

自托管的 Linux 服务器配置管理平台。通过 SSH 连接虚拟机，一键安装软件、管理配置、保留环境，把整套系统状态变成可重用的 Playbook。

## 核心能力

- **SSH 连接管理** — 密码 / 密钥（Web 上传，AES-256-GCM 加密存储），连接标签分组
- **配置市场** — 72 个预置 Playbook（运行时 / 数据库 / 安全 / 网络 / 容器等），admin 可增改
- **Ansible-Compatible 引擎** — 13 个内置模块（package / service / lineinfile / copy / template / user / file / ufw / shell / cron / systemd_unit / sysctl / acme），TypeScript 原生，无 Python 依赖
- **环境保留** — 从已连接 VM 反向生成完整重建 Playbook（含敏感字段自动脱敏）
- **配置文件管理** — 查看 / 编辑 / diff 对比 / 模板变量替换 / `.envforge.bak` 自动备份
- **多目标 + 定时调度** — 一个 Playbook 同时跑多 VM；cron-style 调度
- **漂移检测** — 设基线后定时 diff，发现意外变更时触发 Webhook
- **任务并发控制** — Per-VM FIFO 队列：同 VM 串行，多 VM 并行
- **API token** — CI/CD 集成（GitHub Actions / Jenkins）
- **三级角色** — guest / user / admin（admin 可管理 catalog）
- **首次启动向导 + 模块文档浏览器 + 中英双语 + 暗色模式**

## 快速开始

```bash
npm install
echo "ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" > .env
npm run build
node apps/api/dist/server.js
```

访问 http://127.0.0.1:5173

## Docker 部署

```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```

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
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 工程架构、目录结构、引擎设计、关键决策 |
| [docs/STATUS.md](./docs/STATUS.md) | 当前实现状态、启动命令、测试 |

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

90 个单元测试全部通过。

## License

MIT
