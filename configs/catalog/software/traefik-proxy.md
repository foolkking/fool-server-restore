# Traefik 反向代理

Traefik 是云原生反向代理（v3）。比 nginx 最大优势：**自动发现路由**——跑新 Docker 容器时加几个 label，Traefik 立刻代理它，不用改配置文件。ACME / Let's Encrypt 内置，无需手动跑 certbot。

## 你将得到什么

- ✅ Traefik v3 二进制装到 `/usr/local/bin/traefik`
- ✅ systemd 单元 + 专用 `traefik` 用户
- ✅ 静态配置 `/etc/traefik/traefik.yml`：80/443 entrypoint + dashboard + ACME + file/docker provider
- ✅ ACME 证书存储 `/var/lib/traefik/acme.json`（权限 600）
- ✅ 动态配置目录 `/etc/traefik/dynamic/` 准备好（自动 watch 重载）
- ✅ 80 → 443 自动跳转
- ✅ Access log 输出到 `/var/log/traefik/access.log`（JSON 格式）

## 表单字段说明

### `acme_email`

ACME 协议要求注册邮箱，证书快过期且续签失败时通知。**务必真实邮箱**。

### `dashboard_port`

Traefik web 管理面板端口，默认 8080。

### `dashboard_enable_insecure`

| 值 | 适用 |
|---|---|
| ❌ 关闭（**默认**） | dashboard 通过 HTTPS + auth router 访问。**生产正确选择** |
| ✅ 开启 | dashboard 端口裸暴露。仅开发测试 + 防火墙限本机时用 |

### `enable_docker`

启用 Docker provider——Traefik 自动发现带 traefik label 的容器。要求 traefik 用户在 `docker` 组。

## 配置文件 / 目录速查

```
/etc/traefik/
├── traefik.yml                          # ← 静态配置（启动时加载，改要重启）
├── dynamic/                              # ← 动态配置目录（**改不用重启**，watch reload）
│   ├── routers.yml
│   ├── middlewares.yml
│   └── services.yml
└── certs/                                # 自定义证书（非 ACME）

/var/lib/traefik/
├── acme.json                             # ← Let's Encrypt 证书数据库（权限 600）
└── tls/                                   # 用户上传 TLS 证书

/var/log/traefik/
├── traefik.log                           # 主日志
└── access.log                             # 访问日志（JSON）

/usr/local/bin/traefik                    # 二进制
/usr/lib/systemd/system/traefik.service    # systemd unit
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制下载（无包） | 二进制下载 |
| 二进制 | `/usr/local/bin/traefik` | 相同 |
| 服务 / 用户 | `traefik` | `traefik` |
| Docker 集成 | `usermod -aG docker traefik` | 同 |

## 常见配置模板

### 模板 A — 推荐 `/etc/traefik/traefik.yml`（静态配置）

```yaml
# ====== 全局 ======
global:
  checkNewVersion: false                 # 不向 Traefik 中央查询版本
  sendAnonymousUsage: false              # 不发遥测

# ====== Entry Points ======
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true                 # 80 → 443

  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
      middlewares:
        - secure-headers@file

  metrics:
    address: ":8082"                       # Prometheus scrape

  # 可选：传统应用走 :8081
  # legacy:
  #   address: ":8081"

# ====== Providers ======
providers:
  # File provider（动态配置）
  file:
    directory: /etc/traefik/dynamic/
    watch: true                              # 文件改动自动重载

  # Docker provider（自动发现容器）
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false                   # 仅 traefik.enable=true 的容器
    network: traefik-net                       # 共享网络名（容器需加入）
    watch: true

  # Kubernetes（如有 k8s）
  # kubernetesIngress:
  #   ingressClass: traefik

# ====== ACME (Let's Encrypt) ======
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /var/lib/traefik/acme.json
      caServer: "https://acme-v02.api.letsencrypt.org/directory"
      # caServer: "https://acme-staging-v02.api.letsencrypt.org/directory"   # 测试用

      # HTTP-01 challenge（最简单，需要 80 端口对外）
      httpChallenge:
        entryPoint: web

      # 或 DNS-01 challenge（需 DNS provider API）
      # dnsChallenge:
      #   provider: cloudflare
      #   delayBeforeCheck: 30

      # 或 TLS-ALPN-01（443 端口对外）
      # tlsChallenge: {}

# ====== API + Dashboard ======
api:
  dashboard: true
  insecure: false                            # 生产关闭（用 router + auth）

# ====== 日志 ======
log:
  level: INFO                                # DEBUG / INFO / WARN / ERROR
  filePath: /var/log/traefik/traefik.log
  format: json

accessLog:
  filePath: /var/log/traefik/access.log
  format: json
  filters:
    statusCodes:
      - "400-599"                              # 仅记录错误状态码
  bufferingSize: 100

# ====== Metrics（Prometheus）======
metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addServicesLabels: true
    buckets:
      - 0.1
      - 0.3
      - 1.2
      - 5.0

# ====== Tracing（可选）======
# tracing:
#   jaeger:
#     samplingServerURL: http://jaeger:5778/sampling

# ====== Pilot（关闭，已废弃）======
pilot:
  dashboard: false

# ====== ServersTransport（自签证书后端）======
serversTransport:
  insecureSkipVerify: false                   # 生产保持 false

# ====== HTTP/3 + QUIC（可选）======
# experimental:
#   http3: true
```

应用：`sudo systemctl restart traefik`。

### 模板 B — 安全 Header 中间件 `/etc/traefik/dynamic/middlewares.yml`

```yaml
http:
  middlewares:
    secure-headers:
      headers:
        sslRedirect: true
        forceSTSHeader: true
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        contentTypeNosniff: true
        browserXssFilter: true
        referrerPolicy: "strict-origin-when-cross-origin"
        permissionsPolicy: "camera=(), microphone=(), geolocation=()"
        contentSecurityPolicy: "default-src 'self'"
        frameDeny: true

    # Basic auth
    admin-auth:
      basicAuth:
        users:
          - "admin:$apr1$xxxxx..."             # htpasswd -nB admin

    # Rate limit
    rate-limit:
      rateLimit:
        average: 100
        burst: 200
        period: 1s

    # IP 白名单
    internal-only:
      ipWhiteList:
        sourceRange:
          - "10.0.0.0/8"
          - "192.168.0.0/16"

    # 删除 Server header（不暴露 Traefik 版本）
    no-server-header:
      headers:
        customResponseHeaders:
          Server: ""
```

### 模板 C — File Provider 给非 Docker 服务路由

`/etc/traefik/dynamic/myapp.yml`:

```yaml
http:
  routers:
    myapp:
      rule: "Host(`app.example.com`)"
      service: myapp-svc
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      middlewares:
        - rate-limit@file
        - secure-headers@file

    myapp-www-redirect:
      rule: "Host(`www.example.com`)"
      service: noop@internal
      middlewares:
        - to-non-www-redirect@file

  services:
    myapp-svc:
      loadBalancer:
        servers:
          - url: "http://10.0.0.10:3000"
          - url: "http://10.0.0.11:3000"
        passHostHeader: true
        sticky:
          cookie:
            name: server_cookie
            secure: true
            httpOnly: true
        healthCheck:
          path: /healthz
          interval: 10s
          timeout: 3s

  middlewares:
    to-non-www-redirect:
      redirectRegex:
        regex: "^https?://www\\.example\\.com/(.*)"
        replacement: "https://example.com/$1"
        permanent: true
```

Traefik 自动重载，几秒后生效。

### 模板 D — Docker Labels 自动发现

```yaml
# docker-compose.yml
services:
  myapp:
    image: myapp:latest
    networks:
      - traefik-net
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-net"
      - "traefik.http.routers.myapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.routers.myapp.middlewares=rate-limit@file,secure-headers@file"
      - "traefik.http.services.myapp.loadbalancer.server.port=3000"
      - "traefik.http.services.myapp.loadbalancer.healthcheck.path=/healthz"
      - "traefik.http.services.myapp.loadbalancer.healthcheck.interval=10s"

networks:
  traefik-net:
    external: true
```

需先创建共享网络：

```bash
docker network create traefik-net
sudo systemctl restart traefik    # 重新连接 docker socket
```

`docker compose up -d`，Traefik 立刻代理。

### 模板 E — 暴露 Dashboard（HTTPS + Auth）

`/etc/traefik/dynamic/dashboard.yml`:

```yaml
http:
  routers:
    dashboard:
      rule: "Host(`traefik.example.com`)"
      service: api@internal
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      middlewares:
        - dashboard-auth@file
        - internal-only@file              # 仅内网 IP

  middlewares:
    dashboard-auth:
      basicAuth:
        users:
          - "admin:$apr1$..."             # htpasswd -nB admin（输入两次密码）
        removeHeader: true                  # 不传给后端
```

### 模板 F — DNS-01 ACME（适合 wildcard 证书）

```yaml
# traefik.yml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /var/lib/traefik/acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

```bash
# /etc/systemd/system/traefik.service.d/override.conf
sudo systemctl edit traefik

[Service]
Environment="CF_API_EMAIL=you@example.com"
Environment="CF_DNS_API_TOKEN=cloudflare-api-token-with-zone-edit"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart traefik
```

申请 wildcard：

```yaml
# /etc/traefik/dynamic/wildcard.yml
http:
  routers:
    catch-all:
      rule: "HostRegexp(`{sub:.+}.example.com`)"
      service: ...
      tls:
        certResolver: letsencrypt
        domains:
          - main: "example.com"
            sans:
              - "*.example.com"
```

## 关键参数调优速查

### 性能

| 参数 | 默认 | 推荐 |
|---|---|---|
| `entryPoints.web.transport.respondingTimeouts.readTimeout` | 60s | 30s |
| `entryPoints.web.transport.respondingTimeouts.idleTimeout` | 180s | 60s |
| `serversTransport.maxIdleConnsPerHost` | 200 | 500（高并发） |

```yaml
entryPoints:
  websecure:
    address: ":443"
    transport:
      respondingTimeouts:
        readTimeout: 30s
        writeTimeout: 30s
        idleTimeout: 60s
```

### Worker / GOMAXPROCS

Traefik 用 Go runtime，自动按 CPU 核数。容器里需手动：

```ini
# systemd unit Environment
Environment="GOMAXPROCS=4"
```

### 资源占用

| 部署 | RAM | CPU |
|---|---|---|
| 个人（10 service） | 50 MB | < 1% |
| 中型（100 service） | 200 MB | 1-5% |
| 大型（1000 service） | 1 GB | 5-15% |

## 跨发行版兼容

二进制安装跨发行版一致。

| 平台 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| Anolis 9 | ✅ |
| Alpine | 用 `traefik:v3-alpine` Docker |
| ARM64 | ✅（Playbook 自动选 arm64 二进制） |

## 与其它 catalog 项的配合

- **`nginx-web-service` / `haproxy-lb` / `openresty`** — **互斥**（争 80/443）
- **`docker-host-profile`** — Docker provider 自动发现容器（模板 D）
- **`certbot-ssl`** — 不用——Traefik 内置 ACME，certbot 多余
- **`prometheus-monitoring`** — Traefik 自带 `/metrics`（端口 8082，模板 A）
- **`grafana-dashboard`** — 有现成 Traefik dashboard（Grafana ID: 17347）

## 排错

### `bind: address already in use`

80/443 被 nginx/apache 占了：

```bash
sudo ss -tlnp | grep -E ':(80|443) '
sudo systemctl stop nginx                # 或 apache2 / httpd
sudo systemctl start traefik
```

### ACME 证书签不下来

```bash
# 看 Traefik 日志
sudo journalctl -u traefik -n 100 | grep -i acme

# 常见
# 1. 域名 DNS 没指向本机
dig +short example.com

# 2. 80 端口防火墙没开（HTTP-01 challenge 需要）
sudo ufw status

# 3. acme.json 权限不是 600
sudo chmod 600 /var/lib/traefik/acme.json
sudo chown traefik:traefik /var/lib/traefik/acme.json

# 4. Let's Encrypt rate limit（每周 50 个证书 / 同 domain）
# 切到 staging 测试：caServer 改 acme-staging-v02
```

### Docker provider 不工作

```bash
# Traefik 用户能读 docker.sock？
sudo usermod -aG docker traefik
sudo systemctl restart traefik

# 或用 socket proxy（更安全）
docker run -d --name socket-proxy \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CONTAINERS=1 \
  tecnativa/docker-socket-proxy

# Traefik 改用 tcp://socket-proxy:2375
```

### `404 page not found` 但 router 存在

```bash
# 1. 看 Traefik 是否识别了 router
curl http://localhost:8080/api/http/routers

# 2. 规则匹配？
# 浏览器请求 Host header 与 router rule 一致

# 3. 看 access log
sudo tail -f /var/log/traefik/access.log
```

### `Bad Gateway` (502)

```bash
# 后端不通
curl http://10.0.0.10:3000/healthz

# 网络隔离（Docker）
docker exec traefik ping myapp

# 看 Traefik 报错
sudo journalctl -u traefik -n 50 | grep -i error
```

### Dashboard 401 / 无权访问

中间件 basicAuth 配置：

```bash
# 生成 hash
htpasswd -nB admin

# 注意 docker-compose.yml 中 $ 必须双 $$ 转义
```

### HTTP/2 / WebSocket 失败

```yaml
# entryPoints.websecure 默认支持 H2，如关了重启
```

### 性能差 / 高 CPU

```bash
# 1. 关 access log（DEBUG 级别）
log:
  level: WARN

# 2. 关 access log filtering（statusCodes 不写表示全部）

# 3. ACME staging 测试时签太多证书 + 重启 → 限流
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active traefik

# 2. 端口
sudo ss -tlnp | grep -E ':(80|443|8080) '

# 3. 配置语法 + 启动测试
sudo -u traefik /usr/local/bin/traefik --configFile=/etc/traefik/traefik.yml --validate

# 4. 默认请求（无 router 时返回 404）
curl http://localhost                     # 404 page not found

# 5. ACME 状态
sudo cat /var/lib/traefik/acme.json | jq '.letsencrypt.Certificates[].domain'

# 6. API
curl http://localhost:8080/api/version
curl http://localhost:8080/api/http/routers | jq

# 7. Metrics
curl http://localhost:8082/metrics | head
```

## 多次运行

`installMode: skip-existing`。二进制下载有 `creates` 守卫。**`/etc/traefik/traefik.yml` 每次按表单值重写**——但 `/etc/traefik/dynamic/` 下的用户文件**保留**（推荐把所有动态路由放这里）。

要升级 Traefik：

```bash
TRAEFIK_VER=v3.2.0
curl -L "https://github.com/traefik/traefik/releases/download/${TRAEFIK_VER}/traefik_${TRAEFIK_VER}_linux_amd64.tar.gz" -o /tmp/traefik.tar.gz
sudo tar -xzf /tmp/traefik.tar.gz -C /tmp/
sudo systemctl stop traefik
sudo mv /tmp/traefik /usr/local/bin/traefik
sudo systemctl start traefik
```

## ⚠️ 敏感性

**review** — 占用 80/443，**不能与 nginx/apache/haproxy 同机**。Dashboard 含敏感运维信息（路由 / 证书 / 后端列表）。

强制：

1. Dashboard 必须 HTTPS + auth + IP 白名单（模板 E）
2. `acme.json` 权限 600（含私钥）
3. Docker provider 时 traefik 用户加 docker 组——等同 root（**慎用**），生产用 socket proxy
4. DNS-01 ACME 时 API token 仅授最小权限（zone:read + DNS:edit）

## 隐私说明

- `acme.json` 含**所有 Let's Encrypt 私钥**（明文 JSON，权限 600）
- access.log 含**每个请求的 IP / Host / URL / 状态码**——按合规需求处理
- Traefik 已设 `sendAnonymousUsage: false`（默认会发匿名使用统计）
- ACME 协议要求注册邮箱给 Let's Encrypt（不公开但 LE 持有）
- Docker provider 通过 socket 能看到所有容器配置（含 env 变量，可能含密码）——隔离风险高
