# NocoDB - 数据库 GUI

NocoDB 把 **MySQL / PostgreSQL / SQLite** 变成 **Airtable 风格的无代码界面**——业务人员看 / 改数据，开发者管 schema。**适合**：替代 Airtable / Adminer / phpMyAdmin、CRUD 后台、内部业务工具、运营看板。

## 你将得到什么

- 📦 **nocodb/nocodb:latest** Docker 容器
- ✅ Web UI 监听 `127.0.0.1:8088`
- ✅ 默认 SQLite 元数据库
- ✅ JWT secret 自动生成
- ✅ Telemetry 已禁用
- ✅ 数据持久化 `/opt/nocodb/`

## 表单字段说明

### `nocodb_port`

本机端口。

### `nocodb_jwt_secret`

加密 JWT token。**丢失则所有用户 session 失效**。

### `nocodb_data_dir`

元数据目录。

## 配置文件 / 目录速查

```
/opt/nocodb/
├── docker-compose.yml                       # ← EnvForge 写入
├── noco.db                                    # SQLite 元数据库（默认）
└── ...
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker（仅） |
| 镜像 | `nocodb/nocodb:latest` |
| 默认 backend | SQLite（够用 < 10k 用户） |

## 常见配置模板

### 模板 A — 首次创建 Super Admin

```
http://server-ip:8088/signup
```

第一个注册的用户自动成为 **Super Admin**。**确保你是第一个**——之后关闭 signup（UI → Account → 关）。

### 模板 B — 用外部 PostgreSQL 元数据库（生产）

```yaml
# docker-compose.yml umami 加 env
environment:
  NC_DB: "pg://my-pg-host:5432?u=nocodb&p=password&d=nocodb_meta"
  # 或 NC_DB_JSON
  NC_DB_JSON: |
    {
      "client": "pg",
      "connection": {
        "host": "my-pg-host",
        "port": 5432,
        "user": "nocodb",
        "password": "...",
        "database": "nocodb_meta"
      }
    }
```

### 模板 C — 连接业务数据库

UI → 点 + → New Project → External Database：

```
DB Type: PostgreSQL / MySQL / SQLite / SQL Server
Host: db.example.com
Port: 5432
Username: readonly_user                      # 创建只读账号最安全
Password: ...
Database: production
```

NocoDB 自动扫 schema → 生成 Airtable 风格表格视图。

### 模板 D — Nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name nocodb.example.com;
    ssl_certificate /etc/letsencrypt/live/nocodb.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nocodb.example.com/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 模板 E — 启用 SMTP 邀请用户

```yaml
environment:
  NC_SMTP_HOST: smtp.gmail.com
  NC_SMTP_PORT: 587
  NC_SMTP_USERNAME: user@example.com
  NC_SMTP_PASSWORD: app-password
  NC_SMTP_SECURE: "tls"
  NC_SMTP_FROM: nocodb@example.com
```

### 模板 F — REST API + Webhook

NocoDB 自动给每张表生成 REST API：

```bash
# Token 在 UI → Account → Tokens 创建
curl -H "xc-token: <TOKEN>" \
    https://nocodb.example.com/api/v2/tables/<TABLE_ID>/records
```

支持 webhook 触发：UI → 表 → Details → Webhooks → 配 URL（变更时 POST）。

### 模板 G — 备份

```bash
# 元数据备份
docker exec nocodb tar czf /tmp/backup.tar.gz /usr/app/data
docker cp nocodb:/tmp/backup.tar.gz /backup/nocodb-$(date +%F).tar.gz
```

业务数据库本身的备份按业务 DB 自己的备份方案（pg_dump / mysqldump）。

## 关键参数调优速查

### 资源占用

| 表 / 行数 | RAM |
|---|---|
| 个人（< 10 表） | 200 MB |
| 团队（< 100 表） | 500 MB |
| 大型（< 1k 表） | 1 GB+ |

### 性能（外部 PG 元数据库时）

```yaml
environment:
  NC_REDIS_URL: "redis://redis:6379/4"        # 启用 Redis 缓存（推荐生产）
```

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`postgres-profile` / `mysql-server`** — 元数据后端 + 业务数据源
- **`redis-server`** — 性能优化（可选）
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`n8n`** — 互补（NocoDB 改数据 / n8n 自动化流程）

## 排错

### 启动卡住

```bash
docker logs -f nocodb
# 等 "Server started on port 8080"
```

### 连业务 DB 失败

```bash
# DB 在容器内能访问吗
docker exec nocodb sh -c 'apk add postgresql-client; psql -h db-host -U user -d database -c "SELECT 1"'

# 防火墙 / DB 监听 0.0.0.0
```

### Webhook 不触发

UI → Details → Webhooks → Test。检查目标 URL 可达 + 返回 200。

### JWT secret 改了所有用户登录失败

预期——清浏览器 cookie 重登。

## 验证

```bash
docker ps | grep nocodb
curl http://127.0.0.1:8088/api/v1/health
```

## 多次运行

`installMode: skip-existing`。compose 重写。**数据保留**。

## ⚠️ 敏感性

**review** — NocoDB 持有**业务数据库连接凭据**——攻陷 = 业务数据库攻陷。

强制：

1. 公网必须 HTTPS
2. 业务数据库用专用受限账号（最小权限：仅特定表的 SELECT/INSERT/UPDATE）
3. JWT secret 离线备份
4. 关闭 public signup

## 隐私说明

- Telemetry 禁用
- 元数据 + DB 凭据存 SQLite / PG（NC_DB）
- 业务数据存原 DB（NocoDB 不复制）
- API token 在 UI 里管理，权限粒度到表级
