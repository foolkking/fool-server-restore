# Keycloak SSO

Keycloak 是**企业级 SSO 事实标准**——Red Hat 主导开发，被绝大多数商业 SaaS / 企业软件文档列为参考实现。**适合**：企业 / 复杂场景需要 OIDC + SAML + LDAP federation + social login + 多租户的全套身份方案。**资源重**（最低 1GB RAM，推荐 2GB+）—— 家庭 / 小团队选 `authelia` 或 `authentik` 更轻。

## 你将得到什么

- 📦 **Keycloak 25**（Quarkus 版，比 21 之前 WildFly 版轻 3 倍）
- 📦 **PostgreSQL 16**（专用 DB 容器）
- ✅ Web UI 监听 `127.0.0.1:8082`
- ✅ master realm + 初始 admin 账号
- ✅ Health endpoint（`/health/ready`）
- ✅ Metrics endpoint（Prometheus 兼容，`/metrics`）
- ✅ XForwarded-* 头处理（适合 nginx / Traefik / Caddy 反代）
- ✅ DB 密码 / admin 密码自动生成 + 显示一次

## 表单字段说明

### `kc_domain`

⚠️ **最关键字段**。Keycloak 25 强制 hostname 一致性——所有 OIDC redirect URI / SAML assertion 都按这个域名签发。

**必须与反代 server_name 完全一致**（含子域）。改 domain 后已发的 token 会失效。

### `kc_admin_user` / `kc_admin_password`

master realm 初始 admin。**仅首次启动**写入——重跑 Playbook 不会改已有密码。

⚠️ **重置 admin 密码** 需要进容器：

```bash
docker exec -it keycloak /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 --realm master --user admin
docker exec -it keycloak /opt/keycloak/bin/kcadm.sh \
  set-password -r master --username admin --new-password 'newpass'
```

### `kc_db_password`

PG 容器密码。一般不需要直接用。生产想换 → 改 `docker-compose.yml` env + 重启 PG + 重启 Keycloak。

### `kc_port`

本机绑定端口，**只听 127.0.0.1**——必须挂反代。

### `kc_data_dir`

PG data 在 `<data_dir>/postgres-data`。**这是真相之源**——所有 realm / client / 用户 / role / group 全在 PG。备份此目录 = 备份完整 SSO 配置。

## 配置文件 / 目录速查

```
/opt/keycloak/
├── docker-compose.yml
└── postgres-data/                       # PG 数据（**最重要**）
    └── ...

# 容器内（参考用）
/opt/keycloak/conf/keycloak.conf
/opt/keycloak/data/                       # 缓存（运行时数据）
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name auth.example.com;

    ssl_certificate     /etc/letsencrypt/live/auth.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.example.com/privkey.pem;

    # Keycloak 静态资源较多，关闭 buffer 提速
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Port  $server_port;

        proxy_connect_timeout       60s;
        proxy_send_timeout          120s;
        proxy_read_timeout          120s;
    }
}

server {
    listen 80;
    server_name auth.example.com;
    return 301 https://$host$request_uri;
}
```

### 模板 B — 创建第一个 Realm

不要用 master realm 给应用用！master 仅用于管理。

```
1. Admin 控制台登录
2. 左上 dropdown → Create Realm
3. Realm name: company（或项目名）
4. Create
```

切到新 realm 后再创建 client / 用户。

### 模板 C — 接入应用（OIDC client）

```
[新 realm] → Clients → Create client
  Client type: OpenID Connect
  Client ID: nextcloud (或应用名)

  下一步:
  Client authentication: ON       ← 后端应用必开（confidential client）
  Authorization: OFF
  Standard flow: ON                 ← 浏览器登录
  Direct access grants: OFF         ← 一般用不到（除非 password grant）
  Service accounts roles: ON        ← 应用要调 Keycloak API

  下一步:
  Valid redirect URIs:
    https://nextcloud.example.com/apps/sociallogin/custom_oidc/Keycloak
    https://nextcloud.example.com/index.php/apps/oidc_login/oidc

  Web origins:
    https://nextcloud.example.com

Save → Credentials 标签 → 拿 Client secret
```

应用配置（以 Nextcloud 为例）：

```
Discovery URL: https://auth.example.com/realms/company/.well-known/openid-configuration
Client ID:     nextcloud
Client Secret: <从 Keycloak 复制>
```

### 模板 D — LDAP federation（接入企业目录）

```
Realm → User Federation → Add → LDAP
  Connection URL:    ldap://ldap.company.com
  Bind DN:           cn=admin,dc=company,dc=com
  Bind Credential:   <密码>
  Users DN:          ou=users,dc=company,dc=com
  Username LDAP:     uid
  Sync All Users:    ✓

Test connection / Test authentication
Save
```

之后 Keycloak 自动同步 LDAP 用户——可仍用 OIDC 协议给应用，但底层是 LDAP。

### 模板 E — Social login（微信 / Google / GitHub）

```
Realm → Identity Providers → Add provider → 选 GitHub / Google / OpenID Connect (微信用通用 OIDC)
  Client ID / Client Secret 从对应 provider 拿
  Redirect URI: https://auth.example.com/realms/company/broker/<provider>/endpoint
```

用户登录页就有 "Login with GitHub" 按钮。

### 模板 F — 强制 2FA

```
Realm → Authentication → Required Actions
  Configure OTP: Enabled + Default action ✓

新用户首次登录强制设 TOTP。已有用户：
  Users → 选用户 → Required Actions → Configure OTP → Save
```

### 模板 G — 备份 / 还原

```bash
# 备份 PG（推荐）
docker exec keycloak-db pg_dump -U keycloak keycloak | gzip > kc-backup-$(date +%F).sql.gz

# 还原（新机器）
gunzip -c kc-backup-YYYY-MM-DD.sql.gz | docker exec -i keycloak-db psql -U keycloak keycloak

# 或直接复制 postgres-data（要先停 PG 容器）
docker compose stop
tar -czf kc-data-backup.tar.gz postgres-data/
docker compose up -d
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU | 磁盘 |
|---|---|---|---|
| < 100 | 1 GB | 1 vCPU | 5 GB |
| < 1k | 2 GB | 2 vCPU | 10 GB |
| < 10k | 4 GB | 4 vCPU | 30 GB |
| > 10k | 8 GB+ + Keycloak 集群 | 8 vCPU | – |

JVM 内存：`docker-compose.yml` 加：

```yaml
environment:
  JAVA_OPTS_APPEND: "-Xms512m -Xmx1024m"  # 默认按容器 limit 25%
```

### Token 过期时间调优

```
Realm Settings → Tokens
  Access Token Lifespan:        5-15 min（短，安全）
  Refresh Token Lifespan:        1-7 day（长，少打扰用户）
  SSO Session Idle:              30 min（用户不活跃就退出）
  SSO Session Max:               10 hour（强制重登）
```

### 性能优化

```yaml
# docker-compose.yml command 加 --optimized 已在 Playbook 默认
command: start --optimized --hostname-strict=false ...

# Cluster 模式（多实例）
KC_CACHE: ispn
KC_CACHE_STACK: kubernetes  # 或 tcp / jdbc-ping
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Docker 部署 | ✅ | ✅ |
| ARM64 | ✅（quay.io 多架构镜像） | ✅ |
| Anolis 9 | – | ✅ |
| 内存最低 | 1 GB | 1 GB |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（**必装**）
- **`authentik`** — 互斥替代品（同 SSO 服务，二选一）
- **`authelia`** — 互补不互斥（Authelia 做 forward-auth，Keycloak 做 OIDC）
- **`postgres-profile`** — Keycloak 内置 PG，**不需要**外部 PG（除非生产想用专用 PG 集群）
- **`prometheus-monitoring`** — 抓 `/metrics` 监控

## 排错

### 容器一直在重启

```bash
docker logs --tail 100 keycloak
# 最常见：PG 没就绪 → KC 连不上
# 等 PG 健康再起：
docker logs keycloak-db
```

### 登录后跳错域名

`KC_HOSTNAME` 与反代 `server_name` 不一致。**两者必须完全相同**。

```bash
# 改 docker-compose.yml
KC_HOSTNAME: "auth.example.com"     # ← 与 nginx server_name 一致

docker compose up -d --force-recreate keycloak
```

### `Mixed Content` / `redirect_uri parameter does not match`

反代没正确传 `X-Forwarded-Proto`：

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
```

### admin 控制台空白 / 静态资源 404

`proxy_buffering off` 漏配。详见模板 A。

### 升级失败

```bash
# 升级前必备份
docker exec keycloak-db pg_dump -U keycloak keycloak > kc-pre-upgrade.sql

# 改 docker-compose.yml 镜像 tag
image: quay.io/keycloak/keycloak:26.0    # 新版

# 跑 migration
docker compose pull
docker compose up -d
docker logs -f keycloak                   # 看 schema migration 日志
```

### 内存不够 OOM

```bash
docker stats keycloak
# 若到 limit 就 OOM → 加内存

# docker-compose.yml
deploy:
  resources:
    limits:
      memory: 2G
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=keycloak

# 2. PG 健康
docker exec keycloak-db pg_isready -U keycloak

# 3. Keycloak ready
curl -fsS http://127.0.0.1:8082/health/ready
# {"status": "UP", "checks": [...]}

# 4. Admin 控制台
curl -fsS http://127.0.0.1:8082/admin/ -o /dev/null -w '%{http_code}\n'
# 期望 200 / 302

# 5. OIDC discovery（替换 realm 名）
curl -fsS http://127.0.0.1:8082/realms/master/.well-known/openid-configuration | jq .issuer
# "http://127.0.0.1:8082/realms/master"
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——其中 `KEYCLOAK_ADMIN_PASSWORD` 仅首次启动时被读取。**已存 realm / client / 用户 / 自定义改动全部保留**（在 PG）。要彻底重置：删 `postgres-data/` 后重跑。

## ⚠️ 敏感性

**privileged** — Keycloak **持有所有用户的认证凭据**——攻陷 = 所有接入应用全失守。

强制：

1. **公网必须 HTTPS**（Keycloak 25 强制要求）
2. master realm **仅管理用**——别给应用用
3. admin 强密码 + 启用 2FA
4. 所有 client `Client authentication: ON`（confidential，避免 secret 泄露走 PKCE）
5. PG 备份每日（Realm 改了就丢一天等于丢配置）
6. 升级跨大版本前必读 release notes（schema 自动 migrate 但偶有 breaking）

## 隐私说明

- 所有用户 / role / group / token 在内部 PG，**不上传 Red Hat**
- Keycloak 软件本身**无遥测**（开源）
- Identity Provider（GitHub / Google）配上后会与对应平台交换用户邮箱 / 用户名
- LDAP federation 时凭据 / 用户名同步到 Keycloak（按 federation 设置可单向）
