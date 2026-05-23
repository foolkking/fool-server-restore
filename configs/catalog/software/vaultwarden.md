# Vaultwarden 自托管密码管理器

Vaultwarden 是 [Bitwarden](https://bitwarden.com/) 服务端的 **Rust 重写版**——完全兼容官方 Bitwarden 客户端（浏览器插件 / iOS / Android / 桌面 App / CLI），但资源占用 **1/10**（单容器 + SQLite，**~100 MB RAM** 起步）。是**自托管最热门**的项目之一。

## 你将得到什么

- 📦 **vaultwarden 容器**（`vaultwarden/server:latest`）
- ✅ 数据持久化 `/opt/vaultwarden/data/`（SQLite + attachments + RSA keys）
- ✅ 监听 `127.0.0.1:8086`（默认；反代到 443）
- ✅ Admin token 自动生成（64 位）
- ✅ Healthcheck（30s 轮询 `/alive`）
- ✅ `restart: unless-stopped`（开机自启）
- ✅ 默认禁公开注册（`SIGNUPS_ALLOWED=false`）

## 表单字段说明

### `vw_domain`

对外访问域名（不带协议端口）。Vaultwarden 用此生成密码重置邮件链接 / TOTP issuer 等。**生产强烈反代 + HTTPS**——否则浏览器拒绝某些功能（密码自动填充必须 HTTPS）。

### `vw_admin_token`

`/admin` 管理面板的 token。**Vaultwarden 无 admin 用户名/密码概念**——只用这一个 token。留空 = 自动生成 64 位强 token。

### `vw_port`

容器在本机监听的端口。默认仅 `127.0.0.1` 绑定——通过 nginx / Caddy / Traefik 反代到 443。

### `vw_signups_allowed`

公网部署强烈建议 `false`——避免陌生人注册占空间 / 用作邮件中转。Admin 通过邀请邮件加用户。

### SMTP 配置（可选）

用于邀请邮件 / 密码重置 / 紧急联系。Gmail / Outlook / SendGrid / Mailgun / 自托管 SMTP 都行。留空 = 不配置（这些功能不可用，但密码管理仍能用）。

## 配置文件 / 目录速查

```
/opt/vaultwarden/
├── docker-compose.yml                     # ← EnvForge 写入
└── data/                                    # ← 主数据目录（**最重要**）
    ├── db.sqlite3                            # 主数据库（SQLite）
    ├── db.sqlite3-wal                         # WAL（运行时存在）
    ├── db.sqlite3-shm                          # shared memory
    ├── attachments/                            # 用户上传附件（每用户独立目录）
    │   └── <user-uuid>/
    ├── sends/                                  # Bitwarden Send 临时分享
    ├── icon_cache/                              # 网站 favicon 缓存
    ├── tmp/
    ├── rsa_key.pem / rsa_key.pub.pem            # JWT 签名密钥（**敏感**）
    └── config.json                              # admin 面板改的配置（持久化）

# 容器内
/data → /opt/vaultwarden/data           # mount 映射
```

| 项 | 跨平台 |
|---|---|
| 安装方式 | Docker（仅 Docker，本 Playbook 不提供 system 部署） |
| 镜像 | `vaultwarden/server:latest`（多架构：amd64 / arm64 / arm/v7） |
| 端口 | 80（容器内） / 表单 `vw_port`（宿主） |
| 运行用户 | 容器内 `vaultwarden`（非 root） |

## 常见配置模板

### 模板 A — Nginx 反代（**最关键**，含 WebSocket）

```nginx
upstream vaultwarden {
    server 127.0.0.1:8086;
    keepalive 32;
}

# 80 → 443
server {
    listen 80;
    server_name vault.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vault.example.com;

    ssl_certificate     /etc/letsencrypt/live/vault.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vault.example.com/privkey.pem;

    # 文件上传
    client_max_body_size 525M;             # Bitwarden 默认 attachment 上限

    # 安全 header
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "same-origin" always;

    # WebSocket（实时同步必须！）
    location /notifications/hub {
        proxy_pass http://vaultwarden;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /notifications/hub/negotiate {
        proxy_pass http://vaultwarden;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 限制 admin 面板仅自己 IP
    location /admin {
        allow 1.2.3.4;                      # 你的运维 IP
        deny all;
        proxy_pass http://vaultwarden;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 主流量
    location / {
        proxy_pass http://vaultwarden;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

应用：

```bash
sudo certbot certonly --nginx -d vault.example.com
sudo nginx -t && sudo systemctl reload nginx
```

### 模板 B — Caddy 反代（**3 行搞定**）

```caddyfile
vault.example.com {
    reverse_proxy 127.0.0.1:8086

    # 限 admin 路径
    @admin path /admin*
    handle @admin {
        @allowed remote_ip 1.2.3.4
        handle @allowed { reverse_proxy 127.0.0.1:8086 }
        respond 403
    }
}
```

Caddy 自动签 / 续 LE 证书，WebSocket 默认支持。

### 模板 C — 客户端配置

#### 浏览器插件（Chrome / Firefox / Safari）

1. 装 Bitwarden 浏览器插件（任何 Bitwarden 客户端都行）
2. 点开插件 → "Self-hosted" → Server URL 填 `https://vault.example.com`
3. 注册账号（如 admin 已邀请）→ 登录

#### iOS / Android App

App Store / Play 装 Bitwarden → 设置 → 服务器 URL → `https://vault.example.com` → 登录。

#### 命令行（bw CLI）

```bash
npm install -g @bitwarden/cli
bw config server https://vault.example.com
bw login user@example.com
bw unlock                                  # 输入主密码 → 拿到 session token
export BW_SESSION="..."
bw list items
bw get password "Gmail"                     # 取密码
bw sync
```

### 模板 D — 创建第一个用户

由于 `SIGNUPS_ALLOWED=false`，admin 必须邀请：

1. 访问 `https://vault.example.com/admin` → 输入 admin token
2. **Users** tab → **Invite User** → 输入邮箱
3. 用户收到邀请邮件 → 点链接注册（**SMTP 必配**才能发邮件）

> **没配 SMTP 怎么办**：admin 面板 → Users → Invite → 复制邀请链接手动发给用户。

或临时开启 signup：

```bash
# 在 admin 面板 Settings → General → 临时开 signups → 用户注册 → 关回去
```

### 模板 E — 备份策略（**最关键**）

**Vaultwarden 数据 = 全部密码 = 灾难性数据**。务必多重备份。

```bash
# 1. 停容器（保证一致性）
docker stop vaultwarden

# 2. tar 整个 data 目录
sudo tar czf /backup/vaultwarden-$(date +%F).tar.gz -C /opt/vaultwarden data

# 3. 启
docker start vaultwarden

# 4. 加密备份（**强制**）
gpg -c /backup/vaultwarden-$(date +%F).tar.gz
rm /backup/vaultwarden-$(date +%F).tar.gz
# .gpg 文件可同步到 S3 / Backblaze / etc

# 自动 cron（每天 3 AM）
sudo tee /etc/cron.daily/vaultwarden-backup > /dev/null <<'EOF'
#!/bin/bash
docker stop vaultwarden
tar czf /backup/vw-$(date +%F).tar.gz -C /opt/vaultwarden data
gpg --batch --passphrase-file /root/.vw-bkp-pass -c /backup/vw-$(date +%F).tar.gz
rm /backup/vw-$(date +%F).tar.gz
docker start vaultwarden
find /backup -name 'vw-*.tar.gz.gpg' -mtime +30 -delete    # 保留 30 天
EOF
sudo chmod +x /etc/cron.daily/vaultwarden-backup
```

或用 [vaultwarden-backup-script](https://github.com/dani-garcia/vaultwarden/wiki/Backing-up-your-vault) 官方推荐方案。

### 模板 F — 客户端导出（额外保险）

每个用户**自己**也该导出一份本地保险：

1. Web vault → Settings → Export Vault → 选格式：
    - `.json` — 完整（推荐）
    - `.csv` — 仅密码（兼容性好）
    - `.json (encrypted)` — 加密的（**最推荐**）
2. 加密 JSON 用主密码解密，可在任何 Bitwarden 实例导入

### 模板 G — 升级 Vaultwarden

```bash
cd /opt/vaultwarden
sudo docker compose pull
sudo docker compose up -d                   # 自动停老的、起新的

# 看日志确认 OK
sudo docker logs --tail 50 vaultwarden

# 数据库自动 migration（看日志有 "Migrating database" 字样）
```

### 模板 H — Admin 面板关键配置

访问 `https://vault.example.com/admin`（输入 admin token）：

| Tab | 关键配置 |
|---|---|
| **General Settings** | Domain URL / Allow signups / Allow invitations |
| **Email** | SMTP（同表单） |
| **Advanced** | Trash auto-delete 天数 / Icon service |
| **Yubikey** | 2FA hardware key 集成 |
| **Users** | 邀请 / 删除 / 重置主密码（**有限制**） |
| **Organizations** | 团队功能（共享密码 collection） |

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | 磁盘 |
|---|---|---|
| 1-10 用户 | 100-200 MB | < 100 MB |
| 50 用户 | 300 MB | 数百 MB |
| 200 用户 + attachments | 500 MB | GB 级（按 attachments 数） |

### Postgres backend（大型部署）

默认 SQLite 够用 < 1k 用户。要 PG：

```yaml
# docker-compose.yml 加 services.db
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vaultwarden
      POSTGRES_USER: vaultwarden
      POSTGRES_PASSWORD: <pg-pass>
    volumes:
      - db-data:/var/lib/postgresql/data

  vaultwarden:
    environment:
      DATABASE_URL: "postgresql://vaultwarden:<pg-pass>@db:5432/vaultwarden"
    depends_on:
      - db
```

### Yubikey / WebAuthn 2FA

强烈推荐启用。Admin 面板 → Yubikey 配置（Yubico 凭据从 yubico.com/getapikey 拿）→ 用户在 Settings → Two-Factor 启用。

### 内存限制

```yaml
services:
  vaultwarden:
    mem_limit: 256m
    cpus: 0.5
```

## 跨发行版兼容

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅（SELinux 需配 `setsebool -P container_manage_cgroup on`） |
| Alpine | ✅ |
| ARM64（树莓派） | ✅（多架构镜像） |

EnvForge Playbook 自动适配——本质是 docker compose 部署，跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（模板 A）
- **`caddy-server`** — 替代 nginx（模板 B，更简单）
- **`traefik-proxy`** — Docker label 自动反代
- **`fail2ban-protection`** — 给 /admin 加 jail（防暴破）
- **`vault-secrets`**（HashiCorp Vault）— 完全不同定位（DevOps secret store）

## 排错

### 浏览器登录卡住 / Network Error

**反代没正确处理 WebSocket**。

```bash
# 看 vaultwarden 日志
docker logs --tail 50 vaultwarden

# 测试 WS endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    https://vault.example.com/notifications/hub
# 应返回 101 Switching Protocols
```

确保 nginx 配置含模板 A 的 `/notifications/hub` location。

### `/admin` 看不到 token 输入

```bash
# 检查 ADMIN_TOKEN 环境变量
docker exec vaultwarden env | grep ADMIN_TOKEN

# 没有 = compose.yml 里没设 / 容器没重启
docker restart vaultwarden
```

### 客户端错误 `Server URL is invalid`

URL 必须含协议（`https://`），且证书有效：

```bash
# 测试证书
curl -I https://vault.example.com
# 200 OK + 有效证书

# Bitwarden 客户端拒绝自签证书——必须用 LE 或商用 CA
```

### 找回 admin token

```bash
docker exec vaultwarden env | grep ADMIN_TOKEN
# 或
sudo grep ADMIN_TOKEN /opt/vaultwarden/docker-compose.yml
```

### 用户忘了主密码

**Bitwarden 的零知识架构**——主密码本地加密所有数据，**服务端无法重置或解密**。三条路：

1. 用户客户端有缓存的离线副本（vault.bitwarden.com 设过 PIN unlock 时）
2. 紧急访问联系人（提前设过）
3. **重新创建账号 → 从备份导入**（如有）

教育用户：**主密码丢失 = 数据丢失**，备份关键密码到物理保险箱。

### 升级后启动失败

```bash
# 看升级日志
docker logs vaultwarden | grep -i error

# 数据库 migration 失败（极少）→ 回退
docker stop vaultwarden
sudo cp -r /opt/vaultwarden/data /opt/vaultwarden/data.upgrade-fail-bak
# 改 docker-compose.yml 锁定老版本：
# image: vaultwarden/server:1.30.5
docker compose up -d
```

### 端口被占

```bash
sudo ss -tlnp | grep 8086
# 改 vw_port 或杀冲突进程
```

### SELinux 阻止（RHEL）

```bash
sudo ausearch -m avc -ts recent | grep vaultwarden
sudo setsebool -P container_manage_cgroup on
sudo restorecon -Rv /opt/vaultwarden
```

### 邀请邮件没发出

```bash
# 测 SMTP（容器内）
docker exec vaultwarden /vaultwarden --help | head

# 看日志
docker logs vaultwarden | grep -i smtp

# 检查 SMTP 配置
docker exec vaultwarden env | grep SMTP
```

Gmail 账号 2FA 后**必须**用 App Password。

## 验证

```bash
# 1. 容器在跑
docker ps | grep vaultwarden                # status: Up (healthy)

# 2. 健康检查
curl -fsS http://127.0.0.1:8086/alive

# 3. 登录页（200）
curl -I http://127.0.0.1:8086/

# 4. Admin 面板（302，要求 token）
curl -I http://127.0.0.1:8086/admin

# 5. 数据持久化
ls -la /opt/vaultwarden/data/

# 6. 反代生效（如配）
curl -I https://vault.example.com/

# 7. WebSocket（同上 /notifications/hub）
```

## 多次运行

`installMode: skip-existing`。**已存在的 docker-compose.yml 备份后重写**——admin token 每次按表单值（或自动生成新的）更新。**数据目录不动**——用户 / 密码全部保留。

要彻底重置（**丢失全部数据**）：

```bash
docker stop vaultwarden
docker rm vaultwarden
sudo rm -rf /opt/vaultwarden                 # ⚠️ 不可恢复
# 重跑 Playbook
```

## ⚠️ 敏感性

**privileged** — Vaultwarden 是**全部凭据的中央存储**。

强制清单：

1. **公网必须 HTTPS**（Bitwarden 客户端拒绝 HTTP 服务器）
2. **Admin token 严格保密**——丢了换 docker-compose.yml 重启
3. **数据目录加密备份**（模板 E）
4. **每用户启用 2FA**（Yubikey / TOTP）
5. **`/admin` 用 IP 白名单**或 mTLS（模板 A / B）
6. **关 SIGNUPS_ALLOWED**（公网部署）
7. **JWT 私钥** `data/rsa_key.pem` 不要泄露——丢了所有用户重新登录
8. 主密码强度宣讲：用户必须设 ≥ 16 位随机主密码（密码本身需在外面记 / 物理保险箱）

## 隐私说明

- **零知识架构**：主密码本地加密，**Vaultwarden 服务端无法看到密码**（仅密文）
- **服务端能看到**：用户邮箱 / 用户量 / 登录 IP / 访问时间 / TOTP issuer 名（不含 secret）
- 数据目录含**所有加密密文 + RSA keypair**——备份必须加密
- **Vaultwarden 不发遥测**
- 客户端图标缓存（icon_cache）会向 vault domain 的 `/icons/...` 请求，间接拉取目标网站 favicon——可能透露用户保存了哪些站
- SMTP 密码**明文存** docker-compose.yml + 容器 env——文件权限 0640
- 紧急访问 / 组织 collection 等高级功能涉及多用户密钥协商——见 [Bitwarden 安全白皮书](https://bitwarden.com/help/article/what-encryption-is-used/)
