# Gitea 自托管 Git 服务

Gitea 是轻量级自托管 Git 服务（类似 GitLab，但资源占用极低，单机就能跑）。**用 Go 写，单二进制 + SQLite 起步**——512 MB RAM 都能跑。EnvForge 用官方二进制安装，配 systemd 单元和数据目录。

## 你将得到什么

- ✅ Gitea 最新 stable 二进制（`/usr/local/bin/gitea`）
- ✅ 系统用户 `git`，数据目录 `/var/lib/gitea`，配置 `/etc/gitea`
- ✅ systemd 单元 `gitea.service`，开机自启
- ✅ 默认监听 `127.0.0.1:3000`（**走反向代理才暴露公网**）
- ✅ 默认 SQLite 数据库（`/var/lib/gitea/data/gitea.db`，单机够用）

## 表单字段说明

### `domain` / `root_url`

填实际访问域名（如 `git.example.com`）。Gitea 用它生成 clone URL / 邮件链接。

### `http_port`

默认 3000（注意：和 Grafana 同端口冲突，并存时改一个）。

### `enable_lfs`

启用 Git LFS（大文件存储）。生产建议开启。

## 配置文件 / 目录速查

```
/etc/gitea/
└── app.ini                                    # ← 主配置（关键）

/var/lib/gitea/
├── custom/
│   ├── conf/                                   # 模板覆盖
│   ├── public/                                  # 自定义 CSS / JS / favicon
│   └── templates/                               # 自定义页面模板
├── data/
│   ├── gitea.db                                 # SQLite 数据库（默认 backend）
│   ├── attachments/                             # issue 附件
│   ├── avatars/                                  # 用户头像
│   ├── repo-archive/                             # 仓库 zip 归档缓存
│   ├── lfs/                                       # Git LFS 对象
│   ├── repos/                                     # ⚠️ 仓库本体（git bare clone）
│   │   └── <user>/<repo>.git/
│   └── sessions/
├── log/                                         # 日志（按天滚动）
└── home/                                        # git 用户 home（含 .ssh/）

/usr/local/bin/gitea                            # 主二进制
/etc/systemd/system/gitea.service                # systemd unit

# 备份关键
# - /etc/gitea/app.ini（含 SECRET_KEY，丢了所有 OAuth / token 失效）
# - /var/lib/gitea/data/（数据 + 仓库 + 附件）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制下载（无包） | 二进制下载 |
| 二进制位置 | `/usr/local/bin/gitea` | 相同 |
| 服务名 | `gitea` | `gitea` |
| 默认运行用户 | `git` | `git` |
| 默认 SSH 端口 | 22（与 sshd 冲突，可改用内置 SSH） | 同 |

## 自动化步骤

EnvForge 在目标机器依次：

1. 下载 Gitea 官方二进制到 `/tmp/gitea`，校验后移到 `/usr/local/bin/`
2. 创建系统用户 `git`（无登录 shell）
3. 创建目录结构 `/var/lib/gitea/{custom,data,log}` 并设置权限
4. 写入 systemd unit `/etc/systemd/system/gitea.service`
5. `systemctl enable --now gitea`

## 常见配置模板

### 模板 A — 首次安装向导（必走）

启动后访问 `http://server-ip:3000`（或反代域名）→ 进入安装向导：

| 选项 | 推荐值 |
|---|---|
| Database | SQLite（< 100 用户）/ PostgreSQL（推荐生产） |
| Server Domain | 实际域名 / IP |
| Gitea Base URL | `https://git.example.com/`（带斜杠完整 URL） |
| 管理员账号 | **必须填**（否则首个注册用户成为管理员，存在抢注风险） |
| 邮件 | 暂时跳过，后续在 admin 面板开 SMTP |

提交后写入 `/etc/gitea/app.ini`，重启服务即可。

### 模板 B — `[server]` — 端口、域名、SSH

```ini
[server]
PROTOCOL          = http                          ; 走反代时 http；裸跑 https
DOMAIN            = git.example.com
ROOT_URL          = https://git.example.com/
HTTP_ADDR         = 127.0.0.1                     ; 仅本机让 nginx 反代；裸跑 0.0.0.0
HTTP_PORT         = 3000

; 内置 SSH server（推荐：sshd 占 22 时不冲突）
START_SSH_SERVER  = true
SSH_PORT          = 2222                           ; clone 用 ssh://git@host:2222/...
SSH_LISTEN_HOST   = 0.0.0.0
SSH_LISTEN_PORT   = 2222

; LFS（推荐启用）
LFS_START_SERVER  = true
LFS_JWT_SECRET    = <gitea generate secret JWT_SECRET>
LFS_CONTENT_PATH  = /var/lib/gitea/data/lfs

; 大仓库 push 超时
SSH_TRUSTED_USER_CA_KEYS_FILENAME =
DISABLE_SSH       = false
```

### 模板 C — `[database]` — 数据库后端

```ini
; SQLite（默认，单机 < 100 用户够用）
[database]
DB_TYPE  = sqlite3
PATH     = /var/lib/gitea/data/gitea.db
SQLITE_TIMEOUT = 500

; PostgreSQL（推荐生产，> 100 用户必上）
[database]
DB_TYPE  = postgres
HOST     = 127.0.0.1:5432
NAME     = gitea
USER     = gitea
PASSWD   = <强密码>
SSL_MODE = disable                                ; 同机 disable；跨机 require + ssl

; MySQL/MariaDB
[database]
DB_TYPE  = mysql
HOST     = 127.0.0.1:3306
NAME     = gitea
USER     = gitea
PASSWD   = <强密码>
CHARSET  = utf8mb4
```

### 模板 D — `[mailer]` — 邮件（注册激活、issue 提醒）

```ini
[mailer]
ENABLED      = true
PROTOCOL     = smtps                              ; smtp / smtps / smtp+starttls
SMTP_ADDR    = smtp.gmail.com
SMTP_PORT    = 465
USER         = git-notify@example.com
PASSWD       = <SMTP 密码或 app password>
FROM         = "Gitea <git-notify@example.com>"
SUBJECT_PREFIX = "[Gitea] "
```

测试：用户菜单 → Site Administration → Configuration → Send Test Email。

### 模板 E — `[security]` — 关键安全开关

```ini
[security]
INSTALL_LOCK              = true                   ; 安装完成后锁定，防有人重跑 /install
SECRET_KEY                = <gitea generate secret SECRET_KEY>
INTERNAL_TOKEN            = <gitea generate secret INTERNAL_TOKEN>
PASSWORD_HASH_ALGO        = pbkdf2_hi
LOGIN_REMEMBER_DAYS       = 7
DISABLE_GIT_HOOKS         = true                    ; **强烈建议开**！git hooks = 服务器命令执行
DISABLE_WEBHOOKS          = false
COOKIE_USERNAME           = gitea_username
COOKIE_REMEMBER_NAME      = gitea_incredible
```

### 模板 F — `[service]` — 注册策略

```ini
[service]
DISABLE_REGISTRATION              = true             ; 公开实例必关，否则被刷垃圾仓库
REQUIRE_SIGNIN_VIEW               = false             ; 改 true 仓库要登录才能看
REGISTER_EMAIL_CONFIRM            = true
ENABLE_NOTIFY_MAIL                = true
DEFAULT_ALLOW_CREATE_ORGANIZATION = true
DEFAULT_ENABLE_TIMETRACKING       = true
NO_REPLY_ADDRESS                  = noreply.localhost

; 限制只允许某邮箱后缀注册（公司内部用）
EMAIL_DOMAIN_WHITELIST            = example.com,corp.example.com
```

### 模板 G — Nginx 反代 + HTTPS

```nginx
upstream gitea { server 127.0.0.1:3000; }

server {
    listen 443 ssl http2;
    server_name git.example.com;

    ssl_certificate /etc/letsencrypt/live/git.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.example.com/privkey.pem;

    client_max_body_size 1G;                          # 大仓库 push 必须

    location / {
        proxy_pass http://gitea;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

EnvForge 已有 `nginx-web-service` Playbook 配反代 + `certbot-ssl` Playbook 拿证。

### 模板 H — `[storage]` — 大文件 / Avatar / LFS 改 S3

```ini
; 默认本地
[storage]
STORAGE_TYPE = local

; 改 minio / S3
[storage]
STORAGE_TYPE              = minio
MINIO_ENDPOINT            = minio.example.com:9000
MINIO_ACCESS_KEY_ID       = gitea
MINIO_SECRET_ACCESS_KEY   = <密钥>
MINIO_BUCKET              = gitea
MINIO_LOCATION             = us-east-1
MINIO_USE_SSL              = false
```

### 模板 I — `[oauth2]` / `[openid]` — 第三方登录

```ini
[openid]
ENABLE_OPENID_SIGNIN = true
ENABLE_OPENID_SIGNUP = true
WHITELISTED_URIS     = "https://accounts.google.com https://github.com"
```

UI → Site Administration → Authentication Sources → Add → 选 OAuth2 / LDAP / SMTP / SSPI 等接入企业身份。

### 模板 J — `[cron]` — 定时任务调度

```ini
[cron.update_mirrors]
SCHEDULE = @every 10m

[cron.repo_health_check]
SCHEDULE = @every 24h

[cron.archive_cleanup]
SCHEDULE = @midnight
OLDER_THAN = 24h

[cron.delete_inactive_accounts]
ENABLED = true
SCHEDULE = @annually
```

### 模板 K — CLI 工具速查

```bash
# 生成各种 secret
sudo -u git gitea generate secret SECRET_KEY
sudo -u git gitea generate secret JWT_SECRET
sudo -u git gitea generate secret INTERNAL_TOKEN

# 改密码
sudo -u git gitea admin user change-password --username admin --password "..."

# 创建管理员
sudo -u git gitea admin user create --admin --username root --password "..." --email "..."

# 转 SQLite → PostgreSQL（迁移）
sudo systemctl stop gitea
sudo -u git gitea dump -c /etc/gitea/app.ini -t /tmp -f /tmp/gitea-dump.zip
# 改 app.ini 的 DB_TYPE 为 postgres
sudo -u git gitea migrate -c /etc/gitea/app.ini

# 修复仓库元数据不一致
sudo -u git gitea doctor check --all
sudo -u git gitea doctor check --fix
```

### 模板 L — 备份策略

```bash
# 关键：app.ini（含 SECRET_KEY）+ data/

# 1. app.ini
sudo cp /etc/gitea/app.ini /backup/

# 2. 数据 + 仓库目录
sudo systemctl stop gitea
sudo tar czf /backup/gitea-data-$(date +%F).tar.gz /var/lib/gitea
sudo systemctl start gitea

# 或用内置 dump（含 db + repos + attachments + lfs）
sudo -u git gitea dump -c /etc/gitea/app.ini -f /backup/gitea-$(date +%F).zip
```

## 关键参数调优速查

### 资源占用

| 部署 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 个人（< 50 repo） | 256 MB | < 0.5 vCPU | 按 repo |
| 团队（< 100 user） | 512 MB | 1 vCPU | – |
| 中型（< 1k user） | 2 GB（PG 后端） | 2 vCPU | – |
| 大型（< 10k user） | 8 GB+ | 4+ vCPU | – |

Gitea 极轻量——比 GitLab 省 5-10× 资源。

### 性能优化

```ini
[server]
DISABLE_ROUTER_LOG = true                          ; 关 router log 加速

[cache]
ENABLED  = true
ADAPTER  = memory                                   ; redis 更快
INTERVAL = 60

[database]
MAX_OPEN_CONNS = 100                                ; PG 后端
MAX_IDLE_CONNS = 10
CONN_MAX_LIFETIME = 0
```

### 大仓库支持

```ini
[server]
LFS_START_SERVER = true
LFS_HTTP_AUTH_EXPIRY = 24h
```

```bash
# 仓库内启用 LFS
git lfs track "*.psd"
git lfs track "models/*.bin"
git add .gitattributes
```

## 跨发行版兼容

二进制安装跨发行版一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅ |
| Alpine | 用 `gitea/gitea:latest-rootless` Docker |
| ARM64 | ✅（Playbook 自动选 arm64 二进制） |

## 与其它 catalog 项的配合

- **`gitlab-runner`** — Gitea 兼容 GitLab CI / GitHub Actions，可用 GitLab Runner 跑 CI
- **`postgres-profile`** — 推荐生产 backend（模板 C）
- **`certbot-ssl` + `nginx-web-service`** — 反代 + HTTPS（模板 G）
- **`minio-storage`** — Gitea LFS / archives 后端（模板 H）
- **`prometheus-monitoring`** — Gitea 内置 metrics endpoint

## SSH Git 推送

默认 Gitea 在 22 端口看 git 用户的 SSH key。如果你已有真实 sshd 在 22：

- 选项 1：Gitea 用内置 SSH server（`START_SSH_SERVER = true` + 不同端口，模板 B）
- 选项 2：把 sshd 移到别的端口
- **不要两个都监听 22**

## 排错

### 3000 端口被占

Node / dev server 常用 3000：

```ini
[server]
HTTP_PORT = 3001
```

```bash
sudo systemctl restart gitea
```

### `error: RPC failed; HTTP 413`（clone / push 大文件）

nginx 的 `client_max_body_size` 太小：

```nginx
client_max_body_size 1G;       # 模板 G 已含
```

### 管理员忘了密码

```bash
sudo -u git gitea admin user change-password --username admin --password "新密码" -c /etc/gitea/app.ini
```

### 服务启动失败

```bash
sudo journalctl -u gitea -n 100

# 常见
# 1. /etc/gitea/app.ini 不可读（权限或 SELinux）
sudo chown -R git:git /etc/gitea /var/lib/gitea
sudo restorecon -Rv /var/lib/gitea           # RHEL

# 2. SQLite 数据库锁定
ls -la /var/lib/gitea/data/gitea.db-wal
sudo systemctl restart gitea

# 3. 端口被占
sudo ss -tlnp | grep 3000
```

### `[ERR] db: failed to migrate`（升级后）

```bash
# 维护模式 + 手动迁移
sudo -u git gitea -c /etc/gitea/app.ini migrate
```

### Webhook 不工作

```bash
# 看 webhook delivery 历史（在 repo settings → Webhooks → 点某条）
# 看错误 + retry

# Gitea 默认不允许给私网 IP 发 webhook（防 SSRF）
[webhook]
ALLOWED_HOST_LIST = *.example.com,10.0.0.0/8
```

### 大仓库 clone 慢

```ini
[server]
SSH_TRUSTED_USER_CA_KEYS_FILENAME =
LFS_HTTP_AUTH_EXPIRY = 24h

[git.timeout]
DEFAULT = 360                                      ; 默认 git 操作超时（秒）
MIGRATE = 600                                       ; 迁移操作
MIRROR = 300
CLONE = 300
PULL = 300
GC = 60
```

### 镜像仓库不更新

```bash
# 看 cron 状态
sudo -u git gitea -c /etc/gitea/app.ini admin auth list
# UI: Site Administration → Cron Tasks → Mirror update → Run

# 调度间隔
[cron.update_mirrors]
SCHEDULE = @every 10m
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active gitea

# 2. 端口
sudo ss -tlnp | grep 3000

# 3. API
curl -fsSL http://localhost:3000/api/v1/version
# 应返回 {"version":"1.x.x"}

# 4. SSH（内置）
ssh -T -p 2222 git@localhost                       # 应输出 "Hi there, ..."

# 5. 仓库目录权限
ls -la /var/lib/gitea/data/repos/
sudo -u git ls /var/lib/gitea/

# 6. 看日志
sudo journalctl -u gitea -n 30 --no-pager
```

## 多次运行

`installMode: skip-existing`。已装好不会被覆盖。要升级二进制：

```bash
sudo systemctl stop gitea
GITEA_VER=1.22.0
curl -L "https://dl.gitea.com/gitea/${GITEA_VER}/gitea-${GITEA_VER}-linux-amd64" -o /usr/local/bin/gitea
sudo chmod +x /usr/local/bin/gitea
sudo systemctl start gitea
```

## ⚠️ 敏感性

**review** — Gitea 服务本身的安全模型较稳。但首次登录用户自动成管理员——确保你是第一个访问 `/install` 的人；安装后立刻禁用注册（设置里 `Disable Registration`）。

强制：

1. 公网部署务必 HTTPS
2. `DISABLE_GIT_HOOKS = true`
3. `DISABLE_REGISTRATION = true`（公开实例）
4. SECRET_KEY / INTERNAL_TOKEN / JWT_SECRET 严格保密

## 隐私说明

- `/etc/gitea/app.ini` 含数据库连接信息和 SECRET_KEY；备份这台机器时记得**排除或加密**
- EnvForge 环境捕获默认会扫描其中的 secret 值并脱敏
- 用户邮箱进入 commit author（公开仓库可见）
- Gitea 不发遥测；webhook delivery 走外部 URL
- LFS 对象 / 附件存在 `data/lfs/` 和 `data/attachments/`——按合规需求加密
