# Umami 隐私优先网站分析

Umami 是 **Google Analytics 替代品**——**无 cookie、GDPR 合规、轻量**（< 100 MB RAM）。在你网站嵌一段 JS，看 PV / UV / 来源 / 设备 / 地区。**适合**：博客 / 小型 SaaS / 需要 GDPR 合规的电商。

## 你将得到什么

- 📦 **umami** + **postgres:16-alpine** Docker compose 栈
- ✅ Web UI 监听 `127.0.0.1:3001`
- ✅ 默认登录 `admin` / `umami`（**立刻改**）
- ✅ Telemetry 已禁用
- ✅ 内嵌 PG 数据库
- ✅ 数据持久化 `/opt/umami/db-data/`

## 表单字段说明

### `umami_domain`

公开域名。**tracking script 从此 URL 加载**——浏览器访问目标网站时去 umami.example.com 拉 script.js。

### `umami_port`

本机端口。

### `umami_db_password`

内嵌 PG 密码（容器间通信）。

### `umami_app_secret`

Umami 加密 session token 的密钥。**丢失则所有 session 失效**。留空 = 自动生成 64 hex。

### `umami_data_dir`

数据目录。

## 配置文件 / 目录速查

```
/opt/umami/
├── docker-compose.yml                       # ← EnvForge 写入
└── db-data/                                  # ← PG 数据（最关键）

# Umami 配置全在数据库 + 环境变量，无独立配置文件
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker compose |
| 镜像 | `ghcr.io/umami-software/umami:postgresql-latest` + `postgres:16-alpine` |
| 内存 | ~200 MB |

## 常见配置模板

### 模板 A — 首次登录 + 改密码

```
http://server-ip:3001
```

默认 `admin` / `umami`：

1. **立刻改密码**：右上角头像 → Profile → Password

### 模板 B — 添加 website + 嵌 tracking script

UI → Settings → Websites → Add website：

```
Name: My Blog
Domain: blog.example.com
```

→ 拿到 Tracking code：

```html
<script defer src="https://umami.example.com/script.js" data-website-id="<UUID>"></script>
```

把这段 JS 放到目标网站的 `</head>` 前。

### 模板 C — Nginx 反代（必备）

```nginx
server {
    listen 443 ssl http2;
    server_name umami.example.com;
    ssl_certificate /etc/letsencrypt/live/umami.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/umami.example.com/privkey.pem;

    # CORS——让其他域名能加载 script.js
    add_header Access-Control-Allow-Origin "*";

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 模板 D — 自定义 tracking script 名（防广告屏蔽）

广告屏蔽器（uBlock / AdGuard）会屏蔽 `umami.js` 等明显路径。改 path：

```yaml
# docker-compose.yml umami 容器加 env
environment:
  TRACKER_SCRIPT_NAME: "stats,analytics"      # 自定义路径
```

之后可用 `/stats.js` 或 `/analytics.js` 加载（避开屏蔽）。

```html
<script defer src="https://umami.example.com/stats.js" data-website-id="..."></script>
```

### 模板 E — 备份

```bash
docker exec umami-db pg_dump -U umami umami > /backup/umami-$(date +%F).sql
gpg -c /backup/umami-$(date +%F).sql
```

## 关键参数调优速查

### 资源占用

| 月 PV | RAM | 磁盘 |
|---|---|---|
| < 100k | 200 MB | 100 MB |
| < 1M | 500 MB | 1 GB |
| < 10M | 1 GB | 5 GB |

Umami 极轻量。

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`plausible`** — 替代品（互斥）
- **`postgres-profile`** — 不需要（自带容器）

## 排错

### 默认密码不对

```bash
# 看 PG 里的 admin 用户
docker exec umami-db psql -U umami umami -c "SELECT * FROM \"user\";"

# 重置密码（hash 的，复杂——重置 admin 最简单：删用户 + 重启容器）
docker exec umami-db psql -U umami umami -c "DELETE FROM \"user\" WHERE username='admin';"
docker restart umami
# 重启后会自动重建默认 admin/umami
```

### Tracking 数据没收到

```bash
# 1. 浏览器开发者工具 Network → 看 script.js 是否加载
# 2. 看 umami 日志
docker logs umami | tail -30

# 3. 域名 / website ID 对吗
# UI → Websites → 看 ID

# 4. 广告屏蔽器屏蔽了 umami.js（用模板 D 改 script 名）
```

### 反代后 IP 全是 127.0.0.1

```yaml
# docker-compose.yml umami 加
environment:
  CLIENT_IP_HEADER: "X-Forwarded-For"
```

## 验证

```bash
docker ps | grep umami
curl http://127.0.0.1:3001/api/heartbeat              # {"status":"ok"}
```

## 多次运行

`installMode: skip-existing`。compose 重写。**db-data 保留**。

## ⚠️ 敏感性

**review** — Umami 自身合规（无 cookie），但**含访问统计数据**——按 GDPR 处理。

强制：

1. 立刻改默认密码
2. 公网必须 HTTPS
3. APP_SECRET 离线备份

## 隐私说明

- **无 cookie**——不需 cookie consent banner
- 不收集个人识别信息（PII）
- IP 只用于地区识别，**不存原始 IP**（hash 后只存 country）
- Telemetry 已禁用
- 数据本地存储 PG
- GDPR 合规标杆（许多欧盟博客指定推荐）
