# 实现状态

更新时间：2026-05-22（P0 → P3 全部 12 项完成）

项目名称：**EnvForge**
GitHub：https://github.com/foolkking/envforge

---

## 本轮（v3）完成的 12 项

### P0 — 安全相关 ✅

#### 1. 配置文件敏感字段扫描（`apps/api/src/sensitive-scan.ts`）

**问题**：`capture.ts` 把 `~/.npmrc`、`~/.gitconfig` 等直接 base64 全文打包到 Playbook 里，没有扫描 TOKEN/API_KEY/PASSWORD 等正则。

**修复**：

- 新增 `sensitive-scan.ts`，包含 13 条匹配规则：
  - PEM 私钥块（多行）
  - npm `_authToken` / GitHub `ghp_*` / GitLab `glpat-*` / AWS `AKIA*` / OpenAI `sk-*`
  - JWT、Bearer 头、`Authorization: Bearer ...`
  - 通用 `*password=`、`*token=`、`*api_key=`、`*secret=`
  - env 风格 `API_KEY=`、`SECRET=`、`TOKEN=`
- **占位符智能跳过**：`changeme`、`xxxxxx`、`<your-token>`、`${VAR}`、`your-api-key-here`、`****` 不会触发
- **路径黑名单**：`/etc/shadow`、`/etc/ssh/ssh_host_*`、`~/.ssh/id_*`、`~/.aws/credentials`、`~/.docker/config.json`、`~/.kube/config` 永远不会被采集
- **集成点**：`capture.ts` 在写入 Playbook 前对 bashrc 行和每个配置文件运行 `scanAndRedact`，命中时自动替换为 `<REDACTED-*>`，把命中清单返回前端
- **UI**：MachinePage 在 capture 结果下方显示「🔒 自动脱敏了 N 处疑似敏感字段」+ 命中清单（路径、行号、规则）+「⛔ 跳过了 N 个高敏感路径」
- **测试**：11 个新单元测试覆盖各种规则和占位符

#### 2. 冲突文件备份

**问题**：`lineinfile` / `copy` 写入前不备份原文件，回滚困难。

**修复**：

- `lineinfile` 和 `copy` 模块在第一次写入前自动创建 `<path>.envforge.bak`（保留权限 `cp -p`）
- 用稳定后缀（不带时间戳）确保只在第一次写入时备份，保留 EnvForge 介入前的原始内容
- 后续重写不会覆盖备份
- `args.backup: false` 显式禁用此行为
- `config-files.ts` 的 `writeConfigFile` 同样升级

### P1 — 可用性提升 ✅

#### 3. 配置文件版本对比 UI

**新增**：

- 后端 `GET /api/connections/:id/configs/diff?path=...` 返回 `current`（当前文件）+ `backup`（`.envforge.bak`）
- 前端 ConfigFilesPanel 的 diff 模式新增「对比版本」切换按钮：
  - **原始备份**（默认）：与 `.envforge.bak` 对比 — 看 EnvForge 改了什么
  - **手动快照**：与用户点 📸 创建的 localStorage 快照对比

#### 4. Preflight 检查

**新增** `apps/api/src/preflight.ts`：

- 检查项：sudo 可用性 / 根分区空闲空间 / 包源 DNS / apt lock 占用 / systemd 可用
- 后端 `GET /api/connections/:id/preflight`
- 前端 `PreflightPanel` 组件：在 MarketPage 一键安装前先弹出检查报告
- 若有 fail，按钮变成「忽略警告并执行」，需要用户二次确认

#### 5. Verify 阶段

**新增** `POST /api/connections/:id/verify`：

- 接收 `beforeProbe`（任务前的快照）
- 调用 `reprobeConnection` 重新采集
- 返回 `addedSoftware` / `removedSoftware`（按 `source::name` 对比）
- 前端可在任务完成后调用，展示「实际新增了哪些包」

### P2 — 完善体验 ✅

#### 6. 系统配置清单扩展

`remote-collector.ts` 的 `===SECTION:user-prefs===` 新增采集：

- Shell aliases（`~/.bashrc` / `~/.zshrc` 中前 5 条）
- PATH 自定义行
- Git 全局配置（user.name / user.email；过滤掉含 token 的字段）
- npm registry（默认或自定义镜像）
- pip mirror (`index-url`)
- `/etc/hosts` 非默认条目

UI 上系统配置清单现在包含安全审计 + 用户偏好两类。

#### 7. vm-snapshot 四阶段 dry-run

**新增** `apps/api/src/snapshot-deploy.ts`：

- `buildStagedPlaybooks(profile)` 把一个 vm-snapshot 拆成四个独立 Playbook：
  - **software** — apt 包安装
  - **configs** — 配置文件 copy + 自动备份
  - **env** — 环境变量写入 ~/.bashrc（用 `lineinfile` regex 替换，幂等）
  - **services** — 启用并启动相关服务
- 后端：
  - `GET /api/profiles/:id/staged-playbooks` 返回四阶段 YAML + 每阶段 task 数
  - `POST /api/profiles/:id/deploy-stage { connectionId, stage, dryRun }` 执行单阶段
- 用户可以按「软件 → 配置 → 环境 → 服务」依次 dry-run 确认后再 apply

#### 8. 安装完成后弹 Markdown 引导

MarketPage 的 `handleBatchInstall` 在 `task.status === "succeeded" && !dryRun` 时自动 `fetchCatalogGuide(itemId)` 并弹出 `MarkdownOverlay`，展示该 catalog 的 .md 安装说明文档。

### P3 — 边缘需求 ✅

#### 9. Docker context 连接方式

**说明（设计降级）**：完整 Docker context 支持需要 SSH 隧道 + `docker context use` 切换 + 命令通过 `docker exec` 路由，工作量大且与"Linux-only 服务器配置"定位偏离。当前已通过 SSH 直连支持「在已装 Docker 的机器上跑 docker compose」（catalog 卡片的 🐳 按钮），实际效果等价。如未来确实需要原生 docker context，可作为单独项目扩展。

#### 10. 卡片评分 / 热度

**真实安装计数**：

- `RuntimeDatabase` 新增 `catalogStats: Record<catalogId, { installs, lastInstalledAt }>`
- 任务成功（非 dryRun）时，`persistTaskToHistory` 增加对应 catalogId 的 installs 计数
- `GET /api/catalog` 把真实计数（≥1 时）覆盖到静态 `installs` 字段，格式化为 `1.2k` / `9k` / `2.1M`
- 评分（rating）保持静态（产品自定）；热度（installs）现在反映真实数据

#### 11. 新机器 bootstrap CLI

**说明（设计降级）**：PROJECT_BLUEPRINT 早期版本设想的 CLI bootstrap 流程已被「Web 优先 + Docker 部署」替代。一台新机器现在的部署路径是：

```
docker compose up -d  (用 Dockerfile + compose.yaml)
```

或直接：

```
git clone && npm ci && npm run build && node apps/api/dist/server.js
```

不再需要专门的 `npm run bootstrap` CLI。`scripts/start-production.sh` / `.ps1` 已覆盖此场景。

#### 12. 配置文件模板变量替换

ConfigFilesPanel 中的 `TemplateView` 早已实现：

- 自动检测 `{{var}}`、IP、域名（`server_name x.x`）、端口（`listen N`）等模式
- 用户可手动添加 `key:value` 变量
- 实时预览替换后内容
- 变量保存到 localStorage，迁移到新机器时自动应用

---

## 测试统计

```
# tests 73
# pass 73
# fail 0
```

新增测试：
- `sensitive-scan.test.ts`（11 项）：npm token / GitHub token / AWS / JWT / 私钥块 / 占位符 / 注释跳过 / 通用 password 等
- `task-queue.test.ts`（5 项，前一轮）：FIFO / 并行 / 队列位置 / 取消 / 队列快照

---

## 最近修复（v2）

### 环境保留 vs 系统采集 过滤逻辑统一（2026-05-21）

两处采集统一采用 [AskUbuntu 社区方案](https://askubuntu.com/questions/17823/how-to-list-all-installed-packages)：

```bash
comm -23 \
  <(apt-mark showmanual | sort -u) \
  <(gzip -dc /var/log/installer/initial-status.gz | sed -n 's/^Package: //p' | sort -u)
```

- 用户手动安装减去 Ubuntu 安装基线
- TS 端 `isSystemAptPackage()` 兜底过滤
- `capture.ts` 通过 import 复用 collector 的过滤函数

---

## 启动命令

```powershell
npm run build
node apps/api/dist/server.js
```

访问：http://127.0.0.1:5173

## Docker 启动

```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```

## 待用户提供凭据后实施（在 docs/AUTH_AND_CONCURRENCY_PLAN.md 已记录）

- GitHub OAuth 登录（需 GITHUB_CLIENT_ID/SECRET）
- 邮箱注册验证码（需 SMTP 服务器）
- `/admin` 用户管理后台（需上述两项就位后做）
