# 跨 Linux 发行版兼容策略

EnvForge 支持把同一个 Playbook 部署到不同的 Linux 发行版。这份文档说明系统怎么处理
发行版差异，开发者写新 Playbook 时该注意什么，以及当前**已支持** vs **暂不支持**的范围。

## 当前支持矩阵

| 发行版家族 | 包管理器 | EnvForge 支持级别 |
|---|---|---|
| **debian-family** (Debian / Ubuntu / Linux Mint / Raspbian) | apt | ✅ 完整支持 |
| **rhel-family** (RHEL / CentOS / Rocky / Alma / Anolis / Fedora / openEuler) | dnf / yum | ✅ 完整支持 |
| suse-family (openSUSE / SLES) | zypper | ⚠️ 探测能识别，但包管理器适配未完成 |
| arch-family (Arch / Manjaro) | pacman | ⚠️ 同上 |
| alpine | apk | ⚠️ 同上（musl libc 兼容性差，多数 Playbook 不能裸跑） |

EnvForge 在三个层次处理跨发行版差异：

## 第 1 层：包名 / 服务名翻译（自动）

文件 [`apps/api/src/engine/modules/package.ts`](../apps/api/src/engine/modules/package.ts) 里的
`PACKAGE_ALIASES` 表 + [`apps/api/src/engine/modules/service.ts`](../apps/api/src/engine/modules/service.ts) 里的 `SERVICE_ALIASES` 表，
自动翻译 Debian/Ubuntu 包名/服务名到 RHEL 系。

例：
- `redis-server` → `redis` (RHEL 包名)
- `apache2` → `httpd` (服务和包名)
- `mysql` 服务 → `mysqld`

这层完全自动，Playbook 作者直接写 Ubuntu 风格的包名就行。

## 第 2 层：Preflight 阶段（自动）

`package` 模块在批量安装前，**主动**做这些事（仅 dnf/yum 系统）：

1. 探测 distro 家族 + 主版本（从 `/etc/os-release`）
2. 检测 `/etc/dnf/dnf.conf` 是否有 `exclude=` 配置（Aliyun Anolis 等定制镜像常见，会拦截 nginx 安装）
3. 如果待装包列表里有需要 EPEL 的（bat / btop / fail2ban / certbot 等），主动 `dnf install epel-release`
4. 如果待装包列表里有需要 dnf module enable 的（nginx / redis / php / postgresql / mariadb），主动 enable
5. 刷新元数据缓存

这样原本一个一个失败再重试的"反应式"流程，变成"先把环境搞干净再批量装"的"主动式"流程。

## 第 3 层：Compatibility 声明（手动）

Playbook 作者可以在 catalog item 上声明它"经过测试支持哪些发行版"：

```typescript
// 在 catalog.ts 的 catalog item 上：
{
  id: "my-app",
  // ...其它字段...
  compatibility: {
    verified: ["ubuntu-22", "ubuntu-24", "anolis-9"],  // 明确测试过
    families: ["debian-family", "rhel-family"],        // 兜底家族
    knownIncompatible: ["alpine-*"]                    // 明确不工作
  }
}
```

部署前，EnvForge 调用 `POST /api/compatibility/check` 端点，对照目标机器的实际发行版，
给出 4 种级别的反馈：

| Level | 含义 | UI 表现 |
|---|---|---|
| **verified** | 用户的目标 distro+major 在 verified 列表里 | 卡片正常显示（无警告） |
| **compatible** | family 匹配但具体版本未验证 | 信息蓝条："声明支持 X family（包含...），但未对此具体版本验证" |
| **untested** | Playbook 没声明 compatibility 但 PM 是 EnvForge 支持的 | 卡片正常（隐含的"可能能跑通"） |
| **unsupported** | 包管理器不支持 / Playbook 明确排除 / family 不匹配 | 红色警告条 + 卡片置灰 |

## API 端点

### `GET /api/connections/:id/distro`
探测目标机器的发行版。返回 `DistroInfo`（id / family / packageManager / 版本号等）。

### `POST /api/compatibility/check`
Body: `{ connectionId, catalogIds: [] }`
返回每个 catalog item 的 compatibility 级别 + 给用户的中英文解释。

## 写新 Playbook 的最佳实践

### 包名

优先用 Ubuntu/Debian 风格的包名（如 `redis-server`、`apache2`、`postgresql`）。
EnvForge 会自动翻译到 RHEL 系。如果你写了一个新 Playbook 而 Ubuntu 包名在 RHEL 上没对应，
请把映射加到 `PACKAGE_ALIASES` 表。

### Shell 命令

避免用发行版特有的命令：
- ❌ `apt-get install ...`（仅 Debian/Ubuntu）
- ❌ `dnf install ...`（仅 RHEL 系）
- ✅ 用 `module: package` 让 EnvForge 选择包管理器

如果非要用 shell 装（比如要加自定义仓库），写**双路径分支**：
```yaml
- name: Add Docker repo
  module: shell
  args:
    cmd: |
      if command -v apt-get >/dev/null 2>&1; then
        # Debian/Ubuntu 风格
      elif command -v dnf >/dev/null 2>&1; then
        # RHEL 风格
      fi
```

参考 EnvForge catalog 里的 docker-host-profile / mongodb / elasticsearch 等 Playbook，
都是双路径写法。

### 配置文件路径

不同发行版同一个软件的配置路径常常不一样：
- nginx：`/etc/nginx/sites-available/`（Ubuntu）vs `/etc/nginx/conf.d/`（RHEL）
- mysql：`/etc/mysql/mysql.conf.d/mysqld.cnf` vs `/etc/my.cnf.d/mysql-server.cnf`
- postgresql：`/etc/postgresql/16/main/postgresql.conf` vs `/var/lib/pgsql/data/postgresql.conf`

写法：**两路径都做一次 lineinfile**，加 `ignore_errors: true`，错误那条会被忽略，
对的那条生效。看 catalog 里的 postgres-profile / redis-server / mysql-server 都是这种写法。

### 配 systemd 单元的服务

服务名也常不同：
- Ubuntu：`apache2` `mysql` `cron` `ssh`
- RHEL：`httpd` `mysqld` `crond` `sshd`

`SERVICE_ALIASES` 表已自动翻译。写新 Playbook 时**用 Ubuntu 风格服务名**，EnvForge 处理。

### 声明 compatibility

写完一个新 Playbook 后，**实测过**才在 catalog item 上加：
```typescript
compatibility: {
  verified: ["ubuntu-24", "anolis-9"],   // 你真测过的
  families: ["debian-family", "rhel-family"]
}
```

不要随便往 verified 里加没测过的发行版。

## 扩展到新的包管理器

要让 EnvForge 支持 zypper / apk / pacman，需要：

1. 在 [`distro-compat.ts`](../apps/api/src/distro-compat.ts) 里：
   - 已经识别 family（已完成 detection）
   - 把对应 PM 加到 `nativelySupported` 列表

2. 在 [`engine/modules/package.ts`](../apps/api/src/engine/modules/package.ts) 里：
   - 扩展 `detectPackageManager` 识别新 PM
   - 在 `installOne` / `removeOne` / `isInstalled` 里加 case
   - 写一个新的 `PACKAGE_ALIASES` 子表（`zypper:` / `apk:` / `pacman:`）做包名翻译
   - preflight 阶段对应的 module enable / repo 启用逻辑

3. 在 [`engine/modules/service.ts`](../apps/api/src/engine/modules/service.ts) 里：
   - 多数 Linux 都用 systemd，service 模块基本不用改
   - 例外：Alpine 默认是 OpenRC 不是 systemd，要加 OpenRC 路径

4. 在 catalog item 的 `compatibility.families` 里把新 family 加进去

## 测试覆盖

- [`apps/api/src/engine/tests/distro-compat.test.ts`](../apps/api/src/engine/tests/distro-compat.test.ts) — distro 探测 + compatibility 评估的单元测试
- [`apps/api/src/engine/tests/package-translate.test.ts`](../apps/api/src/engine/tests/package-translate.test.ts) — 包名翻译
- [`apps/api/src/engine/tests/service-portability.test.ts`](../apps/api/src/engine/tests/service-portability.test.ts) — 服务名翻译
- [`apps/api/src/engine/tests/package-preflight.test.ts`](../apps/api/src/engine/tests/package-preflight.test.ts) — preflight EPEL / module / exclude 检测

每次改 PACKAGE_ALIASES / SERVICE_ALIASES / preflight 逻辑都跑这些测试。
