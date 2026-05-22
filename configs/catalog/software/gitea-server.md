# Gitea 自托管 Git 服务

Gitea 是轻量级的自托管 Git 服务（类似 GitLab，但资源占用低，单机就能跑）。EnvForge 用官方二进制安装，配 systemd 单元和数据目录。

## 你将得到什么

- ✅ Gitea 最新 stable 二进制（`/usr/local/bin/gitea`）
- ✅ 系统用户 `git`，数据目录 `/var/lib/gitea`，配置 `/etc/gitea`
- ✅ systemd 单元 `gitea.service`，开机自启
- ✅ 默认监听 `localhost:3000`（**走反向代理才暴露公网**）
- ✅ 默认用 SQLite 数据库（`/var/lib/gitea/data/gitea.db`，单机够用）

## 自动化步骤

1. 下载 Gitea 官方二进制到 `/tmp/gitea`，校验后移到 `/usr/local/bin/`
2. 创建系统用户 `git`（无登录 shell）
3. 创建目录结构 `/var/lib/gitea/{custom,data,log}` 并设置权限
4. 写入 systemd 单元 `/etc/systemd/system/gitea.service`
5. `systemctl enable --now gitea`

## 安装后：首次配置（5 分钟）

启动后访问 `http://<server-ip>:3000`（或你的反向代理域名），会进入安装向导：

1. **数据库**：保持 SQLite（推荐单机）；超过 100 用户再考虑 MySQL/PostgreSQL
2. **Server Domain**：填你的实际域名（用 IP 也行）
3. **Gitea Base URL**：`https://git.example.com/` 这种带斜杠的完整 URL
4. **管理员账号**：必须填，否则任何注册的第一个用户会变成管理员
5. **邮件**：可以暂时跳过，后续在 admin 面板开启 SMTP

提交后会写入 `/etc/gitea/app.ini`，重启服务即可。

## 配 HTTPS（强烈建议）

Gitea 自带 LetsEncrypt 支持，但更稳的做法是用 nginx 反向代理 + Certbot：

```nginx
server {
  listen 443 ssl http2;
  server_name git.example.com;
  ssl_certificate /etc/letsencrypt/live/git.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/git.example.com/privkey.pem;

  client_max_body_size 1G;  # 大仓库 push 需要

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

EnvForge 已有 `Nginx Web 服务` Playbook（带反向代理表单）和 `Certbot SSL` Playbook，组合用即可。

## SSH Git 推送

默认 Gitea 在 22 端口看 git 用户的 SSH key。如果你已有真实 sshd 在 22 端口，要么把 Gitea 改用内置 SSH server（`/etc/gitea/app.ini` 设 `[server] START_SSH_SERVER = true` + 不同端口），要么把 sshd 移到别的端口，**不要两个都监听 22**。

## ⚠️ 敏感性

**review** — Gitea 服务本身的安全模型较稳（无密码默认）。但首次登录的用户自动成为管理员，所以确保你是第一个访问 `/install` 的人；安装后立刻禁用注册（设置里 `Disable Registration`）。

## 验证

```bash
systemctl status gitea --no-pager
curl -fsSL http://localhost:3000/api/v1/version
sudo journalctl -u gitea -n 30 --no-pager
```

## 排错

- **3000 端口被占** — 这是 Node/dev server 的常用端口；改 `/etc/gitea/app.ini` 的 `[server] HTTP_PORT = 3001` 后重启。
- **clone 报 `error: RPC failed; HTTP 413`** — nginx 的 `client_max_body_size` 太小，调到 1G 以上。
- **管理员账号忘了密码** — `sudo -u git gitea admin user change-password --username admin --password "新密码"`

## 多次运行

`installMode: skip-existing` — 已经装好的不会被覆盖；要升级二进制，先 `systemctl stop gitea`，下载新二进制覆盖 `/usr/local/bin/gitea`，再 `systemctl start gitea`。

## 隐私说明

`/etc/gitea/app.ini` 含数据库连接信息和 SECRET_KEY；备份这台机器时，记得排除或加密这个文件。EnvForge 的环境捕获默认会扫描其中的 secret 值并脱敏。

## /etc/gitea/app.ini 关键 section

Gitea 的所有运行时行为都在 `app.ini` 里——首次 web 安装向导生成基础内容后，
后续所有调整都改这个文件。下面是常用的几个 section（每个 section 末尾配示例值）。

> **改完一定要重启 Gitea**：`sudo systemctl restart gitea`。
> 部分 section（mailer / cache）支持热加载，重启更稳。

### `[server]` — 端口、域名、SSH

```ini
[server]
PROTOCOL          = http                         ; 走反向代理时保持 http；不挂代理跑 HTTPS 时改 https
DOMAIN            = git.example.com
ROOT_URL          = https://git.example.com/
HTTP_ADDR         = 127.0.0.1                    ; 仅本机监听，让 nginx 反代；裸跑改 0.0.0.0
HTTP_PORT         = 3000

; 内置 SSH server（端口已被 sshd 占用 22 时用）
START_SSH_SERVER  = true
SSH_PORT          = 2222                         ; clone 用 ssh://git@host:2222/...
SSH_LISTEN_HOST   = 0.0.0.0
SSH_LISTEN_PORT   = 2222

; 大仓库 push 必须给够时间
LFS_START_SERVER  = true
LFS_JWT_SECRET    = <运行 gitea generate secret JWT_SECRET 生成>
```

### `[database]` — 数据库后端

```ini
; SQLite（默认，单机够用）
[database]
DB_TYPE  = sqlite3
PATH     = /var/lib/gitea/data/gitea.db

; PostgreSQL（推荐，> 100 用户必上）
[database]
DB_TYPE  = postgres
HOST     = 127.0.0.1:5432
NAME     = gitea
USER     = gitea
PASSWD   = <强密码>
SSL_MODE = disable                              ; 同机用 disable；跨机改 require + ssl

; MySQL/MariaDB
[database]
DB_TYPE  = mysql
HOST     = 127.0.0.1:3306
NAME     = gitea
USER     = gitea
PASSWD   = <强密码>
CHARSET  = utf8mb4
```

### `[mailer]` — 邮件提醒（注册激活、issue 提醒）

```ini
[mailer]
ENABLED      = true
PROTOCOL     = smtps                            ; smtp / smtps / smtp+starttls
SMTP_ADDR    = smtp.gmail.com
SMTP_PORT    = 465
USER         = git-notify@example.com
PASSWD       = <SMTP 密码或 app password>
FROM         = "Gitea <git-notify@example.com>"
SUBJECT_PREFIX = "[Gitea] "
```

测试邮件发送：用户菜单 → Site Administration → Configuration → Send Test Email。

### `[security]` — 关键安全开关

```ini
[security]
INSTALL_LOCK                  = true            ; 安装完成后锁定，防止有人重新跑 /install
SECRET_KEY                    = <gitea generate secret SECRET_KEY 生成>
INTERNAL_TOKEN                = <gitea generate secret INTERNAL_TOKEN 生成>
PASSWORD_HASH_ALGO            = pbkdf2_hi
LOGIN_REMEMBER_DAYS           = 7
DISABLE_GIT_HOOKS             = true            ; 强烈建议开！git hooks 等于服务器命令执行
```

### `[service]` — 注册策略

```ini
[service]
DISABLE_REGISTRATION              = true        ; 公开实例必关，否则被刷垃圾仓库
REQUIRE_SIGNIN_VIEW               = false       ; 改 true 仓库要登录才能看
REGISTER_EMAIL_CONFIRM            = true
ENABLE_NOTIFY_MAIL                = true
DEFAULT_ALLOW_CREATE_ORGANIZATION = true
DEFAULT_ENABLE_TIMETRACKING       = true
NO_REPLY_ADDRESS                  = noreply.localhost
```

### `[oauth2]` / `[openid]` — 第三方登录

```ini
[openid]
ENABLE_OPENID_SIGNIN = true
ENABLE_OPENID_SIGNUP = true
WHITELISTED_URIS     = "https://accounts.google.com https://github.com"
```

UI 里 → Site Administration → Authentication Sources → Add → 选 OAuth2 / LDAP / SMTP / SSPI 等接入企业身份。

### `[storage]` — 大文件 / Avatar / LFS 改 S3

```ini
[storage]
STORAGE_TYPE = local                            ; 默认本地

; 改 minio / S3：
[storage]
STORAGE_TYPE  = minio
MINIO_ENDPOINT       = minio.example.com:9000
MINIO_ACCESS_KEY_ID  = gitea
MINIO_SECRET_ACCESS_KEY = <密钥>
MINIO_BUCKET         = gitea
MINIO_LOCATION       = us-east-1
MINIO_USE_SSL        = false
```

### `[log]` — 日志级别

```ini
[log]
MODE      = console                             ; console / file
LEVEL     = info                                ; trace / debug / info / warn / error
ROOT_PATH = /var/lib/gitea/log

[log.file]
LEVEL = warn
FILE_NAME = gitea.log
LOG_ROTATE = true
MAX_DAYS = 7
```

### `[cron]` / `[cron.update_mirrors]` — 定时任务

Gitea 内置定时任务：清理旧 session、刷新 mirror 仓库等。可调度间隔：

```ini
[cron.update_mirrors]
SCHEDULE = @every 10m                           ; 拉取 mirror 仓库间隔
[cron.repo_health_check]
SCHEDULE = @every 24h
[cron.archive_cleanup]
SCHEDULE = @midnight
OLDER_THAN = 24h
```

### CLI 工具速查

```bash
# 生成各种 secret 值
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
# 改 app.ini 的 DB_TYPE 为 postgres，再 restore
sudo -u git gitea migrate -c /etc/gitea/app.ini

# 修复仓库元数据不一致
sudo -u git gitea doctor check --all
sudo -u git gitea doctor check --fix
```

### 备份建议

最关键的两份内容：
```bash
# 1. app.ini（含 SECRET_KEY，丢了重启后所有 token / OAuth 失效）
sudo cp /etc/gitea/app.ini /backup/

# 2. 数据库 + 仓库目录
sudo systemctl stop gitea
sudo tar czf /backup/gitea-data-$(date +%F).tar.gz /var/lib/gitea
sudo systemctl start gitea

# 或者用 gitea 自带 dump（含 db + repos + attachments + lfs）
sudo -u git gitea dump -c /etc/gitea/app.ini -f /backup/gitea-$(date +%F).zip
```
