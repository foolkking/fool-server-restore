# 自托管多媒体三件套

**家庭 / 个人 NAS 完整媒体方案**——视频 / 音乐 / 有声书各用专精工具：

- 📦 **Jellyfin** — 视频流媒体（Plex 替代，开源）
- 📦 **Navidrome** — 音乐流媒体（Subsonic API 兼容，能用 100+ 第三方 App）
- 📦 **Audiobookshelf** — 有声书 + 播客服务器（官方 iOS / Android App）

**为什么不一个 Jellyfin 全管？** Jellyfin 视频强 / 音乐勉强 / 有声书弱。各专精工具体验完胜（同样的硬件 / 同样的库）。

## 你将得到什么

- ✅ Jellyfin `127.0.0.1:8096` —— 视频 / 电影 / 剧集
- ✅ Navidrome `127.0.0.1:4533` —— 音乐（智能播放列表 / 喜爱）
- ✅ Audiobookshelf `127.0.0.1:13378` —— 有声书 + 播客
- ✅ 4 个媒体目录隔离（movies / tvshows / music / audiobooks）
- ✅ 媒体目录**只读挂载**（不会改你的文件）
- ✅ 各自独立用户系统

## 表单字段说明

### `sm_data_dir`

```
{data_dir}/
├── jellyfin/{config,cache}/      # JF 元数据 + 缩略图
├── navidrome/data/               # ND SQLite + 用户
└── audiobookshelf/{config,metadata}/  # ABS 配置
```

### `sm_movies_dir` / `sm_tvshows_dir` / `sm_music_dir` / `sm_audiobooks_dir`

媒体文件目录。建议挂大盘 / NAS。

**推荐目录结构**：

```
/srv/media/
├── movies/                # 电影
│   ├── The Matrix (1999).mkv
│   ├── Inception (2010).mp4
│   └── ...
├── tvshows/               # 剧集
│   ├── Breaking Bad/
│   │   ├── Season 01/
│   │   └── Season 02/
│   └── ...
├── music/                 # 音乐
│   ├── 周杰伦/
│   │   ├── 范特西/
│   │   └── 八度空间/
│   └── ...
└── audiobooks/            # 有声书（每书一目录）
    ├── 三体/
    │   └── *.m4b
    └── ...
```

### `sm_jf_port` / `sm_nd_port` / `sm_ab_port`

3 个端口都仅 127.0.0.1 绑定，生产用反代到不同子域。

## 常见配置模板

### 模板 A — 三子域反代

```nginx
# 视频
server {
    listen 443 ssl http2;
    server_name media.example.com;
    ssl_certificate     /etc/letsencrypt/live/media.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/media.example.com/privkey.pem;
    client_max_body_size 1G;
    proxy_read_timeout 600s;
    location / {
        proxy_pass http://127.0.0.1:8096;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}

# 音乐
server {
    listen 443 ssl http2;
    server_name music.example.com;
    ssl_certificate     /etc/letsencrypt/live/music.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:4533;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 有声书
server {
    listen 443 ssl http2;
    server_name books.example.com;
    ssl_certificate     /etc/letsencrypt/live/books.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/books.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:13378;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 模板 B — 首次设置

**Jellyfin**：

```
http://server-ip:8096/web/ → 走 setup wizard
1. 语言:        中文
2. 用户名:      admin / 密码
3. 媒体库:
   + Add Movies   → /movies
   + Add Shows    → /tvshows
4. 元数据语言:   中文 / Chinese
5. Done → 登录
```

**Navidrome**：

```
http://server-ip:4533/ → 创建 admin → Library Scan
```

**Audiobookshelf**：

```
http://server-ip:13378/ → 创建 admin
Settings → Libraries → New
  Type: Audiobooks
  Path: /audiobooks
```

### 模板 C — 移动 App 推荐

**视频（Jellyfin）**：

| 平台 | App | 价格 |
|---|---|---|
| iOS | Jellyfin（官方） | 免费 |
| iOS | Infuse | 付费（最强体验） |
| Android | Jellyfin（官方） | 免费 |
| Android TV | Jellyfin / Findroid | 免费 |

**音乐（Navidrome / Subsonic API）**：

| 平台 | App |
|---|---|
| iOS | Substreamer / Amperfy / play:Sub |
| Android | DSub / Symfonium / Substreamer |

**有声书（Audiobookshelf）**：

| 平台 | App |
|---|---|
| iOS / Android | Audiobookshelf（官方） |

### 模板 D — 硬件加速（视频转码）

Jellyfin 转码默认 CPU 软件——慢且占资源。启用 GPU 加速：

```yaml
# docker-compose.yml jellyfin 服务
devices:
  - /dev/dri:/dev/dri        # Intel iGPU / AMD GPU
groups_add:
  - "989"                     # render group ID（getent group render | cut -d: -f3）

# 或 NVIDIA
runtime: nvidia
environment:
  NVIDIA_VISIBLE_DEVICES: all
```

Web UI → Dashboard → Playback → 选 VAAPI / NVENC / 等。

### 模板 E — 加 SSO 保护

如果已部署 `sso-stack`：

```yaml
# 给 docker-compose.yml 加 networks + labels（每服务）
networks:
  default:
  sso:
    external: true
    name: sso-stack_sso
```

### 模板 F — 备份

```bash
sudo tar -czf media-backup-$(date +%F).tar.gz -C /opt selfhost-media
```

媒体文件**不需要 combo 备份**——它们在 `sm_*_dir`，按你 NAS 备份策略。

## 关键参数调优速查

### 资源占用（三件套总和，无转码时）

| 媒体规模 | RAM | 磁盘（缓存） |
|---|---|---|
| 小（< 100 影 + 1k 曲） | 500 MB | 5 GB |
| 中（< 1k 影 + 10k 曲） | 1 GB | 30 GB |
| 大（< 10k 影 + 100k 曲） | 2 GB | 200 GB |

### Jellyfin 转码 CPU

| 来源 → 目标 | CPU（无 GPU） |
|---|---|
| H.264 1080p → 同 | 1 核 100% |
| 4K HEVC → 1080p H.264 | 4 核 100%（慢） |
| 4K HEVC → 1080p（GPU） | 5% |

**有 4K 库 → 必装硬件加速**。

### Navidrome 大库扫描

```yaml
# docker-compose.yml
ND_SCANSCHEDULE: "@every 6h"     # 大库（10万+ 曲）调慢
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64 | ✅（Jellyfin / Navidrome / ABS 都支持） |
| 硬件加速 | Intel / AMD / NVIDIA 见模板 D |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`samba-share` / `nfs-server`** — 共享媒体目录便于上传
- **`sso-stack`** — 加 SSO（可选）
- **`homelab-dashboard`** — Homepage 列出三个服务做入口
- **`immich`** — 互补（照片 vs 视频流）

## 排错

### Jellyfin 视频卡 / 转码失败

```bash
# 1. 硬件加速没启用 → CPU 转码不够
# 见模板 D

# 2. 转码缓存满
docker exec media-jellyfin du -sh /cache/transcodes/
# 清: docker exec media-jellyfin rm -rf /cache/transcodes/*

# 3. 客户端 Direct Play 失败
# Web UI → Dashboard → Playback → 看转码原因
```

### Navidrome 曲库为空

```bash
# 1. 容器看到音乐？
docker exec media-navidrome ls /music | head

# 2. ID3 标签缺失？
# 用 mp3tag / Picard 整理
```

### Audiobookshelf 不识别有声书

每书需独立子目录（不能直接平铺 mp3）：

```
/srv/media/audiobooks/
├── 三体/                   ← 一本书一目录
│   ├── 01.m4b
│   └── 02.m4b
└── ...
```

## 验证

```bash
# 三个容器都跑着
docker ps --filter name=media-

# 各自响应
curl -fsS http://127.0.0.1:8096/web/ -o /dev/null -w 'jellyfin %{http_code}\n'
curl -fsS http://127.0.0.1:4533/ping -o /dev/null -w 'navidrome %{http_code}\n'
curl -fsS http://127.0.0.1:13378/ -o /dev/null -w 'audiobookshelf %{http_code}\n'
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——三个组件的数据 / 用户 / 库扫描结果全保留。

## ⚠️ 敏感性

**review** — 媒体内容一般不太敏感，但用户 / 播放历史是个人信息。

强制：

1. **公网必须 HTTPS**（移动 App 拒非 HTTPS）
2. 各自 admin 强密码
3. 公网启用 fail2ban
4. 备份 config（用户 / 偏好）

## 隐私说明

- **完全本地**——媒体 + 元数据 / 用户 / 历史在你服务器
- **零遥测**（三个都开源）
- Jellyfin 元数据抓取主动连 TheMovieDB / IMDB（首次添加新片时）
- Navidrome 默认不连 Last.fm（需手动启用）
- Audiobookshelf 元数据抓取主动连 Audible / Google Books
