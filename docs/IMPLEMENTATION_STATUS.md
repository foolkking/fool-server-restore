# 实现状态

更新时间：2026-05-21（环境保留与采集逻辑统一）

项目名称：**EnvForge**
GitHub：https://github.com/foolkking/envforge

---

## 最近修复

### 环境保留 vs 系统采集 过滤逻辑统一（2026-05-21）

**问题**：环境保留（capture.ts）和系统采集（remote-collector.ts）使用不同的过滤逻辑，导致环境保留生成的 Playbook 包含 600+ 个 Ubuntu 系统预装包（base-files、libc6、bash 等），而采集面板只显示 ~30 个用户安装的包。

**修复**：两处采集统一采用 [AskUbuntu 社区方案](https://askubuntu.com/questions/17823/how-to-list-all-installed-packages)：

```bash
comm -23 \
  <(apt-mark showmanual | sort -u) \
  <(gzip -dc /var/log/installer/initial-status.gz | sed -n 's/^Package: //p' | sort -u)
```

- 用 `apt-mark showmanual`（用户手动安装的包）减去 `/var/log/installer/initial-status.gz`（Ubuntu 安装时的基线包列表）。
- 没有 `initial-status.gz` 时（Docker / 非 Ubuntu）fallback 到 `apt-mark showmanual` 全量列表。
- TypeScript 端 `isSystemAptPackage()` 作为兜底过滤（catch lib*, linux-*, python3-* 等漏网包）。
- `capture.ts` 通过 `import { isSystemAptPackage, isSystemService }` 复用 collector 的过滤函数，保证两处一致。

---


## 功能完成度

### ✅ 核心功能（全部完成）

| 功能 | 状态 |
|------|------|
| SSH 连接（密码 + 密钥 + Web 上传） | ✅ |
| 全面系统采集（25+ 来源，排除预装包） | ✅ |
| Ansible-Compatible 引擎（9 模块 + sudo） | ✅ |
| 配置市场（22 个 Playbook YAML） | ✅ |
| 一键安装（真实执行，SSE 实时进度） | ✅ |
| 单项安装（/api/execute，支持 catalog + profile） | ✅ |
| 影响范围预估（/api/catalog/:id/impact + batch） | ✅ |
| Docker Compose 部署模式 | ✅ |
| Playbook 编辑器 + 版本管理 + 上传 YAML | ✅ |
| 多目标批量执行 | ✅ |
| 环境保留（生成完整重建 Playbook，含配置文件） | ✅ |
| 配置文件管理（查看/编辑/diff/模板变量） | ✅ |
| 终端日志面板（可拉伸 + 连接日志 + 任务日志） | ✅ |
| 任务历史持久化（写入 runtime-db，重启不丢失） | ✅ |
| 保持登录（24h localStorage） | ✅ |
| 安全审计清单（SSH 加固/防火墙/Fail2Ban/自动更新/开放端口） | ✅ |
| 暗色模式（跟随系统 prefers-color-scheme） | ✅ |
| 响应式移动端适配 | ✅ |
| 配置市场分类筛选 | ✅ |
| 57 个引擎单元测试 | ✅ |
| Docker 化部署（Dockerfile + compose） | ✅ |

### 系统配置清单（安全审计项）

重新设计后的清单显示以下安全相关检查项：

| 检查项 | 说明 | 状态判定 |
|--------|------|---------|
| Root 登录 | 检查 `PermitRootLogin` 是否为 no | 禁用=healthy, 未禁用=warning |
| 密码认证 | 检查 `PasswordAuthentication` 是否为 no | 禁用=healthy, 启用=warning |
| UFW 防火墙 | 检查 `ufw status` 是否 active | 启用=healthy, 未启用=warning |
| Fail2Ban | 检查 fail2ban 服务是否 active | 运行=healthy, 未运行=warning |
| 自动更新 | 检查 unattended-upgrades 是否安装 | 已配置=healthy, 未配置=warning |
| 开放端口 | 列出所有 LISTEN 端口 | 信息展示 |
| 磁盘使用 | df 根分区使用率 | >90%=warning |
| 运行时间 | uptime | 信息展示 |
| 服务统计 | 运行中/已启用数量 | 信息展示 |

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
