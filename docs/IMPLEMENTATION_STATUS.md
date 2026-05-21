# 实现状态

更新时间：2026-05-22（基于全部设计文档的差距分析）

项目名称：**EnvForge**
GitHub：https://github.com/foolkking/envforge

---

## 一、完整目标盘点（来源：所有 docs/*.md）

### 已完成的核心目标 ✅

| 模块 | 状态 | 来源 |
|------|------|------|
| 三大主导航（当前虚拟机 / 配置市场 / 我的） | ✅ | UI_AND_VM_MANAGEMENT |
| 中英文 UI 切换 | ✅ | UI_AND_VM_MANAGEMENT |
| SSH 真实连接（密码 + 密钥 + Web 上传） | ✅ | PRODUCT_STRATEGY |
| 多种连接方式 UI（SSH 密码 / SSH Key） | ✅ | UI_AND_VM_MANAGEMENT |
| 系统采集（25+ 来源，过滤 Ubuntu 预装包） | ✅ | PRODUCT_STRATEGY 3.4 |
| Ansible-Compatible 引擎（9 模块 + sudo） | ✅ | PRODUCT_STRATEGY 3.2 |
| 配置市场（72 个 Playbook YAML） | ✅ | PRODUCT_STRATEGY 3.3 |
| 三种 kind：software / combo / vm-snapshot | ✅ | MARKET_MD_AND_MIGRATION_PLAN |
| 一键安装（真实 SSH，SSE 实时进度，可取消） | ✅ | PRODUCT_STRATEGY |
| 单项安装（/api/execute） | ✅ | PRODUCT_STRATEGY P2 |
| 影响范围预估（/api/catalog/:id/impact + batch） | ✅ | PRODUCT_STRATEGY P2 |
| Docker Compose 部署模式 | ✅ | PRODUCT_STRATEGY 9.4 |
| 卸载软件功能 | ✅ | (用户额外需求) |
| 环境保留（capture → 重建 Playbook，含配置文件） | ✅ | PRODUCT_STRATEGY 3.4 |
| Playbook 编辑器 + 版本管理（最多 20）+ YAML 上传 | ✅ | PRODUCT_STRATEGY P1 |
| 多目标批量执行（按 connectionId 或 tags） | ✅ | PRODUCT_STRATEGY P2 |
| 连接档案标签（tags[]） | ✅ | PRODUCT_STRATEGY P2 |
| 任务历史持久化（写入 runtime-db） | ✅ | PRODUCT_STRATEGY P0 |
| 终端日志面板（可拉伸 + SSE 流） | ✅ | PRODUCT_STRATEGY |
| 保持登录（24h localStorage） | ✅ | (用户需求) |
| 安全审计清单（SSH/UFW/Fail2Ban/自动更新/开放端口） | ✅ | PRODUCT_STRATEGY |
| 暗色模式 + 移动端响应式 | ✅ | PRODUCT_STRATEGY |
| 配置市场分类筛选 + 搜索 | ✅ | UI_AND_VM_MANAGEMENT |
| 从当前 VM 提取热门组合（extract-combo） | ✅ | MARKET_MD_AND_MIGRATION_PLAN |
| 配置文件管理（list/read/write） | ✅ | PRODUCT_STRATEGY 10 |
| 加密敏感字段（AES-256-GCM） | ✅ | PRODUCT_STRATEGY P0 |
| RBAC（admin/user，软件需 admin） | ✅ | MARKET_MD_AND_MIGRATION_PLAN |
| Docker 化部署（Dockerfile + compose） | ✅ | PRODUCT_STRATEGY 9.2 |
| 57 个引擎单元测试 | ✅ | PRODUCT_STRATEGY P1 |

---

## 二、未完成或半成的目标 ⚠️

### A. 隐私与还原策略（PRIVACY_AND_RESTORE_STRATEGY.md）

> 该文档定义了四层数据模型：软件 / 偏好 / 应用数据 / 密钥凭据。当前只完整实现了「软件层」和部分「偏好层」。

| 缺失项 | 现状 | 优先级 |
|------|------|------|
| **配置文件敏感字段扫描** | capture.ts 直接 base64 全文打包，未扫描 TOKEN / PASSWORD / API_KEY 等正则 | P0 |
| **配置文件保存前的人工二次确认** | 当前 capture 自动包含所有读到的 /etc/* 和 ~/* 配置 | P0 |
| **未连接虚拟机时模糊系统信息** | 已实现"未连接时不显示" | ✅ |
| **应用数据层（数据库数据等）单独加密包** | 完全未实现 | P3（设计明确说"暂不进入普通市场"） |
| **加密配置存储（age/sops）** | PRODUCT_STRATEGY 标记 ~~删除线~~（不做） | — |

### B. 同步模型（SYNC_MODEL.md）

> 该文档原本设计 GitHub 同步流程，PRODUCT_STRATEGY 已明确**不再以 Git 为中心**，但保留了 diff 的语义价值。

| 缺失项 | 现状 | 优先级 |
|------|------|------|
| **Snapshot diff（current vs snapshot）UI** | 后端 `/api/diff` 路由存在，前端无入口 | P2 |
| **配置文件版本对比（历次 capture 之间）** | PRODUCT_STRATEGY 10.4 P2 阶段，未实现 | P2 |
| **policy 文件**（`configs/policies/default.policy.json`） | 未创建，用 hardcode 黑白名单代替 | P3 |
| GitHub 提交 / pull / push | PRODUCT_STRATEGY 已弃用 | — |

### C. 还原阶段划分（BUILD_AND_RESTORE_FLOW.md）

> 该文档设计了 5 个 stage 还原流程；当前 Playbook 引擎已能在一个执行流里完成等价工作，但缺少阶段化 UI 反馈。

| 缺失项 | 现状 | 优先级 |
|------|------|------|
| **Preflight 阶段**（OS/磁盘/网络/冲突文件检查） | 未实现 | P2 |
| **分阶段确认**（Runtime → Packages → Configs → Services → Verify） | 当前 Playbook 一次性顺序执行，无阶段确认 | P3 |
| **冲突文件备份**（覆盖 ~/.bashrc 前先备份原文件） | 未实现 | P1 |
| **Stage 5 Verify**（执行后重新扫描对比结果） | 未实现 | P2 |
| **rollback 提示** | 未实现 | P2 |

### D. UI 与连接方式（UI_AND_VM_MANAGEMENT.md）

| 缺失项 | 现状 | 优先级 |
|------|------|------|
| **WinRM 连接** | UI 不显示该选项（已废弃 Windows 目标支持） | — |
| **Docker context 连接** | 未实现 | P3 |
| **未连接时模糊处理 + 连接面板覆盖** | 已实现 | ✅ |

### E. 配置市场详情（MARKET_MD_AND_MIGRATION_PLAN.md）

| 缺失项 | 现状 | 优先级 |
|------|------|------|
| **vm-snapshot 一键部署的分层确认 UI**（4 层 dry-run） | 当前直接整体执行 Playbook | P2 |
| **冲突策略选项**（skip-existing / replace-existing） | 当前默认幂等，但 UI 上无选择 | P2 |
| **虚拟机 hardware 细节**（CPU 型号/速度/磁盘 IO 等） | 仅采集 cores+totalGb | P3 |
| **市场卡片评分 / 热度** | 未实现（设计中提到） | P3 |

### F. 项目结构遗留（PROJECT_STRUCTURE.md）

| 缺失项 | 现状 | 优先级 |
|------|------|------|
| `packages/cli`（bootstrap 脚本） | 完全未实现 | P3 |
| `packages/restorers`（独立包） | 已被 engine/ 替代 | — |
| `apps/mobile`（React Native） | 已删除 | — |
| `scripts/bootstrap.ps1` / `.sh` | 仅 `start-production.sh/.ps1` 存在 | P3 |
| **新服务器 bootstrap CLI**（10 步骤） | 未实现 | P3 |

### G. 系统配置清单（PRIVACY_AND_RESTORE_STRATEGY 推荐）

> 当前清单只展示安全审计项（SSH/UFW/Fail2Ban），缺少推荐的"包和个人偏好"清单。

| 缺失清单项 | 现状 | 优先级 |
|------|------|------|
| Shell alias / PATH 片段 / profile 函数 | 未在系统清单展示（仅在 capture 时收集） | P2 |
| Git config（global） | 未展示 | P2 |
| 编辑器 settings + 插件列表 | 未展示 | P2 |
| 包管理器 registry / mirror 配置 | 未展示 | P2 |
| Hosts 片段 / 代理设置 | 未展示 | P2 |

---

## 三、按优先级建议的下一步

### P0 — 安全相关（强烈建议）

1. **capture 配置文件敏感字段扫描** —
   在写入捕获 Playbook 前，对配置文件内容跑一组正则（`TOKEN=`、`PASSWORD=`、`SECRET=`、`API_KEY=`、`Bearer `、私钥头`-----BEGIN`），命中时自动脱敏为 `<REDACTED>` 并在 UI 上提示哪些行被脱敏。
2. **冲突文件备份** —
   `lineinfile` 或 `copy` 模块在写入前若目标已存在且内容不同，自动复制到 `<path>.envforge.bak.<timestamp>`。

### P1 — 提升可用性

3. **配置文件版本对比（diff）** —
   `/api/connections/:id/configs/diff?path=...&from=v1&to=v2`，前端用 monaco diff editor 展示。
4. **执行前 Preflight 检查** —
   连接前快速检查 sudo 可用 / 磁盘空间 / Internet 可达，列在终端面板顶部。
5. **Stage Verify**（执行后重扫） —
   一键安装完成后自动 reprobe，UI 上 diff 显示"新增的软件包/服务"。

### P2 — 完善体验

6. **系统配置清单扩展** —
   添加 alias / PATH / git config / npm registry / hosts 片段的展示行。
7. **vm-snapshot 分层 dry-run** —
   把"软件 / 配置文件 / 环境变量 / 服务"分四个 stage 走，每个 stage 单独 dry-run + 用户确认。
8. **Markdown 安装说明弹窗** —
   一键安装完成后自动弹出该 catalog 的 .md 引导（接口已有 `/api/catalog/:id/guide`）。

### P3 — 边缘需求（设计文档提到但优先级低）

9. Docker context 连接方式
10. 卡片评分 / 热度
11. CLI bootstrap 工具
12. 配置文件模板变量替换（IP/域名）

---

## 四、启动命令

```powershell
npm run build
node apps/api/dist/server.js
```

访问：http://127.0.0.1:5173

## 五、Docker 启动

```bash
export ENVFORGE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d
```
