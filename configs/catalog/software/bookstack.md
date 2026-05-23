# BookStack 文档平台

BookStack 是**层级化技术文档**平台——结构 **Books → Chapters → Pages**，比 Wiki.js 更"书本化"，适合产品文档 / 培训教材 / API 文档 / SOP。WYSIWYG + Markdown 双编辑器，强搜索（含全文）。

## 你将得到什么

- 📦 **bookstack** + **mariadb** Docker compose 栈
- ✅ Web UI 监听 `127.0.0.1:6875`
- ✅ 内嵌 MariaDB 数据库（独立容器）
- ✅ 数据持久化 `/opt/bookstack/`
- ✅ 默认登录 `admin@admin.com` / `password`（**首次登录立刻改**）
- ⚠️ 首次启动 2-3 分钟（DB migration）

## 表单字段说明

### `bookstack_domain`

公网访问域名。**改后影响所有共享链接、邮件邀请链接**——生产改前慎重。

### `bookstack_port`

本机端口。默认 6875（避免与 nginx 80 冲突）。

### `bookstack_db_password`

内嵌 MariaDB 密码。容器间通信，正常情况无需手动用。

### `bookstack_data_dir`

数据目录。

## 配置文件 / 目录速查

```
/opt/bookstack/
├── docker-compose.yml                    # ← EnvForge 写入
├── app-data/                              # BookStack 应用数据
│   ├── www/                                # PHP 应用代码
│   ├── nginx/                              # 内置 nginx 配置
│   └── ...
└── db-data/                                # ← MariaDB 数据（最关键）
    └── ...

# 容器内
/config/  → /opt/bookstack/app-data/
/config/  → /opt/bookstack/db-data/  (db 容器)
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker compose（仅） |
| 镜像 | `lscr.io/linuxserver/bookstack` + `lscr.io/linuxserver/mariadb` |
| 内存 | ~500 MB（PHP + MariaDB） |
| 默认用户 | UID/GID 1000:1000 |

## 常见配置模板

### 模板 A — 首次登录

```
http://server-ip:6875/login
```

默认凭据：`admin@admin.com` / `password`

**立刻改**：

1. 右上角头像 → Settings → 用户列表 → admin
2. 改邮箱（你的真实邮箱）
3. 改密码

### 模板 B — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name bookstack.example.com;
    ssl_certificate /etc/letsencrypt/live/bookstack.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bookstack.example.com/privkey.pem;

    client_max_body_size 50M;                 # 上传图片 / 附件

    location / {
        proxy_pass http://127.0.0.1:6875;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 模板 C — SSO 集成（OIDC / SAML / LDAP）

UI → Settings → Authentication：

- Standard（默认 email/password）
- LDAP（企业目录）
- SAML 2.0（接 Authentik / Keycloak）
- OIDC（GitHub / Google / Authentik）

```
# 例：Authentik OIDC
Display Name: Authentik
Client ID: bookstack
Client Secret: <secret>
Issuer: https://auth.example.com/application/o/bookstack/
Authorization endpoint: <自动从 issuer 取>
Token endpoint: <自动>
User endpoint: <自动>
```

### 模板 D — 邮件配置（密码重置 / 通知）

UI → Settings → Maintenance → 看不到 SMTP——必须改 `.env` 文件：

```bash
docker exec -it bookstack /bin/bash -c "cat >> /config/www/.env" <<EOF
MAIL_DRIVER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=user@example.com
MAIL_PASSWORD=app-password
MAIL_ENCRYPTION=tls
MAIL_FROM=bookstack@example.com
MAIL_FROM_NAME=BookStack
EOF

docker restart bookstack
```

### 模板 E — 备份策略

```bash
# 1. DB dump
docker exec bookstack-db mysqldump -ubookstack -p$DB_PASS bookstackapp > /backup/bookstack-db-$(date +%F).sql

# 2. 文件 + uploads
sudo tar czf /backup/bookstack-files-$(date +%F).tar.gz \
    -C /opt/bookstack/app-data www/storage www/public/uploads

# 3. 加密
gpg -c /backup/bookstack-*.{sql,tar.gz}
```

### 模板 F — 升级

```bash
cd /opt/bookstack
docker compose pull
docker compose up -d                          # 自动 schema migration
```

升级前必须备份。

## 关键参数调优速查

### 资源占用

| 内容量 | RAM | 磁盘 |
|---|---|---|
| 个人（< 100 页） | 500 MB | 500 MB |
| 团队（< 1k 页） | 1 GB | 5 GB |
| 大型（10k+ 页 + 附件） | 2 GB+ | 50 GB+ |

### 性能

| 项 | 推荐 |
|---|---|
| 全文搜索 | 内置（MariaDB FULLTEXT），< 10k 页够用 |
| 大库 | 接 Elasticsearch / Meilisearch（社区插件） |
| Redis 缓存 | 可选（提升 30%） |

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`authentik`** — SSO 后端（模板 C）
- **`wikijs`** — 替代品（互斥选）：Wiki.js 更灵活，BookStack 强结构

## 排错

### 首次启动卡 2 分钟

正常——DB migration + Laravel artisan key:generate + 静态资源构建。看：

```bash
docker logs -f bookstack
```

### 改 APP_URL 后 share link 还是老的

```bash
# 清缓存
docker exec bookstack /bin/bash -c "cd /var/www/html && php artisan cache:clear && php artisan config:clear"
docker restart bookstack
```

### 上传图片失败

```bash
# 1. nginx client_max_body_size 太小
sudo nano /etc/nginx/...
client_max_body_size 50M;

# 2. PHP 上传限制
docker exec bookstack /bin/bash -c "grep -E '(upload_max|post_max)' /etc/php/*/cli/php.ini"
# 默认 10M，改大需改容器内 php.ini 后重启
```

### 默认 admin 改不了

```bash
# 命令行强制重置
docker exec -it bookstack /bin/bash -c "cd /var/www/html && php artisan bookstack:reset-mfa-and-roles admin@admin.com"
```

或直接进 DB 改：

```sql
docker exec -it bookstack-db mariadb -ubookstack -p$DB_PASS bookstackapp
> UPDATE users SET email='you@example.com', password=... WHERE id=1;
```

### 搜索结果不全

MariaDB FULLTEXT 默认最小词长 4。改：

```sql
SET GLOBAL ft_min_word_len=2;
# 配置文件持久化：my.cnf 加 [mysqld] ft_min_word_len=2
# 重启 MariaDB
docker restart bookstack-db

# 重建索引
docker exec bookstack /bin/bash -c "cd /var/www/html && php artisan bookstack:regenerate-search"
```

## 验证

```bash
docker ps | grep bookstack
curl -I http://127.0.0.1:6875/login                  # 200 OK
docker exec bookstack-db mariadb-show -ubookstack -p$DB_PASS bookstackapp
```

## 多次运行

`installMode: skip-existing`。docker-compose.yml 重写。**db-data 保留**。

## ⚠️ 敏感性

**review** — 含**业务文档 / 培训材料**。

强制：

1. **公网必须 HTTPS**
2. **首次登录立刻改默认 admin 密码**
3. 启用 2FA（Settings → 用户 → 2FA）
4. 关公开注册（Settings → Registration）

## 隐私说明

- 数据本地存储 MariaDB
- 不发遥测
- 上传附件存 `app-data/www/storage/uploads/`
- API token / SSO secret 存 `.env`（容器内，权限 0600）
