# Certbot / Let's Encrypt SSL

Certbot 自动签发并续签 Let's Encrypt 免费 SSL 证书。EnvForge 把签发命令、nginx/apache 配置改写、自动续签 timer 一次性配好。**所有公网 web 服务都该用——成本零，证书 90 天有效自动续签**。

## 你将得到什么

- 📦 **certbot** + 选定的插件（nginx / apache / standalone / webroot）
- ✅ 证书签发并放到 `/etc/letsencrypt/live/<domain>/`（fullchain.pem + privkey.pem）
- ✅ nginx/apache 模式下，对应的 vhost 自动加上 `ssl_certificate` + 80 → 443 跳转
- ✅ `certbot.timer` 启用并设开机自启（每天检查 + 提前 30 天自动续签）

## 表单字段说明

### `domain` / `email`

域名必须 DNS 已指向本机。邮箱用于：(1) 证书快过期且自动续签失败时通知（**重要**）(2) ACME 服务变更通知。**务必填真实邮箱**——续签出问题时这是唯一告警通道。

### `challenge_method`

| 方式 | 适用 | 优 | 缺 |
|---|---|---|---|
| `nginx` | 已装 nginx | 自动改配置，最省心 | 需先装 nginx |
| `apache` | 已装 apache | 自动改配置 | 需先装 apache |
| `standalone` | 还没装 web server | 不依赖现有服务 | 签发时 80 端口被占 |
| `webroot` | 已有任意 web server | 不打扰运行中服务 | 必须能写 `.well-known/` |
| `dns-cloudflare` 等 | 通配符证书 | 支持 wildcard | 需 DNS API token |

### `staging`

✅ **第一次或调试时建议先开**。Let's Encrypt 生产服务器有限速：

- 每周每域名 5 次失败签发
- 每周每证书 5 次重复签发

测试模式无限速，但证书浏览器不信任。流程通了再关 staging 重签真证书。

## 配置文件 / 目录速查

```
/etc/letsencrypt/
├── live/                                # ← 应用配置永远引用这里（软链）
│   └── example.com/
│       ├── fullchain.pem                # 服务器证书 + 中间证书
│       ├── privkey.pem                   # 私钥（**root 600**）
│       ├── cert.pem                       # 仅服务器证书
│       └── chain.pem                       # 仅中间证书
├── archive/                              # 实际文件（按版本号编号）
│   └── example.com/
│       ├── fullchain1.pem
│       ├── fullchain2.pem               # 续签后的新版本
│       └── ...
├── renewal/                               # 续签配置
│   └── example.com.conf                   # 每域名一份
└── accounts/                               # ACME 账号

# Cron / Timer
/etc/cron.d/certbot                        # 老式 cron（部分发行版）
systemctl list-timers certbot.timer         # systemd timer（推荐）

# 续签 hook
/etc/letsencrypt/renewal-hooks/
├── pre/                                    # 续签前
├── deploy/                                  # 新证书生成后（**最常用**）
└── post/                                     # 续签后
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `certbot` `python3-certbot-nginx` 等 | `certbot` `python3-certbot-nginx` 等（EPEL） |
| 服务 / Timer | `certbot.timer` | `certbot-renew.timer` |
| 续签频率 | 每天 2 次（自带 jitter） | 同 |
| 默认 web root | `/var/www/html` | `/var/www/html` |

EnvForge preflight 启 EPEL，RHEL 系无障碍。

## 常见配置模板

### 模板 A — Nginx 模式（最推荐）

```bash
# 一条命令搞定（自动签 + 改 nginx 配置 + 加 80 → 443 redirect）
sudo certbot --nginx -d example.com -d www.example.com \
    --email admin@example.com --agree-tos --non-interactive --redirect

# 看证书
sudo certbot certificates

# 测试续签流程
sudo certbot renew --dry-run

# 强制立刻续签（仅调试）
sudo certbot renew --force-renewal
```

### 模板 B — Standalone 模式（无 web server）

```bash
# 临时占用 80 端口签证
sudo certbot certonly --standalone -d example.com \
    --email admin@example.com --agree-tos --non-interactive

# 续签 hook（重启你的服务）
sudo tee /etc/letsencrypt/renewal-hooks/deploy/restart-app.sh > /dev/null <<'EOF'
#!/bin/bash
systemctl restart my-app
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-app.sh
```

### 模板 C — Webroot 模式（不停 web server）

```bash
# 假设 nginx 已配 / 跑着
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/html

sudo certbot certonly --webroot -w /var/www/html -d example.com \
    --email admin@example.com --agree-tos --non-interactive

# 手动改 nginx 配置启用 SSL（certbot 不动 nginx 配）
```

### 模板 D — DNS-01 挑战（通配符证书）

```bash
# Cloudflare（最常用）
sudo apt-get install python3-certbot-dns-cloudflare

# 创建 API token：cloudflare dashboard → My Profile → API Tokens → Create
# 权限：Zone:Read + DNS:Edit（最小权限）

sudo mkdir -p /etc/letsencrypt/secrets
sudo tee /etc/letsencrypt/secrets/cloudflare.ini > /dev/null <<EOF
dns_cloudflare_api_token = YOUR_CF_API_TOKEN
EOF
sudo chmod 600 /etc/letsencrypt/secrets/cloudflare.ini

# 签 wildcard
sudo certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/secrets/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 30 \
    -d "*.example.com" -d example.com \
    --email admin@example.com --agree-tos --non-interactive
```

其它 DNS provider：`route53` / `digitalocean` / `dnspod`（国内）/ `aliyun` / `gcloud` 等都有插件。

### 模板 E — 多域名 SAN 证书

```bash
sudo certbot --nginx \
    -d example.com -d www.example.com \
    -d api.example.com -d admin.example.com \
    --email admin@example.com --agree-tos --non-interactive --redirect
```

一张证书覆盖多个域名。**最多 100 个**（LE 限制）。

### 模板 F — 续签 hook（最重要）

`/etc/letsencrypt/renewal-hooks/deploy/reload-services.sh`:

```bash
#!/bin/bash
# 每次成功续签后跑（仅成功，不失败）
systemctl reload nginx
systemctl reload haproxy 2>/dev/null
systemctl restart mosquitto 2>/dev/null

# Slack / 钉钉通知
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"LE 证书续签 OK on '"$(hostname)"'"}' \
  "$SLACK_WEBHOOK"

# 同步证书到 HAProxy 合并 pem
cat /etc/letsencrypt/live/example.com/fullchain.pem \
    /etc/letsencrypt/live/example.com/privkey.pem \
    > /etc/haproxy/certs/example.com.pem
chmod 600 /etc/haproxy/certs/example.com.pem
chown haproxy:haproxy /etc/haproxy/certs/example.com.pem
systemctl reload haproxy
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh
```

### 模板 G — 让非 root 服务读证书（grafana / mosquitto / 等）

```bash
# 方案 1：调权限 + ACL
sudo chmod 750 /etc/letsencrypt/live /etc/letsencrypt/archive
sudo setfacl -R -m u:grafana:rx /etc/letsencrypt/live /etc/letsencrypt/archive

# 方案 2：deploy hook 复制
# /etc/letsencrypt/renewal-hooks/deploy/copy-to-grafana.sh
cp /etc/letsencrypt/live/example.com/{fullchain,privkey}.pem /etc/grafana/
chown grafana:grafana /etc/grafana/{fullchain,privkey}.pem
chmod 600 /etc/grafana/privkey.pem
systemctl restart grafana-server
```

## 关键参数调优速查

### 续签调度

```bash
# Timer 已自动配每天 2 次
systemctl list-timers certbot.timer
sudo systemctl status certbot.timer

# 手动触发
sudo systemctl start certbot.service

# 看续签日志
sudo journalctl -u certbot.timer -n 30
```

### Rate Limits（Let's Encrypt 限速）

| 限速 | 阈值 |
|---|---|
| 同 domain 重复证书 | 5/周 |
| 同 hostname 重复 | 5/周 |
| 失败验证 | 5/账号/小时 |
| 新证书签发 | 50/周/registered domain |
| 同账号 pending auth | 300 |

详见 [letsencrypt.org/docs/rate-limits](https://letsencrypt.org/docs/rate-limits/)。

### 测试 (staging) 服务器

无限速，但证书浏览器不信任。开发 / CI 用：

```bash
sudo certbot --staging certonly --webroot -w /var/www/html -d test.example.com
```

### 手动安装非 LE 证书（如自签 / 商用 CA）

```bash
sudo cp my-cert.pem /etc/ssl/certs/
sudo cp my-key.pem /etc/ssl/private/
sudo chmod 600 /etc/ssl/private/my-key.pem

# nginx 配置直接指向
ssl_certificate /etc/ssl/certs/my-cert.pem;
ssl_certificate_key /etc/ssl/private/my-key.pem;
```

不通过 certbot 时无自动续签——商用证书一般 1-2 年有效，到期手动换。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `certbot` 包 | 默认仓库 | EPEL ✅ |
| `python3-certbot-nginx` | 默认仓库 | EPEL ✅ |
| `python3-certbot-apache` | 默认仓库 | EPEL ✅ |
| `python3-certbot-dns-cloudflare` | 默认仓库 | EPEL ✅ |
| Snap 替代 | `sudo snap install certbot --classic` | 同 |
| Timer | systemd `certbot.timer` | `certbot-renew.timer` |

## 与其它 catalog 项的配合

- **`nginx-web-service` / `apache`** — 最常见组合（模板 A）
- **`haproxy-lb`** — deploy hook 合并 pem（模板 F）
- **`traefik-proxy`** — 不用！Traefik 自带 ACME
- **`postgres-profile` / `mosquitto-mqtt` / `grafana-dashboard`** — 让这些服务用 LE 证书（模板 G）

## 排错

### `Connection refused` 或 timeout

```bash
# 1. 80 端口对外通
curl -I http://example.com/.well-known/acme-challenge/test
# 应不是 connection refused

# 2. 防火墙
sudo ufw allow 80
sudo firewall-cmd --add-service=http --permanent && sudo firewall-cmd --reload

# 3. 域名 DNS 指本机
dig +short example.com                # 应输出本机公网 IP
```

### `DNS problem: NXDOMAIN`

域名 A 记录没生效（DNS 传播 5-30 分钟）。等等再试：

```bash
dig +short example.com @8.8.8.8       # 看权威 DNS
```

### `Too many failed authorizations recently`

触发了 LE 限速。**切 staging 调通后再换生产**：

```bash
sudo certbot certonly --staging ...
```

### `The given path is not a directory`（webroot 模式）

```bash
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/html
```

### 续签静悄悄失败

```bash
sudo journalctl -u certbot.timer -n 50

# 常见原因：
# 1. nginx 启动失败 → certbot 续签时 nginx -t 报错
# 2. 80 端口被新加的服务占了
# 3. 域名 DNS 改了但 cert 配置没改
# 4. cloudflare API token 过期（DNS-01）
```

### `certbot: command not found`

包没装：

```bash
sudo apt-get install certbot              # Ubuntu/Debian
sudo dnf install certbot                  # RHEL/Anolis（需 EPEL）

# 或 snap
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### nginx 续签后没 reload 新证书

```bash
# 查看 deploy hook 是否存在
ls /etc/letsencrypt/renewal-hooks/deploy/

# 手动加（模板 F）
```

### 证书路径不对（应用读不到）

应用配置必须用 **`live/` 路径**：

```
/etc/letsencrypt/live/example.com/fullchain.pem    ✅
/etc/letsencrypt/archive/example.com/fullchain1.pem ❌（续签后版本号变会失效）
```

## 验证

```bash
# 1. 命令存在
certbot --version

# 2. 看现有证书
sudo certbot certificates

# 3. 测试续签流程
sudo certbot renew --dry-run

# 4. Timer 启用
systemctl is-enabled certbot.timer
systemctl list-timers certbot.timer

# 5. 验证证书内容
sudo openssl x509 -in /etc/letsencrypt/live/example.com/fullchain.pem -text -noout | head -20

# 6. 在线测试（A+ 评级）
# https://www.ssllabs.com/ssltest/analyze.html?d=example.com
```

## 多次运行

`installMode: skip-existing`。已签证书不重签（certbot 自己判断到期 ≤ 30 天才续）。重新启用 `certbot.timer`。

## ⚠️ 敏感性

**review** — 证书私钥在 `/etc/letsencrypt/archive/`，权限 root:root 600。

**风险点**：

- 不要 chmod 给应用读——用 ACL 或 deploy hook 复制（模板 G）
- 私钥泄露 = 必须 `certbot revoke` 撤销证书
- staging 模式签的证书浏览器不信任，**生产前务必关 staging**

## 隐私说明

- 私钥不被 EnvForge 上传——本地生成留 `/etc/letsencrypt/`
- 邮箱注册到 LE 账号
- ACME 协议不发送应用数据——仅验证域名所有权
- DNS-01 时 API token 写本地配置（权限 600）
- LE 公开证书透明日志（CT log）：所有签发的证书域名都会记录到 `crt.sh` 等公开数据库
- 内部域名 / staging 子域用 LE 等于公开域名结构——介意可用自签或自己的 PKI
