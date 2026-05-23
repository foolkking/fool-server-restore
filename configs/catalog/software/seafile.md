# Seafile 文件同步

Seafile 是**专业文件同步服务**——比 Nextcloud **同步性能高 10 倍**（块级同步 / 协议成熟 / 大文件可靠）。**适合**：1 GB+ 文件频繁同步、专业用户 NAS、数百 GB 库共享。**与 Nextcloud 关系**：互补——NC 是协作平台（含日历 / 邮件 / Office），Seafile **专做纯文件同步**。

## 你将得到什么

- 📦 **Seafile 容器**（`seafileltd/seafile-mc:latest`）
- 📦 **MariaDB 10.11**（专用 DB）
- 📦 **Memcached**（缓存）
- ✅ Web UI 监听 `127.0.0.1:8082`
- ✅ 块级同步（修改 1MB 文件不重传整个文件）
- ✅ 客户端：Windows / macOS / Linux / iOS / Android（官方）
- ✅ 多用户 + Group / Library 共享
- ✅ 文件加密（库级别）
- ✅ 历史版本 + 回收站

## 表单字段说明

### `sf_data_dir`

```
{data_dir}/
├── data/                 # **所有文件 + 配置 + 日志**
│   ├── seafile-data/     # 块存储（用户文件）
│   ├── conf/              # 配置
│   └── logs/
└── mariadb-data/         # DB 数据
```

**核心数据**——必须**每日备份 + 异地**。

### `sf_hostname`

公开域名。改了之后所有客户端要重新连——**慎重**。

### `sf_admin_email` / `sf_admin_password`

⚠️ 仅首次启动写入。后续改：

```bash
docker exec -it seafile /opt/seafile/seafile-server-latest/reset-admin.sh
```

### `sf_db_password` / `sf_port`

内部用。

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
upstream seafile {
    server 127.0.0.1:8082 fail_timeout=0;
}

server {
    listen 443 ssl http2;
    server_name files.example.com;

    ssl_certificate     /etc/letsencrypt/live/files.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/files.example.com/privkey.pem;

    # 大文件上传
    client_max_body_size 0;
    proxy_read_timeout 1200s;
    proxy_send_timeout 1200s;
    proxy_request_buffering off;
    proxy_buffering off;

    location / {
        proxy_pass http://seafile;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /seafhttp {
        rewrite ^/seafhttp(.*)$ $1 break;
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        client_max_body_size 0;
        proxy_request_buffering off;
        proxy_send_timeout 1200s;
        proxy_read_timeout 1200s;
        proxy_connect_timeout 75s;
        send_timeout 1200s;
    }
}
```

反代后改 `docker-compose.yml`：

```yaml
environment:
  SEAFILE_SERVER_HOSTNAME: "files.example.com"
  SEAFILE_SERVER_PROTOCOL: "https"
```

```bash
docker compose up -d --force-recreate seafile
```

### 模板 B — 桌面客户端

下载：<https://www.seafile.com/en/download/>

```
1. 装客户端
2. 加账号:
   Server URL:  https://files.example.com
   Email:       admin@example.com
   Password:    <密码>
3. 选库 → 选本地同步目录 → 同步
```

### 模板 C — 创建库（Library）

```
Web UI → My Libraries → + → New Library
  Name:        家庭照片
  Encrypted:   ✓ (端到端加密——只有用户知道密码)
  Password:    <加密密码>

→ 拖文件进去 / 用客户端同步
```

### 模板 D — Group 共享

```
Web UI → Groups → + → New Group
  Name:    工作团队

→ Group 内 → + Library 创建团队库
→ Manage Members → 加成员
```

### 模板 E — iOS / Android App

```
应用商店搜 Seafile（官方）
Server URL:  https://files.example.com
登录 → 选库 → 浏览 / 上传 / 离线缓存
```

### 模板 F — 备份

```bash
#!/bin/bash
# /etc/cron.daily/seafile-backup
DEST=/backup/seafile

# 1. MariaDB dump
docker exec seafile-db mysqldump -uroot -p<密码> --all-databases | gzip > $DEST/db-$(date +%F).sql.gz

# 2. 文件库（增量）
sudo rsync -az --delete /opt/seafile/data/ $DEST/data/

# 3. 旧 DB 备份保留 30 天
find $DEST -name 'db-*.sql.gz' -mtime +30 -delete
```

## 关键参数调优速查

### 资源占用

| 用户 + 库大小 | RAM | CPU |
|---|---|---|
| < 5 用户 / 100 GB | 1 GB | < 5% |
| < 50 用户 / 1 TB | 2 GB | 10-20% |
| < 500 用户 / 10 TB | 4 GB+ | 50%+ |

### 大文件 chunk 大小

```bash
# /opt/seafile/data/conf/seafile.conf
[fileserver]
max_upload_size = 0       # 0 = 无限
max_download_dir_size = 0
```

### 性能

```bash
# block size（默认 1MB——大文件多 chunk 多 IO）
[fileserver]
block_size = 8M           # 大文件场景调大
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64 | ⚠️ 仅 amd64 官方镜像（社区有 ARM 镜像） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（**必装**——专门的 nginx 配置）
- **`nextcloud`** — **互补不互斥**——NC 协作平台，Seafile 纯同步
- **`onlyoffice-docs`** — Seafile 6.3+ 集成 OnlyOffice（在线编辑 docx）

## 排错

### 启动后 502 / Web UI 不可达

```bash
# Seafile 启动慢，等 60-180 秒再试
docker logs -f seafile

# 仍不行：
docker exec seafile /opt/seafile/seafile-server-latest/seahub.sh restart
```

### 上传大文件失败

```bash
# 反代 client_max_body_size 必须 0（不限）
# proxy_read_timeout 1200s 以上
# 见模板 A
```

### 同步客户端连不上

```bash
# 1. URL 含 https + 完整域名
https://files.example.com    ← 不是 IP

# 2. 反代 /seafhttp 端点配了？
curl -fsS https://files.example.com/seafhttp/protocol-version
# 应返回 JSON

# 3. SEAFILE_SERVER_HOSTNAME 与反代 server_name 一致？
docker exec seafile env | grep SEAFILE_SERVER
```

### Library 创建后无法挂载

```bash
# 1. 用户磁盘配额
# Web UI → System Admin → Users → 看配额

# 2. 服务器磁盘满
df -h /opt/seafile/data
```

### admin 密码忘了

```bash
docker exec -it seafile /opt/seafile/seafile-server-latest/reset-admin.sh
# 按提示输入新密码
```

### 升级失败

```bash
# 必备份：
sudo tar -czf seafile-pre-upgrade.tar.gz -C /opt seafile

cd /opt/seafile
docker compose pull
docker compose up -d

# Schema migration 自动跑
docker logs -f seafile
```

## 验证

```bash
# 1. 三个容器都跑着
docker ps --filter name=seafile

# 2. Web 响应
curl -fsS http://127.0.0.1:8082/ -o /dev/null -w '%{http_code}\n'

# 3. seafhttp 端点（关键，客户端走这个）
curl -fsS http://127.0.0.1:8082/seafhttp/protocol-version

# 4. DB 健康
docker exec seafile-db mysqladmin ping -uroot -p<密码>
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——`SEAFILE_ADMIN_*` **仅首次启动有效**。已存的库 / 用户 / 文件全部保留。

## ⚠️ 敏感性

**review** — 用户文件可能含敏感数据（合同 / 照片 / 代码 / 等）。

强制：

1. **公网必须 HTTPS**（客户端拒非 HTTPS）
2. admin 强密码 + 启用 2FA（System Admin → Settings → 2FA）
3. 敏感库用 **客户端加密**（创建 Library 时勾 Encrypted——server 看不到内容）
4. **每日备份 + 异地**（含 DB + data/）—— 加密
5. 公开链接默认带过期 + 密码

## 隐私说明

- **完全本地**——文件 / 用户 / 历史版本在你服务器
- **零遥测**（Seafile CE 开源版）
- 客户端加密的库：服务器仅存密文，无法解密（用户丢密码 = 永久不可读）
- 文件块去重（同样的文件多用户上传仅占一份磁盘）—— 不影响隐私（每用户自己的密钥）
