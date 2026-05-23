# Immich 自托管照片库

Immich 是**自托管 Google Photos 替代品**——AI 人脸识别 / 物体分类 / 时间轴 / 地图 + iOS/Android 原生 App 自动备份相册。**2024 年 GitHub stars 增速第一**（55k+ stars），是自托管最热门的"个人云"项目。**适合**：家庭照片库、专业摄影师作品集、企业团队照片管理。**与 Nextcloud 关系**：互补不互斥——NC 是文件协作，Immich 是照片专用（UI / AI / App 体验远超 NC Photos）。

## 你将得到什么

- 📦 **Immich 容器栈**（5 容器：server + ML + Redis + PG + Postgres-vector）
- 📦 **PostgreSQL with pgvecto-rs**（向量检索——CLIP 智能搜索）
- ✅ Web UI 监听 `127.0.0.1:2283`
- ✅ AI 人脸识别（自动聚类同一人）
- ✅ AI 物体 / 场景识别（"猫"、"海滩"、"婚礼"等关键词搜索）
- ✅ CLIP 智能搜索（"穿红色衣服的人"、"夕阳"）
- ✅ 时间轴 + 地图视图
- ✅ 照片元数据完整保留（GPS / EXIF / 拍摄设备）
- ✅ 多用户支持 + 共享相册
- ✅ iOS / Android 官方 App（自动备份相册）

## 表单字段说明

### `imm_domain`

公开域名。生产 HTTPS 强烈推荐（手机 App 在 HTTP 下部分功能受限）。

### `imm_jwt_secret`

JWT 签名密钥。改了 = 所有用户被强制重登。

### `imm_upload_location`

⚠️ **最重要字段**——照片库存这里。

- 一个家庭 5 年照片轻松 1-2 TB
- 推荐挂**大盘 / NAS**（NFS / Samba / iSCSI）
- 路径必须是**绝对路径**
- 容器内 UID 默认 1000（不一致时 chown 处理）

### `imm_port`

本机端口。生产用反代。

### `imm_disable_ml`

`true` = 关闭 ML 服务。

| 资源 | 启用 ML | 关闭 ML |
|---|---|---|
| RAM | 2-3 GB | 800 MB |
| 磁盘 | + 5 GB（模型缓存） | 仅照片 |
| 启动时间 | +30s（模型加载） | < 30s |
| 失去功能 | – | 人脸 / 物体 / CLIP 搜索 |

照片**仍能正常上传 / 查看 / 元数据搜索**——仅失去 AI 功能。

## 配置文件 / 目录速查

```
/opt/immich/
├── .env                            # 环境变量（密码 / 路径）
├── docker-compose.yml
├── postgres/                       # PG 数据（**重要**——元数据 + 用户 + 缩略图引用）
├── library/                        # **照片原文件**（最大目录）
│   └── ...
└── model-cache/                    # ML 模型（首次启动下载，~5 GB）
    ├── facial-recognition/
    └── clip/

# 容器名
immich
immich-ml
immich-redis
immich-postgres
```

## 常见配置模板

### 模板 A — 创建首个用户（admin）

浏览器打开 `http://server-ip:2283/`：

```
1. 注册页面（首次访问出现）
2. 邮箱 / 密码 / 名字
3. 登录后默认是 admin（首个用户自动获 admin 权限）
4. Settings → 邀请其他家庭成员
```

### 模板 B — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name photos.example.com;

    ssl_certificate     /etc/letsencrypt/live/photos.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/photos.example.com/privkey.pem;

    # Immich 上传可能很大（4K 照片 + 4K 视频）
    client_max_body_size 50G;
    proxy_read_timeout 600s;
    send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:2283;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host               $host;
        proxy_set_header X-Real-IP          $remote_addr;
        proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto  $scheme;
        # 大文件不缓冲
        proxy_buffering off;
        proxy_request_buffering off;
    }
}

server {
    listen 80;
    server_name photos.example.com;
    return 301 https://$host$request_uri;
}
```

### 模板 C — 手机 App 配置（iOS/Android）

```
1. App Store / Play Store 下载 Immich
2. Server URL: https://photos.example.com
3. 登录（用 web 注册的账号）
4. Settings → Backup → 选 Camera Roll → 启用 Foreground / Background backup

# 后台备份在 iOS 上有限制——Immich 24h 内会被系统挂起
# 解：定期开 App 让它跑（或装 Tasker 等外部触发器）
```

### 模板 D — External libraries（不复制原文件，原地引用）

适合你已有的大量历史照片放在某 NAS 路径：

```
1. 容器挂载 NAS 路径
   编辑 docker-compose.yml 加：
   immich-server:
     volumes:
       - /mnt/nas/family-photos:/external/family:ro    ← read-only

2. 重启
   docker compose up -d --force-recreate immich-server

3. Web UI → Administration → External Library
   Path: /external/family
   Owner: alice@example.com

4. 触发扫描
```

External library **不复制文件**——Immich 仅索引 + 缩略图缓存。原 NAS 文件改了 / 删了，Immich 同步。

### 模板 E — 自动备份照片库（rsync 到另一台机器）

```bash
# /etc/cron.daily/immich-backup
#!/bin/bash
BACKUP_HOST=backup.example.com
BACKUP_DIR=/backup/immich

# 1. 备份 PG（含所有元数据 + 人脸聚类等）
docker exec immich-postgres pg_dump -U postgres immich | gzip > /tmp/immich-pg-$(date +%F).sql.gz
rsync -az /tmp/immich-pg-*.sql.gz "$BACKUP_HOST:$BACKUP_DIR/pg/"
rm -f /tmp/immich-pg-*.sql.gz

# 2. 备份照片原文件（增量）
rsync -az --delete /opt/immich/library/ "$BACKUP_HOST:$BACKUP_DIR/library/"

# 3. 旧 PG 备份保留 30 天
ssh "$BACKUP_HOST" "find $BACKUP_DIR/pg/ -name '*.sql.gz' -mtime +30 -delete"
```

```bash
sudo chmod +x /etc/cron.daily/immich-backup
```

### 模板 F — GPU 加速 ML（NVIDIA）

```yaml
# docker-compose.yml
services:
  immich-machine-learning:
    image: ghcr.io/immich-app/immich-machine-learning:${IMMICH_VERSION}-cuda
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

人脸聚类 5 万张照片：CPU 5 小时 → GPU 30 分钟。

### 模板 G — 升级 Immich

```bash
cd /opt/immich

# 备份（**必做**——Immich 每月发版，schema 偶变）
docker exec immich-postgres pg_dump -U postgres immich > immich-pre-upgrade.sql

# 拉新版
docker compose pull
docker compose up -d

# 看日志（schema migration 可能花 5-30 分钟，看库大小）
docker logs -f immich
```

## 关键参数调优速查

### 资源占用

| 照片量 | RAM（含 ML） | RAM（无 ML） | 磁盘 |
|---|---|---|---|
| < 10k | 2 GB | 1 GB | 库大小 + 5 GB（缩略图） |
| < 100k | 4 GB | 2 GB | 库 + 10 GB |
| < 1M | 8 GB | 4 GB | 库 + 50 GB |

### ML 模型选择

`/opt/immich/.env` 可配：

```bash
# 默认面部识别
MACHINE_LEARNING_FACIAL_RECOGNITION_MODEL=buffalo_l   # 默认
# buffalo_s = 更小更快，精度略低
# buffalo_l = 默认，平衡
# antelope = 最大精度，最慢

# CLIP（智能搜索）
MACHINE_LEARNING_CLIP_MODEL=ViT-B-32__openai          # 默认
# ViT-B-32__openai = 默认，800 MB 模型
# ViT-L-14__openai = 大 3 倍，搜索精度高
```

### 缩略图调优

Web 显示用低分辨率缩略图。可调：

```
Settings → Administration → System Settings → Thumbnails
  Preview size:    1440px  (默认 — 平板 / 笔电查看用)
  Thumbnail size:  250px   (默认 — 列表用)
```

减小 → 省磁盘 + 快。增大 → 更清晰。

### Job 并发

```
Administration → System Settings → Jobs
  Thumbnail Generation: 5      (默认 5)
  Metadata Extraction:  5
  Sidecar:              5
  Library:              5
  Migration:            5
  Search:               5
```

机器吃力时调到 2-3。机器闲（夜间批量处理）调到 10。

## 跨发行版兼容

容器化跨发行版一致。

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Docker 部署 | ✅ | ✅ |
| ARM64 | ✅（多架构镜像）| ✅ |
| Anolis 9 | – | ✅ |
| GPU（NVIDIA） | nvidia-container-toolkit | 同 |
| 内存最低 | 2 GB（无 ML）/ 4 GB（含 ML） | 同 |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`postgres-profile`** — **不用**（Immich 用专用 pgvecto-rs 镜像）
- **`nextcloud`** — 互补（NC 文件 + Immich 照片，分别专精）
- **`rsync-tools`** — 备份照片库

## 排错

### Immich 启动慢（5 分钟仍未 ready）

正常——首次启动要：

1. PG 初始化 + 应用 schema migration
2. 下载 ML 模型（CLIP + 人脸识别），共 ~5 GB
3. 索引建立

```bash
docker logs -f immich
docker logs -f immich-ml      # 看模型下载进度
```

### "Failed to load thumbnails" / 上传文件 500 错

```bash
# 1. 上传目录权限？
ls -la /opt/immich/library
# 容器内 immich 用户 UID = 1000，需可写

sudo chown -R 1000:1000 /opt/immich/library

# 2. 磁盘满？
df -h /opt/immich/library
```

### 手机 App 一直转圈无法登录

```bash
# 1. URL 对吗？必须含 https:// 和域名（不能 IP）
# 2. 自签证书 → App 拒（必须 LE 或正规 CA）
# 3. 反代 WebSocket 漏配？
curl -fsS https://photos.example.com/api/server-info/ping
```

### 后台备份不工作（iOS）

iOS 限制：

- App 必须**最近 7 天打开过**
- WiFi + 充电 + 锁屏才会触发后台
- 解：开 App 让它跑前台一会；启用 Foreground backup（即时上传）

### 人脸识别没结果

```bash
# 1. ML 服务跑着？
docker logs immich-ml
# 应有 "Model loaded" 类似日志

# 2. 触发 Job 重跑
# Web UI → Administration → Jobs → Face Recognition → All

# 3. 至少要有 5+ 张同一人的照片才会聚类
```

### CLIP 搜索效果差（返回不相关）

CLIP 模型语言能力以英文为主。中文搜索效果差是已知。

```bash
# 用英文关键词
"sunset"   优于   "夕阳"
"red car"  优于   "红色的车"
```

升级到 ViT-L-14 模型（更大但精度高）：

```bash
# .env
MACHINE_LEARNING_CLIP_MODEL=ViT-L-14__openai
docker compose up -d --force-recreate immich-ml
# 等模型重新下载 + 全库重索引（库大慢）
```

### 升级后 Web UI 显示版本不一致

```bash
# 三个容器（server / ml / 后端工具）必须同版本
docker compose pull
docker compose up -d --force-recreate
```

## 验证

```bash
# 1. 所有容器跑着
docker ps --filter name=immich

# 2. API 响应
curl -fsS http://127.0.0.1:2283/api/server-info/ping
# {"res":"pong"}

# 3. 服务器版本
curl -fsS http://127.0.0.1:2283/api/server-info/version
# {"major":1, "minor":xxx, "patch":x}

# 4. 数据库
docker exec immich-postgres pg_isready -U postgres -d immich

# 5. ML（若启用）
docker exec immich-ml ls /cache/clip/
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` + `.env` 每次按表单值重写。**`postgres/` + `library/` + `model-cache/` 完全保留**——重跑不丢照片 / 不丢人脸聚类 / 不重下模型。

## ⚠️ 敏感性

**review** — 照片含**家庭隐私 + GPS 位置 + 人脸数据**——攻陷 = 非常严重的隐私事故。

强制：

1. **公网必须 HTTPS**（HSTS 长 max-age）
2. **强密码 + 2FA**（Settings → Account → Two-Factor）
3. 反代加 fail2ban / IP 白名单（含家用 + 手机）
4. **每日备份**（PG + library 两份）—— 见模板 E
5. 不要用 EXIF 含 GPS 的照片做公开链接（"Shared Albums" 默认含 GPS）

## 隐私说明

- **完全本地**——照片 + 人脸数据全在你服务器
- ML 模型**首次启动从 GitHub 下载**（约 5 GB），之后离线运行
- **零遥测**（开源）
- App 上传 / 浏览走你的反代 → 服务器，**不经过任何第三方**
- 共享链接（Shared Albums）：分享出去的链接含 token，**带 token 就能访问**——别公开发到论坛
- GPS 数据：上传保留原 EXIF（含位置），可以在 Settings 中关"share location with shared links"
