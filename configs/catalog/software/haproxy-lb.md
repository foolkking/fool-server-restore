# HAProxy 负载均衡器

HAProxy 是高性能 TCP/HTTP 负载均衡器，**生产环境跑了 20 年**。比 nginx 在纯转发场景性能更好（专注 LB，无静态文件服务包袱），监控面板更详细，但配置语法陡（不是 nginx 的 `server { }` 风格）。

## 你将得到什么

- 📦 **haproxy** 包（来自发行版仓库）
- ✅ `/etc/haproxy/haproxy.cfg` 写好基础结构（global / defaults / stats / frontend / backend）
- ✅ Stats 监控页（账号密码保护，端口 8404）
- ✅ 一个 backend 占位（指向表单填的 IP:port）
- ✅ 服务自动启动 + 开机自启
- ✅ rsyslog 集成（日志写 `/var/log/haproxy.log`）

## 表单字段说明

### `frontend_port`

客户端入口。HTTP 用 80，HTTPS 用 443（443 还要在 cfg 加 `bind *:443 ssl crt ...`）。

### `backend_addresses`

第一个上游 `IP:port`。多机 LB 需手动在 cfg 追加 `server srv1 ... server srv2 ...`。

### `stats_port` / `stats_user` / `stats_password`

stats 页配置。**默认 8404 不要公网暴露**——防火墙限本机或运维 IP。

### `mode`

| 值 | 用途 |
|---|---|
| `http` | HTTP/1.1 应用层代理（推荐） |
| `tcp` | 透传 TCP（如 MySQL / Redis 流量） |

## 配置文件 / 目录速查

```
/etc/haproxy/
├── haproxy.cfg                    # ← 主配置（全部 global/defaults/frontend/backend 在一个文件）
├── conf.d/                         # 自定义片段（需 cfg 里 include）
├── certs/                          # SSL 证书目录（合并 fullchain+privkey 的 .pem）
└── errors/                         # 自定义错误页（HTML）

/var/lib/haproxy/                  # 运行时 chroot 目录（默认）
/run/haproxy/admin.sock             # 管理员 socket（API 接入）
/var/log/haproxy.log                # 主日志（rsyslog 写）
/etc/rsyslog.d/49-haproxy.conf      # rsyslog 配置

# systemd
/lib/systemd/system/haproxy.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `haproxy` | `haproxy` |
| 服务名 | `haproxy` | `haproxy` |
| 默认仓库版本 | Ubuntu 22 = 2.4，Ubuntu 24 = 2.8（推荐 LTS） | RHEL 9 / Anolis 9 = 2.4 |
| 装最新版 | `apt install haproxy=2.8.\*` 或 ppa | RHEL 系装 EPEL 上的 `haproxy26` 等 |
| 默认运行用户 | `haproxy` | `haproxy` |

## 常见配置模板

### 模板 A — 推荐 `/etc/haproxy/haproxy.cfg`（生产基线）

```haproxy
#---------------------------------------------------------------------
# Global settings
#---------------------------------------------------------------------
global
    log         /dev/log local0
    log         /dev/log local1 notice
    chroot      /var/lib/haproxy
    pidfile     /run/haproxy.pid
    maxconn     50000
    user        haproxy
    group       haproxy
    daemon

    # SSL / TLS（现代化 cipher）
    ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

    # Runtime API（动态修改配置不需重启）
    stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
    stats timeout 30s

#---------------------------------------------------------------------
# defaults — 所有 frontend/backend 共享
#---------------------------------------------------------------------
defaults
    mode                    http
    log                     global
    option                  httplog
    option                  dontlognull
    option                  http-server-close
    option                  forwardfor       except 127.0.0.0/8
    option                  redispatch
    retries                 3
    timeout http-request    10s
    timeout queue           1m
    timeout connect         10s
    timeout client          1m
    timeout server          1m
    timeout http-keep-alive 10s
    timeout check           10s
    maxconn                 30000
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

#---------------------------------------------------------------------
# Stats 页（监控面板）
#---------------------------------------------------------------------
listen stats
    bind *:8404
    stats enable
    stats uri /
    stats refresh 10s
    stats admin if TRUE
    stats auth admin:STRONG-PASSWORD
    stats hide-version

#---------------------------------------------------------------------
# 前端：HTTP（80 → 443 跳转）
#---------------------------------------------------------------------
frontend http_in
    bind *:80
    redirect scheme https code 301 if !{ ssl_fc }

#---------------------------------------------------------------------
# 前端：HTTPS
#---------------------------------------------------------------------
frontend https_in
    bind *:443 ssl crt /etc/haproxy/certs/

    # 安全 header
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    http-response set-header X-Content-Type-Options nosniff
    http-response set-header X-Frame-Options DENY

    # ACL 路由（按 host / path 分流）
    acl is_api          path_beg /api/
    acl is_admin        hdr(host) -i admin.example.com
    acl is_main         hdr(host) -i www.example.com

    # 限流（per IP）
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny if { sc_http_req_rate(0) gt 100 }

    use_backend api_backend     if is_api
    use_backend admin_backend   if is_admin
    default_backend             web_backend

#---------------------------------------------------------------------
# 后端
#---------------------------------------------------------------------
backend web_backend
    balance roundrobin
    option httpchk GET /healthz
    http-check expect status 200
    cookie SERVERID insert indirect nocache    # session 粘性（可选）
    server web1 10.0.0.10:3000 check cookie web1 inter 5s rise 2 fall 3 weight 100
    server web2 10.0.0.11:3000 check cookie web2 inter 5s rise 2 fall 3 weight 100
    server web3 10.0.0.12:3000 check cookie web3 backup        # 备用，全挂才启用

backend api_backend
    balance leastconn               # API 用最少连接
    option httpchk GET /api/health
    server api1 10.0.0.20:8000 check
    server api2 10.0.0.21:8000 check

backend admin_backend
    balance roundrobin
    server admin1 10.0.0.30:8080 check
```

应用：

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg              # 校验语法
sudo systemctl reload haproxy                             # 平滑重载（不断连接）
```

### 模板 B — Layer 4 TCP 代理（数据库 / Redis 等）

```haproxy
frontend mysql_frontend
    bind *:3306
    mode tcp
    default_backend mysql_backend

backend mysql_backend
    mode tcp
    balance source                   # 按客户端 IP hash（同 IP 总到同 server）
    option mysql-check user haproxy_check
    server mysql1 10.0.0.40:3306 check
    server mysql2 10.0.0.41:3306 check
```

注意：MySQL 健康检查需要在 MySQL 上建专用账号 `haproxy_check`。

### 模板 C — HTTPS + Let's Encrypt 集成

```bash
# 1. certbot 拿证书（standalone）
sudo certbot certonly --standalone -d example.com

# 2. 合并 fullchain + privkey 给 HAProxy
sudo bash -c 'cat /etc/letsencrypt/live/example.com/fullchain.pem \
              /etc/letsencrypt/live/example.com/privkey.pem \
              > /etc/haproxy/certs/example.com.pem'
sudo chmod 600 /etc/haproxy/certs/example.com.pem
sudo chown haproxy:haproxy /etc/haproxy/certs/example.com.pem

# 3. cfg 里 bind *:443 ssl crt /etc/haproxy/certs/

# 4. certbot 续签 hook（自动合并 + reload）
sudo tee /etc/letsencrypt/renewal-hooks/deploy/haproxy.sh > /dev/null <<'EOF'
#!/bin/bash
cat /etc/letsencrypt/live/example.com/fullchain.pem \
    /etc/letsencrypt/live/example.com/privkey.pem \
    > /etc/haproxy/certs/example.com.pem
chmod 600 /etc/haproxy/certs/example.com.pem
chown haproxy:haproxy /etc/haproxy/certs/example.com.pem
systemctl reload haproxy
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/haproxy.sh
```

### 模板 D — 速率限制（防 DDoS / API 滥用）

```haproxy
frontend api_in
    bind *:443 ssl crt /etc/haproxy/certs/

    # 表 1：每 IP 10 秒内请求数
    stick-table type ip size 100k expire 10s store http_req_rate(10s)

    # 表 2：每 IP 30 秒内 4xx 错误数（识别探测攻击）
    stick-table type ip size 100k expire 30s store http_err_rate(30s)

    # 跟踪
    http-request track-sc0 src
    http-request track-sc1 src

    # 阈值：10s 100 req / 30s 50 err 拒绝
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }
    http-request deny deny_status 403 if { sc_http_err_rate(1) gt 50 }
```

### 模板 E — 健康检查策略

```haproxy
backend web
    # HTTP 健康检查（推荐）
    option httpchk GET /healthz
    http-check expect status 200

    # 慢检查（间隔 5s，2 次成功 OK，3 次失败 DOWN）
    server web1 10.0.0.10:3000 check inter 5s fastinter 1s downinter 2s rise 2 fall 3 weight 100

    # 多次健康检查链式（保证后端真的能用）
    option httpchk
    http-check connect
    http-check send meth GET uri /healthz ver HTTP/1.1 hdr Host example.com
    http-check expect status 200
    http-check expect string "OK"
```

## 关键参数调优速查

### `balance` 算法

| 算法 | 适用 |
|---|---|
| `roundrobin` | 通用，server 性能相同 |
| `leastconn` | 长连接 / 业务时长不均（API / WebSocket） |
| `source` | 同客户端总到同 server（session 粘性） |
| `uri` | 缓存场景，相同 URI 总到同 server |
| `hdr(X-Header)` | 按某 header 哈希 |
| `random` | 随机（适合大量 server） |

### Connection / Timeout

| 参数 | 推荐 |
|---|---|
| `maxconn` | 物理内存 / (50KB) → 1GB ≈ 20000 |
| `timeout client` | 1m（普通 HTTP）；15m（WebSocket / SSE） |
| `timeout server` | 同上 |
| `timeout connect` | 5-10s |
| `timeout http-keep-alive` | 10s |
| `timeout queue` | 30s（防 slow client 占满 queue） |

### 性能（HAProxy 单进程支持 1M+ 连接）

```haproxy
global
    maxconn 100000
    nbthread 4              # 多线程（HAProxy 1.8+）
    cpu-map auto:1/1-4 0-3   # 绑定线程到 CPU
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `haproxy` | `haproxy` |
| 服务名 | `haproxy` | `haproxy` |
| 默认仓库版本 | 2.4 - 2.8 | 2.4 |
| 装最新（2.8 LTS） | apt 默认（24+） / vbernat PPA | EPEL 或 haproxytech 仓库 |

EnvForge 不需要 EPEL（haproxy 在 RHEL 默认仓库）。

## 与其它 catalog 项的配合

- **`nginx-web-service`** / **`openresty`** / **`traefik-proxy`** — 互斥（争 80/443）
- **`certbot-ssl`** — 配模板 C 的 deploy hook 自动续证
- **`postgres-profile` / `mysql-server`** — Layer 4 TCP 代理（模板 B）
- **`prometheus-monitoring`** — `haproxy_exporter` 暴露 Prometheus 指标
- **`fail2ban-protection`** — 给 stats 页加 jail

## 排错

### 服务起不来 / `haproxy.service: Failed`

99% 是 cfg 语法错：

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
# 输出明确指出哪行哪个字段
```

### 后端显示 DOWN 但 curl 直接访问能通

```bash
# 1. 看具体错误
sudo journalctl -u haproxy -n 50

# 2. 健康检查路径不对
# 后端没 /healthz → 改成 / 或写应用 health endpoint

# 3. 检查方式不对
option httpchk GET /             # HTTP 检查
# vs
option tcp-check                 # 仅 TCP 连通性

# 4. SELinux（RHEL）
sudo setsebool -P haproxy_connect_any 1
```

### `option forwardfor` 没添加 X-Forwarded-For

后端应用要信任 HAProxy 的 IP 才会读这个头。代码示例（Express）：

```javascript
app.set('trust proxy', '10.0.0.0/8');
```

### Stats 页 401 Unauthorized

```bash
# 浏览器输入用户名/密码
# 或 curl 测试
curl -u admin:password http://127.0.0.1:8404/

# stats auth 用户名密码必须明文写在 cfg（不能 hash）
```

### `bind 443: address already in use`

80/443 被 nginx/apache 占了：

```bash
sudo ss -tlnp | grep -E ':(80|443) '
sudo systemctl stop nginx                # 或 apache2 / httpd
```

### Reload 后部分请求 502

热重载切换的瞬间窗口。HAProxy 用 `seamless reload` 可缓解：

```haproxy
global
    expose-fd listeners            # 已加在模板 A
```

systemd unit 默认用 `-x` flag 共享 socket fd，无需手动配。

### 反代 WebSocket 502

```haproxy
defaults
    timeout client 15m
    timeout server 15m
    timeout tunnel 1h               # WebSocket 隧道超时
```

## 验证

```bash
# 1. 语法
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
# Configuration file is valid

# 2. 服务在跑
systemctl is-active haproxy

# 3. 端口
sudo ss -tlnp | grep haproxy

# 4. 主转发
curl -I http://127.0.0.1/
curl -k https://127.0.0.1/

# 5. Stats
curl -u admin:password http://127.0.0.1:8404/

# 6. Runtime API（如 admin.sock 存在）
echo "show servers state" | sudo socat - UNIX-CONNECT:/run/haproxy/admin.sock | head
echo "show stat" | sudo socat - UNIX-CONNECT:/run/haproxy/admin.sock | head -5
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`/etc/haproxy/haproxy.cfg` 每次按表单值重写**——大量定制配置请放 `conf.d/*.cfg`（cfg 里加 `include`）或脱离 EnvForge 管理。

## ⚠️ 敏感性

**review** — HAProxy 占用 80/443，**不能与 nginx/apache/Traefik 同机** 跑。stats 页含运维敏感信息（QPS / 错误率 / 后端列表）。

强制清单：

1. stats 必须强密码 + 防火墙限源
2. 公网部署用 HTTPS（启用 STS）
3. backend 列表谨慎暴露（攻击者借此摸内网拓扑）
4. SSL/TLS 用现代 cipher（模板 A 已配）

## 隐私说明

- stats 页密码会出现在 `/etc/haproxy/haproxy.cfg`（明文，权限 0640）
- HAProxy 不发遥测
- 访问日志（`/var/log/haproxy.log`）含**每个请求的 IP / URL / 状态码**——按合规需求保留 / 加密备份
- ACME 私钥不在 HAProxy 仓库（用 certbot 管），但合并的 `.pem` 文件含**私钥明文**，权限 0600
