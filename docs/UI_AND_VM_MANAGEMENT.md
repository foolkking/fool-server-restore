# UI 与目标虚拟机管理设计

## 2026-05-19 重要修正

UI 不应把所有信息放在一个页面，也不应以 GitHub 同步、快照、diff、restore 为主导航。主导航精简为：

- 当前虚拟机软硬件信息管理
- 系统软硬件信息 add
- 我的

“系统软硬件信息 add”页面参考 Chrome 应用商店布局：左侧主栏目、顶部搜索框、下方大卡片网格。每个卡片包含配置/软件图片、名称、分类、评分或热度、简短说明和加入按钮。

“我的”页面默认为游客，支持登录、注册、登出、个人信息管理，以及用户上传过的虚拟机配置资料管理。

界面默认中文，并提供中文/英文切换。

## 2026-05-19 实现更新

已将 Web UI 改为三大页面切换，而不是把所有内容堆叠在一个总览页：

1. 当前虚拟机软硬件信息管理
2. 系统软硬件信息 add
3. 我的

当前实现要点：

- 左侧导航只保留三项主功能。
- 顶部右侧提供中文/英文切换。
- “当前虚拟机软硬件信息管理”页面包含：
  - SSH/连接目标虚拟机表单。
  - 当前连接虚拟机摘要。
  - 扫描当前虚拟机按钮。
  - 上传当前虚拟机配置按钮。
  - 硬件、软件、系统配置三类详细清单。
  - 每条清单均可单独勾选。
- “系统软硬件信息 add”页面包含：
  - 顶部搜索框。
  - 左侧分类栏。
  - 应用商店式配置卡片。
  - 每张卡片包含图片区域、名称、说明、评分、安装热度、敏感度和加入按钮。
- “我的”页面包含：
  - 游客身份展示。
  - 登录、注册、登出入口。
  - 个人资料表单。
  - 用户上传过的虚拟机配置资料管理入口。

新增 API：

```text
GET /api/catalog
GET /api/me
```

当前不再在 UI 中突出 Git/GitHub、commit、diff、restore timeline 等旧主线。

## 2026-05-19 第二次 UI 修正

根据最新反馈继续调整：

- 未连接远程服务器/虚拟机前，系统信息、软件信息、配置清单都必须模糊处理。
- 连接面板覆盖在核心区域上方，用户先选择连接方式，再填写对应字段。
- 连接方式字段需要匹配方式：
  - SSH 密码：Host、Port、Username、Password
  - SSH Key：Host、Port、Username、Private key path/passphrase
  - WinRM：Host、Domain、Username、Password
  - Docker context：Context name、Socket/Host
- “硬件信息”不再作为大列表占一列，而是固定展示在顶部摘要区域，重点是软件运行相关资源：
  - CPU 核数
  - 总内存
  - 运行内存/可用内存
  - 磁盘空间
- 下方仅保留左右两栏：
  - 软件信息
  - 系统配置清单
- 软件信息必须包含安装命令。
- 系统配置清单主要展示包、alias、shell/profile、registry、服务启动偏好等用户偏好配置。
- “系统软硬件信息 add”更名为“配置市场”。
- add 页不再内嵌左侧分类栏，分类收进筛选下拉。
- 我的页：
  - 未登录时不显示个人信息详情。
  - 登录后登录/注册按钮变为编辑资料。
  - 登录后个人信息在底部固化展示，默认只读。

更新时间：2026-05-19

## UI 方向

Web 控制台已按专业开源基础设施工具的方向重构。视觉目标是可信、技术化、可审计，参考 GitHub、Vercel、Linear、Sentry、Supabase Studio 的开发者工具气质。

当前默认主题：

- 页面背景：`#f6f8fa`
- 卡片：白色背景、细灰边框、低噪声
- 侧边栏：深色 charcoal/navy
- 主操作色：teal/emerald
- 警告：amber
- 错误：red
- 信息：blue
- 字体：Inter / system-ui
- 圆角：10-12px

## 当前页面结构

- 左侧分组导航：
  - Overview
  - Nodes
  - Sync Scope
  - Snapshots
  - Diff
  - Restore
  - Audit Logs
  - Settings
- 顶部状态：
  - 当前节点
  - GitHub 仓库同步状态
  - 最近快照
  - 扫描状态
  - `Run scan` 主操作
- Dashboard 卡片：
  - Current node
  - Last snapshot
  - Scan status
  - GitHub sync
  - Restore readiness
- 主工作流 stepper：
  - Scan
  - Manifest
  - Diff
  - Commit
  - Dry-run
  - Restore
- 同步范围：
  - 图标
  - 标签
  - 描述
  - 敏感度/状态 badge
  - 最近变更时间
- 最新扫描：
  - CLI 风格日志
  - warning
  - recommended fix
- 快照：
  - 版本列表
  - 时间戳
  - commit 状态
  - diff 摘要
  - restore 操作
- 恢复：
  - dry-run preview
  - 风险提示
  - 受影响 package/file/service
  - 强确认入口
- 审计：
  - timeline
  - severity badge
  - actor/action/resource metadata

## 目标虚拟机管理功能

新增“Target virtual machines”区域，用于可视化管理连接目标虚拟机的软件应用与常见系统配置清单。

当前 API：

```text
GET /api/targets
```

当前数据模型：

```text
TargetVirtualMachine
  id
  name
  provider
  address
  status
  os
  region
  lastSeen
  software[]
  configChecklist[]

TargetSoftware
  name
  version
  source
  status

SystemConfigItem
  id
  label
  category
  status
  lastChanged
```

当前 UI 支持展示：

- VM 名称、Provider、地址、区域、OS、last seen。
- 软件清单：runtime、npm、system、container 来源。
- 系统配置清单：security、network、runtime、service 分类。
- 状态 badge：Healthy、Warning、Failed、Unsynced、Synced。

## 后续实现方向

1. 将 `GET /api/targets` 从静态样例改为本地数据库读取（已完成）。
2. 增加目标 VM 连接配置：SSH、WinRM、Docker context（已完成）。
3. 为目标 VM 增加只读探测任务（已完成，通过 SSH 采集）。
4. 为每台 VM 单独生成软件应用 inventory（已完成）。
5. 连接详情面板：查看字段、编辑标签/agentUrl、重新验证、删除（已完成）。
6. 软件/配置清单可展开详情，支持安装/应用操作（已完成）。
