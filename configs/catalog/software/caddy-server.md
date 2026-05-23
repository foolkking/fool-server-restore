# Caddy Web 服务器

Caddy 是 **Go 写的 web 服务器**，最大特点：**自动 HTTPS**（内置 Let's Encrypt 集成）+ 极简配置。**3 行 Caddyfile 完成 nginx 50 行的事**。适合替代 nginx 做新项目的反代 / 静态站点。

## 你将得到什么

- 📦 **caddy**（来自 Caddy 官方仓库 / EPEL COPR）
- ✅ 自动签发 + 续期 Let's Encrypt 证书
- ✅ HTTP/2 + HTTP/3（QUIC）默认开
- ✅ Brotli + Gzip + Zstd 压缩默认开
- ✅ 强 TLS 默认（仅 1.2/1.3，现代 cipher）
- ✅ JSON 结构化访问日志
- ✅ systemd 服务自动启动 + 开机自启

## 表单字段说明

### `caddy_email`

LE 注册邮箱。证书快过期通知。**务必真实**——续证失败时这是唯一告警通道。

### `caddy_default_site`

主站域名。Caddy 自动签 HTTPS 证书。留空 = 仅起 :80 占位站点（HTTP-only）。**域名必须 DNS 已指向本机**。

### `caddy_default_backend`

反代目标（如 Node.js 应用 `127.0.0.1:3000`）。留空 = 静态文件服务器（`/var/www/html`）。

## 配置文件 / 目录速查

```
/etc/caddy/
├── Caddyfile                          # ← 主配置（极简语法）
├── Caddyfile.envforge.bak              # 备份
└── conf.d/                              # 子配置（include 用）

/var/lib/caddy/
└── .local/share/caddy/
    ├── certificates/                    # ACME 证书存储
    │   └── acme-v02.api.letsencrypt.org-directory/
    │       └── <domain>/
    │           ├── *.crt
    │           └── *.key                # 私钥
    └── locks/

/var/log/caddy/
├── access.log                            # JSON 访问日志
└── caddy.log                              # 主日志

/var/www/html                              # 默认 web root

# CLI
/usr/bin/caddy                              # 主二进制
sudo systemctl status caddy                  # 服务

# 用户级
~/.config/caddy/                           # 用户级配置（少用）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `dl.cloudsmith.io/public/caddy/stable` | COPR `@caddy/caddy` |
| 包名 | `caddy` | `caddy` |
| 服务 | `caddy` | `caddy` |
| 用户 | `caddy` | `caddy` |
| 配置 | `/etc/caddy/Caddyfile` | 同 |
| 安装位置 | `/usr/bin/caddy` | 同 |

## 常见配置模板

### 模板 A — 基础静态站点（极简）

```caddyfile
example.com {
    root * /var/www/html
    file_server
}
```

**就这两行**。Caddy 自动：

- 签 LE 证书
- 启 HTTPS（443）
- 80 → 443 跳转
- HTTP/2
- 压缩
- 安全 header

### 模板 B — 反代到 Node.js / Python 应用

```caddyfile
api.example.com {
    reverse_proxy 127.0.0.1:3000
}

# 多 backend 负载均衡
api2.example.com {
    reverse_proxy 10.0.0.10:8080 10.0.0.11:8080 {
        lb_policy round_robin
        health_uri /healthz
        health_interval 5s
    }
}
```

### 模板 C — 多站点（虚拟主机）

```caddyfile
example.com {
    root * /var/www/example
    file_server
    encode gzip
}

api.example.com {
    reverse_proxy 127.0.0.1:3000
}

admin.example.com {
    reverse_proxy 127.0.0.1:5000

    # 仅自己 IP 能访问
    @blocked not remote_ip 1.2.3.4
    handle @blocked { respond 403 }

    # Basic auth
    basicauth {
        admin $2a$14$bcrypt-hash-here
    }
}

blog.example.com {
    redir https://example.com{uri} permanent       # 301 跳转
}
```

### 模板 D — 反代 + 静态资源混合（SPA）

```caddyfile
app.example.com {
    root * /var/www/myapp/dist

    # 静态文件 + SPA fallback
    @api path /api/*
    handle @api {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        try_files {path} /index.html       # SPA 路由
        file_server
    }

    encode gzip zstd
    header Cache-Control "public, max-age=86400"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

### 模板 E — WebSocket + 长连接

```caddyfile
chat.example.com {
    reverse_proxy 127.0.0.1:8080 {
        # WebSocket 自动支持，无需特殊配置（Caddy 自动处理 Upgrade）
        transport http {
            read_timeout 24h
            write_timeout 24h
        }
    }
}
```

### 模板 F — 限速 / 防爬虫

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:3000

    # IP 限速（每秒 10 请求 burst 50）
    rate_limit {
        zone all {
            key {remote_host}
            events 10
            window 1s
        }
    }

    # 屏蔽某 UA
    @badbots header User-Agent *Baiduspider*
    handle @badbots { respond 403 }

    # 仅特定国家（需 GeoIP 模块）
    # @cn maxmind_geoip2 country CN
    # handle @cn { respond 403 }
}
```

`rate_limit` 需要 [caddy-ratelimit 模块](https://github.com/mholt/caddy-ratelimit)，自带 build 不含。要么用 xcaddy 编译，要么直接用 Caddy 内置 `@bytes` matcher 限请求体大小。

### 模板 G — DNS-01 ACME（通配符证书）

```caddyfile
{
    acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}
}

*.example.com {
    @api host api.example.com
    handle @api { reverse_proxy 127.0.0.1:3000 }

    @www host www.example.com example.com
    handle @www {
        root * /var/www/html
        file_server
    }
}
```

systemd unit Environment 加 `CLOUDFLARE_API_TOKEN=...`。需要 [caddy-dns/cloudflare](https://github.com/caddy-dns/cloudflare) 模块——用 [xcaddy](https://github.com/caddyserver/xcaddy) 重新编译 caddy：

```bash
xcaddy build --with github.com/caddy-dns/cloudflare
sudo mv caddy /usr/bin/
sudo systemctl restart caddy
```

### 模板 H — Docker 部署

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"                          # HTTP/3 QUIC
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data                        # 证书存储
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

### 模板 I — 平滑重载

```bash
# 校验语法
caddy validate --config /etc/caddy/Caddyfile

# 平滑重载（不断现有连接）
sudo systemctl reload caddy
# 或
sudo caddy reload --config /etc/caddy/Caddyfile

# 重启
sudo systemctl restart caddy
```

## 关键参数调优速查

### 性能

| 项 | 推荐 |
|---|---|
| HTTP/3（QUIC） | 自动开（443/UDP） |
| 压缩 | `encode gzip zstd` |
| 缓存 header | `header Cache-Control` |
| 静态文件 | `file_server` 内置高性能 |
| 反代 keepalive | 自动 |

### 资源占用

| 部署 | RAM | CPU |
|---|---|---|
| 小型（< 100 req/s） | 30 MB | < 1% |
| 中型（< 1k req/s） | 100 MB | 1-3% |
| 大型（10k req/s） | 500 MB+ | 中等 |

Caddy 比 nginx 略重（Go runtime + 自动 HTTPS 状态机），但**功能更丰富**。

### TLS 调优

Caddy 默认 TLS 配置已是行业最佳：

- 仅 TLS 1.2 / 1.3
- 现代 cipher（AES-GCM / ChaCha20-Poly1305）
- HSTS preload-ready
- OCSP stapling 自动

无需手动调。

### admin API（生产可关）

```caddyfile
{
    admin off                                   # 关闭 admin API（生产推荐）
}
```

或限本机：

```caddyfile
{
    admin localhost:2019
}
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | dl.cloudsmith.io | COPR @caddy/caddy（需 `dnf install dnf-command(copr)`） |
| 包 | `caddy` | `caddy` |
| 服务 | `caddy.service` | 同 |
| systemd 用户 | `caddy` | `caddy` |
| ARM64 | ✅ | ✅ |
| Anolis 9 | – | ✅（COPR 走 RHEL 9 兼容） |

## 与其它 catalog 项的配合

- **`nginx-web-service` / `haproxy-lb` / `traefik-proxy` / `openresty`** — **互斥**（争 80/443）
- **`certbot-ssl`** — **不需要**（Caddy 自带 ACME）
- **`docker-host-profile`** — Docker 部署（模板 H）
- **业务 Playbook** — Caddy 反代到 Node.js / Python / Go / Rust 应用

## 排错

### `bind: address already in use`

80 / 443 被 nginx / apache 占：

```bash
sudo systemctl stop nginx                    # 或 apache2 / httpd / haproxy / traefik
sudo systemctl restart caddy
```

### LE 证书签不下来

```bash
sudo journalctl -u caddy -n 50 | grep -i acme

# 常见
# 1. 域名 DNS 没指向本机
dig +short example.com

# 2. 80 端口防火墙未开
sudo ufw allow 80
sudo firewall-cmd --add-service=http --permanent && sudo firewall-cmd --reload

# 3. LE 限速（每周同 domain 5 个证书）
# 临时切到 staging 测：
# {
#     acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
# }
```

### Caddyfile 语法错

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
# 输出明确指出哪行错误
```

### 配置不生效

```bash
# Caddy 用 admin API 加载 config，不重启 systemd 也能改
sudo systemctl reload caddy
# 或
sudo caddy reload --config /etc/caddy/Caddyfile
```

### HTTP/3 不工作

```bash
# 1. 防火墙开 443/UDP
sudo ufw allow 443/udp
sudo firewall-cmd --add-port=443/udp --permanent && sudo firewall-cmd --reload

# 2. 看 Caddy 监听
sudo ss -ulnp | grep :443
```

### 证书路径找不到（其他工具想用 LE 证书）

```bash
# Caddy 证书在 /var/lib/caddy/.local/share/caddy/certificates/
# 让其他服务读：

# 方案 1：复制（deploy hook）
sudo caddy adapt --config /etc/caddy/Caddyfile | jq '.apps.tls.automation.policies[0].issuers[0].email'

# 方案 2：让 Caddy 同时管自定义路径
# Caddyfile:
# example.com {
#     tls {
#         issuer acme {
#             ca https://acme-v02.api.letsencrypt.org/directory
#         }
#     }
# }
```

### 反代 502

```bash
# 1. 后端 listening?
curl -I http://127.0.0.1:3000/

# 2. 防火墙挡 caddy 访问后端
sudo ss -tlnp | grep :3000

# 3. SELinux（RHEL）
sudo setsebool -P httpd_can_network_connect 1
```

### Module 不存在 `unknown directive`

某指令需要额外模块：

```bash
# 看当前 build 含哪些模块
caddy list-modules | grep ratelimit

# 没有 = 用 xcaddy 重新编译
xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddy-dns/cloudflare
sudo mv caddy /usr/bin/caddy
sudo systemctl restart caddy
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active caddy

# 2. 端口
sudo ss -tlnp | grep -E ':(80|443) '

# 3. 配置语法
sudo caddy validate --config /etc/caddy/Caddyfile

# 4. 看 admin API（默认关时这步不通）
curl -s http://127.0.0.1:2019/config/ | jq

# 5. 主站可达
curl -I http://localhost
curl -kI https://localhost                    # 自签或 LE 测试

# 6. 自动证书
sudo ls -la /var/lib/caddy/.local/share/caddy/certificates/

# 7. 访问日志
sudo tail -10 /var/log/caddy/access.log
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`/etc/caddy/Caddyfile` 每次按表单值重写**——你**手动加的站点会被覆盖**。

要保留：把额外站点放 `/etc/caddy/conf.d/` + 主 Caddyfile 用 `import conf.d/*.caddy`：

```caddyfile
{
    email admin@example.com
}

# 自定义站点（用户管，Playbook 不动）
import /etc/caddy/conf.d/*.caddy

# EnvForge 表单管的默认站点
example.com {
    ...
}
```

## ⚠️ 敏感性

**review** — Caddy 占 80 / 443，**与 nginx / apache / Traefik 互斥**。自动 HTTPS 是最大优势但也意味着**容易上线没注意权限**。

强制：

1. admin API 默认 :2019 开放——生产关闭（`admin off`）
2. LE 邮箱真实
3. 证书私钥在 `/var/lib/caddy/.local/share/caddy/`，权限自动 caddy:caddy
4. WebSocket / 长连接超时按需调（默认 30s）

## 隐私说明

- **Caddy 不发遥测**
- LE 注册邮箱在 LE 账号里
- 访问日志（JSON）含 IP / URL / UA / 状态——按合规处理
- 证书透明日志（CT log）：所有 LE 证书的 domain 公开记录到 `crt.sh` 等
- 自动 HTTPS 时 Caddy 联系 `acme-v02.api.letsencrypt.org`（隐含暴露你的 IP）
- TLS 私钥不离开本机
