# Nextcloud 私有云盘

Nextcloud 是开源版"自建 Dropbox / Google Drive"——文件同步、日历、联系人、协作文档、端到端加密、视频通话。EnvForge 用 **snap 安装**，**内置 nginx + PHP-FPM + Redis 缓存 + MariaDB 全套**——无需手动配 LAMP/LEMP，一条命令完事。

## 你将得到什么

- 📦 **snap nextcloud**（含所有内置依赖）
- ✅ 监听 80（HTTP），可选 443（HTTPS via Let's Encrypt）
- ✅ 管理员账号已创建
- ✅ 内置 nginx（前端）+ PHP-FPM（应用）+ Redis（缓存）+ MariaDB（数据库）
- ✅ 自动 cron 任务（处理后台同步、清理）
- ✅ 数据目录 `/var/snap/nextcloud/common/nextcloud/data/`

## 表单字段说明

### `domain`

填上后加到 `trusted_domains`（Nextcloud 安全机制：仅允许配置过的域名访问）。不填只能用 IP 访问。**生产必填**。

### `admin_username` / `admin_password`

> ⚠️ 不要用 `admin`（爆破字典首选）。建议改名（如 `nc-admin`）。

留空 = EnvForge 自动生成 24 位强密码。

### `enable_https`

打开后跑 `nextcloud.enable-https lets-encrypt`，自动签证书。前提：

1. `domain` 已 DNS 指向本机
2. 80 端口防火墙开（HTTP-01 challenge 需要）
3. `letsencrypt_email` 已填

### `letsencrypt_email`

LE 注册邮箱。

## 配置文件 / 目录速查

```
# Snap 部署独立路径（不是发行版包路径！）
/var/snap/nextcloud/
├── current/                                # 程序当前版本
│   └── nextcloud/
│       ├── config/
│       │   ├── config.php                  # ← 主配置（关键）
│       │   └── apps/
│       └── ...
├── common/                                  # 数据 + 持久化
│   ├── nextcloud/
│   │   ├── data/                            # ← 用户文件（**最重要**）
│   │   │   └── <username>/
│   │   │       └── files/
│   │   ├── apps/                             # 已装第三方 app
│   │   └── ...
│   ├── mysql/                                # MariaDB 数据
│   ├── redis/                                 # Redis 数据
│   └── logs/
│       ├── nextcloud.log
│       ├── nginx-access.log
│       └── ...
└── x86_64/...

# 命令
/snap/bin/nextcloud                           # 主管理命令
/snap/bin/nextcloud.occ                        # Nextcloud OCC（命令行）
/snap/bin/nextcloud.export                     # 全量导出
/snap/bin/nextcloud.import                     # 全量导入
/snap/bin/nextcloud.mysql-client                # 进 MariaDB shell
/snap/bin/nextcloud.enable-https                # HTTPS 管理
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | snap | snap（需先装 snapd） |
| snapd 包 | 默认仓库 | EPEL（preflight 启用）+ 启用 snapd.socket |
| 数据位置 | `/var/snap/nextcloud/common/nextcloud/data/` | 同 |
| 端口 | 80 / 443 | 同 |

> **RHEL/Anolis 9 关键步骤**（EnvForge 自动处理）：
>
> ```bash
> sudo dnf install -y epel-release
> sudo dnf install -y snapd
> sudo systemctl enable --now snapd.socket
> sudo ln -s /var/lib/snapd/snap /snap         # snap 路径符号链接
> # 重启或退出当前 shell 让 PATH 更新
> ```

## 常见配置模板

### 模板 A — 浏览器访问

```
http://server-ip            # 不开 HTTPS
https://your-domain.com     # 开 HTTPS 后
```

第一次跳到登录页，用 admin 账号登录。

### 模板 B — 装常用 App

UI → 右上角头像 → Apps → 浏览安装。推荐：

| App | 用途 |
|---|---|
| **Calendar** | 日历（CalDAV） |
| **Contacts** | 联系人（CardDAV） |
| **Mail** | 邮件客户端 |
| **Notes** | Markdown 笔记 |
| **Talk** | 视频通话（WebRTC） |
| **OnlyOffice / Collabora** | 在线编辑 docx/xlsx/pptx |
| **Photos** | 照片管理（含人脸识别） |
| **Tasks** | 待办列表 |
| **News** | RSS 阅读器 |

### 模板 C — 命令行管理（occ 工具）

```bash
# 查看状态
sudo nextcloud.occ status

# 用户管理
sudo nextcloud.occ user:list
sudo nextcloud.occ user:add john --password-from-env
sudo nextcloud.occ user:resetpassword john
sudo nextcloud.occ user:delete john
sudo nextcloud.occ user:disable john

# 文件管理
sudo nextcloud.occ files:scan --all                    # 扫描所有用户的文件
sudo nextcloud.occ files:scan john                      # 仅扫某用户
sudo nextcloud.occ files:cleanup                        # 清理无效记录

# 配置
sudo nextcloud.occ config:system:get
sudo nextcloud.occ config:system:set trusted_domains 1 --value=cloud.example.com
sudo nextcloud.occ config:system:set memcache.local --value '\OC\Memcache\Redis'
sudo nextcloud.occ config:system:set redis host --value 'localhost'

# Maintenance 模式（升级前）
sudo nextcloud.occ maintenance:mode --on
sudo nextcloud.occ maintenance:mode --off

# 后台任务（替代 cron）
sudo nextcloud.occ background:cron
sudo nextcloud.occ background:webcron

# App 管理
sudo nextcloud.occ app:list
sudo nextcloud.occ app:install calendar
sudo nextcloud.occ app:enable calendar
sudo nextcloud.occ app:disable old_app
```

### 模板 D — 改默认数据目录到大磁盘

```bash
# 1. 暂停服务
sudo snap stop nextcloud

# 2. 移动数据
sudo rsync -avh --progress /var/snap/nextcloud/common/nextcloud/data /mnt/big-disk/

# 3. 改 config.php
sudo nextcloud.occ config:system:set datadirectory --value '/mnt/big-disk/data'
# 或直接改文件
sudo nano /var/snap/nextcloud/current/nextcloud/config/config.php
# 'datadirectory' => '/mnt/big-disk/data',

# 4. 给 snap 用户访问权限
sudo chown -R root:root /mnt/big-disk/data       # snap 用 root 运行
sudo chmod -R 750 /mnt/big-disk/data

# 5. 启动 + 扫描
sudo snap start nextcloud
sudo nextcloud.occ files:scan --all
```

> snap 的 confined 模式默认不让访问任意路径。要让 nextcloud 访问 `/mnt/...`，需 connect interface：
>
> ```bash
> sudo snap connect nextcloud:removable-media
> # 然后只能在 /media、/run/media 这些路径
> ```
>
> 想完全自由路径需要更改 snap 安全模型——通常情况建议保持默认路径，加大 `/var/snap/` 所在盘。

### 模板 E — 配 SMTP 邮件（密码重置 / 通知）

UI → 右上角 → Administration → Settings → Basic settings → Email server：

| 字段 | 示例 |
|---|---|
| Send mode | smtp |
| Encryption | SSL/TLS |
| From address | `nextcloud@example.com` |
| Authentication method | Login |
| Server address | `smtp.example.com:465` |
| Credentials | user / password |

或命令行：

```bash
sudo nextcloud.occ config:system:set mail_smtphost --value 'smtp.example.com'
sudo nextcloud.occ config:system:set mail_smtpport --value 465
sudo nextcloud.occ config:system:set mail_smtpsecure --value 'ssl'
sudo nextcloud.occ config:system:set mail_smtpauth --value true
sudo nextcloud.occ config:system:set mail_smtpauthtype --value 'LOGIN'
sudo nextcloud.occ config:system:set mail_smtpname --value 'user@example.com'
sudo nextcloud.occ config:system:set mail_smtppassword --value 'password'
sudo nextcloud.occ config:system:set mail_from_address --value 'nextcloud'
sudo nextcloud.occ config:system:set mail_domain --value 'example.com'
```

### 模板 F — 客户端

Nextcloud 官方 App：

| 平台 | 配置 |
|---|---|
| Windows / macOS / Linux | URL + 用户名 + 应用密码 |
| iOS / Android | 同 |

应用密码：UI → 右上角 → Security → 生成新设备密码（区别于账号主密码，丢了可单独撤销）。

WebDAV 直接挂载（替代 App）：

```
URL: https://cloud.example.com/remote.php/dav/files/<username>/
```

### 模板 G — 备份策略

```bash
# 1. Maintenance 模式
sudo nextcloud.occ maintenance:mode --on

# 2. 全量导出（推荐，含数据库 + 文件 + 配置）
sudo nextcloud.export -abc /var/backups/
# -a = apps -b = data -c = config

# 输出 /var/backups/<timestamp>/

# 3. 关 maintenance 模式
sudo nextcloud.occ maintenance:mode --off

# 4. 上传到远程（rclone / borg）
rclone sync /var/backups/ s3:my-backup-bucket/nextcloud/

# 还原
sudo nextcloud.import /var/backups/<timestamp>/
```

或单独备份各部分：

```bash
# 数据
sudo tar czf data-$(date +%F).tar.gz /var/snap/nextcloud/common/nextcloud/data/

# 数据库
sudo nextcloud.mysqldump > db-$(date +%F).sql

# 配置
sudo cp /var/snap/nextcloud/current/nextcloud/config/config.php config-$(date +%F).php
```

### 模板 H — 防火墙

```bash
sudo ufw allow http
sudo ufw allow https
# RHEL
sudo firewall-cmd --add-service={http,https} --permanent
sudo firewall-cmd --reload
```

## 关键参数调优速查

### 性能

```bash
# 启用 Redis 缓存（默认已启用，确认）
sudo nextcloud.occ config:system:get memcache.local
# 应是 \OC\Memcache\Redis

# 文件锁用 Redis（避免死锁）
sudo nextcloud.occ config:system:set memcache.locking --value '\OC\Memcache\Redis'

# 启用 OPcache（PHP 优化，snap 默认开）
# 大文件上传限制
sudo nextcloud.occ config:system:set max_chunk_size --value 10485760     # 10 MB

# 修剪日志
sudo nextcloud.occ log:manage --level error                 # 仅记录 error
```

### 资源占用

| 部署 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 个人（< 10 user） | 512 MB | 0.5 vCPU | 按文件量 |
| 小团队（< 50 user） | 2 GB | 1-2 vCPU | – |
| 企业（< 500 user） | 8 GB | 4 vCPU | – |
| 大型（< 5k user） | 16 GB+ | 8 vCPU+ | – |

snap 包**整套服务**（nginx + PHP + Redis + MariaDB）算这些。

### 文件大小限制

```bash
# 默认 512 MB 上传限制
sudo nextcloud.occ config:system:set upload_max_filesize --value '4G'
sudo nextcloud.occ config:system:set max_chunk_size --value 104857600
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| snap 支持 | ✅ 默认有 snapd | ⚠️ 需先装 EPEL + snapd + 启用 snapd.socket |
| Nextcloud snap | ✅ | ✅ |
| 防火墙 | UFW | firewalld |
| 数据路径 | 一致 | 一致 |

EnvForge 自动处理 RHEL 系的 snapd 安装。

## 与其它 catalog 项的配合

- **`nginx-web-service`** — **互斥**！snap 包内嵌 nginx 监听 80/443
- **`mariadb` / `postgres-profile`** — snap 已内置 MariaDB；外部 DB 需要更复杂的 docker / 手动部署
- **`redis-server`** — snap 内嵌 Redis；外部 Redis 同上
- **`certbot-ssl`** — 不用——snap 内置 LE 集成

## 排错

### snap 装不上（RHEL 9 / Anolis 9）

```bash
# 1. EPEL
sudo dnf install -y epel-release

# 2. snapd
sudo dnf install -y snapd

# 3. 启用 socket
sudo systemctl enable --now snapd.socket

# 4. 创建 /snap 链接
sudo ln -s /var/lib/snapd/snap /snap

# 5. 退出当前 shell（让 PATH 含 /snap/bin）

# 6. 装 Nextcloud
sudo snap install nextcloud
```

### 首次访问超慢 / 502

snap 第一次启动 1-3 分钟（数据库初始化、PHP-FPM 预热、Redis 启动）。等等就好。

```bash
# 看启动状态
sudo snap services nextcloud
sudo snap logs nextcloud --follow
```

### `Untrusted domain` 错误

```bash
sudo nextcloud.occ config:system:set trusted_domains 1 --value='cloud.example.com'
sudo nextcloud.occ config:system:set trusted_domains 2 --value='192.168.1.100'
```

### 升级后 snap 卡住 maintenance 模式

```bash
sudo nextcloud.occ maintenance:mode --off
sudo nextcloud.occ upgrade                              # 手动跑升级
```

### 数据库连不上 `Database error`

```bash
# snap 内置 MariaDB 状态
sudo snap services nextcloud | grep mysql
sudo nextcloud.mysql-client      # 进 shell 测

# 重启
sudo snap restart nextcloud.mysql
sudo snap restart nextcloud.php-fpm
```

### Redis 连不上

```bash
sudo snap services nextcloud | grep redis
sudo nextcloud.occ redis-cli ping            # 应输出 PONG
```

### 文件扫描后看不到（手动放进 data 目录）

```bash
# Nextcloud 不知道这些文件
sudo nextcloud.occ files:scan --all
```

### 大文件上传失败

```bash
# UI: Administration → Settings → Basic → 看错误提示
# 改限制
sudo nextcloud.occ config:system:set upload_max_filesize --value '10G'
```

### 性能差 / 慢

```bash
# 1. Redis 没启用
sudo nextcloud.occ config:system:get memcache.local

# 2. PHP OPcache
sudo nextcloud.occ config:system:get system.opcache.memory_consumption

# 3. 数据库索引
sudo nextcloud.occ db:add-missing-indices
sudo nextcloud.occ db:add-missing-columns

# 4. 文件碎片
sudo nextcloud.occ files:cleanup
sudo nextcloud.occ trashbin:cleanup --all-users
```

## 验证

```bash
# 1. snap 状态
sudo snap services nextcloud

# 2. occ 可用
sudo nextcloud.occ status                                # version / installed / maintenance / etc

# 3. 端口
sudo ss -tlnp | grep -E ':(80|443) '

# 4. 浏览器
curl -I http://localhost                                  # 302 重定向到登录

# 5. 关键检查
sudo nextcloud.occ check                                   # 系统检查（无 [ERR] 即正常）

# 6. trusted_domains
sudo nextcloud.occ config:system:get trusted_domains
```

## 多次运行

`installMode: skip-existing`。snap 已装就跳过。`trusted_domains` / HTTPS 配置每次更新。**admin 账号一旦创建过不会重新创建**——重设密码用 `sudo nextcloud.occ user:resetpassword admin`。

升级 Nextcloud：

```bash
sudo snap refresh nextcloud
```

snap 默认每天自动检查更新，可关：

```bash
sudo snap set system refresh.metered=hold
```

## ⚠️ 敏感性

**review** — Nextcloud 是**个人 / 企业数据中心**。挂了或被攻陷 = 文件 / 日历 / 联系人 / 邮件全暴露。

强制：

1. 公网部署务必启用 HTTPS（模板 A 的 `enable_https`）
2. admin 账号用强密码
3. **频繁备份数据目录**——snap 升级偶尔有 bug
4. 启用 brute-force protection（默认开）
5. 启用 2FA（admin 设置 → Security → Two-Factor）

## 隐私说明

- admin 密码会在 Playbook 任务日志出现（一次）
- 用户上传的文件全部本地存储 `/var/snap/nextcloud/common/nextcloud/data/`——**不上传不同步**
- `config.php` 含数据库凭据 / SMTP 凭据（明文）—— 权限 0640 root:root，备份注意加密
- snap **自动升级**——可关：`sudo snap set system refresh.metered=hold`
- snap 自动统计使用率（匿名）：`sudo snap set system experimental.refresh-app-awareness=true` 控制
- Nextcloud 应用层不发遥测；第三方 app 自带可能有
- 端到端加密 app（E2EE）可选——客户端密钥客户端持有，server 看不到内容
