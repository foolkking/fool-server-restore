# Catalog 项编写规范

> 给 catalog 新增 / 修改一项 software 或 combo 时的统一规范。
> 既是开发者编写 PR 时的 checklist，也是给 LLM 协助生成新 md / playbook 的 schema。

每个 catalog 项由 4 个文件组成（combo 的话最少 3 个）：

```
configs/catalog/
├── software/<id>.md                  ← 用户指南（本文档主要规范的就是它）
├── combos/<id>.md                    ← 组合的用户指南（同样规范）
├── playbooks/<id>.yaml               ← 执行步骤（YAML，遵循第三节规范）
├── playbooks/<id>.vars.json          ← 表单 schema（可选，没有就跳过表单直接执行）
└── docker/<id>.yaml                  ← Docker compose 片段（仅 deployModes 含 docker 时）
```

外加在 `apps/api/src/catalog.ts` 加一条 `CatalogItem` 元数据。

---

## 一、总要求

> **md 必须帮用户把它配明白。装上不算完事——用户得照 md 知道每个配置文件改在哪、关键参数推荐什么值、跨发行版差异在哪。**

判断一项是否"达标"的最终标准：**新手照着 md 走，5-15 分钟内能从"装好"到"配置成符合自己场景的样子"，不用搜外网。**

---

## 二、md 文件规范（11 个区块）

每份 catalog md（不论是 software 还是 combo）按这 11 块组织。✅ = 必写，⚪ = 视情况。

### 1. ✅ 开篇定位（30-50 字）

第一段直白说明 "它是什么 / 解决什么场景 / 跟同类对比时的位置"。

```markdown
# Nginx Web 服务

一键安装并配置 Nginx，支持静态站点和反向代理两种模式。
```

❌ 不要写营销文案 ("最快的"、"业界领先")，写**事实和适用场景**。

### 2. ✅ "你将得到什么"（bullet 列表）

让用户一眼看完装好后**什么就绪了**。每条尽量写**可观测的事实**。

```markdown
## 你将得到什么

- ✅ Nginx 主程序（来自系统包源，自动处理 dnf module 启用、SELinux 标签等）
- ✅ 一份 `envforge-default.conf`（写入 `/etc/nginx/conf.d/`），声明为 `default_server`
- ✅ 自动禁用发行版自带的抢占式 default（备份到 `.envforge.bak`，可恢复）
- ✅ RHEL 系自动设置 SELinux 布尔，让 nginx 能反代任意本地端口
- ✅ 启动 + 开机自启 + 重启时优先 `nginx -t` 校验
- ✅ 独立的访问/错误日志：`/var/log/nginx/envforge-access.log` / `envforge-error.log`
```

### 3. ⚪ 表单字段说明（仅当有 `<id>.vars.json`）

每个表单字段一段，包括：
- 字段含义
- 推荐值 / 默认值 / 备选值
- 留空 / 改默认值时的副作用
- 常见误用警告

例：

```markdown
### 启用反向代理 `enable_reverse_proxy`

- **关闭**（默认）：作为静态文件服务器，提供 `/usr/share/nginx/html` 目录
- **开启**：所有请求转发到后端，适合 Node.js / Python / Go / Rust 写的动态站点
```

### 4. ✅ 配置文件 / 目录速查

**这是最关键、之前最缺的一块。** 必须列出：

- **关键配置文件的绝对路径**（不要用 `~/.config/...` 这种依赖用户的写法，给完整路径）
- **数据目录 / 日志路径**
- **跨发行版差异**（Ubuntu / Debian 系 vs RHEL / Anolis 系经常不一样，一张表对照）
- **不知道路径时的查找命令**（`sudo find`、`systemctl show -p FragmentPath` 等）

```markdown
## 配置文件 / 目录速查

```
/etc/nginx/
├── nginx.conf                      # 主配置
├── conf.d/                         # http 段下的 server 块（RHEL 约定）
│   └── envforge-default.conf       # ← EnvForge 管的，每次运行会覆盖
├── sites-available/  + sites-enabled/   # Ubuntu/Debian 约定
└── snippets/                       # 公用配置片段
```

| 文件 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| 主配置 | `/etc/nginx/nginx.conf` | 相同 |
| vhost 目录 | `sites-available/` + `sites-enabled/` | `/etc/nginx/conf.d/` |
| 服务名 | `nginx` | `nginx` |
```

### 5. ✅ 常见场景的配置模板（"模板 A / B / C"）

给至少 2-5 个**可直接复制粘贴**的配置样板，按用户场景分类。每个模板要：

- 标题写场景（"模板 A — 静态站点（带 gzip + 缓存 + history fallback）"）
- 完整代码块，标语言（```` ```nginx ````）
- 代码内加注释解释每段干什么
- 末尾一行"应用方式"（`sudo nginx -t && sudo systemctl reload nginx`）

举例：nginx-web-service.md 给了 5 个模板（静态 / 反代 / HTTPS / PHP-FPM / 限速）。
postgres-profile.md 给了 postgresql.conf 调优表 + pg_hba.conf 模板。

### 6. ✅ 关键参数调优速查（生产软件必写）

按场景给**具体数值**，不要给"按需调整"这种废话。

```markdown
经验法则：**物理内存的 50%**（其余给 OS file cache）。
**不要超过 32GB**（JVM 失去 compressed oops）。

| 物理内存 | 推荐 heap |
|---|---|
| 1-2 GB | 512m |
| 2-4 GB | 1g |
| 4-8 GB | 2g |
| 8-16 GB | 4g |
| 16-32 GB | 8g |
```

### 7. ✅ 跨发行版兼容说明

明确说出：

- 包名差异（`postgresql-server` vs `postgresql`）
- 服务名差异（`mariadb` vs `mariadb-server`）
- 路径差异（数据目录、配置目录）
- 是否需要额外仓库（EPEL / CRB / 第三方源）
- EnvForge 的 PACKAGE_ALIASES 是否已自动处理

```markdown
**跨发行版**：从 Ubuntu 捕获的 Playbook 应用到 RHEL/Anolis 时，
包名 `postgresql` 自动翻译为 `postgresql-server`（PACKAGE_ALIASES）。
```

### 8. ⚪ 与其它 catalog 项的配合

提示用户该项是否依赖 / 推荐配套别的 catalog 项。例：

```markdown
## 与其它组件配合

- **Certbot SSL** — 给本 nginx 自动签证书并改写 server 块
- **PHP toolchain** — 配合做 LEMP stack（参见 `lemp-stack` combo）
- **Node.js + PM2** — PM2 跑应用，nginx 反代到 :3000（参见 `node-production-deploy` combo）
- **Fail2Ban** — jail 已含 `nginx-http-auth` / `nginx-noscript` 规则
```

### 9. ✅ 排错指南（至少 3-5 条）

每条按 "症状 → 原因 → 命令" 的格式写。最常见错误排前面。

```markdown
## 排错

#### 浏览器看到小写 "nginx" 的 404

那是发行版自带 default server 在拦截请求。确认：
```bash
ls /etc/nginx/conf.d/default.conf*       # RHEL: 应只有 .envforge.bak
ls /etc/nginx/sites-enabled/default*     # Ubuntu: 应为空或只有 .envforge.bak
```

#### 反代模式下 502 Bad Gateway

- 后端没起来：`curl -v http://127.0.0.1:1027`
- SELinux 阻止（RHEL）：`sudo setsebool -P httpd_can_network_connect 1`
```

### 10. ✅ 验证安装（一组命令）

给一段能直接复制的命令，用户跑一遍能确认装好了。

```markdown
## 验证

```bash
systemctl status nginx --no-pager
curl -fsS http://localhost/
sudo nginx -T | grep envforge-default
sudo ss -tlnp | grep ':80 '
```
```

### 11. ✅ 多次运行 + 隐私 + 敏感性

三段简短的"运维边界"声明：

```markdown
## ⚠️ 敏感性

**review** — 默认配置已加固。改 bind 0.0.0.0 是高危操作。

## 多次运行

`installMode: skip-existing`。已装跳过；conf 每次重写——你大量定制配置请放到独立文件。

## 隐私说明

证书私钥不进入 Playbook 模板，由 Certbot 在目标机器本地生成。
```

---

## 三、Playbook YAML 规范

`configs/catalog/playbooks/<id>.yaml` 是真正在目标机器上执行的脚本。

### 3.1 基础结构

```yaml
# Playbook: 简短标题
#
# 多行注释说清这个 Playbook 的目标、跨发行版策略、需要注意的坑。
name: Install and configure Foo
hosts: all

vars:
  port: 8080
  domain: example.com
  # 与 vars.json 里 default 一致；表单填了的话会被覆盖

tasks:
  - name: 描述这一步在做什么（中文）
    module: package
    args:
      name: foo
      state: present

verify:
  - name: foo process is active
    cmd: "systemctl is-active --quiet foo"
    hint: |
      Foo 没启起来。常见原因：
        1. 端口冲突
        2. 配置语法错误
      详情：sudo systemctl status foo --no-pager
```

### 3.2 必须包含的环节

| 环节 | 说明 | 适用 |
|---|---|---|
| **预检（pre-check）** | 端口冲突 / 资源占用 / 依赖软件存在性，**早于实际安装** fail | 所有开端口的服务 |
| **孤儿进程清理** | 检测 systemctl 管不到的同名进程，优雅关 → SIGTERM → SIGKILL | 长驻服务（nginx / postgres / etc.） |
| **配置文件备份** | 改任何系统级配置前先写 `.envforge.bak` 副本 | 改 sshd / nginx / pg_hba 等 |
| **跨发行版分支** | 用 `when:` 区分 family，或者两条路径都试（`ignore_errors`）+ verify | 凡是 Ubuntu / RHEL 路径不一样的 |
| **SELinux / AppArmor 处理** | RHEL 系上 nginx 反代 / Samba / Web app 都要设 boolean | RHEL 系特定 |
| **verify 块 + 友好 hint** | 每个 verify 失败时输出多行 hint（不是注释，是实际任务输出） | 所有 |
| **幂等（idempotent）** | 重跑 Playbook 不应破坏已有数据、不应重复创建用户 / 文件 / 服务 | 所有 |

### 3.3 verify 块写法

verify 不只是 "跑一遍能不能过"，更是给用户**故障时的导航地图**。每条都写 `hint`：

```yaml
verify:
  - name: nginx process is active
    cmd: "systemctl is-active --quiet nginx"
    hint: |
      Nginx 没启起来。最常见原因（按可能性排序）：
        1. 端口 {{ listen_port }} 被另一个 web 服务占用
           查询：sudo ss -tlnp | grep :{{ listen_port }}
           常见占用：apache2 / httpd / caddy / openresty / 容器
        2. 配置文件语法错误：sudo nginx -t
        3. SELinux/AppArmor 阻止 nginx 监听该端口
      详情：sudo systemctl status nginx --no-pager -l && sudo journalctl -u nginx -n 50
```

### 3.4 注释要求

YAML 里凡是"非显然的步骤"都要有中文注释解释**为什么这么做**（不是做什么）。例：

```yaml
# 禁用发行版自带的 default server（Ubuntu sites-enabled/default + RHEL conf.d/default.conf）。
# 这两个文件都标了 default_server 或 server_name localhost/_，会在用户用 IP 访问、
# 或 DNS 解析不一致时拦截请求并返回 nginx 默认 404 页面（小写 "nginx" 那个），
# 让我们的 envforge-default.conf 看上去"配了等于没配"。
# 备份到 .envforge.bak 而不是 rm，防误删；卸载时可恢复。
- name: Disable distro-provided default server
  module: shell
  ...
```

---

## 四、`<id>.vars.json` 规范（表单 schema）

字段类型见 `apps/api/src/catalog-vars-schema.ts`：`string` / `number` / `boolean` / `choice` / `password` / `port`。

### 4.1 每个字段必填

```json
"listen_port": {
  "type": "port",
  "label": "监听端口",
  "labelEn": "Listen port",
  "default": 80,
  "help": "Nginx 监听的端口。如果系统已有 web 服务占用 80，请改用其他端口（如 8080）。",
  "helpEn": "Port for Nginx to listen on. If 80 is taken, pick another (e.g. 8080)."
}
```

| key | 必填 | 说明 |
|---|---|---|
| `type` | ✅ | 6 种枚举之一 |
| `label` / `labelEn` | ✅ | 中英双语字段名 |
| `default` | 视类型 | `boolean` 必填；其它推荐填，避免空值 |
| `help` / `helpEn` | ✅ | 字段下方的助词，要写清楚副作用 |
| `validate` | 推荐 | 字符串字段配 regex；password 配最小长度 |
| `show_when` | ⚪ | 条件可见，如 `"enable_reverse_proxy == true"` |
| `options` | choice 必填 | `[{value, label, labelEn}]` |
| `placeholder` | ⚪ | 输入框灰底提示 |

### 4.2 password 字段约定

- 留空 = EnvForge 自动生成 24 位强密码（运行结束日志显示一次）
- 明文密码会出现在任务日志，md 的"隐私说明"必须提示这一点

```json
"admin_password": {
  "type": "password",
  "label": "管理员密码",
  "labelEn": "Admin password",
  "generate_length": 24,
  "reveal_after_run": true,
  "help": "留空则 EnvForge 生成 24 位强密码。"
}
```

---

## 五、`apps/api/src/catalog.ts` 元数据规范

加入 catalog 列表的对象必须包含：

```ts
{
  id: "foo-service",                                        // 仅小写字母 + 连字符
  kind: "software",                                         // 或 "combo"
  name: "Foo 服务",                                         // 中文显示
  nameEn: "Foo service",                                    // 英文显示
  category: "service",                                      // 7 选 1（见 CATALOG.md）
  summary: "一句话定位（30 字内）。",
  summaryEn: "One-line tagline (under 30 chars).",
  rating: 4.7,                                              // 1-5，参考社区评价
  installs: "5.2k",                                         // 字符串，参考实际使用度
  imageTone: "blue",                                        // UI 卡片色调（已有色板）
  sensitivity: "review",                                    // safe | review | privileged
  assets: ["foo", "config", "service"],                     // 关键词（搜索用）
  guidePath: "configs/catalog/software/foo-service.md",
  guideAuthor: "admin",                                     // admin（默认） | user
  installMode: "skip-existing",                             // 或 replace-existing
  deployModes: ["system"],                                  // 或 ["system", "docker"]
  components: [
    { type: "software", label: "foo", labelEn: "Foo", detail: "apt" },
    { type: "system-command", label: "启动 Foo", labelEn: "start Foo",
      detail: "sudo systemctl enable foo" }
  ],
  compatibility: { families: ["debian-family", "rhel-family"] }
}
```

---

## 六、PR 自检清单

提交新 catalog 项的 PR 前，逐条核对：

### md 层面
- [ ] 11 个区块完整（开篇 / 你将得到 / 表单字段 / **配置文件速查** / **配置模板** / **调优速查** / 跨发行版 / 配合 / 排错 / 验证 / 隐私）
- [ ] 配置文件给的是**绝对路径**而不是 `~/...`
- [ ] 跨发行版差异有**明确表格**对照
- [ ] 至少 2 个**可复制的配置模板**
- [ ] 至少 3 条**真实场景的排错**条目（不要"重启试试"这种废话）
- [ ] 风险等级（safe / review / privileged）有**理由说明**

### Playbook 层面
- [ ] 端口冲突 / 资源预检任务在实际安装之前
- [ ] 跨发行版差异处理（`when:` 或两路径并行）
- [ ] verify 块覆盖：进程在跑 + 端口在听 + 至少一条 functional check
- [ ] 每个 verify 都有多行 `hint` 排查指引
- [ ] 改系统配置前自动备份到 `.envforge.bak`
- [ ] RHEL 系的 SELinux / EPEL 等前置条件已处理
- [ ] 重跑两次 Playbook 不会破坏已有数据 / 不重复创建用户

### vars.json 层面（如适用）
- [ ] 所有字段中英双语 label + help
- [ ] password 字段说明留空时的自动生成行为
- [ ] 高危选项（如 0.0.0.0 监听）在 help 里有警告
- [ ] `show_when` 表达式简单清晰

### catalog.ts 元数据
- [ ] id 小写 + 连字符
- [ ] category 是 7 个枚举之一
- [ ] sensitivity 与实际行为匹配
- [ ] components 列表准确（用户卡片 preview 会读取）
- [ ] compatibility.families 已声明

### 整体
- [ ] 跑过 `npm run audit:catalog` 通过
- [ ] 在沙盒（`docker-compose.demo.yml`）里实跑过一遍
- [ ] 同步更新 `docs/CATALOG.md` 的清单
- [ ] sensitivity = privileged 的项 PR 描述里写明操作风险

---

## 七、给 LLM 写 catalog 项的额外要求

把这份规范连同上下文一起喂给 LLM 时，要求它：

1. **必须输出 4 件套**（md + yaml + vars.json + catalog.ts 片段），不只是描述
2. md 里**不能**用"按需调整 / 自行配置 / 参考官方文档"这种含糊词——要给具体值
3. 配置模板必须**在 GitHub 风格 markdown 里能正确渲染**（代码块要标语言名 ` ```nginx `, ` ```yaml ` 等）
4. 跨发行版差异**必须明确写出**，不能假设"两边一样"
5. 风险等级（sensitivity）要**给出理由**，不只是分类
6. 排错条目要**贴近真实问题**，不要"重启试试"这种废话
7. 输出格式严格遵循已有 catalog 项的写法（参考 `nginx-web-service.md` / `postgres-profile.md` / `redis-server.md` 三份高质量样板）

LLM 输出后，**人必须在沙盒里实跑一遍**才能合入 main。LLM 写的 Playbook 经常有路径笔误 / 包名错 / SELinux 漏处理。

---

## 八、参考样板

挑 3 份"配置层面写得最完整"的 md 作为模板范例，新人写新项时照着学：

- **`configs/catalog/software/nginx-web-service.md`** — 5 个 server 块模板 + 主配置调优 + 路径速查 + 完整排错
- **`configs/catalog/software/postgres-profile.md`** — postgresql.conf 调优表 + pg_hba.conf 全套 + 跨发行版路径
- **`configs/catalog/software/redis-server.md`** — 配置项详细 + 内存策略 + 远程访问安全四步

playbook 范例同样选这 3 个对应的 yaml。
