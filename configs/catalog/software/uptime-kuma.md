# Uptime Kuma 自托管监控

Uptime Kuma 是**自托管 Uptime Robot 替代品**——HTTP / TCP / Ping / DNS / Docker container / Steam game / 等多协议健康监测 + 70+ 通知渠道（Discord / Slack / Telegram / 微信 / 邮件 / Webhook） + 公开状态页。**适合**：站长 / homelab / 中小团队监控自己服务的存活。**比 Prometheus 简单 10 倍**——10 秒配好一个监控。

## 你将得到什么

- 📦 **Uptime Kuma 容器**（`louislam/uptime-kuma:1`）
- ✅ Web UI 监听 `127.0.0.1:3001`
- ✅ 14 种监控类型（HTTP / HTTPS / TCP / Ping / DNS / SSL 证书 / Docker / Steam / 等）
- ✅ 70+ 通知渠道
- ✅ 公开状态页（独立 URL，不需登录）
- ✅ Docker socket 挂载（监控容器健康）
- ✅ Healthcheck（自监控）
- ✅ SQLite 数据库（轻量，无外部依赖）

## 表单字段说明

### `uk_port`

本机绑定端口，默认 3001。生产用反代到 443。

### `uk_data_dir`

```
{data_dir}/data/
├── kuma.db                 # SQLite（监控配置 + 历史数据）
├── upload/                 # 自定义图标
└── ssl/                    # 自定义 TLS 证书
```

**每周备份 `kuma.db`**——丢了所有监控配置 + 历史 + 通知规则要重设。

## 配置文件 / 目录速查

```
{data_dir}/data/
├── kuma.db                 # 主数据库
├── kuma.db.bak0            # 自动备份（每次启动）
└── upload/                 # 图标 / logo
```

无外部配置文件——**所有配置走 Web UI**。

## 常见配置模板

### 模板 A — 首次安装

```
1. 浏览器打开 http://server-ip:3001/setup
2. 创建 admin 账号（首次访问就是注册页面）
   Username: admin
   Password: <强密码>
3. 默认进 Dashboard
```

### 模板 B — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name status.example.com;

    ssl_certificate     /etc/letsencrypt/live/status.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/status.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # WebSocket（Uptime Kuma 用 socket.io 实时推送）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
    }
}
```

⚠️ **WebSocket 必配**——否则 Web UI 进入后空白（实时数据靠 socket.io）。

### 模板 C — 加监控（HTTP 检查）

```
+ Add New Monitor

Monitor Type:        HTTP(s)
Friendly Name:       My Website
URL:                 https://example.com
Heartbeat Interval:  60 seconds       (推荐 30-60s)
Retries:             3                  (失败 3 次才算 down)
Heartbeat Retry:     30 seconds
Request Timeout:     48 seconds

Advanced:
  Method:            GET
  Body:              <空>
  Headers:           <可加 Authorization 等>
  Accepted Status:   200-299
  Ignore TLS error:  false              (生产关闭)
  Upside down mode:  false              (true = 200 视为 down，用于"应该挂掉的服务")
  Max redirects:     10
  Certificate Expiry Notification: ✓   (证书快过期时通知)

Save
```

### 模板 D — 通知配置（Discord webhook）

```
1. Discord: 服务器设置 → 整合 → Webhooks → 新 webhook → 复制 URL

2. Uptime Kuma: Settings → Notifications → Setup Notification
   Notification Type:  Discord
   Friendly Name:      Discord-alerts
   Discord Webhook URL: <粘贴>
   Bot Display Name:   Uptime Kuma
   Default:            ✓                (新监控自动用此通知)

3. Test → 收到测试消息 → Save
```

类似配 Telegram / Slack / Email / 100+ 其他。

### 模板 E — 公开状态页

```
1. Status Pages → New Status Page
   Name:        Acme Inc Service Status
   Slug:        acme-status              (URL 中: /status/acme-status)
   Description: <Markdown 支持>

2. + Add a Group        (可选 — 分组监控)
   Group Name:  Production

3. + Add a Monitor      (从已配监控里选)
   勾选要公开的监控

4. Save → 公开 URL: https://status.example.com/status/acme-status
```

设为首页（域名根路径直接显示状态）：

```
Settings → Status Pages
  Default Status Page: <选你的 page>
```

### 模板 F — 监控类型速查

| 类型 | 用途 | 配置要点 |
|---|---|---|
| **HTTP(s)** | 网站存活 + 状态码 + SSL | URL + 状态码范围 |
| **TCP Port** | 端口监听（DB / Redis / SSH） | host + port |
| **Ping** | ICMP 探测 | hostname/IP |
| **DNS** | DNS 解析 | hostname + 期望 IP |
| **Docker Container** | 容器健康 | 容器名 + 健康检查 |
| **Push** | 反向（监控来心跳） | 给定 URL 让目标 cron 推 |
| **Steam Game** | 游戏服务器在线 | server IP + port |
| **MQTT** | MQTT broker | host + port + topic |
| **HTTP Keyword** | 网页内容含关键词 | URL + keyword |
| **JSON Query** | API 返回 JSON 字段 | URL + jsonpath |
| **gRPC** | gRPC 服务 | host + port + 方法 |
| **Group** | 子监控聚合 | – |

### 模板 G — 备份 / 还原

```bash
# 容器化方式（推荐）
docker exec uptime-kuma sqlite3 /app/data/kuma.db ".backup /app/data/kuma-backup.db"
sudo cp /opt/uptime-kuma/data/kuma-backup.db /backup/uk-$(date +%F).db

# 或停容器复制 db
docker stop uptime-kuma
sudo cp /opt/uptime-kuma/data/kuma.db /backup/uk-$(date +%F).db
docker start uptime-kuma

# 还原（新机器）
docker stop uptime-kuma
sudo cp /backup/uk-YYYY-MM-DD.db /opt/uptime-kuma/data/kuma.db
docker start uptime-kuma
```

### 模板 H — 监控自托管 catalog 的所有服务

部署多个自托管服务后，让 Uptime Kuma 监控全部：

```
+ Add Monitor (HTTP) — Nextcloud
  URL: https://cloud.example.com/status.php
  Accepted Status: 200
  Keyword: '"installed":true'

+ Add Monitor (HTTP) — Vaultwarden
  URL: https://vault.example.com/alive
  Accepted Status: 200

+ Add Monitor (Docker) — Postgres
  Container Name: keycloak-db
  Docker Daemon: socket (默认)

+ Add Monitor (TCP) — Redis
  Hostname: 127.0.0.1
  Port: 6379

+ Add Monitor (HTTPS Cert) — 所有公网域名
  类型: HTTP(s) → Certificate Expiry Notification ✓
```

## 关键参数调优速查

### 资源占用

| 监控数 | RAM | CPU |
|---|---|---|
| < 20 | 100 MB | 极低 |
| < 100 | 250 MB | 1-2% |
| < 500 | 500 MB | 5% |
| > 500 | 加 RAM + 调长 interval | – |

### 监控间隔

```
默认 60s 通用。
高频（30s）= 更早发现 down，但 WebSocket 推送 / 通知 / DB 写入压力大
低频（5min）= 不重要服务用，省资源
SSL 证书检查不需要高频（每天 1 次足够）
```

### 历史数据保留

```
Settings → General → Auto Clear Old Data
  Keep monitor heartbeat history for: 180 days  (默认；> 1k 监控可调短)
```

### 反代健康（重要）

```nginx
# 上面模板 B 的 WebSocket 配置
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# 漏配 = Web UI 进入后空白 / 不实时
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64（树莓派） | ✅（多架构镜像） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（**必装**——WebSocket）
- **`prometheus-monitoring`** — 互补——Prom 重指标 + 复杂查询，UK 重存活检测 + 状态页
- **`alertmanager`** / 其他通知系统 —— UK 通知功能强，一般够用
- **`fail2ban-protection`** — 监控 SSH 服务存活
- **`docker-host-profile`** — Docker container 监控类型

## 排错

### 反代后 Web UI 空白

```bash
# 99% 是 WebSocket 漏配
# 浏览器 F12 → Console 看 socket.io 是否报 426 Upgrade Required

# 修：nginx 加
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

sudo nginx -t && sudo nginx -s reload
```

### 通知不发

```
1. Settings → Notifications → 选通知 → Test
   失败 → 看错误（webhook URL 错 / token 过期 / 等）

2. Monitor 的 Notification 标签页有勾选此通知吗？
   每个 monitor 必须显式勾选要用哪些通知（除非通知设了 Default）

3. Down 状态确认了吗？
   Retries 3 次都失败才算 down
```

### Docker container 监控失败

```bash
# 1. socket 挂上去了？
docker exec uptime-kuma ls -l /var/run/docker.sock
# 应是 socket（srw-...）

# 2. 容器名对吗？
docker ps --format '{{ "{{" }}.Names{{ "}}" }}'

# 3. UK 容器内的 docker daemon 配置对吗？
# Add Monitor → Docker Container → Docker Daemon → 默认 socket 应工作
```

### SSL 证书过期通知没收到

```
Monitor → 编辑 → 下拉 Advanced → Certificate Expiry Notification ✓
默认通知阈值 14 / 7 天前。
看你的通知渠道是否正常（Settings → Notifications → Test）
```

### 升级失败 / DB schema migration 错

```bash
# 1. 备份 DB
docker stop uptime-kuma
sudo cp /opt/uptime-kuma/data/kuma.db /backup/uk-pre-upgrade.db

# 2. 拉新版
cd /opt/uptime-kuma
docker compose pull
docker compose up -d

# 3. 看日志
docker logs -f uptime-kuma
```

### 长时间 down 历史很大 / 慢

```bash
# Settings → General → Clear Statistics 5 minutes mark
# 删 5 分钟以上历史（保留 down/up 事件）

# 或定期清最旧
docker exec uptime-kuma sqlite3 /app/data/kuma.db \
  "DELETE FROM heartbeat WHERE time < datetime('now', '-180 days');"
docker exec uptime-kuma sqlite3 /app/data/kuma.db "VACUUM;"
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=uptime-kuma

# 2. Web UI 响应
curl -fsS http://127.0.0.1:3001/ -o /dev/null -w '%{http_code}\n'
# 200

# 3. 健康检查
docker inspect uptime-kuma --format '{{ "{{" }}.State.Health.Status{{ "}}" }}'
# healthy

# 4. DB 健康
docker exec uptime-kuma sqlite3 /app/data/kuma.db "SELECT COUNT(*) FROM monitor;"
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次重写，**`data/kuma.db` 完全保留**——所有监控 / 通知 / 状态页配置都不动。重启容器即可应用新配置。

## ⚠️ 敏感性

**review** — Uptime Kuma 知道你的所有内部服务 URL + 凭据（HTTP 监控可带 Authorization header）。

强制：

1. **公网必须 HTTPS**
2. admin 强密码 + 长期保密
3. HTTP monitor 带 token 时——Settings 中的 token 是密文存储，**不要把 monitor URL 公开**
4. 公开状态页**仅显示监控的状态**（up/down + 名字），不暴露 URL
5. 备份 DB 含密码（监控认证 / 通知 webhook URL）—— 加密存储

## 隐私说明

- **完全本地**——所有监控数据 / 历史 / 用户在你服务器
- **无遥测**（开源）
- 通知 webhook 出方向连第三方（按你配置的 Discord / Slack / 等）
- 状态页公开 URL 任何人能访问（设公开就是公开）
- HTTP monitor 会主动请求被监控的目标——目标方能看到你的 server IP
