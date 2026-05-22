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
