# OnlyOffice Document Server

OnlyOffice Document Server 是**在线协作 Office 文档后端**——直接编辑 docx / xlsx / pptx，多人实时协作，**MS Office 兼容性最好**（比 Collabora 强）。**适合**：Nextcloud / SeaTable / Confluence 等的文档编辑器后端。**不适合**：作为独立产品用——它是 backend service，要前端（如 Nextcloud）调用。

## 你将得到什么

- 📦 **OnlyOffice Document Server**（CE 社区版）
- 📦 **PostgreSQL 15**（专用 DB 容器）
- 📦 **RabbitMQ 3**（组件协调）
- ✅ Web API 监听 `127.0.0.1:8083`
- ✅ JWT 强制启用（防未授权使用）
- ✅ 文档缓存 + 编辑会话状态
- ✅ Healthcheck endpoint

## 表单字段说明

### `oo_domain`

OnlyOffice 公开域名。**必须 HTTPS**——Nextcloud / 现代浏览器会拒 mixed content。

### `oo_jwt_secret`

⚠️ **核心字段**——所有调用 OnlyOffice API 的客户端（Nextcloud / SeaTable / 等）都必须用**完全相同**的 JWT secret。**改了 = 所有集成断开，需要在每个客户端那边同步更新**。

留空 = 自动生成 64 位 hex（运行后日志显示）。

### `oo_db_password` / `oo_rabbitmq_password`

OnlyOffice 内部用，一般不需要直接管。

### `oo_port`

本机绑定端口，仅 127.0.0.1。

### `oo_data_dir`

```
{data_dir}/
├── data/                  # 文档缓存 + 编辑会话
├── logs/                  # 日志
├── cache/                 # 缩略图 / 字体
├── postgresql/            # PG 数据
└── rabbitmq/              # MQ 数据
```

OnlyOffice **不存原文档**——每次会话从 Nextcloud（或调用方）拉，编辑结束推回去。**重启 = 丢未保存的编辑**（用户警告）。

### `oo_max_request_body_size`

单文档最大上传 + 编辑大小。**注意**：Nextcloud 那边的 PHP `upload_max_filesize` 要 ≥ 这个值。

## 配置文件 / 目录速查

```
{data_dir}/
├── docker-compose.yml
├── data/                       # 文档处理临时目录
├── logs/
│   ├── documentserver/
│   │   ├── converter/out.log
│   │   └── docservice/out.log
├── cache/
│   └── ...
├── postgresql/
└── rabbitmq/
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
upstream onlyoffice {
    server 127.0.0.1:8083;
}

map $http_x_forwarded_proto $the_scheme {
    default $http_x_forwarded_proto;
    "" $scheme;
}

map $http_x_forwarded_host $the_host {
    default $http_x_forwarded_host;
    "" $host;
}

server {
    listen 443 ssl http2;
    server_name office.example.com;

    ssl_certificate     /etc/letsencrypt/live/office.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/office.example.com/privkey.pem;

    client_max_body_size 100M;

    location / {
        proxy_pass http://onlyoffice;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host               $the_host;
        proxy_set_header X-Real-IP          $remote_addr;
        proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto  $the_scheme;
        proxy_set_header X-Forwarded-Host   $the_host;
    }
}

server {
    listen 80;
    server_name office.example.com;
    return 301 https://$host$request_uri;
}
```

### 模板 B — Nextcloud 集成

```
1. Nextcloud → Apps → Office & Text → 找 ONLYOFFICE → 启用
2. Nextcloud → 管理设置（齿轮）→ ONLYOFFICE
   Document Editing Service 地址（内部和外部都填）：
     https://office.example.com/

   Secret key（**与 Playbook 的 oo_jwt_secret 完全相同**）：
     <从运行日志拿到的 JWT secret>

   Authorization Header:  Authorization

   高级 → 服务 IP 同时（可选，用于内外网双网卡）：
     https://office.internal.example.com/

3. 保存 → 提示连接成功
```

### 模板 C — SeaTable / 其它集成

```
JWT secret + Document Server URL 是通用接入点。
SeaTable: 后台 → Settings → Office Suite
  Office API URL:  https://office.example.com/
  JWT Token:        <oo_jwt_secret>
```

### 模板 D — 调字体（添加中文 / 自定义字体）

```bash
# 1. 把字体文件放到容器内
docker cp /path/to/fonts/. onlyoffice-docs:/usr/share/fonts/truetype/custom/

# 2. 重新生成字体缓存
docker exec onlyoffice-docs documentserver-generate-allfonts.sh

# 3. 重启
docker restart onlyoffice-docs
```

### 模板 E — 备份 / 还原

```bash
# 备份（PG 是关键）
docker exec onlyoffice-postgres pg_dump -U onlyoffice onlyoffice | gzip > oo-backup-$(date +%F).sql.gz

# 还原
gunzip -c oo-backup.sql.gz | docker exec -i onlyoffice-postgres psql -U onlyoffice onlyoffice

# 文档缓存（一般不需备份——重启自动重建）
```

### 模板 F — 用 OnlyOffice 自托管字体（非 latin）

OnlyOffice 默认字体不含完整中文 / 阿拉伯 / 等。常见做法：复制系统字体进容器。

```bash
# Linux 系统字体
docker exec -it onlyoffice-docs bash
# 容器内：
apt-get update && apt-get install -y fonts-noto-cjk fonts-noto-cjk-extra
documentserver-generate-allfonts.sh
exit

docker restart onlyoffice-docs
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU |
|---|---|---|
| < 5 同时编辑 | 2 GB | 1 vCPU |
| < 50 | 4 GB | 2 vCPU |
| < 500 | 8 GB+ | 4+ vCPU |
| > 500 | OnlyOffice 商业版（开源版有 20 同时连接限制） | – |

⚠️ **CE（社区版）限 20 用户同时连接** —— 多人企业用需买 EE。

### 编辑会话超时

```yaml
# 改容器内 default.json 困难（每升级会重置）
# 推荐改 docker-compose.yml 的环境变量：
environment:
  WOPI_ENABLED: "false"   # 用原生 WebDAV 协议
  ONLYOFFICE_HTTPS_HSTS_MAXAGE: 5184000
  REDIS_SERVER_HOST: ""    # 单实例不需要 Redis
```

### 性能

```bash
# 看慢请求
docker logs onlyoffice-docs 2>&1 | grep -i 'slow\|timeout'

# RabbitMQ 队列深度（积压预警）
docker exec onlyoffice-rabbitmq rabbitmqctl list_queues
```

### 日志清理（默认无限增长）

```bash
# 加 cron
echo '0 2 * * * find /opt/onlyoffice/logs -name "*.log" -mtime +30 -delete' \
    | sudo crontab -
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Docker 部署 | ✅ | ✅ |
| ARM64 | ⚠️ 官方镜像仅 amd64 | ⚠️ 同 |
| 资源最低 | 2 GB RAM | 2 GB RAM |
| Anolis 9 | – | ✅ |

⚠️ **ARM64 不支持** — OnlyOffice 官方仅 amd64。Apple Silicon Mac / 树莓派要用替代品（Collabora）。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nextcloud`** — **核心配合**——Nextcloud + OnlyOffice = 完整 Office 套件
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（**必装**）
- **`postgres-profile`** — **不需要**（OnlyOffice 自带 PG 容器）
- 替代品：Collabora（CODE）—— 性能更好、兼容性差，ARM 友好

## 排错

### Nextcloud 显示 "Connection failed" 或 "Bad health check"

```bash
# 1. OnlyOffice 真在跑？
curl -fsS https://office.example.com/healthcheck
# 应返回 "true"

# 2. JWT secret 完全一致？
docker logs onlyoffice-docs 2>&1 | grep -i jwt
# 看是否有"JWT" / "Token decode" 错误

# 3. 反代正确？
curl -fsS https://office.example.com/web-apps/apps/api/documents/api.js -o /dev/null -w '%{http_code}\n'
# 应 200
```

### 编辑器加载卡住 / 白屏

浏览器开发者工具 → Console / Network 看错。常见：

- WebSocket 升级失败 → nginx 漏 `Upgrade` `Connection` 头
- CSP 拒绝 → Nextcloud OnlyOffice app 设置漏配 origin
- 字体缺失（中文乱码）→ 见模板 F

### "Concurrent connection limit reached"

CE 限制 20 用户同时连接。

```bash
# 看当前
docker logs onlyoffice-docs 2>&1 | grep -i 'connection.*limit'
```

解：

- 个人 / 小团队足够（很少同时 20 人编辑）
- 超出 → 商业版 EE / 用 Collabora

### 文档保存后 Nextcloud 没更新

```bash
# 1. JWT 失败 → OnlyOffice 不告知 Nextcloud
docker logs onlyoffice-docs 2>&1 | grep -i 'jwt\|callback'

# 2. callback URL 不通（OnlyOffice 调 Nextcloud 的 webhook 失败）
# Nextcloud 公网域名要从 OnlyOffice 容器内可达
docker exec onlyoffice-docs curl -fsS https://nextcloud.example.com -o /dev/null
# 失败 → DNS / 防火墙问题
```

### 容器 OOM（kill）

```bash
docker stats onlyoffice-docs

# 加 JVM heap
# 修改 docker-compose.yml
environment:
  ONLYOFFICE_HEAP_INITIAL: "512m"
  ONLYOFFICE_HEAP_MAX: "2048m"
```

### 中文字体不显示

见模板 F——`apt-get install fonts-noto-cjk` 后 `documentserver-generate-allfonts.sh`。

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=onlyoffice

# 2. healthcheck
curl -fsS http://127.0.0.1:8083/healthcheck
# "true"

# 3. API 响应
curl -fsS http://127.0.0.1:8083/web-apps/apps/api/documents/api.js -o /dev/null -w '%{http_code}\n'
# 200

# 4. PG 健康
docker exec onlyoffice-postgres pg_isready -U onlyoffice

# 5. RabbitMQ 健康
docker exec onlyoffice-rabbitmq rabbitmq-diagnostics ping
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——**`oo_jwt_secret` 改了所有客户端集成都要更新**。PG 数据 / 字体配置等保留。

## ⚠️ 敏感性

**review** — OnlyOffice 处理用户文档（含可能敏感内容）。

强制：

1. **公网必须 HTTPS**（Nextcloud 强制要求）
2. JWT secret 长期保密（泄露 = 任何人能编辑文档）
3. 别开 `USE_UNAUTHORIZED_STORAGE: "true"`（关闭 JWT 鉴权）
4. CE 限 20 同时用户——超出考虑商业版
5. 备份 PG（编辑历史 / 文档元数据）

## 隐私说明

- 文档**临时缓存**在 OnlyOffice，编辑会话结束后清理（默认 30 分钟）
- 原文档存调用方（如 Nextcloud），OnlyOffice 不持久存储
- **无遥测**（开源 CE 版）
- 字体 / 模板从镜像内载（不发对外请求）
- 协作功能：所有改动通过 RabbitMQ 在 OnlyOffice 容器内部传递（不出容器）
