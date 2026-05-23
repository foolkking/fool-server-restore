# 自托管个人知识库（PKM）

**信息消费 → 整理 → 沉淀的完整闭环**——三件套一键部署：

- 📦 **FreshRSS** — RSS / Atom 订阅聚合（信息源）
- 📦 **Linkwarden** — 书签 + **网页全文 / 截图 / PDF 永久归档**（防原页消失）
- 📦 **Wiki.js** — 现代化 Wiki / 知识库（写作 / 整理 / 输出）

**典型工作流**：

```
  RSS 拉信息源
       ↓
  发现好文章 → Linkwarden 一键收藏 + 归档（永久保存）
       ↓
  反复阅读 → 抽取笔记 → 写到 Wiki.js
       ↓
  沉淀的知识 = 你的"个人 Wikipedia"
```

## 你将得到什么

- ✅ Wiki.js `127.0.0.1:3000` —— Markdown 编辑 + git 同步 + 全文搜索
- ✅ FreshRSS `127.0.0.1:8085` —— 多用户 + Fever API（接 Reeder / Unread）
- ✅ Linkwarden `127.0.0.1:3020` —— 浏览器扩展一键收藏 + Chromium 归档
- ✅ 三个 PG 数据库（独立隔离）
- ✅ 三组件同 PG 密码（简化）

## 表单字段说明

### `pkm_data_dir`

```
{data_dir}/
├── wiki/postgres-data/
├── rss/{data,postgres-data}/
└── lw/{data,postgres-data}/      # **lw/data/** 含 Linkwarden 网页归档（可能很大）
```

⚠️ Linkwarden 归档膨胀很快——5000 链接 ≈ 50 GB。

### `pkm_wiki_port` / `pkm_rss_port` / `pkm_lw_port`

3 个端口都仅 127.0.0.1，生产用反代到不同子域。

### `pkm_db_password`

三 PG 共用同样的密码（不同库）。简化管理。

## 常见配置模板

### 模板 A — 三子域反代

```nginx
# Wiki.js
server {
    listen 443 ssl http2;
    server_name wiki.example.com;
    ssl_certificate     /etc/letsencrypt/live/wiki.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.example.com/privkey.pem;
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# FreshRSS
server {
    listen 443 ssl http2;
    server_name rss.example.com;
    ssl_certificate     /etc/letsencrypt/live/rss.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rss.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Linkwarden
server {
    listen 443 ssl http2;
    server_name links.example.com;
    ssl_certificate     /etc/letsencrypt/live/links.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/links.example.com/privkey.pem;
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 B — 完整工作流示例

```
1. FreshRSS 加订阅
   + Subscription → URL: https://news.ycombinator.com/rss

2. 阅读时发现好文 → 浏览器扩展点 Linkwarden 图标
   → 自动归档（截图 + PDF + readability 文本）
   → 加 Tags: AI / 量化金融 / 等

3. 长期参考的内容 → 写到 Wiki.js
   - Books → AI 笔记 → Page → Markdown 写
   - 引用 Linkwarden 链接做来源
   - 配图 / 嵌视频

4. 全文搜索贯穿三件套：
   - FreshRSS 搜未读
   - Linkwarden 搜已收藏的归档全文
   - Wiki.js 搜你的笔记
```

### 模板 C — Wiki.js 启用 git 同步（笔记备份到 GitHub）

```
Wiki.js Admin → Storage → Add → Git
  Repository URL:     git@github.com:user/notes.git
  Branch:              main
  SSH key:             生成（自动）
  Sync direction:      Push
  Frequency:           Every 5 minutes
```

每次改 Wiki.js 自动 push 到 GitHub 私库——免费云备份。

### 模板 D — Linkwarden 浏览器扩展

```
1. Web UI → Settings → Access Tokens → New Token
2. Chrome / Firefox 装 Linkwarden 扩展
3. 配:
   Server URL:  https://links.example.com
   API Token:   <粘贴>
4. 任何网页 → 点扩展 → 一键收藏
```

### 模板 E — FreshRSS 配 Fever API + 移动 App

```
1. FreshRSS Config → Authentication → API → Enable
   设 API password（与登录密码不同）

2. iOS Reeder / Unread / NetNewsWire:
   Add Account → Fever
   URL: https://rss.example.com/api/fever.php
   Username: admin
   Password: <Fever API 密码>
```

### 模板 F — 备份

```bash
#!/bin/bash
# /etc/cron.daily/pkm-backup
DEST=/backup/pkm

# 各 PG dump
docker exec pkm-wiki-db pg_dump -U wikijs wikijs | gzip > $DEST/wiki-$(date +%F).sql.gz
docker exec pkm-rss-db pg_dump -U freshrss freshrss | gzip > $DEST/rss-$(date +%F).sql.gz
docker exec pkm-lw-db pg_dump -U linkwarden linkwarden | gzip > $DEST/lw-$(date +%F).sql.gz

# Linkwarden 归档（大）
sudo rsync -az --delete /opt/selfhost-pkm/lw/data/ $DEST/lw-data/

# 旧 PG 备份保留 30 天
find $DEST -name '*.sql.gz' -mtime +30 -delete
```

## 关键参数调优速查

### 资源占用（三件套 + 3 个 PG）

| 规模 | RAM | 磁盘 |
|---|---|---|
| 个人小用（< 100 RSS / < 500 链接 / < 100 wiki page） | 1 GB | 5 GB |
| 中等（< 1000 链接 / < 5k page） | 2 GB | 50 GB（链接归档大） |
| 大量归档 | 3 GB | 200 GB+ |

### Linkwarden 归档关闭省磁盘

```yaml
# 改 docker-compose.yml lw 服务
environment:
  ARCHIVE_TAKE_SCREENSHOT: "false"   # 截图最大占空间
  ARCHIVE_AS_PDF: "false"             # PDF 也大
  ARCHIVE_AS_READABILITY: "true"      # 仅保留可读文本（小）
```

### Wiki.js git 同步频率

```
Storage → Git → Frequency
  小用户: Every hour
  写作多: Every 5 min
```

## 跨发行版兼容

容器化跨发行版一致，ARM64 ✅（Linkwarden Chromium 慢但能跑）。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`sso-stack`** — 加 SSO（强烈建议——三个工具都重要）
- **`bookstack`** — Wiki.js 替代品（结构化更强）
- **`umami`** — 监控 Wiki 访问量

## 排错

### Wiki.js setup wizard DB 连接失败

```bash
# DB host 必须 wiki-db（容器名）
# 密码 = pkm_db_password
# 库名 = wikijs
# 用户 = wikijs

# 看日志
docker logs pkm-wiki
```

### FreshRSS setup 时连不上 DB

```
DB Host:     rss-db
DB User:     freshrss
DB Password: <pkm_db_password>
DB Name:     freshrss
Prefix:      freshrss_
```

### Linkwarden 归档失败

```bash
docker logs pkm-lw | grep -i puppeteer
# Chromium 启动慢——首次启动等 60 秒
```

## 验证

```bash
# 6 个容器都跑着（3 应用 + 3 PG）
docker ps --filter name=pkm-

# 三个应用响应
curl -fsS http://127.0.0.1:3000/ -o /dev/null -w 'wiki %{http_code}\n'
curl -fsS http://127.0.0.1:8085/i/ -o /dev/null -w 'rss %{http_code}\n'
curl -fsS http://127.0.0.1:3020/ -o /dev/null -w 'lw %{http_code}\n'
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——所有 PG 数据 / 笔记 / 订阅 / 书签 / 归档全部保留。

## ⚠️ 敏感性

**review** —

- Wiki.js 含个人知识 / 笔记
- Linkwarden 含完整浏览归档（可能含敏感）
- FreshRSS 阅读历史 = 兴趣画像

强制：

1. **公网必须 HTTPS**
2. 所有三个组件强密码
3. 加 SSO（`sso-stack`）—— 三个独立登录烦
4. **每日备份 + 异地** —— 含数据 + 加密存储

## 隐私说明

- **完全本地**——所有内容在你服务器
- **零遥测**（三个都开源）
- FreshRSS / Linkwarden 主动连源 URL（暴露你的服务器 IP）
- Wiki.js git 同步会上传到外部 git 服务（按你的配置）
- Linkwarden 归档可选 Wayback Machine（默认关）
