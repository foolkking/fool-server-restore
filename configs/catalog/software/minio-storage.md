# MinIO 对象存储

MinIO 是 S3 兼容的开源对象存储——单二进制、零配置启动。AWS S3 SDK / aws-cli /
boto3 都能直接用。适合自建对象存储、备份、CI artifact 仓库、容器 registry 后端。

此 Playbook 装**单节点单磁盘**模式（适合中小规模/开发测试）。生产分布式集群部署
请参考官方文档 https://min.io/docs/minio/linux/operations/install-deploy-manage-tenants.html。

## 你将得到什么

- ✅ MinIO server 二进制装到 `/usr/local/bin/minio`
- ✅ 数据目录（默认 `/var/lib/minio/data`）
- ✅ S3 API 监听 `:9000`
- ✅ Web Console 监听 `:9001`
- ✅ root 用户/密码已设
- ✅ systemd 服务

## 表单字段说明

### Root 用户/密码

S3 兼容协议里：
- `root_user` → AWS_ACCESS_KEY_ID
- `root_password` → AWS_SECRET_ACCESS_KEY

**不要用默认的 `minioadmin/minioadmin`**——这是出厂值，自动扫描器满世界在找。

### API 端口 / Console 端口

S3 客户端连 9000（API），人用浏览器连 9001（Web 控制台）。

### 数据目录

生产环境放在专用磁盘 / 大容量 LVM。MinIO 把每个对象存成磁盘文件，元数据存在 `.minio.sys/`。

## 安装后

### 浏览器登录

访问 `http://server-ip:9001/`，用 root 用户名密码登录。能看到：
- Buckets 列表
- Users / Policies 管理
- 监控面板（请求速率、流量）

### 用 mc (MinIO Client) 命令行

```bash
# 装 mc
curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o mc
chmod +x mc && sudo mv mc /usr/local/bin/

# 配置 alias
mc alias set local http://localhost:9000 admin 你的密码

# 创建 bucket
mc mb local/my-backups

# 上传文件
mc cp ./report.pdf local/my-backups/

# 列出
mc ls local/my-backups/
```

### 用 aws-cli（一切都是 S3）

```bash
aws configure --profile minio
# AWS Access Key ID: envforge_admin
# AWS Secret Access Key: 你的密码
# region: us-east-1 (随便填)

aws --endpoint-url http://localhost:9000 \
    --profile minio \
    s3 ls
```

### 应用代码（Python boto3）

```python
import boto3
s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:9000',
    aws_access_key_id='envforge_admin',
    aws_secret_access_key='...'
)

s3.create_bucket(Bucket='my-bucket')
s3.upload_file('report.pdf', 'my-bucket', 'report.pdf')
```

### 创建受限的应用账号（推荐）

不要把 root 凭据给业务应用用！在 console 里：
1. Identity → Users → Create user (如 `app1`, 单独密码)
2. Policies → 创建 policy 限定到某个 bucket
3. 把 policy 绑给 user
4. 业务应用用 user 的 access key

### 反向代理（生产必备）

MinIO 默认 HTTP，公网暴露要前面挂 nginx + HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name s3.example.com;
    ssl_certificate     /etc/letsencrypt/live/s3.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/s3.example.com/privkey.pem;

    client_max_body_size 0;          # 不限上传大小（大对象）
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $http_host;
    }
}
```

## ⚠️ 敏感性

**review** — 默认配置 9000/9001 监听 0.0.0.0。**root 凭据 = 全部数据的钥匙**。务必：
1. 不用默认 minioadmin/minioadmin
2. 反向代理 + HTTPS 后再公网暴露
3. 业务用受限 user 凭据，不要直接给 root

## 验证

```bash
systemctl status minio --no-pager
curl http://localhost:9000/minio/health/live
curl http://localhost:9001/         # console
```

## 排错

- **`Specified path is not exclusively allocated to MinIO`** — 数据目录里有别的非 MinIO 文件，删掉或换目录。
- **服务起来但很慢** — 数据目录在网络盘 / NFS 上：MinIO 要求本地盘（性能 + 一致性）。
- **403 Forbidden** — access/secret key 不对，或 user 没有对应 bucket 的权限。
- **跨发行版**：用二进制安装，无包管理器差异。

## 多次运行

`installMode: skip-existing`。已下载的二进制不重下，env 文件每次重写——**root 凭据每次会被表单值覆盖**。

## 隐私说明

- root 密码会出现在任务日志里。安装后建议立刻在 console 里改一次。
- 数据全部本地存储 `/var/lib/minio/data`，不上传不同步。
