# Navidrome 音乐流媒体服务器

Navidrome 是**自托管 Spotify 替代品**——专为音乐设计（不像 Jellyfin 啥都做），**Subsonic API 兼容**——能用 100+ 第三方 App（iOS / Android / 桌面）。Go 写，**~50MB RAM**，启动 1 秒。**适合**：本地音乐收藏 + 多设备流媒体、家人共享。**不适合**：放视频（用 `jellyfin-media`）。

## 你将得到什么

- 📦 **Navidrome 容器**（`deluan/navidrome:latest`）
- ✅ Web UI 监听 `127.0.0.1:4533`
- ✅ 音乐目录**只读挂载**（不会改你的文件）
- ✅ 自动元数据扫描（每小时）+ 智能播放列表 + 评分 / 喜爱
- ✅ 转码（高码率 → 移动网络省流量）
- ✅ Subsonic API + Open Subsonic 扩展
- ✅ 多用户 + 各自播放历史
- ✅ Last.fm scrobble 支持（默认关）

## 表单字段说明

### `nd_music_dir`

音乐目录绝对路径。子目录递归扫描。**只读**——Navidrome 不会改文件。

支持格式：mp3 / flac / ogg / m4a / aac / wav / opus / wma / aif。

推荐目录结构（虽然 Navidrome 按 ID3 标签识别，但好结构方便管理）：

```
/srv/music/
├── 周杰伦/
│   ├── 范特西/
│   │   ├── 01 爱在西元前.mp3
│   │   └── 02 爱情悬崖.mp3
│   └── 八度空间/
└── Coldplay/
    └── A Rush of Blood to the Head/
```

### `nd_data_dir`

```
{data_dir}/data/
├── navidrome.db       # SQLite（元数据 + 用户 + 历史）
├── cache/             # 缩略图缓存
└── ...
```

备份 `navidrome.db` = 备份用户 / 历史 / 喜爱（不含音乐文件本身）。

### `nd_port`

本机端口，默认 4533。生产用反代。

### `nd_admin_user` / `nd_admin_password`

⚠️ Navidrome **首次访问 Web UI 时**才创建 admin（不是 Playbook 创建）。

工作流：

1. Playbook 跑完，看运行日志记下密码
2. 浏览器打开 `http://server-ip:4533`
3. 出现"创建第一个账号"页面 → 输入 admin / 上面记下的密码
4. 进入 Web UI

## 配置文件 / 目录速查

```
{data_dir}/data/navidrome.db   # 主数据库

# 容器内
/data/                          # 数据目录
/music/                         # 你的音乐（只读）

# 环境变量（docker-compose.yml 改）
ND_LOGLEVEL                     # 日志级别
ND_SCANSCHEDULE                 # 扫描周期（@every 1h / @midnight）
ND_LASTFM_ENABLED               # last.fm scrobble
ND_ENABLETRANSCODINGCONFIG      # 转码功能（默认开）
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name music.example.com;

    ssl_certificate     /etc/letsencrypt/live/music.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music.example.com/privkey.pem;

    # 流式播放大文件
    client_max_body_size 100M;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:4533;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
```

### 模板 B — 添加用户 + 各自家目录

```
Web UI → 右上角 admin → Settings → Users → New user
  Username:  alice
  Password:  ...
  Email:     alice@example.com
  Admin:     false
```

普通用户**看到的是同一个音乐库**——Navidrome 不支持按用户分音乐目录（这是设计而非 bug）。要分库 → 部署多个 Navidrome 实例。

### 模板 C — 配 Subsonic App（iOS / Android）

iOS 推荐：

| App | 价格 | 优点 |
|---|---|---|
| **Substreamer** | 免费 | 简洁，Last.fm 集成 |
| **play:Sub** | 付费一次 | 老牌，功能全 |
| **Amperfy** | 免费开源 | 现代 UI |

Android 推荐：

| App | 价格 | 优点 |
|---|---|---|
| **DSub** | 免费 | 老牌可靠 |
| **Symfonium** | 付费一次 | 最现代 UI |
| **Substreamer** | 免费 | iOS 同款 |

App 配置：

```
Server URL:  https://music.example.com
Username:    alice
Password:    <密码>
Use HTTPS:   ✓
```

### 模板 D — 转码（移动流量省）

```yaml
# docker-compose.yml
environment:
  ND_ENABLETRANSCODINGCONFIG: "true"
```

Web UI → Settings → Transcoding：

```
Default Transcoding:    Disabled         (高质量，全速度)
                        OPUS 96k         (省流量)
                        MP3 192k         (兼容老 App)
```

App 端连接时：高码率 FLAC 自动转码 → 客户端只见 OPUS（省 80% 带宽）。

### 模板 E — 智能播放列表

```
Web UI → Playlists → New → Smart Playlist
  Rules:
    Genre = '中国摇滚' AND
    Year >= 2010 AND
    Rating >= 4

  Sort: Random
  Limit: 100 songs
```

每次播放自动用最新匹配——动态更新。

### 模板 F — 备份

```bash
# DB 是关键（用户 / 历史 / 喜爱 / 智能列表）
cp /opt/navidrome/data/navidrome.db /backup/navidrome-$(date +%F).db

# 或整目录
sudo tar -czf navidrome-backup.tar.gz -C /opt navidrome
```

音乐文件**不需要 Navidrome 备份**——它们在 `nd_music_dir`，按你自己的存储备份策略。

### 模板 G — 启用 Last.fm scrobble

```yaml
# docker-compose.yml
environment:
  ND_LASTFM_ENABLED: "true"
  ND_LASTFM_APIKEY: "<你的 API key>"      # https://www.last.fm/api/account/create
  ND_LASTFM_SECRET: "<API secret>"
```

Web UI → Profile → 连 Last.fm 账号 → 之后所有播放自动 scrobble。

## 关键参数调优速查

### 资源占用

| 库大小 | RAM | 扫描时间 |
|---|---|---|
| < 5k 曲 | 50 MB | < 1 min |
| < 50k 曲 | 100 MB | 5-10 min |
| < 500k 曲 | 200 MB | 1-2 小时 |

首次扫描慢——之后只扫新增文件（按 mtime）。

### 扫描频率

```yaml
ND_SCANSCHEDULE: "@every 1h"        # 默认
# 大库可调慢：
ND_SCANSCHEDULE: "@every 6h"
ND_SCANSCHEDULE: "@daily"
```

### 转码并发

```yaml
ND_TRANSCODINGCACHESIZE: "100M"     # 转码缓存
ND_IMAGECACHESIZE: "10M"
```

## 跨发行版兼容

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64 | ✅（树莓派完美） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`jellyfin-media`** — 互补（JF 视频，Navidrome 音乐）
- **`samba-share` / `nfs-server`** — 把 `nd_music_dir` 共享给桌面便于上传

## 排错

### 扫描后曲库空

```bash
# 1. 容器能看到音乐？
docker exec navidrome ls /music | head

# 2. 文件格式支持？
docker exec navidrome ls /music | grep -iE '\.(mp3|flac|m4a|ogg|wav)$' | head

# 3. ID3 标签缺失（最常见）
# Navidrome 优先按 ID3 元数据组织——文件名仅备用
# 用 mp3tag / Picard 整理 ID3 标签
```

### Web UI 进不去 / 没创建账号机会

```bash
# 重置 DB（**会丢所有用户 / 历史**）
docker compose down
sudo rm /opt/navidrome/data/navidrome.db
docker compose up -d
# 再次访问会出现创建账号页
```

### App 连不上 / 401 Unauthorized

```bash
# 1. URL 含完整协议
https://music.example.com           ← 不要 http
https://music.example.com:443       ← 不要带端口

# 2. 用户名 / 密码大小写

# 3. 反代 WebSocket / proxy_buffering off？
```

### 中文乱码

```bash
# 容器 locale
docker exec navidrome locale
# 应有 LANG=C.UTF-8 或 zh_CN.UTF-8

# ID3 标签编码（旧 mp3 用 GBK 编码）
# 用 mp3tag 把所有 ID3 转 UTF-8
```

### 转码失败

```bash
# Navidrome 转码用 ffmpeg —— 容器内已装
docker exec navidrome ffmpeg -version

# 看转码日志
docker logs navidrome 2>&1 | grep -i transcod
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=navidrome

# 2. ping
curl -fsS http://127.0.0.1:4533/ping
# OK

# 3. 库扫描状态
# Web UI → Library → 看 "Last scan"

# 4. API 工作
curl -fsS 'http://127.0.0.1:4533/rest/ping?u=admin&p=<密码>&v=1.16.1&c=test&f=json'
# {"subsonic-response":{"status":"ok",...}}
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——`navidrome.db` **保留**（用户 / 历史 / 喜爱 / 智能列表全部）。要重置 → 删 `data/navidrome.db` 后重跑。

## ⚠️ 敏感性

**review** — Navidrome 音乐库一般不敏感，但 admin 账号能看所有用户播放历史。

强制：

1. **公网必须 HTTPS**（很多 App 拒非 HTTPS）
2. admin 强密码
3. 公网启用 fail2ban-protection 防爆破

## 隐私说明

- **完全本地**——音乐 + 元数据 / 用户 / 历史在你服务器
- **零遥测**（开源）
- Last.fm scrobble（默认关）——开了会上传播放记录到 last.fm
- Spotify ID（默认空）——不用 Spotify 的封面 / 歌词
- App 走 Subsonic API（密码以 token + salt 形式传输，**HTTPS 仍是必须**）
