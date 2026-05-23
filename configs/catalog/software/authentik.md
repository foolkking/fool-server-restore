# Authentik 身份认证服务器

Authentik 是**开源 SSO 解决方案**——OIDC / SAML 2.0 / LDAP 三协议中央认证。比 Keycloak 简单部署、UI 更现代、扩展点更多。**适合**：给 Nextcloud / GitLab / Grafana / Jenkins / Vaultwarden / 等所有自托管应用一个统一登录入口。

## 你将得到什么

- 📦 **Authentik** Docker compose 栈（4 容器）：
    - **postgresql** （主数据库）
    - **redis**（session + 缓存）
    - **server**（HTTP API + UI）
    - **worker**（后台任务 + LDAP 提供者）
- ✅ Web UI 监听 `127.0.0.1:9000`
- ✅ Bootstrap admin（首次登录 `/if/flow/initial-setup/` 创建）
- ✅ Error reporting 已禁用
- ✅ 数据持久化 `/opt/authentik/`
- ⚠️ **最低 2 GB RAM**（PG + Redis + 2 个 Authentik 进程）

## 表单字段说明

### `authentik_domain`

对外 URL。**所有 OIDC / SAML 客户端**会重定向到此——一旦改了所有应用集成都要重配。

### `authentik_port`

HTTP 端口。仅 127.0.0.1，反代到 443。

### `authentik_admin_email`

首次创建 admin 账号用的邮箱。

### `authentik_pg_password`

内嵌 PG 密码 + 同时是 admin 首次登录密码（bootstrap）。

### `authentik_secret_key`

> ⚠️ **极其关键**——加密 session / OAuth refresh token 等。**丢失 = 所有用户会话失效，OAuth refresh token 无法解密**！

留空 = 自动 60 位。**离线备份到密码管理器**。

## 配置文件 / 目录速查

```
/opt/authentik/
├── docker-compose.yml                       # ← EnvForge 写入
├── .env                                       # 含密码（**0600**）
├── db-data/                                    # PostgreSQL（核心）
├── redis-data/
├── media/                                       # 用户头像 / icons
├── templates/                                    # 自定义页面模板
└── certs/                                         # SAML 签名证书 / 客户端证书
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker compose |
| 镜像 | `ghcr.io/goauthentik/server` |
| 容器数 | 4（PG + Redis + server + worker） |
| 内存需求 | ≥ 2 GB（强烈建议 4 GB） |

## 常见配置模板

### 模板 A — 首次 setup（必走）

```
http://<server-ip>:9000/if/flow/initial-setup/
```

输入：

- Email: 表单填的 admin 邮箱
- Password: 表单的 bootstrap password（= PG password）

完成后跳到 admin UI。

### 模板 B — Nginx 反代（**关键**：要传 X-Forwarded-Host）

```nginx
upstream authentik {
    server 127.0.0.1:9000;
    keepalive 10;
}

server {
    listen 443 ssl http2;
    server_name auth.example.com;
    ssl_certificate /etc/letsencrypt/live/auth.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.example.com/privkey.pem;

    client_max_body_size 5M;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;

    location / {
        proxy_pass         http://authentik;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host $http_host;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";

        proxy_read_timeout 600s;
    }
}
```

### 模板 C — 给 Grafana 接 OIDC

#### Authentik 端：创建 Provider + Application

UI → Applications → Providers → Create OAuth2/OpenID Provider：

```
Name: Grafana
Authorization flow: default-provider-authorization-explicit-consent
Client type: Confidential
Client ID: grafana
Client Secret: <生成或填>
Redirect URIs:
    https://grafana.example.com/login/generic_oauth
Signing Key: authentik Self-signed Certificate
```

UI → Applications → Applications → Create：

```
Name: Grafana
Slug: grafana
Provider: Grafana（刚创建的）
Launch URL: https://grafana.example.com
```

#### Grafana 端

`/etc/grafana/grafana.ini`:

```ini
[auth.generic_oauth]
enabled = true
name = Authentik
allow_sign_up = true
client_id = grafana
client_secret = <secret>
scopes = openid email profile groups
auth_url = https://auth.example.com/application/o/authorize/
token_url = https://auth.example.com/application/o/token/
api_url = https://auth.example.com/application/o/userinfo/
role_attribute_path = contains(groups[*], 'grafana-admin') && 'Admin' || contains(groups[*], 'grafana-editor') && 'Editor' || 'Viewer'
```

重启 Grafana。Grafana 登录页出现 "Sign in with Authentik" 按钮。

### 模板 D — 给 Nextcloud 接 SAML

UI → Applications → Providers → Create SAML Provider：

```
Name: Nextcloud
ACS URL: https://cloud.example.com/apps/user_saml/saml/acs
Issuer: https://auth.example.com
Service Provider Binding: Post
```

下载 metadata XML → Nextcloud admin → Security → SSO & SAML auth → 上传 metadata。

### 模板 E — 启用 LDAP outpost（让其他应用用 Authentik 当 LDAP server）

UI → Applications → Outposts → Create LDAP Outpost：

```
Name: ldap-outpost
Type: LDAP
Service Connection: Local Docker
Applications: <选你想暴露的 application>
```

部署 outpost（自动起新容器）。其他应用配 LDAP：

```
Host: ldap-outpost-container:3389
Bind DN: cn=service-account,ou=users,DC=ldap,DC=goauthentik,DC=io
Bind Password: <在 Authentik 里给 service account 设密码>
```

### 模板 F — 备份策略（**关键**）

```bash
# 1. 停服务
cd /opt/authentik
docker compose stop

# 2. tar 全部
sudo tar czf /backup/authentik-$(date +%F).tar.gz -C /opt authentik

# 3. 启
docker compose start

# 4. 加密（必须——含 secret key + 用户密码 hash）
gpg -c /backup/authentik-$(date +%F).tar.gz
```

或用 Authentik admin → System → Database backup（PG dump）。

### 模板 G — 升级

```bash
cd /opt/authentik
docker compose pull
docker compose up -d                            # 自动 schema migration
```

升级前必须备份。Authentik major 版本升级偶有 breaking change。

### 模板 H — 启用 SMTP 邮件

`docker-compose.yml` server 服务 environment 加：

```yaml
AUTHENTIK_EMAIL__HOST: smtp.gmail.com
AUTHENTIK_EMAIL__PORT: 587
AUTHENTIK_EMAIL__USERNAME: user@gmail.com
AUTHENTIK_EMAIL__PASSWORD: app-password
AUTHENTIK_EMAIL__USE_TLS: "true"
AUTHENTIK_EMAIL__FROM: authentik@example.com
```

```bash
docker compose up -d
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU |
|---|---|---|
| < 100 | 2 GB | 1 vCPU |
| < 1k | 4 GB | 2 vCPU |
| < 10k | 8 GB+ | 4 vCPU+ |
| > 10k | 跨多 worker scale | – |

PG + Redis + 2 Authentik 进程是基础开销。worker 可水平扩展。

### Worker 扩展

```yaml
worker:
    deploy:
      replicas: 3
```

### 性能

| 项 | 默认 |
|---|---|
| OIDC token 签发 | < 50ms |
| SAML assertion | < 100ms |
| LDAP bind | < 30ms |
| 用户查询 | PG 默认索引够用 |

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`postgres-profile`** — Authentik 自带 PG 容器，可改用外部
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（**必须**）
- **`vaultwarden`** — Authentik 给 Vaultwarden 接 OIDC
- **`grafana-dashboard` / `gitea-server` / `nextcloud` / 大部分 service Playbook** — 都可接 Authentik

## 排错

### 启动慢 / 卡在 migration

```bash
docker compose logs -f server
# 等 "[INFO] Database migrations complete"

# PG 启动慢
docker compose logs postgresql
```

首次启动 1-2 分钟正常。

### 反代后登录死循环

通常 X-Forwarded-Proto 没传：

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $http_host;
```

或 Authentik 的 `AUTHENTIK_LISTEN__TRUSTED_PROXY_CIDRS` 没配代理 IP。

### 找回 admin 密码

```bash
# bootstrap password 仍可用（如果 .env 没改）
sudo grep BOOTSTRAP /opt/authentik/.env

# 或 reset
docker exec -it $(docker ps -q --filter "name=server") /bin/bash
ak shell
# >>> from authentik.core.models import User
# >>> user = User.objects.get(username='akadmin')
# >>> user.set_password('newpass')
# >>> user.save()
```

### Secret key 改了所有 session 失效

预期行为——所有用户重新登录。OAuth client 的 refresh token 也失效，需重新授权。

### 内存不够 OOM

```bash
free -h
# 物理 < 2GB 必须加 swap
# 或减 worker 数
```

### Provider 配错（OIDC redirect URI mismatch）

Authentik 严格匹配 redirect URI。要改：UI → Provider → Edit → Redirect URI。

## 验证

```bash
# 1. 容器都跑
docker ps | grep -E '(server|worker|postgresql|redis)'

# 2. Health
curl -fsS http://127.0.0.1:9000/-/health/live/
curl -fsS http://127.0.0.1:9000/-/health/ready/

# 3. 登录页
curl -I http://127.0.0.1:9000/

# 4. 看版本
curl -s http://127.0.0.1:9000/api/v3/admin/version/ | jq
```

## 多次运行

`installMode: skip-existing`。docker-compose.yml 重写。**.env 重写**——secret key + bootstrap password 每次按表单值更新。**db-data 保留**——所有用户 / 应用 / 流程不丢。

> ⚠️ **改 secret key 会让所有 session 失效 + OAuth refresh token 解密失败**——更换前导出 token 或通知用户重新授权。

## ⚠️ 敏感性

**privileged** — Authentik 是**所有应用的认证中央**。攻陷 = 所有接入应用攻陷。

强制：

1. **公网必须 HTTPS**
2. Secret key 离线备份
3. Worker 容器需挂 docker.sock（管理 LDAP outpost）—— 等同 root，谨慎选择 worker 跑哪台
4. Admin 账号启用 TOTP / WebAuthn
5. Brute-force protection 默认开（Authentik 自带）
6. 反代加 IP 白名单（admin /admin path 仅运维 IP）

## 隐私说明

- Error reporting 已禁用（`AUTHENTIK_ERROR_REPORTING__ENABLED=false`）
- 数据全部本地存储（PG + media）
- `.env` 含 secret key + PG password 明文，权限 0600
- 用户密码用 Argon2 hash 存
- OAuth refresh token 用 secret key 加密
- 审计日志：UI → System → Events 含登录历史 / 配置变更 —— 按合规处理
- 邀请邮件 / 密码重置邮件 走配置的 SMTP server（凭据存 PG 加密）
