# 配置市场 MD 与完整迁移方案

更新时间：2026-05-20

## 三种配置类型的行为定义

### 软件配置（kind: software，仅管理员发布）

- 对应一个软件或软件运行环境。
- Markdown 由系统管理员编写，包含：安装内容、私人配置方式、安装命令、隐私说明。
- **一键安装**：通过 SSH 在已连接的目标虚拟机上执行安装命令（白名单控制）。
- 安装完成后自动弹出 Markdown 说明，引导用户完成私人配置。
- 详情展示：软件版本、安装路径、配置文件位置、依赖关系。

### 热门组合（kind: combo，所有登录用户可发布）

- 对应一组软件 + 系统偏好 + alias + registry + shell profile 等组合。
- Markdown 由上传用户编写，管理员可审核推荐。
- **一键应用**：通过 SSH 执行系统环境设置 + 软件包安装。
- 支持从当前已连接虚拟机的 probeSnapshot 自动提取草稿（软件列表 → 组件列表）。
- 详情展示：包含哪些软件、哪些系统配置、哪些 alias/profile 设置。

### 虚拟机运行环境快照（kind: vm-snapshot，所有登录用户可创建，强制私有）

- 来源：已连接虚拟机的完整 probeSnapshot + 用户补充的环境变量、配置文件、备注。
- **一键部署**：通过 SSH 将快照中的所有配置还原到目标机器（分层执行）。
- 部署分层：
  1. 软件层：通过包管理器安装软件包
  2. 配置文件层：通过 SFTP 上传配置文件
  3. 环境变量层：写入 `.bashrc`/`.zshrc`/`$PROFILE`
  4. 服务层：启动 systemctl/sc 服务
- 每层都支持 dry-run 预览，用户确认后再执行。
- 仅自己可见，不出现在配置市场。

---

## 执行引擎设计

### 命令白名单（安全边界）

软件安装命令白名单（按包管理器）：

```text
apt-get install -y <package>
apt-get update
yum install -y <package>
dnf install -y <package>
brew install <package>
npm install -g <package>
pip install <package>
winget install <package>
```

系统配置命令白名单：

```text
echo "export KEY=VALUE" >> ~/.bashrc
echo "alias name='command'" >> ~/.bashrc
source ~/.bashrc
systemctl enable <service>
systemctl start <service>
```

所有命令必须：
- 在白名单内
- 参数经过严格校验（只允许字母、数字、连字符、下划线、点）
- 不允许管道、重定向到系统目录、sudo 提权（除非用户明确授权）

### 任务执行模型

```text
Task
  id
  connectionId
  profileId
  kind: "install" | "apply-combo" | "deploy-snapshot"
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled"
  steps: Step[]
  createdAt
  startedAt
  completedAt

Step
  id
  command
  stdout
  stderr
  exitCode
  durationMs
```

### 实时日志

通过 Server-Sent Events（SSE）或 WebSocket 推送任务执行日志到前端。

---

## 从当前配置提取热门组合

当用户点击"从当前配置提取"时：

1. 读取当前激活连接的 `probeSnapshot.software`
2. 将每个软件映射为 `component: { type: "software", label: name, detail: version }`
3. 读取 `probeSnapshot.configChecklist` 映射为 `system-config` 组件
4. 预填到上传表单，用户可编辑后发布

---

## 配置详情展示

每个配置卡片点击后展示详情面板，包含：

- 软件配置：版本要求、安装路径、配置文件位置、依赖关系、安装命令预览
- 热门组合：包含的软件列表、系统配置项、alias 列表、profile 片段
- 运行环境快照：完整软件清单、环境变量（脱敏）、配置文件列表、系统信息

---

## 完整迁移方法（参考实现）

### 参考项目

- **chezmoi**（https://chezmoi.io）：声明式 dotfiles 管理，支持模板、加密、跨机器同步。核心是把目标状态声明在 source directory，apply 时计算 diff 并更新。
- **Ansible**（https://ansible.com）：无 agent，通过 SSH 执行 YAML playbook，支持安装软件包、写配置文件、启动服务。
- **rsync**：文件层面的批量同步，配合 SSH 可远程同步目录。

### 本项目混合策略

1. 软件和公开配置走声明式市场条目（类 Ansible playbook）
2. 用户自己的完整资料走私有运行环境快照（类 chezmoi + rsync）
3. 冲突策略：
   - `skip-existing`：已有软件和配置跳过
   - `replace-existing`：已有软件和配置替换
4. 应用数据必须单独加密，且需要登录、资料密码和二次确认
5. 他人上传的组合配置只能默认应用公开层，不自动应用私密数据

### 迁移方法对比

| 方法 | 适用场景 | 实现复杂度 |
|------|------|------|
| Windows USMT 思路 | Windows → Windows，迁移用户文件、桌面偏好、应用设置 | 高 |
| rsync home directory | Linux/macOS/SSH，复制用户主目录、dotfiles | 中 |
| 声明式 profile（chezmoi 思路） | 公开或半公开配置，软件/alias/shell profile | 低 |

---

## 当前目录约定

```text
configs/catalog/software/*.md    — 软件配置说明（管理员维护）
configs/catalog/combos/*.md      — 热门组合说明（用户上传）
configs/catalog/admin-notes/*.md — 管理员备选 MD（仅管理员可见）
configs/database/seed.json       — 配置市场种子数据
```
