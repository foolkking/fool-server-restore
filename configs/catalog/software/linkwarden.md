# Linkwarden 书签 + 网页归档

Linkwarden 是**自托管 Pocket / Raindrop 替代**——书签管理 + **自动归档网页全文 + 截图 + PDF**（防原网页消失 / 改 / 删）。**适合**：信息消费者、研究者、想"我以前看过的某文章"全文搜索的人。**与浏览器原生书签关系**：浏览器只存 URL，Linkwarden 存"打开链接时网页的真实内容"。

## 你将得到什么

- 📦 **Linkwarden 容器**（`ghcr.io/linkwarden/linkwarden:latest`）+ **PostgreSQL 16**
- ✅ Web UI 监听 `127.0.0.1:3000`
- ✅ 三种归档方式（每个链接保存 3 份）：
    - **Screenshot** — 整页截图（PNG）
    - **PDF** — 完整页面 PDF
    - **Readability** — 干净的可读文本（无广告 / 侧栏）
- ✅ 内嵌 headless Chromium（首次启动下载 ~200 MB）
- ✅ 全文搜索归档内容
- ✅ Tags + Collections（按主题分）
- ✅ 浏览器扩展（Chrome / Firefox）一键收藏
- ✅ iOS / Android App
- ✅ Public Collections（可分享）

## 表单字段说明

### `lw_data_dir`

```
{data_dir}/
├── data/                 # 归档文件（**可能很大**）
│   ├── screenshots/      # PNG 截图
│   ├── pdfs/              # PDF
│   └── archives/          # readability 文本 + HTML
└── postgres-data/         # PG（书签元数据 + 用户）
```

**警告**：5000 链接归档约 **50 GB**——挂大盘。

### `lw_port`

本机端口，默认 3000。⚠️ 这个端口很常用——可能与其他服务冲突。

### `lw_db_password` / `lw_nextauth_secret`

内部用。NextAuth secret 改了 = 所有 session 失效。

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name links.example.com;

    ssl_certificate     /etc/letsencrypt/live/links.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/links.example.com/privkey.pem;

    client_max_body_size 100M;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

反代后改 `docker-compose.yml`：

```yaml
environment:
  NEXTAUTH_URL: "https://links.example.com/api/v1/auth"
```

### 模板 B — 注册首个用户后关闭注册

```bash
# 1. 浏览器注册第一个用户（自动 admin）

# 2. 关闭公开注册
sudo sed -i 's/DISABLE_REGISTRATION: "false"/DISABLE_REGISTRATION: "true"/' \
  /opt/linkwarden/docker-compose.yml

# 3. 重启
cd /opt/linkwarden
docker compose up -d
```

### 模板 C — 加链接

```
+ New Link → URL → 粘贴
  Tags:        阅读 / 工作 / 研究
  Collection:  每周分享 / 长期参考 / etc
  Description: 你的注解

→ Linkwarden 后台异步:
  1. 抓 OG 元数据（标题 / 作者 / 摘要）
  2. headless Chromium 截图
  3. 生成 PDF
  4. 抽取 readability 文本
```

### 模板 D — 浏览器扩展（一键收藏）

Chrome Web Store / Firefox Add-ons 搜 "Linkwarden"。

```
1. 装扩展
2. 配:
   Server URL:  https://links.example.com
   API Token:   <从 Web UI 拿—— Settings → API Token>
3. 浏览任意网页 → 点扩展图标 → 自动加入 Linkwarden
```

### 模板 E — Collections + 公开分享

```
+ New Collection
  Name:    每周技术分享
  Color:   #FF5733
  Members: alice@example.com（共享给团队）

→ 选 Collection → Settings → Make Public
→ 公开 URL: https://links.example.com/public/collections/<uuid>
（任何人能看，不需登录）
```

### 模板 F — 全文搜索

```
顶部搜索框 → 关键词
  搜索范围:
    - 标题 / 描述 / 标签
    - **归档全文**（这是 Linkwarden 独门）
```

### 模板 G — 备份

```bash
# PG（链接元数据 + 用户）
docker exec linkwarden-db pg_dump -U linkwarden linkwarden | gzip > lw-pg-$(date +%F).sql.gz

# 归档文件
sudo rsync -az --delete /opt/linkwarden/data/ /backup/linkwarden-data/
```

或导出（人类可读）：

```
Settings → Import & Export → Export
  Format: JSON / HTML / Netscape Bookmarks
```

## 关键参数调优速查

### 资源占用

| 链接数 | RAM | 磁盘 |
|---|---|---|
| < 500 | 500 MB | 5 GB |
| < 5k | 1 GB | 50 GB |
| < 50k | 2 GB | 500 GB |

归档（截图 + PDF）很大——单链接平均 5-10 MB。

### 归档调优

```yaml
# docker-compose.yml
environment:
  PUPPETEER_DISABLE_HEADLESS_WARNING: "true"
  ARCHIVE_TAKE_SCREENSHOT: "true"        # false 关闭截图（省磁盘 50%）
  ARCHIVE_AS_PDF: "true"                  # false 关闭 PDF
  ARCHIVE_AS_READABILITY: "true"
  ARCHIVE_AS_WAYBACKMACHINE: "false"      # 改为 true 也存到 wayback machine
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64 | ⚠️ 慢（Chromium ARM 性能） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`freshrss`** — 互补（RSS 拉信息源 → Linkwarden 长期归档具体文章）
- **`wikijs`** — 互补（信息流 → 整理沉淀）

## 排错

### 启动慢 / 卡 60+ 秒

正常——首次启动下 Chromium（~200 MB）。

```bash
docker logs -f linkwarden     # 看进度
```

### 链接添加后归档失败 / 显示 "Pending"

```bash
# 1. Chromium 启动失败？
docker exec linkwarden which chromium
docker logs linkwarden | grep -i puppeteer

# 2. 手动触发重试
# Web UI → 选链接 → ... → Refresh Archive
```

### "NEXTAUTH_URL is not configured"

```yaml
# docker-compose.yml
environment:
  NEXTAUTH_URL: "https://links.example.com/api/v1/auth"
  # 必须含完整 URL + /api/v1/auth 路径
```

### 归档目录占满磁盘

```bash
df -h /opt/linkwarden/data

# 选项：
# 1. 关掉 PDF / 截图（见调优）
# 2. 删旧归档（仅保留元数据）
# Web UI → 选老链接 → Settings → Delete Archive Only
```

### 浏览器扩展认证失败

```bash
# Token 过期？重新生成
# Web UI → Settings → Access Tokens → + New Token
# 复制到扩展配置
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=linkwarden

# 2. Web 响应
curl -fsS http://127.0.0.1:3000/ -o /dev/null -w '%{http_code}\n'

# 3. PG 健康
docker exec linkwarden-db pg_isready -U linkwarden

# 4. Chromium 可用
docker exec linkwarden chromium --version
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——PG 数据 / 链接 / 归档全保留。

## ⚠️ 敏感性

**review** — 含个人浏览历史 + 永久归档（含可能的私密内容）。

强制：

1. **公网必须 HTTPS**
2. 注册首个 admin 后**立即关闭公开注册**（DISABLE_REGISTRATION: true）
3. 公开 Collection 仅放真公开内容（链接含 token，但 Collection 显式公开就是公开）
4. 备份 data/ 加密（含私密归档）

## 隐私说明

- **完全本地**——书签 + 归档在你服务器
- **零遥测**（开源）
- 主动访问被收藏的 URL 抓取（暴露你的服务器 IP）
- ARCHIVE_AS_WAYBACKMACHINE 默认关——开了会上传到 archive.org（公开）
- 浏览器扩展走 API token，token 在 Web UI 管理
