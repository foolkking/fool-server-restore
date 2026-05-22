# Jellyfin 媒体服务器

Jellyfin 是开源的自建媒体服务器——你的电影、电视剧、音乐、有声书集中放服务器上，
从手机/电视/网页流式播放。功能等同 Plex/Emby，但**完全开源 + 没有付费墙**。

## 你将得到什么

- 📦 **jellyfin** + 依赖（来自 Jellyfin 官方仓库）
- ✅ Web UI 在 `:8096`
- ✅ 服务启动并设开机自启
- ⚠️ **首次访问需要在浏览器里跑安装向导**（设管理员账号、添加媒体库）

## 安装后

### 第一次配置

打开 `http://server-ip:8096` 进入安装向导：

1. **选语言**
2. **创建管理员账号**（用户名 + 密码）
3. **添加媒体库**：
   - 类型：电影 / 电视剧 / 音乐 / 有声书 / 照片
   - 文件夹：服务器上媒体文件的路径
4. **元数据语言**（中文 / 英文）
5. **远程访问**：选"允许从公网访问"还是"仅本地"

向导完成后跳到登录页，用刚创建的账号登录。

### 媒体库目录结构（重要！）

Jellyfin 用文件名识别媒体。强烈建议按规范组织：

**电影**：
```
/srv/media/movies/
  Inception (2010)/
    Inception (2010).mkv
    poster.jpg
  The Matrix (1999)/
    The Matrix (1999).mp4
```

**电视剧**：
```
/srv/media/tv/
  Breaking Bad/
    Season 01/
      Breaking Bad - S01E01 - Pilot.mkv
      Breaking Bad - S01E02 - Cat's in the Bag.mkv
```

**音乐**：
```
/srv/media/music/
  Artist Name/
    Album Name/
      01 - Track Name.mp3
```

详见 https://jellyfin.org/docs/general/server/media/。

### 移动设备 App

iOS/Android/Apple TV/Roku/Fire TV/LG TV 都有官方 App，免费下载。
配置：填 `http://server-ip:8096`，登录账号，全套媒体随便看。

### 硬件转码（关键性能优化）

Jellyfin 默认软解，CPU 跑爆。**有 GPU 的话务必启用硬件转码**：
- Intel/AMD 集成显卡：QSV / VAAPI
- NVIDIA：NVENC（需装驱动）

UI → Dashboard → Playback → Transcoding → Hardware acceleration。

### 反向代理（公网访问推荐）

挂 nginx 后用 443 + 域名，比直接暴露 8096 更安全：

```nginx
server {
    listen 443 ssl;
    server_name jellyfin.example.com;

    location / {
        proxy_pass http://127.0.0.1:8096;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;        # 大文件流式必须

        # WebSocket（实时通知）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## ⚠️ 敏感性

**review** — Jellyfin 流式播放视频很吃带宽（4K 流大约 50Mbps）。**先确认你的上行带宽够**，
不然一个客户端就能把出口跑满。

## 验证

```bash
systemctl status jellyfin --no-pager
curl -I http://localhost:8096/web/
```

## 排错

- **`permission denied` 读媒体目录** — Jellyfin 以 `jellyfin` 用户运行。媒体目录权限要让 jellyfin 能读：`sudo chmod -R 755 /srv/media` 或 `sudo chgrp -R jellyfin /srv/media`。
- **首次扫描媒体库慢** — 大库（10000+ 文件）首次扫描可能要 1-2 小时（要识别 + 拉海报 + 元数据）。
- **跨发行版**：Jellyfin 官方提供 install-debuntu.sh（Ubuntu/Debian）和 install-fedora.sh（Fedora/CentOS/RHEL），EnvForge 自动选用。Anolis 因为是 RHEL 克隆能用 fedora 脚本。

## 多次运行

`installMode: skip-existing`。已装就跳过 install 脚本。媒体库配置在 web UI 里，本 Playbook 不动。

## 隐私说明

- Jellyfin 默认不发任何遥测数据。
- 媒体文件不会被 EnvForge 上传或同步。
- 用户信息存在 `/var/lib/jellyfin/`。

## 配置文件 / 目录速查

```
/etc/jellyfin/                      # 系统配置（一般不动）
/var/lib/jellyfin/
├── config/
│   ├── system.xml                  # 全局系统设置（端口/HTTPS/...）
│   ├── network.xml                 # 监听地址、UPnP、PublishedServerUrl
│   ├── encoding.xml                # 转码：ffmpeg 路径、HW accel、临时目录
│   └── logging.json                # 日志级别
├── data/                           # 用户、库元数据 SQLite
├── plugins/                        # 已装插件 dll
├── log/                            # 运行日志（jellyfin.log + 滚动文件）
└── transcodes/                     # 转码临时文件（默认会自动清，但能堆很大）
/var/cache/jellyfin/                # 元数据 + 海报缓存
```

> 这些 XML 优先用 Web Dashboard 改，**不要直接改文件**——服务运行时它会被覆盖。
> 只有需要在脚本/Ansible 里复用配置时才编辑文件，且必须先 `systemctl stop jellyfin`。

### 硬件转码（HW Acceleration）配置详解

**软解 4K H.265 流一路就能吃掉 4 vCPU**——硬件转码是中等以上规模媒体库的必选项。
按 GPU 类型选驱动 + Web 设置：

#### Intel 集成显卡 / Arc（QSV 或 VAAPI）— 最常见

```bash
# Ubuntu/Debian
sudo apt-get install -y intel-media-va-driver-non-free vainfo
# RHEL/Anolis
sudo dnf install -y intel-media-driver libva-utils

# 验证 VAAPI 工作
vainfo
# 应该列出 H264 / HEVC / AV1 的 encoder/decoder profiles

# Jellyfin 用户加入 video / render 组（访问 /dev/dri/）
sudo usermod -aG video,render jellyfin
sudo systemctl restart jellyfin
```

Web Dashboard → Playback → Transcoding：
- Hardware acceleration: **Intel QuickSync (QSV)** 或 **VAAPI**
- VA API device: `/dev/dri/renderD128`
- 勾选 H264 / HEVC / VP9 / AV1（按你 CPU 代次能力）
- 启用 "Allow encoding in HEVC format"

#### NVIDIA（NVENC）— 性能最强

```bash
# 装驱动（按发行版）
sudo apt-get install -y nvidia-driver-535
# 装 nvidia-container-toolkit（Docker 部署 Jellyfin 时）

nvidia-smi                # 验证驱动 OK
```

Web Dashboard → Playback → Transcoding：
- Hardware acceleration: **NVIDIA NVENC**
- 勾选支持的编码器（NVENC 不支持 VP9 编码，能解码）

#### AMD（VAAPI / AMF）

```bash
sudo apt-get install -y mesa-va-drivers vainfo
vainfo
sudo usermod -aG video,render jellyfin
```

Web Dashboard → Playback → Transcoding：
- Hardware acceleration: **VAAPI**
- VA API device: `/dev/dri/renderD128`

### 转码临时目录改路径（防把根分区写满）

转码 4K 流可能瞬时产生几 GB 临时文件。默认在 `/var/lib/jellyfin/transcodes/`，
有大盘建议挪到大盘：

Web Dashboard → Playback → Transcoding → "Transcoding temporary path"：
```
/mnt/data/jellyfin-transcodes
```

或者用 tmpfs 挂在内存（要求 RAM 充足，每 4K 流约 2-4GB）：
```bash
sudo mkdir -p /mnt/jellyfin-tmp
echo "tmpfs /mnt/jellyfin-tmp tmpfs defaults,size=8G,mode=1770,uid=jellyfin,gid=jellyfin 0 0" | sudo tee -a /etc/fstab
sudo mount -a
```

### 远程公网访问（多种方案）

#### 方案 1：反向代理（推荐）

EnvForge 有 `Nginx Web 服务` Playbook 配反向代理 + `Certbot SSL` 证书。
Web Dashboard → Networking 必须配置：
- "Public HTTP port": 80
- "Public HTTPS port": 443
- "Override 'Known proxies'": 127.0.0.1（信任本机 nginx 转发的 X-Forwarded-For）
- "PublishedServerUrl": `https://media.example.com`

#### 方案 2：Tailscale / ZeroTier（私网 VPN）

不暴露公网，家人朋友安装 VPN 客户端后才能访问。最安全。

#### 方案 3：DLNA + 家庭网络（仅本地）

Web Dashboard → Plugins → 启用 DLNA。智能电视 / Kodi 自动发现 Jellyfin。
**仅本地网络可见，公网不可达**。

### 媒体扫描调度

Web Dashboard → Scheduled Tasks → "Scan Media Library"：
- 默认每天凌晨扫描，库大可改每周
- 添加新文件后**手动触发"Scan all libraries"**比等定时快

### 备份关键数据

```bash
# 关键数据：用户配置 + 元数据数据库（不含媒体文件本身）
sudo systemctl stop jellyfin
sudo tar czf jellyfin-backup-$(date +%F).tar.gz \
    /var/lib/jellyfin/config \
    /var/lib/jellyfin/data \
    /var/lib/jellyfin/plugins
sudo systemctl start jellyfin

# 还原
sudo systemctl stop jellyfin
sudo tar xzf jellyfin-backup-2024-01-15.tar.gz -C /
sudo chown -R jellyfin:jellyfin /var/lib/jellyfin
sudo systemctl start jellyfin
```
