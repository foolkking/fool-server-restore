# SSO 单点登录中央认证

**给所有自托管应用一个统一登录入口**——Authelia + Traefik forward-auth + Redis session store 三件套。**适合**：家庭 / 小团队 / 自托管玩家——保护 Nextcloud / Wiki.js / Grafana / Portainer / Jellyfin 等所有应用，**只需要登一次**。WebAuthn / TOTP 2FA + 暴力破解保护内置。

## 你将得到什么

完整 SSO 栈一键部署：

- 📦 **Traefik v3** — 反向代理 + 自动 LE HTTPS（接管 80 / 443）
- 📦 **Authelia** — 主认证后端（登录页 / 2FA / 用户管理）
- 📦 **Redis 7** — 共享 session store（多浏览器跳转保持登录）
- ✅ Web 登录入口：`https://auth.example.com`
- ✅ Traefik 中间件 `authelia-auth@docker` 即用——其他应用加一个 label 就受保护
- ✅ 默认策略 deny + 显式 rules（白名单模式）
- ✅ Brute-force 保护（3 次失败封 5 分钟）
- ✅ TOTP（Google Authenticator）+ WebAuthn（YubiKey / Touch ID）
- ✅ 自动 LE 证书 + 续期（Traefik tlsChallenge）

## 表单字段说明

### `ss_auth_domain`

Authelia 自身访问域名。

⚠️ **必须是受保护根域的子域**——cookie 共享要求。

```
受保护:  *.example.com
Authelia: auth.example.com  ✅
Authelia: auth.different.com ❌
```

### `ss_protected_domain`

要应用 SSO 的根域。所有 `*.example.com` 子域应用一加 Traefik label 就受保护。

### `ss_admin_user` / `ss_admin_password`

首个管理员。后续加用户：

```bash
# 1. 生成 hash
docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'NewPass'

# 2. 加用户
sudo vi /opt/sso-stack/authelia/config/users_database.yml
# 复制 admin 块改名

# 3. 重启
docker restart authelia
```

### `ss_jwt_secret` / `ss_session_secret` / `ss_storage_secret`

3 个独立 secret（最低 32 字符）—— 见 [authelia.md 表单字段](../software/authelia.md#表单字段说明) 详细说明。

### `ss_acme_email`

Traefik 用此邮箱向 LE 注册账号（接续期失败 / 即将过期通知）。

### `ss_data_dir`

```
{data_dir}/
├── authelia/
│   ├── config/
│   │   ├── configuration.yml
│   │   └── users_database.yml
│   └── data/
│       └── db.sqlite3                # **重要**——TOTP / WebAuthn keys
├── traefik/
│   └── letsencrypt/
│       └── acme.json                 # **敏感**——LE account key + cert
└── redis-data/
    └── dump.rdb
```

## 配置文件 / 目录速查

```
docker network: sso-stack_sso          # 应用要加入此 network
traefik 容器:    监听 80 + 443
authelia 容器:   内部 9091
redis 容器:      内部 6379

# Traefik 中间件可用名:
# authelia-auth@docker
```

## 常见配置模板

### 模板 A — 给应用加 SSO 保护（Docker label 方式）

最快——给已有 docker-compose.yml 加几行 label：

```yaml
# 应用的 docker-compose.yml
networks:
  default:
  sso:
    external: true
    name: sso-stack_sso       # ← 必须连到这个网络

services:
  myapp:
    image: nginx
    networks:
      - default
      - sso                    # ← 加入 SSO 网络
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=sso-stack_sso"
      - "traefik.http.routers.myapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=le"
      - "traefik.http.routers.myapp.middlewares=authelia-auth@docker"
      - "traefik.http.services.myapp.loadbalancer.server.port=80"
```

启动：

```bash
docker compose up -d
```

访问 `https://app.example.com` → 自动跳到 Authelia → 登录后才进 myapp。

### 模板 B — 跑现有 catalog 项时加 SSO

修改对应 catalog 项的 docker-compose.yml（如 `nextcloud`）：

```yaml
networks:
  default:
  sso:
    external: true
    name: sso-stack_sso

services:
  nextcloud:
    # ... 原有配置 ...
    networks:
      - default
      - sso
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nextcloud.rule=Host(`cloud.example.com`)"
      - "traefik.http.routers.nextcloud.entrypoints=websecure"
      - "traefik.http.routers.nextcloud.tls.certresolver=le"
      - "traefik.http.routers.nextcloud.middlewares=authelia-auth@docker"
      - "traefik.http.services.nextcloud.loadbalancer.server.port=80"
    # 删除原有 ports（端口由 Traefik 管理）
```

### 模板 C — 精细化访问控制

`/opt/sso-stack/authelia/config/configuration.yml` 的 `access_control:` 段：

```yaml
access_control:
  default_policy: deny
  rules:
    # Authelia 自身免认证（递归保护会循环）
    - domain: 'auth.example.com'
      policy: bypass

    # 公开页面
    - domain: ['blog.example.com', 'docs.example.com']
      policy: bypass

    # 普通保护（密码即可）
    - domain: ['wiki.example.com', 'media.example.com']
      policy: one_factor

    # 高敏感（必须 2FA）
    - domain: ['admin.example.com', 'cockpit.example.com', 'portainer.example.com']
      policy: two_factor

    # 仅 admins 组能访问
    - domain: 'router.example.com'
      policy: two_factor
      subject:
        - 'group:admins'

    # 内网 IP 直连免认证（不出门时方便）
    - domain: 'monitoring.example.com'
      policy: bypass
      networks:
        - 192.168.1.0/24
```

改完重启：

```bash
docker restart authelia
```

### 模板 D — 加用户 + 分组

```bash
# 1. 生成密码 hash
PASS=$(docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'AlicePass123' | grep -oP 'Digest:\s*\K.*')

# 2. 编辑 users_database.yml
sudo tee -a /opt/sso-stack/authelia/config/users_database.yml <<EOF
  alice:
    disabled: false
    displayname: "Alice"
    password: "$PASS"
    email: alice@example.com
    groups:
      - dev
EOF

# 3. 重启
docker restart authelia
```

`groups` 控制访问哪些应用（见模板 C 的 `subject:` 规则）。

### 模板 E — 启用邮件通知（密码重置 / 验证码）

```yaml
# /opt/sso-stack/authelia/config/configuration.yml
notifier:
  smtp:
    address: 'submission://smtp.gmail.com:587'
    username: 'you@gmail.com'
    password: '<gmail-app-password>'   # myaccount.google.com/apppasswords
    sender: 'Authelia <noreply@example.com>'

# 删 notifier.filesystem 段
```

### 模板 F — 用户首次登录设 2FA

1. 用户访问受保护应用
2. 跳到 `https://auth.example.com`
3. 输入用户名 + 密码
4. **第一次登录**: 提示设 TOTP / WebAuthn
5. TOTP: 用 Google Authenticator / Authy 扫二维码
6. WebAuthn: YubiKey / 系统 PassKey（iOS Touch ID / Windows Hello / 等）

之后所有应用都用此 2FA。

### 模板 G — 重置用户 2FA（用户丢手机）

```bash
# 看用户的 TOTP / WebAuthn
docker exec -it authelia authelia storage user totp list
docker exec -it authelia authelia storage user webauthn list

# 删（用户下次登录会被要求重新注册）
docker exec -it authelia authelia storage user totp delete <username>
docker exec -it authelia authelia storage user webauthn delete <id>
```

### 模板 H — 备份

```bash
#!/bin/bash
# /etc/cron.daily/sso-backup
DEST=backup@nas:/backup/sso/

# 配置 + Authelia DB + Redis dump
sudo rsync -az --delete /opt/sso-stack/ "$DEST/"
```

恢复（新机器）：

```bash
sudo rsync -az "$DEST/" /opt/sso-stack/
cd /opt/sso-stack
docker compose up -d
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM（总栈）| CPU |
|---|---|---|
| < 10 | 300 MB | 极低 |
| < 100 | 500 MB | 1% |
| < 1k | 1 GB | 2% |
| > 1k | 用 LDAP / 加 Redis sentinel | – |

### Session 调优

```yaml
session:
  inactivity: 5m       # 5 分钟无活动失效（公网严格） / 1h（内网宽松）
  expiration: 1h       # 强制超时
  remember_me: 1M      # "记住我"勾选后 1 个月
```

### Brute-force 调优

```yaml
regulation:
  max_retries: 3       # 连续失败 N 次
  find_time: 2m        # 在窗口内
  ban_time: 5m         # 封多久（公网调到 1h）
```

### LE rate limit

LE 默认每周 50 个证书 / 域名。Traefik 自动管。**注意**：

- 每加一个新 `*.example.com` 子域 = 1 个证书
- 如果短时间加 50+ 个应用 → 触发 LE rate limit → 7 天禁用
- 解：用 wildcard 证书（DNS challenge，配 DNS provider API）

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64（树莓派 / Apple Silicon） | ✅ |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`certbot-ssl`** — **不需要**（Traefik 自带 ACME）
- **`nginx-web-service` / `caddy-server`** — **互斥**（Traefik 接管 80 + 443）
- **`firewall-baseline`** — 配合放行 80 + 443
- **`authelia` / `keycloak` / `authentik`** — 重叠（本 combo 是 Authelia 完整部署，独立 software 项更简单）
- **应用接入**：`nextcloud` / `wikijs` / `bookstack` / `grafana-dashboard` / `portainer` / `n8n` / `home-assistant` / 等都可加 Docker label 接入

## 排错

### Traefik 拿不到证书

```bash
docker logs traefik | grep -i acme

# 常见：
# - DNS 没指向本机 IP → 检查 dig
# - 80 端口公网通？(LE TLS-ALPN-01 challenge 用 443)
# - LE rate limit hit → 用 staging 测：
#   --certificatesresolvers.le.acme.caServer=https://acme-staging-v02.api.letsencrypt.org/directory
```

### 应用没被保护（直接进了应用页面）

```bash
# 1. middleware label 写对了？
docker inspect <app-container> | grep -A2 middlewares
# 应有 authelia-auth@docker

# 2. 应用容器在 sso-stack_sso 网络里？
docker network inspect sso-stack_sso

# 3. Traefik 看到此 router 了？
docker logs traefik | grep <app-host>

# 4. Traefik dashboard（如启用）：
# 访问 traefik 容器的 8080 端口看 routers / middlewares
```

### Authelia 登录后跳一直回登录页

- cookie domain 不对 → `ss_protected_domain` 必须是受保护应用域的根域
- HTTPS 缺失 → SameSite=lax 要求 HTTPS
- 浏览器禁第三方 cookie：Authelia 在不同域名下的 cookie 在某些浏览器（Safari）下会失败

### 单 Authelia 重启后用户被踢

正常——session 在 Redis。如果 Redis 也重启 → session 丢。

预防：

```yaml
# Redis 容器加持久化
command: redis-server --save 60 1 --appendonly yes
```

### TOTP 总不对

服务器时间不准：

```bash
sudo timedatectl status
sudo systemctl enable --now systemd-timesyncd
```

容器内时间：

```bash
docker exec authelia date
docker exec sso-redis date
# 与宿主机一致
```

### LE 证书续期失败

```bash
docker logs traefik | grep -i renew

# 强制重续（不影响现有证书）
sudo rm /opt/sso-stack/traefik/letsencrypt/acme.json
docker restart traefik
# 等几分钟
```

## 验证

```bash
# 1. 三个容器跑着
docker ps --filter name=traefik --filter name=authelia --filter name=sso-redis

# 2. 80 / 443 监听
sudo ss -tlnp | grep -E ':(80|443) '

# 3. 证书签了
sudo cat /opt/sso-stack/traefik/letsencrypt/acme.json | jq '.le.Certificates[].domain'

# 4. Authelia 健康
docker exec authelia wget -qO- http://127.0.0.1:9091/api/health
# {"status":"OK"}

# 5. Redis 健康
docker exec sso-redis redis-cli ping
# PONG

# 6. 登录测试
# 浏览器 https://auth.example.com → 输入 admin / 密码 → 设置 TOTP → 登录成功
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` + `Caddyfile` + Authelia 配置每次按表单值重写——**`users_database.yml` 内的额外用户被覆盖**。复杂用户管理建议直接编辑 yaml + 重启容器，不要重跑 Playbook。Authelia SQLite + Redis dump + LE 证书全部保留。

## ⚠️ 敏感性

**privileged** — SSO 攻陷 = 所有受保护应用全失守。

强制：

1. **公网必须 HTTPS**（Traefik 已强制 80 → 443 跳）
2. 3 个 secret 至少 32 字符（已自动生成 64 字符 hex）
3. `default_policy: deny` + 显式白名单（已是 Playbook 默认）
4. 高敏感应用 `two_factor`，普通 `one_factor`
5. **每日备份** `data/`（含 TOTP / WebAuthn keys）
6. SMTP 用 app password / API token（Gmail / SendGrid），别用主账号
7. Traefik dashboard 默认关闭（这里没启用——避免暴露路由信息）

## 隐私说明

- 所有用户 / 凭据 / TOTP secret / WebAuthn key 在本地 SQLite
- Redis session 包含**当前活跃用户的状态**（攻陷 Redis = 拿到所有 session token，能伪装登录）—— 备份加密
- LE 证书包含所有受保护域名（公开 cert log 可查——**这是 LE 设计本身，不是泄露**）
- **零遥测**（Authelia / Traefik / Redis 都开源 + 无遥测）
- 邮件通知按你配置的 SMTP 走（按需选信任的）
