# EnvForge

自托管的 Linux 服务器配置管理平台。通过 SSH 连接虚拟机，一键安装软件、管理配置文件、保留环境。

## 功能

- **SSH 连接管理** — 密码/密钥认证，Web 上传密钥，连接标签分组
- **全面系统采集** — 25+ 来源（apt/snap/npm/pip/docker/systemd 等），排除系统预装包
- **配置市场** — 22 个预置 Playbook（Nginx、Redis、Docker、Node.js、Go、Rust 等）
- **一键安装/卸载** — 真实 SSH 执行，SSE 实时进度，批量操作
- **Playbook 引擎** — Ansible-Compatible YAML，9 个模块（package/service/shell/lineinfile/copy/template/file/user/ufw）
- **环境保留** — 从 VM 反向生成完整重建 Playbook（含软件包 + 服务 + 配置文件）
- **配置文件管理** — 查看/编辑/diff 对比/模板变量替换
- **安全审计清单** — SSH 加固、防火墙、Fail2Ban、自动更新、开放端口检测
- **Playbook 编辑器** — 版本管理、上传 YAML、多目标执行
- **暗色模式** — 跟随系统 prefers-color-scheme
- **Docker 部署** — Dockerfile + docker-compose.yml

## 快速开始

```bash
# 安装依赖
npm install

# 设置加密密钥
echo "ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" > .env

# 构建
npm run build

# 启动
node apps/api/dist/server.js
```

访问 http://127.0.0.1:5173

## Docker 部署

```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```

## 技术栈

- **前端**: React + TypeScript + Vite + Lucide Icons
- **后端**: Fastify + TypeScript + ssh2
- **引擎**: Ansible-Compatible Playbook 执行器（TypeScript 原生，无 Python 依赖）
- **存储**: JSON 文件（原子写入 + 备份）
- **认证**: scrypt 密码哈希 + AES-256-GCM 加密凭据

## 项目结构

```
apps/
  api/          — Fastify API 服务器
    src/
      engine/   — Playbook 执行引擎（9 模块 + runner）
      collectors/ — 远程系统采集器
  web/          — React 前端
    src/
      pages/    — MachinePage, MarketPage, PlaybookPage, MePage
      components/ — TerminalPanel, ConfigFilesPanel, InventoryPanel 等
configs/
  catalog/
    playbooks/  — 22 个预置 Playbook YAML
    docker/     — Docker Compose 部署文件
    software/   — 软件说明 Markdown
    combos/     — 组合说明 Markdown
docs/           — 产品策略、实现状态
```

## 测试

```bash
npm run build --workspace @fool/api
node --test apps/api/dist/engine/tests/*.test.js
```

57 个引擎单元测试覆盖所有模块。

## License

MIT
