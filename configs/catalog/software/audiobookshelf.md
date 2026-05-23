# Audiobookshelf 有声书 + 播客服务器

Audiobookshelf 是**自托管有声书 + 播客流媒体服务器**——多用户、断点续播、章节支持、iOS/Android **官方原生 App**。**适合**：替代付费 Audible、家庭有声书库、播客自动下载归档。**唯一专做有声书的成熟方案** —— Plex / Jellyfin 都做但功能弱。

## 你将得到什么

- 📦 **Audiobookshelf 容器**（`ghcr.io/advplyr/audiobookshelf:latest`）
- ✅ Web UI 监听 `127.0.0.1:13378`
- ✅ 有声书 + 播客双库
- ✅ 自动元数据抓取（Audible / Google Books / iTunes）
- ✅ 章节支持（m4b / mp3 内嵌）
- ✅ 多用户 + 各自进度同步
- ✅ 播客 RSS 订阅 + 自动下载
- ✅ 官方 iOS / Android App（开源）

## 表单字段说明

### `ab_audiobooks_dir`

有声书根目录。**每书一个子目录**——Audiobookshelf 按目录识别一本书：

```
/srv/audiobooks/
├── 三体/
│   ├── 01 三体.m4b
│   ├── 02 黑暗森林.m4b
│   └── 03 死神永生.m4b
├── 红楼梦/
│   ├── chapter01.mp3
│   ├── chapter02.mp3
│   └── ...
└── Harry Potter/
    └── Book 1 - Sorcerer's Stone/
        ├── 01.mp3
        └── ...
```

### `ab_podcasts_dir`

播客下载目录。RSS 订阅后自动拉。

### `ab_data_dir`

```
{data_dir}/
├── config/                # 配置 + SQLite（用户 + 进度）
└── metadata/              # 封面 / 章节缓存
```

**备份 `config/`** = 备份所有用户阅读进度。

### `ab_port`

本机端口，默认 13378。生产用反代。

## 配置文件 / 目录速查

```
{data_dir}/config/db/      # SQLite 数据库
{data_dir}/metadata/items/  # 元数据 / 封面缓存

# 容器内
/audiobooks                 # 你的有声书目录
/podcasts                   # 播客目录
/config                     # 配置
/metadata                   # 缓存
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name books.example.com;

    ssl_certificate     /etc/letsencrypt/live/books.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/books.example.com/privkey.pem;

    client_max_body_size 5G;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:13378;
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

### 模板 B — 创建 Library

```
1. 浏览器打开 → 创建 admin（首次访问）
2. Settings → Libraries → + Create New Library
   Name:     有声书
   Type:     Audiobooks
   Folders:  /audiobooks
   Save

3. + Create New Library
   Name:     Podcasts
   Type:     Podcasts
   Folders:  /podcasts
```

### 模板 C — 添加播客订阅

```
Web UI → Podcasts library → + → Search
  搜索:  Lex Fridman Podcast / The Daily / 等
  → 找到 → Subscribe → 自动下载新集
```

或直接 RSS URL：

```
+ → URL → 粘贴 RSS feed URL
```

### 模板 D — 移动 App 配置

iOS / Android: 应用商店搜 **Audiobookshelf** —— 官方原生 App，开源。

```
Server URL:  https://books.example.com
Username:    alice
Password:    <密码>
```

App 支持：

- 后台播放（车载 / 锁屏）
- 离线下载
- 章节跳转
- 睡眠定时器
- 倍速 / 静音长段

### 模板 E — 备份

```bash
# config + metadata 是关键（含进度 / 缓存）
sudo tar -czf abs-backup-$(date +%F).tar.gz -C /opt audiobookshelf

# 有声书原文件按你自己的策略备份（一般已在 NAS）
```

## 关键参数调优速查

| 库大小 | RAM | 磁盘 |
|---|---|---|
| < 100 本 | 100 MB | 库本身 + 5% 缓存 |
| < 1000 本 | 200 MB | – |

## 跨发行版兼容

容器化跨发行版一致，ARM64 完美支持（树莓派常用）。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`jellyfin-media`** — 互补（JF 视频，ABS 有声书）
- **`samba-share` / `nfs-server`** — 共享目录便于上传
- **`navidrome`** — 互补（音乐 vs 有声书）

## 排错

### 库扫描不出书

```bash
# 1. 容器看到目录？
docker exec audiobookshelf ls /audiobooks

# 2. 每书需独立子目录
ls /srv/audiobooks/      # 应有书名子目录，不能直接平铺

# 3. Web UI → Settings → Libraries → 选 library → "Force re-scan"
```

### 元数据抓不到（封面 / 作者空）

```bash
# Audiobookshelf 默认从 Audible / Google Books 抓
# 网络问题 / 抓不到 → 手动改

# Web UI → 选书 → Edit → 输入元数据
# 或上传本地封面到目录（cover.jpg）
```

### App 连不上

```bash
# URL 必须含 https:// + 域名（不能 IP + 自签证书）
# WebSocket 反代漏配（见模板 A）
```

### 大量上传慢

```bash
# Audiobookshelf 串行扫描——大量上传完后一起触发 re-scan
# 或暂停扫描：Settings → Libraries → Disable Auto-scan
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=audiobookshelf

# 2. Web 响应
curl -fsS http://127.0.0.1:13378/ -o /dev/null -w '%{http_code}\n'

# 3. 目录挂载
docker exec audiobookshelf ls /audiobooks /podcasts
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——`config/` + `metadata/` 完全保留（用户 / 进度 / 库 / 缓存全都不动）。

## ⚠️ 敏感性

**review** — 用户阅读历史 / 进度算个人偏好数据。

强制：

1. **公网必须 HTTPS**（App 拒非 HTTPS）
2. admin 强密码
3. 备份 config/（含用户 hash + 进度）

## 隐私说明

- **完全本地**——所有书 / 播客 / 进度在你服务器
- **零遥测**（开源）
- 元数据抓取主动连 Audible / Google Books（首次添加书时）
- 播客 RSS 主动拉源服务器（按你订阅的 RSS）
