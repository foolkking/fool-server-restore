# EnvForge — 实现状态

最后更新：2026-05-22

> 本文合并自 IMPLEMENTATION_STATUS。更详细的产品设计见 [PRODUCT.md](./PRODUCT.md)，工程架构见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 已完成功能

### 核心

| 模块 | 状态 |
|------|------|
| SSH 连接（密码 + 密钥 + Web 上传，AES-256-GCM 加密存储） | ✅ |
| 全面系统采集（25+ 来源，`comm -23` 排除 Ubuntu 预装包） | ✅ |
| Ansible-Compatible 引擎（13 模块） | ✅ |
| 配置市场（72 个 Playbook，三种 kind） | ✅ |
| 一键安装 / 卸载（真实 SSH，SSE 进度，可取消） | ✅ |
| 影响范围预估（disk / time / sudo / risk） | ✅ |
| Docker compose 部署模式 | ✅ |
| 环境保留 → 重建 Playbook（含敏感字段扫描） | ✅ |
| 配置文件管理（list / read / write / diff / 模板变量） | ✅ |
| Playbook 编辑器 + 版本管理（最多 20）+ YAML 上传 | ✅ |
| 多目标批量执行（按 connectionIds 或 tags） | ✅ |
| 任务历史持久化（最近 200 条） | ✅ |
| 安全审计清单（SSH / UFW / Fail2Ban / 自动更新 / 开放端口） | ✅ |
| 暗色模式 + 移动端响应式 | ✅ |
| Docker 化部署 + 沙盒 demo | ✅ |
| 90 个引擎单元测试 | ✅ |

### 引擎模块（13 个）

| 模块 | 用途 |
|------|------|
| `package` | apt / yum / dnf 幂等安装 |
| `service` | systemctl 启停 / 启用 |
| `lineinfile` | 配置文件单行编辑（含自动备份 .envforge.bak） |
| `copy` | SFTP 上传（含自动备份） |
| `template` | Jinja2-lite 渲染 + 上传 |
| `user` | 系统用户管理 |
| `file` | 文件 / 目录 mode / owner / state |
| `ufw` | 防火墙规则 |
| `shell` | 逃生口（creates / removes 实现幂等） |
| `cron` | crontab 管理 |
| `systemd_unit` | 创建 .service 单元文件 |
| `sysctl` | 内核参数（live + 持久化双写） |
| `acme` | Let's Encrypt 证书签发 |

### 安全相关

| 功能 | 实现 |
|------|------|
| 凭据加密（密码 / 密钥 / passphrase） | AES-256-GCM，master key 来自 `.env` |
| 敏感字段扫描（capture 前自动脱敏） | 13 条规则，路径黑名单永屏蔽 |
| 冲突文件备份（lineinfile / copy 第一次写入前） | 稳定后缀 `.envforge.bak`，保留权限 |
| 三级角色（guest / user / admin） | 邮箱白名单 + 一次性迁移（fool 历史用户） |
| Per-VM 任务队列 | 防止跨用户改坏同一台机器 |
| API token（CI/CD 集成） | `envf_*` 前缀，SHA-256 hash 存储，可选过期 |

### 持续运维

| 功能 | 实现 |
|------|------|
| 定时任务（cron-style） | 自写 5 字段解析器，30s tick 调度，重启不丢 |
| 漂移检测 | 设基线 + 任意时刻 / 定时 diff，触发 webhook |
| Webhooks | HMAC-SHA256 签名，4 种事件，5s 超时，并行投递 |
| Preflight 检查 | sudo / 磁盘 / 网络 / apt lock / systemd |
| Verify 阶段 | 任务完成后 reprobe + 软件包 diff |
| SSH keepalive | 全部连接点加 30s keepalive，避免长任务被断 |

### Admin 能力

| 功能 | 实现 |
|------|------|
| Catalog 管理（add / edit / hide / reset baseline） | overlay 模式，`data/catalog-overrides/` |
| YAML / Markdown 编辑 | 服务端 parsePlaybook 校验 |
| 严格 id 正则 + 路径注入防护 | `^[a-z0-9][a-z0-9-]{0,59}$` |
| 队列监控（`/api/admin/queues`） | 仅 admin 可见 |

### UX

| 功能 | 实现 |
|------|------|
| 首次启动向导（4 步） | localStorage 控制只展示一次 |
| 模块文档浏览器 | 自描述 schema + 示例代码 |
| 安装完成弹 Markdown 引导 | 自动 fetchCatalogGuide |
| 中英文切换 | 全 UI 覆盖 |
| 终端日志面板（可拉伸） | SSE 实时流，连接 + 任务日志合并 |

## 待实现（需用户提供凭据）

| 功能 | 阻塞条件 |
|------|---------|
| GitHub OAuth 登录 | 需 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| 邮箱注册验证码 | 需 SMTP 服务器（nodemailer） |
| `/admin` 用户管理后台 | 前两项就位后做 |

## 测试

```bash
npm run build --workspace @fool/api
node --test apps/api/dist/engine/tests/*.test.js
```

```
# tests 90
# pass 90
# fail 0
```

测试套件覆盖：runner / errors / 各模块（package / service / shell / lineinfile 等）/ 任务队列 / 敏感扫描 / cron 解析器 / migrations / catalog overrides。

## 启动命令

### 本地

```bash
npm install
echo "ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" > .env
npm run build
node apps/api/dist/server.js
```

访问 http://127.0.0.1:5173

### Docker

```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```

### 沙盒演示（含 Ubuntu target VM）

```bash
docker compose -f docker-compose.demo.yml up -d
# host=sandbox-vm port=22 user=demo password=demo
```
