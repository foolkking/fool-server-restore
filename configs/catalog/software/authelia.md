# Authelia 轻量 SSO

Authelia 是**轻量 forward-auth SSO 中间件**——配合 nginx / Traefik / Caddy 给任意应用一行 `auth_request` 就接入 SSO。**~50MB RAM**（vs Keycloak 1GB+）。**适合**：家庭 NAS / 小团队 / 自托管玩家——给所有内网应用统一登录入口 + WebAuthn / TOTP 2FA。**不适合**：要 OIDC provider 给外部应用（用 `keycloak` 或 `authentik`）—— Authelia 仅给反代用。

## 你将得到什么

- 📦 **Authelia 容器**（`authelia/authelia:latest`）
- ✅ 单容器 SQLite 后端（无 PG / Redis 依赖）
- ✅ Web 登录 / 注册 UI（`https://auth.example.com`）
- ✅ Forward-auth 端点（nginx `auth_request` / Traefik `forwardAuth`）
- ✅ TOTP（Google Authenticator / Authy）+ WebAuthn（YubiKey / 系统生物识别）
- ✅ argon2id 密码哈希
- ✅ Brute-force protection（默认 3 次失败封 5 分钟）
- ✅ 默认策略 deny + 显式 rules（白名单模式）

## 表单字段说明

### `ah_domain`

Authelia 自身访问域。

⚠️ **关键约束**：**必须是受保护根域的子域**。

- 受保护：`*.example.com`
- Authelia: `auth.example.com` ✅
- Authelia: `auth.different-domain.com` ❌ —— cookie 共享失败

原因：Authelia 把 session cookie 写到根域 `.example.com`，所有子域共享。

### `ah_default_protected_domain`

要保护的根域。**示例 `example.com`** = 应用规则 `*.example.com` 都要 SSO。

### `ah_admin_user` / `ah_admin_password`

首个管理员账号。文件后端 = 改 `users_database.yml` 加用户。

```yaml
# users_database.yml
users:
  alice:
    disabled: false
    displayname: "Alice"
    password: "$argon2id$v=19$m=65536,t=3,p=4$..."
    email: alice@example.com
    groups: [admins, dev]
```

生成新密码 hash：

```bash
docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'newpass'
```

### `ah_jwt_secret` / `ah_session_secret` / `ah_storage_secret`

3 个独立 secret（最低 32 字符）：

| Secret | 改了的影响 |
|---|---|
| `jwt_secret` | 已发的密码重置链接失效 |
| `session_secret` | 所有用户被踢下线 |
| `storage_secret` | **所有用户的 TOTP / WebAuthn 失效**——重新设置 |

**生产部署后别瞎改**。

### `ah_port`

本机绑定端口，仅 127.0.0.1。

### `ah_data_dir`

```
{ah_data_dir}/
├── config/
│   ├── configuration.yml          # 主配置
│   └── users_database.yml         # 用户清单
└── data/
    ├── db.sqlite3                  # **重要**——TOTP secret / WebAuthn key
    └── notification.txt            # 邮件通知（无 SMTP 时降级到文件）
```

## 配置文件 / 目录速查

```
configuration.yml 关键段：
├── access_control                 # 规则匹配（deny default + rules 白名单）
├── authentication_backend          # file / ldap
├── session                         # cookie domain（关键）
├── storage                         # local sqlite / mysql / pg
├── notifier                        # smtp / file
└── totp / webauthn                 # 2FA
```

## 常见配置模板

### 模板 A — Nginx 接入（forward-auth）

`/etc/nginx/snippets/authelia-location.conf`：

```nginx
location /authelia {
    internal;
    proxy_pass         http://127.0.0.1:9091/api/verify;
    proxy_pass_request_body off;
    proxy_set_header   Content-Length "";

    proxy_set_header X-Original-URL $scheme://$http_host$request_uri;
    proxy_set_header X-Original-Method $request_method;
    proxy_set_header X-Forwarded-Method $request_method;
    proxy_set_header X-Forwarded-Proto  $scheme;
    proxy_set_header X-Forwarded-Host   $http_host;
    proxy_set_header X-Forwarded-Uri    $request_uri;
    proxy_set_header X-Forwarded-For    $remote_addr;
}
```

`/etc/nginx/snippets/authelia-authrequest.conf`：

```nginx
auth_request /authelia;
auth_request_set $target_url $scheme://$http_host$request_uri;
auth_request_set $user $upstream_http_remote_user;
auth_request_set $groups $upstream_http_remote_groups;
auth_request_set $name $upstream_http_remote_name;
auth_request_set $email $upstream_http_remote_email;

proxy_set_header Remote-User $user;
proxy_set_header Remote-Groups $groups;
proxy_set_header Remote-Name $name;
proxy_set_header Remote-Email $email;

# 未登录跳到 Authelia
error_page 401 =302 https://auth.example.com/?rd=$target_url;
```

保护应用：

```nginx
server {
    listen 443 ssl http2;
    server_name nextcloud.example.com;

    ssl_certificate     /etc/letsencrypt/live/nextcloud.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nextcloud.example.com/privkey.pem;

    include /etc/nginx/snippets/authelia-location.conf;

    location / {
        include /etc/nginx/snippets/authelia-authrequest.conf;
        proxy_pass http://127.0.0.1:11000;     # Nextcloud
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Authelia 自身的 server 块：

```nginx
server {
    listen 443 ssl http2;
    server_name auth.example.com;

    ssl_certificate     /etc/letsencrypt/live/auth.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9091;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 模板 B — Traefik 接入

`docker-compose.yml`（应用容器加 label）：

```yaml
services:
  myapp:
    # ...
    labels:
      - traefik.http.routers.myapp.rule=Host(`app.example.com`)
      - traefik.http.routers.myapp.middlewares=authelia@docker
      - traefik.http.services.myapp.loadbalancer.server.port=80

  authelia:
    # ...
    labels:
      - traefik.http.middlewares.authelia.forwardauth.address=http://authelia:9091/api/verify?rd=https://auth.example.com
      - traefik.http.middlewares.authelia.forwardauth.trustForwardHeader=true
      - traefik.http.middlewares.authelia.forwardauth.authResponseHeaders=Remote-User,Remote-Groups,Remote-Name,Remote-Email
```

### 模板 C — 访问规则（access_control）

`configuration.yml`：

```yaml
access_control:
  default_policy: deny
  rules:
    # Authelia 自身免认证（否则递归）
    - domain: 'auth.example.com'
      policy: bypass

    # 公开页面
    - domain: 'blog.example.com'
      policy: bypass

    # 普通受保护：单因素
    - domain: 'wiki.example.com'
      policy: one_factor

    # 高敏感：必须 2FA
    - domain: ['admin.example.com', 'cockpit.example.com']
      policy: two_factor

    # 仅 admins 组能访问
    - domain: 'router.example.com'
      policy: two_factor
      subject:
        - 'group:admins'

    # 内网 IP 直连免认证
    - domain: 'monitoring.example.com'
      policy: one_factor
      networks:
        - 192.168.1.0/24
```

### 模板 D — 启用邮件通知

```yaml
# configuration.yml
notifier:
  smtp:
    address: 'submission://smtp.gmail.com:587'
    timeout: 5s
    username: 'you@gmail.com'
    password: 'app-specific-password'   # Gmail 必须用 app password
    sender: 'noreply@example.com'
    subject: '[Authelia] {title}'
    startup_check_address: 'test@example.com'
    disable_html_emails: false
    tls:
      server_name: smtp.gmail.com
      skip_verify: false
      minimum_version: TLS1.2
```

去掉 `notifier.filesystem` 段。

### 模板 E — LDAP 后端

```yaml
# configuration.yml
authentication_backend:
  ldap:
    address: 'ldap://ldap.company.com'
    timeout: 5s
    start_tls: false
    base_dn: 'dc=company,dc=com'
    user:
      additional_dn: 'ou=users'
      filter: '(&(|({username_attribute}={input})({mail_attribute}={input}))(objectClass=person))'
      username_attribute: uid
      mail_attribute: mail
      display_name_attribute: displayName
    additional_users_dn: 'ou=users'
    user: 'cn=admin,dc=company,dc=com'
    password: '<bind password>'
```

去掉 `authentication_backend.file` 段。

### 模板 F — 添加 / 修改用户（文件后端）

```bash
# 1. 生成新密码 hash
docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'NewSecurePass'
# 输出: $argon2id$v=19$m=65536,t=3,p=4$...

# 2. 编辑 users_database.yml
sudo vi /opt/authelia/config/users_database.yml
# 加新条目

# 3. 重启容器使配置生效
docker restart authelia
```

### 模板 G — 重置用户 TOTP / WebAuthn

用户丢手机时管理员重置：

```bash
docker exec -it authelia authelia storage user totp delete <username>
docker exec -it authelia authelia storage user webauthn list
docker exec -it authelia authelia storage user webauthn delete <id>
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU |
|---|---|---|
| < 10 | 30 MB | 极低 |
| < 100 | 50 MB | 极低 |
| < 1k | 100 MB | 1% |
| > 1k | 用 LDAP 后端 + Redis session | – |

### Session 调优

```yaml
session:
  inactivity: 5m         # 5 分钟无活动失效（**默认偏严**，可改 1h）
  expiration: 1h         # 强制超时
  remember_me: 1M        # "记住我"勾选后 1 个月（=2592000s）
```

### Brute-force 调优

```yaml
regulation:
  max_retries: 3         # 失败 3 次
  find_time: 2m          # 在 2 分钟内
  ban_time: 5m           # 封 5 分钟
```

公网部署调严：max_retries 5 / find_time 5m / ban_time 30m。

### 性能

```yaml
# Authelia 是无状态服务（只依赖 sqlite / cookie）
# 多实例用共享 PG / MySQL + Redis session
storage:
  postgres:
    host: postgres
    port: 5432
    database: authelia
    username: authelia
    password: ...
session:
  redis:
    host: redis
    port: 6379
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu/Debian | ✅ |
| RHEL 9 / Anolis 9 | ✅ |
| ARM64（树莓派） | ✅（多架构镜像） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — **核心配合**——Authelia 只作 forward-auth 后端，靠反代生效
- **`traefik-proxy`** — 替代 nginx（forwardAuth middleware 更简洁）
- **`caddy-server`** — 同样支持 forward_auth directive
- **`keycloak` / `authentik`** — 互补（如果还需要 OIDC provider 给外部 SaaS）

## 排错

### 容器一直重启 / 配置错

```bash
docker logs authelia | head -50
# 最常见：configuration.yml YAML 缩进错 / secret < 32 字符 / domain 不匹配

# 验证配置
docker exec authelia authelia validate-config /config/configuration.yml
```

### 登录后跳一直回登录页（cookie 不工作）

```bash
# 1. session.cookies.domain 与受保护应用是同一根域吗？
grep -A3 cookies /opt/authelia/config/configuration.yml
# domain: 'example.com'      ← 必须是 .example.com 或 example.com

# 2. Authelia 在 example.com 子域下吗？
# auth.example.com ✓
# auth.different.com ✗

# 3. HTTPS 启用了吗？same_site=lax 要求 HTTPS
```

### `Failed to verify auth via /api/verify`

nginx forward-auth 配错。检查：

```bash
# 1. nginx 配的 location /authelia 没漏
grep -A10 'location /authelia' /etc/nginx/sites-enabled/*

# 2. proxy_pass 端口对吗？
# Authelia 容器 host:9091 → 127.0.0.1:9091 还是 docker network IP

# 3. include snippets 都加了吗？
nginx -T 2>/dev/null | grep authelia
```

### TOTP code 总不对

```bash
# 服务器时间不准（TOTP 时间敏感）
timedatectl status

# 修：
sudo timedatectl set-ntp true
```

### WebAuthn 注册失败

WebAuthn 要求 HTTPS（含 localhost 例外）。

```bash
# 验证：浏览器开发者工具 console
# 看是否有 SecurityError
```

### 忘了 admin 密码

```bash
# 1. 生成新 hash
docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'NewPass'

# 2. 改 users_database.yml 替换 password 字段

# 3. 重启
docker restart authelia
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=authelia

# 2. API health
curl -fsS http://127.0.0.1:9091/api/health
# {"status":"OK"}

# 3. 配置验证
docker exec authelia authelia validate-config /config/configuration.yml
# Configuration parsed and loaded successfully without errors.

# 4. 登录页响应
curl -fsS http://127.0.0.1:9091/ -o /dev/null -w '%{http_code}\n'
# 200
```

## 多次运行

`installMode: skip-existing`。`configuration.yml` 每次重写——**手动加的 access_control 规则会被覆盖**。复杂规则建议直接编辑该文件后只 `docker restart authelia`，不要重跑 Playbook。`users_database.yml` 同样会被重写——加用户也是手动编辑后重启。

`data/db.sqlite3` **不动**（保留 TOTP / WebAuthn 注册）。

## ⚠️ 敏感性

**privileged** — Authelia 看到所有受保护应用的认证流。

强制：

1. **公网必须 HTTPS**（WebAuthn / SameSite cookie 要求）
2. 3 个 secret 至少 32 字符 + 长期保密
3. `default_policy: deny` + 白名单 rules（已是 Playbook 默认）
4. 所有公网应用至少 `one_factor`，敏感应用 `two_factor`
5. 邮件 SMTP 用 app password（Gmail）/ API token（SendGrid），别用主账号密码
6. 备份 `data/db.sqlite3` —— 含所有用户 TOTP / WebAuthn 注册

## 隐私说明

- 用户 + 凭据 hash + TOTP secret + WebAuthn 全在本地 SQLite
- **无遥测**（开源）
- 邮件通知走配置的 SMTP（看你选哪家）
- LDAP 后端时 bind password 需配置——Authelia 缓存而非反复查
