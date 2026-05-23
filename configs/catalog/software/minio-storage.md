# MinIO 对象存储

MinIO 是 S3 兼容的开源对象存储——单二进制、零配置启动。AWS S3 SDK / aws-cli / boto3 / rclone / Terraform 都能直接用。**适合自建对象存储 / 备份目标 / CI artifact 仓库 / 容器 registry 后端 / Loki / Velero / Restic 的存储后端**。

> **本 Playbook 装单节点单磁盘模式**（适合中小规模 / 开发测试）。生产分布式集群（多机多盘 erasure coding）见官方文档。

## 你将得到什么

- ✅ MinIO server 二进制装到 `/usr/local/bin/minio`
- ✅ MinIO Client (mc) 装到 `/usr/local/bin/mc`
- ✅ 数据目录（默认 `/var/lib/minio/data`）
- ✅ S3 API 监听 `:9000`
- ✅ Web Console 监听 `:9001`
- ✅ root 用户 / 密码已设
- ✅ systemd 服务 + 专用 `minio-user` 用户

## 表单字段说明

### `root_user` / `root_password`

S3 兼容协议里：

- `root_user` → 客户端配置的 `AWS_ACCESS_KEY_ID`
- `root_password` → 客户端配置的 `AWS_SECRET_ACCESS_KEY`

> ⚠️ **永远不要用默认 `minioadmin/minioadmin`**——出厂值，自动扫描器满世界找。

留空 = EnvForge 自动生成 24 位强凭据。

### `api_port`

S3 客户端连此端口（默认 9000）。

### `console_port`

Web 控制台（默认 9001）。

### `data_dir`

数据存储目录。生产推荐放专用磁盘 / 大容量 LVM（不要根分区）。

## 配置文件 / 目录速查

```
/etc/default/minio                       # ← 启动环境变量（systemd 读）
/etc/systemd/system/minio.service        # systemd unit

/var/lib/minio/                           # 数据根
└── data/                                  # ← 默认数据目录
    ├── .minio.sys/                        # MinIO 系统元数据（**不要动**）
    ├── <bucket-1>/
    └── <bucket-2>/

# 二进制
/usr/local/bin/minio                       # server
/usr/local/bin/mc                           # client

# 日志（默认通过 systemd journal）
sudo journalctl -u minio
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制下载（无包） | 二进制下载 |
| 二进制位置 | `/usr/local/bin/minio` | 相同 |
| 服务名 | `minio` | `minio` |
| 运行用户 | `minio-user` | 同 |

## 常见配置模板

### 模板 A — `/etc/default/minio` 启动环境

```bash
# Volume to be used for MinIO server.
MINIO_VOLUMES="/var/lib/minio/data"

# 监听
MINIO_OPTS="--address :9000 --console-address :9001"

# Root 凭据
MINIO_ROOT_USER="envforge_admin"
MINIO_ROOT_PASSWORD="STRONG-RANDOM-PASSWORD-AT-LEAST-8-CHARS"

# 域名（生产建议）
MINIO_SERVER_URL="https://s3.example.com"               # API 域名
MINIO_BROWSER_REDIRECT_URL="https://console.example.com" # Console 域名

# 区域（任意值，但客户端需匹配）
MINIO_REGION="us-east-1"

# 加密所有静态数据（启用 SSE-S3）
MINIO_KMS_AUTO_ENCRYPTION=on
# MINIO_KMS_SECRET_KEY="my-minio-key:VEctZGFkLWh1bWFucy1mZWFyLW1l..."

# 公网 URL（若挂反代）
# MINIO_DOMAIN=s3.example.com

# Browser
MINIO_BROWSER=on
```

应用：`sudo systemctl restart minio`。

### 模板 B — Web Console 登录 + 创建 bucket

```bash
# 浏览器
http://server-ip:9001/

# 登录：root_user / root_password
# Buckets → Create Bucket → 输入名（小写、3-63 字符、唯一）

# 或命令行
mc alias set local http://localhost:9000 envforge_admin 'STRONG-PASS'
mc mb local/my-backups
mc ls local
```

### 模板 C — 用 mc CLI

```bash
# 配置 alias
mc alias set local http://localhost:9000 envforge_admin 'PASS'
mc alias set s3-aws https://s3.amazonaws.com AKIA... SECRET-KEY

# Bucket
mc mb local/photos
mc ls local
mc rb --force local/old-bucket

# Object
mc cp ./report.pdf local/photos/                     # 上传
mc cp local/photos/report.pdf ./                      # 下载
mc cp -r ./local-folder local/photos/                 # 递归
mc mirror ./local-folder local/photos/                 # 镜像（增量同步）
mc rm local/photos/old.pdf

# 跨 endpoint 同步
mc mirror local/photos s3-aws/my-aws-bucket/

# 设 bucket policy
mc anonymous set download local/public-bucket          # 公开读
mc anonymous set none local/private-bucket             # 私有

# 设 lifecycle（自动删除 30 天前的对象）
mc ilm rule add --expire-days 30 local/photos

# 看 bucket 信息
mc stat local/photos
mc du local/photos
mc ls --recursive --summarize local/photos
```

### 模板 D — 创建受限应用账号（**强烈推荐**）

不要让业务应用用 root 凭据！每个应用一个独立 user + 限定 bucket：

```bash
# 用 mc 操作 admin API
mc admin user add local app1 'app1-strong-password'

# 创建 policy（仅访问 myapp- 开头的 bucket）
cat > /tmp/app1-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::myapp-*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::myapp-*/*"]
    }
  ]
}
EOF

mc admin policy create local app1-policy /tmp/app1-policy.json
mc admin policy attach local app1-policy --user app1

# 业务应用配置
# AWS_ACCESS_KEY_ID=app1
# AWS_SECRET_ACCESS_KEY=app1-strong-password
```

### 模板 E — Python boto3 客户端

```python
import boto3
from botocore.config import Config

s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:9000',           # MinIO endpoint
    aws_access_key_id='app1',
    aws_secret_access_key='app1-strong-password',
    region_name='us-east-1',
    config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
)

# Bucket
s3.create_bucket(Bucket='myapp-data')

# Upload
s3.upload_file('local.pdf', 'myapp-data', 'docs/report.pdf')
s3.put_object(Bucket='myapp-data', Key='small.txt', Body=b'hello')

# Download
s3.download_file('myapp-data', 'docs/report.pdf', 'local-copy.pdf')
data = s3.get_object(Bucket='myapp-data', Key='small.txt')['Body'].read()

# List
for obj in s3.list_objects_v2(Bucket='myapp-data')['Contents']:
    print(obj['Key'], obj['Size'])

# Pre-signed URL（临时分享链接）
url = s3.generate_presigned_url('get_object', Params={'Bucket': 'myapp-data', 'Key': 'docs/report.pdf'}, ExpiresIn=3600)
print(url)
```

### 模板 F — Nginx 反代 + HTTPS（生产推荐）

MinIO 默认 HTTP，公网暴露要前面挂 nginx：

```nginx
upstream minio_api { server 127.0.0.1:9000; }
upstream minio_console { server 127.0.0.1:9001; }

server {
    listen 443 ssl http2;
    server_name s3.example.com;

    ssl_certificate /etc/letsencrypt/live/s3.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/s3.example.com/privkey.pem;

    # MinIO 大对象
    client_max_body_size 0;
    client_body_buffer_size 4M;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 300s;

    location / {
        proxy_pass http://minio_api;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        chunked_transfer_encoding off;
    }
}

server {
    listen 443 ssl http2;
    server_name console.example.com;

    ssl_certificate /etc/letsencrypt/live/console.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/console.example.com/privkey.pem;

    location / {
        proxy_pass http://minio_console;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`/etc/default/minio` 加：

```bash
MINIO_SERVER_URL="https://s3.example.com"
MINIO_BROWSER_REDIRECT_URL="https://console.example.com"
```

### 模板 G — 备份目标（Restic / Borg / Velero）

#### Restic

```bash
export RESTIC_REPOSITORY="s3:http://localhost:9000/restic-backup"
export RESTIC_PASSWORD="strong-restic-password"
export AWS_ACCESS_KEY_ID="app1"
export AWS_SECRET_ACCESS_KEY="app1-pass"

restic init
restic backup /home /etc /var/www
restic snapshots
restic restore latest --target /tmp/restore
```

#### rclone

```bash
rclone config           # 选 type=s3, provider=Minio, endpoint=http://localhost:9000
rclone sync /local/ minio:my-bucket/
rclone copy minio:my-bucket/ /local/restored/
```

### 模板 H — Object Lifecycle（自动清理 / 转冷存）

```bash
# 30 天后删
mc ilm rule add --expire-days 30 local/temp-files

# 7 天后转 tier
mc ilm rule add --transition-days 7 --transition-tier WARM local/photos

# 看规则
mc ilm rule ls local/photos

# 删规则
mc ilm rule rm --id <rule-id> local/photos
```

## 关键参数调优速查

### 性能

| 项 | 推荐 |
|---|---|
| 数据盘 | NVMe SSD（低延迟）/ SATA SSD（吞吐） |
| 文件系统 | XFS（推荐）/ ext4 / btrfs |
| `O_DIRECT` | XFS 自动启用 |
| 并发 | 默认无限制；CPU 核数 ≥ 8 起步 |
| Erasure coding（多盘） | 至少 4 盘起 |

### 资源占用

| 部署 | RAM | CPU | 存储 |
|---|---|---|---|
| 单机单盘（< 100 GB） | 256 MB | < 1 vCPU | 按业务 |
| 单机大盘（< 10 TB） | 1 GB | 1 vCPU | – |
| 单机超大（< 100 TB） | 8 GB | 4 vCPU | – |

### 磁盘要求

```bash
# 不要放 NFS / SMB（一致性问题）
# 不要放容器层（Docker overlay2）
# XFS 推荐：
sudo mkfs.xfs /dev/sdb1
sudo mount -o defaults,noatime /dev/sdb1 /mnt/minio
```

## 跨发行版兼容

二进制安装跨发行版一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| Anolis 9 | ✅ |
| Alpine | 用 `minio/minio:latest` Docker |
| ARM64 | ✅（自动选 arm64 二进制） |

## 与其它 catalog 项的配合

- **`loki-logging`** — Loki 用 MinIO 作为 chunk 存储后端
- **`prometheus-monitoring`** — MinIO 原生暴露 Prometheus 指标（`/minio/v2/metrics/cluster`）
- **`rsync-tools`** — Restic / rclone / Velero 用 MinIO 作备份目标
- **`docker-host-profile`** — 用 `minio/minio` 容器化部署
- **`certbot-ssl`** + **`nginx-web-service`** — 反代 + HTTPS（模板 F）

## 排错

### `Specified path is not exclusively allocated to MinIO`

数据目录里有非 MinIO 文件：

```bash
sudo ls -la /var/lib/minio/data
# 删掉非 MinIO 文件，或换空目录
```

### 服务起来但访问极慢

```bash
# 1. 数据目录在网络盘 / NFS（一致性问题 + 慢）
# MinIO 必须本地盘

# 2. 文件系统不是 XFS
mount | grep minio
# 推荐 XFS

# 3. 太多小对象 listing
# MinIO 设计为大对象（> 1 MB）；几百万小对象 listing 会慢
```

### `403 Forbidden` / `AccessDenied`

```bash
# 1. access/secret key 错
mc admin user info local app1

# 2. user 没 attach policy
mc admin policy entities --user=app1 local

# 3. policy 不允许这个 action / resource
mc admin policy info local app1-policy
```

### Console 登录卡住

```bash
# 1. console 端口在听？
sudo ss -tlnp | grep 9001

# 2. MINIO_BROWSER_REDIRECT_URL 配错（反代场景）
sudo grep MINIO_BROWSER /etc/default/minio
sudo systemctl restart minio
```

### 升级后数据看不见

```bash
# MinIO 数据格式有时升级。回退到旧二进制：
sudo systemctl stop minio
sudo cp /usr/local/bin/minio.bak /usr/local/bin/minio   # 之前备份的版本
sudo systemctl start minio
```

升级前**务必备份 .minio.sys**。

### `minio: server cannot start with empty argument`

`MINIO_VOLUMES` 没设：

```bash
sudo grep MINIO_VOLUMES /etc/default/minio
echo 'MINIO_VOLUMES="/var/lib/minio/data"' | sudo tee -a /etc/default/minio
```

### 大对象上传失败 `EntityTooLarge`

S3 单次 PUT 限制 5GB。客户端用 multipart：

```python
# boto3 已自动分片（> 8MB 走 multipart）
config = TransferConfig(multipart_threshold=1024 * 25, max_concurrency=10)
s3.upload_file(file, bucket, key, Config=config)
```

### `Could not connect to MinIO server`

```bash
# 1. 服务在跑？
systemctl is-active minio

# 2. 端口
sudo ss -tlnp | grep 9000

# 3. 防火墙
sudo ufw status

# 4. SELinux（RHEL）
sudo ausearch -m avc -ts recent | grep minio
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active minio

# 2. 端口
sudo ss -tlnp | grep -E ':(9000|9001) '

# 3. Health
curl -fsS http://localhost:9000/minio/health/live
curl -fsS http://localhost:9000/minio/health/ready

# 4. mc 客户端
mc alias set local http://localhost:9000 root_user root_pass
mc ls local
mc admin info local

# 5. 创建 + 上传 + 下载测试
mc mb local/test-bucket
echo "hello" > /tmp/test.txt
mc cp /tmp/test.txt local/test-bucket/
mc cat local/test-bucket/test.txt
mc rb --force local/test-bucket
rm /tmp/test.txt

# 6. 看版本
minio --version
mc --version

# 7. Prometheus metrics
curl http://localhost:9000/minio/v2/metrics/cluster | head
```

## 多次运行

`installMode: skip-existing`。二进制下载有 `creates` 守卫。**`/etc/default/minio` 每次按表单值重写**——root 凭据每次更新（便于忘了重设）。**已有 buckets / objects 完全保留**（数据安全）。

## ⚠️ 敏感性

**review** — 默认配置 9000/9001 监听 0.0.0.0。**root 凭据 = 全部数据的钥匙**。

强制：

1. **不用默认 `minioadmin/minioadmin`**
2. 反代 + HTTPS 后再公网暴露（模板 F）
3. 业务用受限 user 凭据，不直接给 root（模板 D）
4. 启用静态加密（`MINIO_KMS_AUTO_ENCRYPTION=on`）
5. 数据盘**不要**用 NFS / SMB

## 隐私说明

- root 密码会出现在 Playbook 任务日志（一次）+ `/etc/default/minio`（明文，权限 0600）
- 安装后建议 console 里再改一次密码（多重确认）
- 数据全部本地存储 `/var/lib/minio/data/`——**不上传不同步**
- 启用 `MINIO_KMS_AUTO_ENCRYPTION=on` 后所有对象 SSE-S3 加密（防硬盘被取出后裸读）
- pre-signed URL 含临时凭据，分享时注意有效期
- MinIO 默认收集少量匿名遥测（启动时 ping minio.io）；可关：`MINIO_PROMETHEUS_AUTH_TYPE=public`
