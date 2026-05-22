# 实现状态

更新时间：2026-05-22（套餐 A + 套餐 C 完成）

项目名称：**EnvForge**
GitHub：https://github.com/foolkking/envforge

---

## 本轮交付（持续运维 + 降低使用门槛）

### 套餐 A — 持续运维

#### A1. 定时任务（cron-style Playbook 调度）✅
- 新增 `apps/api/src/cron.ts`：手写 5 字段 cron 解析器（无外部依赖），8 个新单元测试
- 新增 `apps/api/src/scheduler.ts`：30 秒 tick 检查到期任务、入队执行、更新 `nextRunAt`
- 服务启动时调用 `startScheduler()`，schedules 持久化到 runtime-db 重启不丢
- `RuntimeDatabase` 新增 `schedules: StoredSchedule[]` 字段
- API：`GET/POST/PATCH/DELETE /api/schedules`
- UI：`SettingsPage` 的「定时任务」标签页，支持新建/启用/禁用/删除
- 支持选 Playbook 或 catalog 项；多目标（connectionIds 或 tags）

#### A2. 漂移检测（自动 capture + diff）✅
- 新增 `apps/api/src/drift.ts`：`setBaseline` / `runDriftCheck`
- 基线只存 `<source>::<name>` key 集合，节省空间
- API：`POST /api/connections/:id/drift/baseline` + `GET /api/connections/:id/drift`
- UI：`SettingsPage` 的「漂移检测」标签页（选 VM → 设置基线 → 立即检查）
- 检测到漂移自动触发 `drift.detected` webhook

#### A4. 通知 webhook（Slack / Discord / 自定义）✅
- 新增 `apps/api/src/webhooks.ts`：HMAC-SHA256 签名、5s 超时、并行投递
- 4 种事件类型：`task.completed` / `task.failed` / `drift.detected` / `schedule.fired`
- 任务完成时 `executor.ts` 自动 fire；schedule fired 时 scheduler.ts 触发
- API：`GET/POST/PATCH/DELETE /api/webhooks` + `POST /api/webhooks/:id/test`
- UI：「Webhooks」标签页，含一键测试按钮
- 投递结果存到 webhook 记录上（lastDeliveryStatus / lastDeliveryError）

#### F2. SSH keepalive ✅
- ssh.ts、routes.ts、config-files.ts、ssh-pool.ts 全部加 `keepaliveInterval: 30000` + `keepaliveCountMax: 3`
- 长 capture 期间不会被服务器/防火墙断开

#### Bonus：B1. REST API token（CI/CD 集成）✅
- `auth.ts` 的 `getUserByToken` 同时识别 session 和 `envf_*` 前缀的 API token
- 创建时返回 raw token 一次（之后只存 SHA-256 hash）
- 支持过期时间（天为单位，留空=永不过期）
- API：`GET/POST/DELETE /api/tokens`
- UI：「API tokens」标签页，含「⚠ 立即复制保存」横幅

---

### 套餐 C — 降低使用门槛

#### G1. 一键沙盒体验 ✅
- 新增 `docker-compose.demo.yml`：自带一台 Ubuntu 22.04 容器作为 target VM
- 容器启动时自动 apt 装 openssh-server + sudo，创建 `demo:demo` 用户（passwordless sudo）
- 用户启动后访问 http://localhost:5173，连接 host=`sandbox-vm` user=`demo` 即可体验完整 Playbook 流程
- 不用真买 VPS 就能完整体验

#### G2. 首次启动向导 ✅
- 新增 `apps/web/src/components/OnboardingWizard.tsx`：4 步引导
  1. 添加 SSH 连接
  2. 浏览配置市场
  3. 终端日志面板
  4. 高级功能（schedules / webhooks / API tokens）
- 登录后只展示一次（localStorage `envforge_onboarded`）
- 4 个进度点 + 中英双语

#### D2. 模块文档浏览器 ✅
- 新增 `apps/api/src/engine/module-docs.ts`：内置模块的自描述（参数 schema + 示例 + 注意事项）
- API：`GET /api/modules/docs`
- UI：「模块文档」标签页 — 左侧模块列表，右侧详细 args 表格 + 示例代码

#### E1. 新增 4 个引擎模块 ✅
| 模块 | 用途 | 关键参数 |
|------|------|---------|
| **cron** | 用户级 crontab 管理 | name / minute hour day month weekday / job |
| **systemd_unit** | 创建/删除 .service 单元文件 | name / exec_start / user / restart |
| **sysctl** | 内核参数（live + 持久化） | name / value |
| **acme** | Let's Encrypt 证书自动签发 | domain / email / plugin |

引擎模块总数：9 → **13**

---

## 测试统计

```
# tests 81
# pass 81
# fail 0
```

新增：`cron.test.ts`（8 项：解析器、`*/N` 步进、范围、`9-17` 工作时间、跨日跳转、跳过周末等）

---

## 启动命令

### 本地开发 / 生产部署
```powershell
npm run build
node apps/api/dist/server.js
```

### Docker（推荐）
```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```

### 沙盒演示（含一台 Ubuntu target VM）
```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose -f docker-compose.demo.yml up -d
# 访问 http://localhost:5173
# 在 VM Manager 添加连接：host=sandbox-vm port=22 user=demo password=demo
```

---

## 待用户提供凭据后实施（在 docs/AUTH_AND_CONCURRENCY_PLAN.md 已记录）

- GitHub OAuth 登录（需 GITHUB_CLIENT_ID/SECRET）
- 邮箱注册验证码（需 SMTP 服务器）
- `/admin` 用户管理后台

## 历史交付（前几轮）

- v3：三级角色（guest/user/admin）+ per-VM 任务队列 + 现存 fool 用户一次性迁移为 admin
- v2 P0-P3：敏感字段扫描、冲突文件备份、配置文件 diff、Preflight、Verify、系统清单扩展、vm-snapshot 四阶段、安装后 Markdown 弹窗、真实安装计数、模板变量
- 配置市场 72 个 Playbook、Ansible-Compatible 引擎（13 模块）、SSE 实时进度、Docker 化部署
