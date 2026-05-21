# EnvForge 产品策略与功能规划（v2 重构版）

更新时间：2026-05-21

## 修订说明

本版本基于用户反馈做了三项重大调整：

1. **SSH Shell 澄清** — 用户要的不是 PTY 终端模拟器，而是命令执行日志面板（已实现，就是左下角的 Terminal Panel）。从"不做"列表移除。
2. **环境保留功能保留** — 不删除，但重新设计为基础设施即代码（IaC）模型。
3. **Ansible 方案重构** — 不直接集成 Ansible，而是设计 Ansible-Compatible 的内置引擎。详见第三章。

---

## 一、当前功能盘点（v2）

### 已实现且应保留

| 模块 | 价值 | 备注 |
|------|------|------|
| 用户注册/登录（scrypt） | 高 | — |
| SSH 真实连接（密码 + 密钥） | **核心** | — |
| 连接档案管理 + 真实 SSH 重新探测 | 高 | — |
| 系统信息采集 | 高 | 将作为 IaC 中的 fact gathering 基础 |
| 配置市场（15 软件 + 8 组合 + MD） | **核心** | 将重构为 Playbook 形式 |
| 命令白名单执行引擎（dry-run + 真实） | **核心** | 将升级为模块化引擎（mini-Ansible） |
| SSE 实时任务日志 | 高 | — |
| 全局终端日志面板 | **核心** | 这就是用户说的"SSH Shell" — 命令执行日志 |
| RBAC 角色权限 | 中 | — |
| 中英文 UI 切换 | 中 | — |

### 应保留但需要重构

| 模块 | 当前状态 | 重构方向 |
|------|---------|---------|
| 私有运行环境快照 (vm-snapshot) | 仅存数据，无还原路径 | 改为 **Playbook 形式**：从已连接 VM 自动生成可执行的 Playbook |
| 用户上传热门组合 (combo) | 自由格式 components 列表 | 改为 **Playbook YAML**：编辑器 + 可视化双模式 |
| `packages/collectors` 本机采集 | 跑在 EnvForge 服务器上无意义 | 改为 **远程 fact gathering**：通过 SSH 在目标 VM 执行 |
| `packages/restorers` 还原计划 | 接口存在前端无 UI | 改为 **playbook executor** 的一部分 |

### 应当删除

| 模块 | 删除原因 |
|------|---------|
| `apps/mock-agent/` 整个目录 | 被 SSH 真实连接替代 |
| `apps/mobile/` 整个目录 | 空壳，移动端不是当前目标 |
| 所有 `agentUrl` 引用 | mock-agent 已弃用 |
| `defaultSshUser` 字段 | 无实际使用场景 |

### 风险存量

| 模块 | 风险 | 处置 |
|------|------|------|
| `_rawPassword` 明文存 JSON | 严重 | P0 加对称加密（使用 `node:crypto` AES-256-GCM + 一个由 `.env` 提供的 master key） |
| `data/runtime-db.json` 单文件 | 中 | P2 切换到 SQLite |
| 无单元测试 | 中 | P1 至少给执行引擎加测试 |
| `main.tsx` 2000+ 行 | 中 | P1 拆分组件 |

---

## 二、不再讨论的功能边界（精简后）

### 明确不做

| 功能 | 原因 |
|------|------|
| 完整磁盘镜像备份 | 偏离配置管理定位（用 Restic / Borg） |
| 浏览器数据/密码库同步 | 安全风险高（用 1Password / Bitwarden） |
| Windows 目标机器支持 | Linux-only 已确立 |
| **PTY 终端模拟器**（实时交互 shell） | 已澄清不需要；用户要的是命令日志（已实现） |
| 容器编排 (Kubernetes) | 用 Argo CD / Flux |
| 用户付费/订阅 | 自托管不需要 |
| 移动端原生 App | Web 已能覆盖 |
| 直接集成 Ansible（python 依赖） | 详见第三章 — 改为 Ansible-Compatible |

---

## 三、IaC 方案重构（核心架构变更）

### 3.1 用户原方案的隐蔽问题

> 用户提议：「引入 Ansible，要求所有配置修改通过 Ansible Playbook 执行」

直接集成 Ansible 有以下问题：

1. **Python 运行时依赖** — 需要在 EnvForge 服务器上安装 `ansible-core` 和 Python 3.10+。对一个 Node.js Web 应用来说是异质栈。
2. **Python 也需要在目标 VM 上** — Ansible 默认要求 target 有 Python（虽然有 raw 模式，但功能受限）。最小化容器或 barebones VM 没有。
3. **YAML 直接写不友好** — Web UI 用户多数不愿意写 YAML。需要可视化编辑器。
4. **Inventory 格式冲突** — 我们的连接档案在数据库里，Ansible 期望 INI/YAML inventory 文件。需要适配层。
5. **输出解析复杂** — Ansible 的 stdout 格式不适合直接喂给 SSE 流前端，需要 parser。
6. **模块过多** — Ansible 几千个模块，但服务器配置场景里 90% 只用 10 个左右（package、service、lineinfile、copy、template、user、file、firewall、shell、setup）。
7. **学习曲线** — 用户从看不懂的 EnvForge 升级到看不懂的 Ansible，没解决问题。

### 3.2 重构后的方案：Ansible-Compatible Engine

**核心理念：**

> 我们设计自己的 TypeScript 原生执行引擎，但**数据格式与 Ansible Playbook YAML 完全兼容**。
> 用户写出来的 Playbook 既可以被 EnvForge 执行，也可以被真正的 ansible-playbook 执行。

**优势：**

| 特性 | 自建引擎 | 直接 Ansible | Ansible-Compatible（本方案） |
|------|---------|------------|--------------------------|
| Python 依赖 | 无 | 必需 | 无（可选） |
| 学习曲线 | 自己一套 | 陡 | 用户学到的就是 Ansible |
| 用户迁移成本 | 锁定 | 零 | 零（导出即用） |
| 模块覆盖 | 有限 | 完整 | 核心 10 个 + 可扩展 |
| 实施成本 | 高 | 中 | 高 |

**核心数据模型：**

```typescript
// 一个 Playbook 由若干 Play 组成
interface Playbook {
  name: string;          // 显示名
  hosts: "all" | string; // inventory 引用
  vars?: Record<string, unknown>;
  tasks: Task[];
}

// 每个 Task 是对一个 Module 的调用
interface Task {
  name: string;          // 人类可读说明
  module: ModuleCall;    // 调用哪个模块
  when?: string;         // 条件表达式
  tags?: string[];       // 用于选择性执行
  register?: string;     // 把结果存到变量
  loop?: unknown[];      // 循环
}

// 模块调用，每种模块有自己的参数 schema
type ModuleCall =
  | { module: "package"; args: { name: string | string[]; state: "present" | "absent" } }
  | { module: "service"; args: { name: string; state?: "started" | "stopped" | "restarted"; enabled?: boolean } }
  | { module: "lineinfile"; args: { path: string; line: string; regexp?: string; state?: "present" | "absent" } }
  | { module: "copy"; args: { src?: string; content?: string; dest: string; mode?: string; owner?: string } }
  | { module: "template"; args: { src: string; dest: string; mode?: string } } // Jinja2-lite
  | { module: "user"; args: { name: string; state: "present" | "absent"; shell?: string; groups?: string[] } }
  | { module: "file"; args: { path: string; state: "directory" | "file" | "absent"; mode?: string; owner?: string } }
  | { module: "ufw"; args: { rule: "allow" | "deny"; port: number; proto?: "tcp" | "udp" } }
  | { module: "shell"; args: { cmd: string; creates?: string; removes?: string } } // 逃生口，需 creates/removes 实现幂等
  | { module: "setup"; args: {} }; // 仅采集 fact，不修改
```

**模块的执行接口：**

```typescript
interface Module<Args> {
  name: string;
  /** 检查当前状态，决定是否需要执行 */
  check(conn: SshConnection, args: Args): Promise<{
    needsChange: boolean;      // false = 已经处于目标状态
    currentState: string;      // 描述当前状态
  }>;
  /** 执行变更（仅 needsChange = true 时调用） */
  apply(conn: SshConnection, args: Args, dryRun: boolean): Promise<{
    changed: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}
```

每个 Task 的执行 = `check → apply`，自然实现幂等性。

### 3.3 Catalog 重构为 Playbook

当前数据：

```json
{
  "id": "redis-server",
  "components": [
    { "type": "software", "label": "redis-server", "detail": "apt" },
    { "type": "system-command", "detail": "sudo systemctl enable redis-server" }
  ]
}
```

重构为：

```yaml
# configs/catalog/playbooks/redis-server.yaml
- name: Install Redis in-memory database
  hosts: all
  vars:
    redis_port: 6379
  tasks:
    - name: Install redis-server package
      package:
        name: redis-server
        state: present

    - name: Enable redis-server service
      service:
        name: redis-server
        enabled: yes
        state: started

    - name: Set bind address (optional)
      lineinfile:
        path: /etc/redis/redis.conf
        regexp: "^bind "
        line: "bind 127.0.0.1"
      register: bind_changed

    - name: Restart redis if config changed
      service:
        name: redis-server
        state: restarted
      when: bind_changed.changed
```

这样：
- **可读** — 用户看 YAML 就知道要做什么
- **可改** — 用户可以 fork 这个 playbook，改成自己的版本
- **幂等** — 跑两次结果一样
- **可移植** — 用户可以下载 YAML，离开 EnvForge 用 ansible-playbook 跑

### 3.4 环境保留 = 反向生成 Playbook

**当前 vm-snapshot 模型问题：**
- 只是记录"有什么"，没法告诉新机器"怎么做"
- JSON 格式不可读，不可执行

**新模型：Capture → Playbook：**

1. 用户连接现有 VM `vm-prod-01`
2. 点击「环境保留」按钮
3. EnvForge 通过 SSH 远程跑 fact gathering 脚本，收集：
   - 已安装的 apt/dpkg 包
   - 启用的 systemctl 服务
   - 用户的 ~/.bashrc / ~/.zshrc 中非默认行
   - sudoers 自定义条目
   - cron 任务
   - 关键配置文件（用户标记的）
4. 自动生成一份 Playbook：

```yaml
- name: Captured from vm-prod-01 at 2026-05-21
  hosts: all
  tasks:
    - name: Install packages from vm-prod-01
      package:
        name:
          - nginx
          - postgresql-16
          - redis-server
          - git
          - vim
        state: present

    - name: Restore aliases from vm-prod-01
      lineinfile:
        path: "~/.bashrc"
        line: "{{ item }}"
      loop:
        - "alias ll='ls -lah'"
        - "export EDITOR=vim"
        - "export PATH=$PATH:$HOME/.local/bin"

    - name: Enable services
      service:
        name: "{{ item }}"
        enabled: yes
        state: started
      loop: [nginx, postgresql, redis-server]
```

5. 用户可以在 Web 编辑这个 Playbook（增删任务、改值、加注释）
6. 保存为可重用的 Playbook（私有，仅自己可见）
7. 在新 VM 上一键应用

**这才是真正的"环境保留"。**

### 3.5 实施分阶段

**阶段 A：内置引擎（P0，必做）**
- 实现 5 个核心模块：`package`、`service`、`lineinfile`、`copy`、`shell`
- 实现 check/apply 框架
- 替换当前 executor.ts
- 改造现有 15 个软件 + 8 个组合为 Playbook YAML

**阶段 B：环境保留（P1，必做）**
- 实现 `setup` 模块（fact gathering）
- 实现 capture 接口：远程探测 → Playbook 生成
- 实现 Playbook 编辑器（Monaco YAML mode）
- 实现 Playbook 应用接口

**阶段 C：进阶模块（P2，必做）**
- 实现 `template`、`user`、`file`、`ufw` 模块
- Playbook 导入/导出（标准 Ansible YAML）
- 多目标批量执行
- 任务历史和审计

---

## 四、近期 Roadmap（按用户优先级）

### P0 — 让产品可用（确认必做）

- [x] **加密敏感字段**：`_rawPassword` 用 AES-256-GCM 加密存储
- [x] **任务持久化**：写入 runtime-db 的 `tasks[]` 表
- [x] **Mini-Ansible 引擎核心 5 模块**：`package`、`service`、`lineinfile`、`copy`、`shell`
- [x] **Catalog 重构为 Playbook YAML**（22 个 YAML 文件）
- [x] **Web 上传 SSH Key**（加密存储在 data/keys/，不再需要服务器路径）
- [x] **批量安装真实进度**（一次 SSH 连接，SSE 流，`N/M` 进度显示，可取消）
- [x] **删除 mock-agent、apps/mobile、defaultSshUser**

### P1 — 让产品稳定（确认必做）

- [x] **环境保留 = 反向生成 Playbook**（capture → YAML，`GET /api/connections/:id/capture`）
- [x] **Playbook 编辑器**（`PlaybookEditor.tsx`：行号、语法验证、Tab 缩进、下载、dry-run 按钮）
- [x] **详细错误提示**（`engine/errors.ts`：分类 network/auth/permission/not_found/disk_space/dependency/timeout/unknown，中英文提示 + 修复建议）
- [x] **拆分前端代码**（main.tsx 从 2293 行 → 332 行；MachinePage/MarketPage/MePage/TerminalPanel/MarkdownOverlay/ComponentPreview/PlaybookEditor 全部独立文件）
- [x] **执行引擎单元测试**（30 个测试，覆盖 runner/errors/package/service/shell 模块，全部通过）

### P2 — 让产品好用（确认必做）

**批次 1（已完成）：**
- [x] **进阶模块**：`template`（Jinja2-lite 渲染）、`user`（系统用户管理）、`file`（文件/目录管理）、`ufw`（防火墙规则）
- [x] **任务历史 + 审计日志**（`GET /api/tasks` + MePage 展示，含状态/步骤/耗时）
- [x] **影响范围预估**（`GET /api/catalog/:id/impact` + `POST /api/impact/batch`，选中配置后自动显示磁盘占用/服务变更/sudo 需求/预估时间）

**批次 2（已完成）：**
- [x] **多目标分组（标签）** — 连接档案支持 `tags[]` 字段，连接 chip 显示标签，编辑面板可管理标签
- [x] **批量目标执行** — `POST /api/multi-execute`：按 connectionIds 或 tags 筛选目标，并行执行同一 Playbook
- [x] **Playbook 版本管理** — 完整 CRUD + 版本历史（最多 20 版本）+ 恢复历史版本，新增"Playbook"导航页

**批次 3（已完成）：**
- [x] **EnvForge 自身容器化** — `Dockerfile`（多阶段构建）+ `docker-compose.yml`（含 volume 挂载、SSH key 挂载、健康检查）+ `.dockerignore`
- [x] **Docker 部署模式** — 8 个软件/组合新增 `deployModes: ["system", "docker"]`，`GET /api/catalog/:id/docker-compose` 返回 compose 文件，前端配置市场卡片新增 🐳 按钮和 compose 预览弹窗
- [x] **安全数据库存储层** — `db-store.ts`：写锁防并发、原子写入（tmp→rename）、自动备份（.bak）、读缓存；`/api/ready` 新增数据库完整性检查（SQLite 因 Windows native 编译失败暂缓，本方案提供等效安全保证）

- ~~GitHub OAuth 登录~~
- ~~配置同步到 Git~~
- ~~API Token + Webhook~~
- ~~加密配置存储（age/sops）~~

---

## 五、UI/UX 设计原则（已确立）

1. **不突兀** — 卡片、按钮、动画风格统一
2. **真反馈** — 异步操作必有 loading + 成功/失败提示
3. **少跳转** — 一键安装、看进度、查日志在同屏完成
4. **可审计** — 每条命令可见可追溯
5. **Linux-native** — 不假装兼容 Windows / macOS 服务器
6. **YAML 是真相** — 所有配置最终落到 Playbook YAML，不引入私有格式

---

## 六、技术架构（重构后）

```text
┌─────────────────────────────────────────────────────────┐
│                    React Web Console                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Machine  │  │  Market  │  │ Playbook │              │
│  │   Page   │  │   Page   │  │  Editor  │  + Terminal  │
│  └──────────┘  └──────────┘  └──────────┘    Panel     │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP + SSE
┌──────────────────────────▼──────────────────────────────┐
│                  Fastify API (Port 5173)                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │             Playbook Engine (TypeScript)          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────┐ │   │
│  │  │ package │ │ service │ │lineinfile│ │ copy  │ │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └───────┘ │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────┐ │   │
│  │  │  shell  │ │  setup  │ │ template │ │ user  │ │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └───────┘ │   │
│  │      Each module: check() + apply()             │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────┬──────────────┬───────────────────────┘
                   │ ssh2         │ ssh2-sftp-client
                   ▼              ▼
              ┌─────────────────────────┐
              │   Linux Target VMs      │
              │  (no agent required)    │
              └─────────────────────────┘
```

**关键变化：**

- 不再有 `executor.ts` 的命令白名单 — 改为模块化引擎
- 不再有 `mock-agent` — 一切通过 SSH/SFTP
- 配置市场内容 = Playbook YAML 文件
- 用户上传 = 自定义 Playbook
- 环境保留 = 反向生成的 Playbook

---

## 七、立即行动清单

按用户确认的优先级（P0 + P1 + P2，跳过 P3），下一步实施顺序：

1. **删除废弃模块**（先减负）
   - 删除 `apps/mobile/`
   - 删除 `apps/mock-agent/`
   - 删除所有 `agentUrl` 引用
   - 删除 `defaultSshUser`

2. **加密敏感字段**
   - 新建 `apps/api/src/crypto.ts`：AES-256-GCM
   - master key 从 `.env` 的 `ENVFORGE_MASTER_KEY` 读取
   - 改造 `_rawPassword` 为加密存储

3. **构建 Mini-Ansible 引擎**
   - `apps/api/src/engine/types.ts`：模块 schema
   - `apps/api/src/engine/runner.ts`：执行框架
   - `apps/api/src/engine/modules/package.ts`：apt/yum/dnf 幂等安装
   - `apps/api/src/engine/modules/service.ts`：systemctl 幂等管理
   - `apps/api/src/engine/modules/lineinfile.ts`：bashrc 幂等编辑
   - `apps/api/src/engine/modules/copy.ts`：SFTP 上传
   - `apps/api/src/engine/modules/shell.ts`：带 creates/removes 的 escape hatch

4. **Catalog 重构**
   - 将 `apps/api/src/catalog.ts` 中的 components 改为 playbook YAML 引用
   - 在 `configs/catalog/playbooks/*.yaml` 写 23 个 Playbook
   - MD 文件保留作为人类可读说明

5. **任务持久化**
   - 在 runtime-db 增加 `tasks[]` 表
   - SSE 流的同时写入数据库

6. **批量执行真实进度**
   - 前端：进度条显示 `3/10 完成`
   - 后端：合并多个 Playbook 为一个执行流

7. **SSH Key Web 上传**
   - 前端：文件上传组件
   - 后端：加密保存到 `data/keys/<userId>/<keyId>.enc`

8. **环境保留：Capture → Playbook**
   - `setup` 模块：远程采集详细 fact
   - `/api/connections/:id/capture` → 生成 Playbook
   - 前端：Playbook 编辑器

9. **拆分前端代码 + 单元测试**

10. **多目标批量执行 + 标签 + 审计日志**

11. **进阶模块**：`template`、`user`、`file`、`ufw`

---

## 八、本次迭代的范围

考虑到上下文长度，**本次仅实施步骤 1-3** 的核心部分：

- 删除 mock-agent、apps/mobile
- 加密敏感字段
- Mini-Ansible 引擎骨架（5 个核心模块）
- 改造 1-2 个 catalog 项目作为示范

剩余步骤（4-11）将在后续迭代中按本路线图依次实施。

---

## 九、Docker 引入分析（2026-05-21 新增）

### 9.1 两种完全不同的用法

**用法 A：把 EnvForge 自身容器化**（把 EnvForge 服务器跑在 Docker 里）

**用法 B：用 Docker 管理目标 VM 上的软件**（把 Redis/Nginx/MySQL 等跑在容器里而不是直接 apt 安装）

这两个方向的结论完全不同。

---

### 9.2 用法 A：EnvForge 自身容器化

**好处：**
- 部署一致性：`docker run envforge` 比 `npm install && node dist/server.js` 更简单
- 隔离：不污染宿主机 Node.js 版本
- 版本管理：`envforge:1.2.0` 可以回滚
- CI/CD 友好：GitHub Actions 直接 push image

**坏处：**
- SSH 密钥访问：容器内需要挂载宿主机的 `~/.ssh`，或通过 volume 传入密钥
- `data/` 持久化：需要 volume 挂载，否则重启数据丢失
- 开发体验：每次改代码要重 build image，不如直接 `node dist/server.js` 快

**结论：值得做，但不是现在的优先级。** 等功能稳定后，加一个 `Dockerfile` 和 `docker-compose.yml` 作为可选部署方式。

---

### 9.3 用法 B：用 Docker 管理目标 VM 上的软件

| 维度 | apt 直接安装（当前） | Docker 容器化 |
|------|-------------------|--------------|
| 目标用户门槛 | 低 — 只需一台 Linux VM | 高 — 需要理解 Docker |
| 软件隔离 | 差 — 共享系统库，版本冲突 | 好 — 每个容器独立 |
| 版本管理 | 差 — 受发行版限制 | 好 — `nginx:1.24` 精确指定 |
| 环境还原 | 难 — 需记录所有包和配置 | 容易 — `docker-compose.yml` 就是完整描述 |
| 资源开销 | 低 | 中 |
| 配置文件管理 | 复杂 — 散落在 /etc/ 各处 | 清晰 — volume mount 集中管理 |
| 与 IaC 的契合度 | 中 — Playbook 描述步骤 | 高 — Compose 文件就是声明式状态 |

**关键洞察：Docker Compose 文件本身就是最好的"环境保留"格式。**

如果目标 VM 上的软件都跑在 Docker 里，"环境保留"就变成了一个 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  nginx:
    image: nginx:1.24
    ports: ["80:80", "443:443"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata:
```

这个文件可以 git 管理，可以在任何有 Docker 的机器上 `docker compose up` 还原，不需要 Ansible，不需要 apt，不需要 systemctl。

**但有一个根本矛盾：**

EnvForge 的目标用户是"想快速配好一台 Linux 服务器的人"。如果用户已经熟悉 Docker Compose，他们大概率不需要 EnvForge — 自己写 compose 文件就行了。EnvForge 的价值在于帮助不熟悉这些工具的用户通过可视化界面完成服务器配置。

---

### 9.4 综合建议：混合策略（P2 实施）

不是"要 Docker 还是要 apt"，而是**两种模式都支持**，让用户选择：

**模式 1：系统安装（当前实现，P0 已完成）**
```
Playbook → apt install nginx → systemctl enable nginx
```

**模式 2：Docker 部署（P2 新增）**
```
Playbook → docker compose up -d
```

**实现方案：**

在 Catalog 中为每个软件增加 `deployModes` 字段：

```typescript
interface CatalogItem {
  deployModes: Array<"system" | "docker">;
  dockerCompose?: string; // compose 片段，用于 docker 模式
}
```

用户在安装时可以选择部署模式：

```
[系统安装]  [Docker 部署]
```

对于"环境保留"功能：
- 如果目标 VM 上有 Docker → 优先生成 `docker-compose.yml`
- 否则 → 生成 Ansible-Compatible Playbook

**EnvForge 自身的 Dockerfile（P2 同步实施）：**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 5173
CMD ["node", "apps/api/dist/server.js"]
```

配套 `docker-compose.yml`（用于部署 EnvForge 自身）：

```yaml
version: '3.8'
services:
  envforge:
    image: envforge:latest
    ports: ["5173:5173"]
    volumes:
      - ./data:/app/data
      - ~/.ssh:/root/.ssh:ro
    environment:
      - NODE_ENV=production
      - ENVFORGE_MASTER_KEY=${ENVFORGE_MASTER_KEY}
```

---

### 9.5 最终结论

| 问题 | 答案 | 优先级 |
|------|------|--------|
| 要不要把 EnvForge 自身容器化？ | 要，加 Dockerfile + compose | P2 |
| 要不要用 Docker 管理目标 VM 上的软件？ | 要，作为可选模式，不替换 apt | P2 |
| Docker 会让产品更好吗？ | 会，但只对已经懂 Docker 的用户有价值 | — |
| 现在应该做吗？ | 不是 P0/P1，先把 apt 方式做稳 | P2 |

**当前 P0/P1 不受影响，继续按原路线图推进。**


---

## 十、配置文件管理功能（2026-05-21 新增）

### 10.1 核心需求

将"已安装软件清单"从只读面板升级为**配置管理中心**：
- 每个已安装软件关联其系统级和用户级配置文件
- 用户可以查看、编辑、备份、对比这些配置
- 环境迁移时自动打包个性化配置为 Playbook

### 10.2 软件→配置文件映射表

#### 系统级配置（`/etc/`）— 需要 sudo 读取

| 软件 | 配置路径 | 说明 |
|------|---------|------|
| nginx | `/etc/nginx/nginx.conf`, `/etc/nginx/sites-enabled/*` | Web 服务器 |
| redis | `/etc/redis/redis.conf` | 内存数据库 |
| mysql | `/etc/mysql/mysql.conf.d/mysqld.cnf` | 数据库 |
| postgresql | `/etc/postgresql/*/main/postgresql.conf`, `pg_hba.conf` | 数据库 |
| ssh | `/etc/ssh/sshd_config` | SSH 服务 |
| docker | `/etc/docker/daemon.json` | Docker 守护进程 |
| fail2ban | `/etc/fail2ban/jail.local`, `/etc/fail2ban/jail.d/*` | 入侵防护 |
| ufw | `/etc/ufw/user.rules`, `/etc/ufw/user6.rules` | 防火墙 |
| caddy | `/etc/caddy/Caddyfile` | Web 服务器 |
| sysctl | `/etc/sysctl.conf`, `/etc/sysctl.d/*.conf` | 内核参数 |
| cron | `/etc/crontab`, `/etc/cron.d/*` | 系统定时任务 |
| hosts | `/etc/hosts` | DNS 映射 |
| fstab | `/etc/fstab` | 磁盘挂载 |
| systemd | `/etc/systemd/system/*.service`（自定义） | 服务单元 |

#### 用户级配置（`~/`）— 个性化设置

| 类别 | 配置路径 | 说明 |
|------|---------|------|
| Shell | `~/.bashrc`, `~/.bash_profile`, `~/.zshrc`, `~/.profile` | 环境变量、别名 |
| Git | `~/.gitconfig`, `~/.gitignore_global` | Git 配置 |
| Vim/Neovim | `~/.vimrc`, `~/.config/nvim/init.vim` | 编辑器 |
| SSH 客户端 | `~/.ssh/config` | 连接快捷方式 |
| npm | `~/.npmrc` | 镜像源 |
| pip | `~/.config/pip/pip.conf` | 镜像源 |
| tmux | `~/.tmux.conf` | 终端复用器 |
| crontab | `crontab -l` 输出 | 用户定时任务 |

### 10.3 配置文件过滤规则

**采集**：只采集存在且有内容的配置文件（限制单文件 50KB，总量 500KB）
**排除**：
- 二进制文件
- `/etc/ssl/`、`/etc/pki/` 下的证书
- `/etc/shadow`、`/etc/gshadow` 密码文件
- `/etc/machine-id` 机器标识
- 超过 50KB 的文件

### 10.4 实施阶段

**P0 — 配置文件采集 + 查看**
- 在 `collectRemoteSnapshot` 中新增 `===SECTION:config-files===`
- 根据已安装软件动态决定采集哪些配置文件
- 前端新增"配置文件"面板，点击软件展开显示关联配置
- 代码查看器（只读，语法高亮）

**P1 — 配置文件编辑 + 环境保留增强**
- 在线编辑器 → 通过 SSH `sudo tee` 写回服务器
- `POST /api/connections/:id/write-config` API
- 环境保留增强：配置文件自动打包为 Playbook `copy` tasks

**P2 — 配置文件版本对比**
- 每次采集保存配置文件快照
- diff 视图对比两次采集的差异
- 配置文件模板化（变量替换，如 IP、域名）

### 10.5 数据流

```
[SSH 采集] → 读取配置文件内容 → 存入 probeSnapshot.configFiles[]
                                         ↓
[前端] ← API 返回 → 配置详情面板 → [查看/编辑]
                                         ↓
[编辑保存] → POST /api/connections/:id/write-config → SSH sudo tee → 服务器
```

### 10.6 API 设计

```
GET  /api/connections/:id/configs          → 列出该连接的所有配置文件（路径+大小+修改时间）
GET  /api/connections/:id/configs/read     → 读取指定配置文件内容（?path=/etc/nginx/nginx.conf）
POST /api/connections/:id/configs/write    → 写入配置文件（body: { path, content, backup? }）
POST /api/connections/:id/configs/diff     → 对比两个版本的配置文件
```
