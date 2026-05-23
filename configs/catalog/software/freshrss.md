# FreshRSS 阅读器

FreshRSS 是**自托管 RSS / Atom 订阅聚合器**——Feedly / Inoreader / Google Reader 替代。**适合**：信息消费者、新闻 / 博客追踪、研究者跟踪学术 RSS。**Fever API 兼容**——能用 Reeder / Unread / NetNewsWire / 其他主流 RSS 客户端。**资源轻**（150 MB RAM）。

## 你将得到什么

- 📦 **FreshRSS 容器**（`freshrss/freshrss:latest`）+ **PostgreSQL 16**
- ✅ Web UI 监听 `127.0.0.1:8085`
- ✅ 自动 cron 拉 feed（默认每 15 分钟）
- ✅ 多用户支持
- ✅ Fever API（兼容 100+ 第三方 App）
- ✅ Google Reader API（兼容 Reeder 等高级客户端）
- ✅ OPML 导入 / 导出
- ✅ 50+ 扩展（黑暗模式 / 缓存全文 / etc）

## 表单字段说明

### `fr_data_dir`

```
{data_dir}/
├── data/                # 用户配置 + cache
├── extensions/          # 扩展
└── postgres-data/        # PG 数据
```

`postgres-data` 含订阅 / 已读状态 / 用户——**每周备份**。

### `fr_port`

本机端口，默认 8085。

### `fr_admin_user` / `fr_admin_password` / `fr_db_password`

⚠️ FreshRSS **首次访问 Web UI 时**进 setup wizard，要手动输入这些值。Playbook 不能预创建账号（FreshRSS 设计）。

### `fr_cron_min`

cron 分钟字段。`*/15` = 每 15 分钟。

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name rss.example.com;

    ssl_certificate     /etc/letsencrypt/live/rss.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rss.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 B — Setup Wizard（首次访问）

```
1. http://server-ip:8085/i/ → "Check installation"
2. Default database type: PostgreSQL
3. DB 设置:
   Host:     freshrss-db          (容器名)
   User:     freshrss
   Password: <见 docker-compose.yml 内 POSTGRES_PASSWORD>
   Database: freshrss
   Prefix:   freshrss_
4. Admin 创建:
   Username: admin
   Password: <密码>
5. Submit → 进 Web UI
```

### 模板 C — 加订阅

```
+ Subscription → URL → 粘贴 RSS / Atom URL
  https://news.ycombinator.com/rss
  https://www.bbc.co.uk/news/world/rss.xml

或 Search → 输关键词 → 选 feed

OPML 导入:
  Configuration → Import / Export → 选 OPML 文件
```

### 模板 D — 第三方 App（Fever API）

```
启用 Fever API:
  Configuration → User profile → Authentication → API → Enable
  → 设置 API password（与登录密码不同）

iOS:
  Reeder / Unread / NetNewsWire / Fiery Feeds
  → Add Account → Fever
  URL:        https://rss.example.com/api/fever.php
  Username:   admin
  Password:   <Fever API 密码>

Android:
  FocusReader / Newsfold
```

### 模板 E — 启用扩展

```
Configuration → Extensions → 看可用扩展
  - GReader Endpoint    (启用 Google Reader API)
  - Tweet OG Image       (Twitter 缩略图)
  - Reduce-Motion        (无动画)
  - Auto-stick top       (滚动固定)
  - YouTube              (RSS 内嵌视频)
```

### 模板 F — 备份

```bash
# PG dump
docker exec freshrss-db pg_dump -U freshrss freshrss | gzip > rss-$(date +%F).sql.gz

# data/（用户偏好）+ extensions/
sudo tar -czf freshrss-backup.tar.gz -C /opt/freshrss data extensions
```

## 关键参数调优速查

| 订阅数 | RAM | 拉取时间 |
|---|---|---|
| < 50 | 150 MB | 30 秒 |
| < 500 | 250 MB | 2-5 分钟 |
| < 5000 | 500 MB | 15+ 分钟 |

大量 feed 时调整 `fr_cron_min` 到 `*/30` 或 `0` 整点，避免一直在拉。

## 跨发行版兼容

容器化跨发行版一致，ARM64 完美支持。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`linkwarden`** — 互补（RSS 拉信息源，Linkwarden 长期归档具体文章）
- **`wikijs`** — 互补（信息消费 → 整理沉淀）

## 排错

### 拉 feed 失败 / "Last update failed"

```bash
# 1. 该 feed URL 真有效？
curl -fsS https://example.com/rss | head

# 2. 容器内能访问？
docker exec freshrss curl -fsS https://example.com/rss | head

# 3. 看 cron 日志
docker exec freshrss cat /var/www/FreshRSS/data/users/<user>/log_app.txt | tail
```

### Setup wizard 报 DB 连接错

```bash
# DB 信息错（最常见）
# Host 必须是 freshrss-db（容器名），不是 localhost / 127.0.0.1

# 检查 PG 容器健康
docker exec freshrss-db pg_isready -U freshrss
```

### 第三方 App 401

```bash
# 1. Fever API 启用了？
# Configuration → Authentication → API → Enable

# 2. URL 完整
https://rss.example.com/api/fever.php
# 不是 /api 也不是 /

# 3. Fever password ≠ 登录密码
```

### 老 feed 已读状态丢失

```bash
# 数据在 PG → 备份不及时丢了
# 之后开启每日备份
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=freshrss

# 2. Web 响应
curl -fsS http://127.0.0.1:8085/i/ -o /dev/null -w '%{http_code}\n'

# 3. PG 健康
docker exec freshrss-db pg_isready -U freshrss
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——PG 数据 / 用户 / 订阅 / 已读全部保留。

## ⚠️ 敏感性

**review** — 阅读历史含个人偏好。

强制：

1. **公网必须 HTTPS**
2. admin 强密码 + Fever API 单独密码
3. 备份 PG（订阅列表）

## 隐私说明

- **完全本地**——订阅 / 已读状态 / 历史在你服务器
- **零遥测**（开源）
- 主动拉公网 feed URL（按你的订阅）—— 暴露你的服务器 IP 给源
- 加的扩展可能有自己的网络行为（看每个扩展文档）
