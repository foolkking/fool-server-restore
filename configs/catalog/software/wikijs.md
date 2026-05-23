# Wiki.js 知识库

Wiki.js 是**现代化 Wiki / 知识库平台**——Markdown 编辑、git 同步、全文搜索、丰富权限。比 MediaWiki 简单 5×、UI 现代得多。**适合**：团队知识库、产品文档、个人笔记。

## 你将得到什么

- 📦 **wiki.js v2** + **PostgreSQL 15** Docker compose 栈
- ✅ Wiki 容器映射到 `127.0.0.1:3500`
- ✅ PG 数据库容器（独立，仅容器内访问）
- ✅ 数据持久化 `/opt/wikijs/db-data`
- ✅ 健康检查 + 自动重启
- ⚠️ **首次访问需在浏览器走安装向导**

## 表单字段说明

### `wiki_domain` / `wiki_port`

域名 + 本机端口。生产挂反代 + HTTPS。

### `wiki_pg_password`

内嵌 PG 密码，仅容器间通信，正常情况不需手动用。

### `wiki_data_dir`

数据目录（含 PG 数据）。

## 配置文件 / 目录速查

```
/opt/wikijs/
├── docker-compose.yml                     # ← EnvForge 写入
└── db-data/                                 # PostgreSQL 数据（**最关键**）
    └── ...

# Wiki.js 配置存在 PG 里，不是文件
# 容器内 /var/wiki/config.yml（最少配置，主要走 env 和 DB）
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker compose（PG + Wiki.js 两容器） |
| 镜像 | `requarks/wiki:2` + `postgres:15-alpine` |
| 端口 | 3500（容器内 3000） |
| 配置 | 全部存数据库（设置 / 用户 / 页面） |

## 常见配置模板

### 模板 A — 首次安装向导（必走）

`http://<server-ip>:3500` → 进入向导：

1. **General** → Site URL: `https://wiki.example.com/`（与反代一致）
2. **Administrator** → 邮箱 + 密码（**记住**）
3. 点 **Install**

完成后跳到登录页。

### 模板 B — Nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name wiki.example.com;
    ssl_certificate /etc/letsencrypt/live/wiki.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.example.com/privkey.pem;

    client_max_body_size 100M;                      # 上传附件大小

    location / {
        proxy_pass http://127.0.0.1:3500;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 模板 C — 启用 git 同步（content as code）

UI → Administration → Storage → Add → Git：

```
Authentication: SSH key
Repository URL: git@github.com:me/my-wiki.git
Branch: main
Sync Direction: Bi-directional
SSH Key: <生成 RSA / ed25519 + 加到 GitHub>
```

之后所有页面变化自动 push 到 git，新 push 也自动 pull 进 wiki。

### 模板 D — LDAP / OAuth / SAML 集成

UI → Administration → Authentication → Add Strategy：

- **Local**（默认）— 用户名/密码
- **GitHub / Google / Microsoft** — OAuth
- **LDAP / Active Directory** — 企业目录
- **SAML 2.0** — 接 SSO（如 Authentik / Keycloak）

详见 https://docs.requarks.io/auth。

### 模板 E — 备份策略

```bash
# 1. 停服务
cd /opt/wikijs
docker compose stop

# 2. tar 数据目录
sudo tar czf /backup/wikijs-$(date +%F).tar.gz -C /opt/wikijs db-data

# 3. 启
docker compose start

# 4. 加密
gpg -c /backup/wikijs-$(date +%F).tar.gz

# 还原：解压回原位即可
```

或在 UI 里 → Administration → Storage → Database → 启用 PG dump。

### 模板 F — 升级

```bash
cd /opt/wikijs
docker compose pull
docker compose up -d                          # 自动迁移 schema
```

## 关键参数调优速查

### 资源占用

| 用户 / 页面 | RAM | 磁盘 |
|---|---|---|
| 个人（< 100 页） | 600 MB | 1 GB（含 PG） |
| 小团队（< 1k 页） | 1 GB | 5 GB |
| 大型（10k+ 页 + 附件） | 2 GB+ | 50 GB+ |

PG 占多数。

### 性能

| 项 | 推荐 |
|---|---|
| 全文搜索 | 内置（PG full-text）够用 < 10k 页；要更快用 Algolia / Elasticsearch 集成 |
| 缓存 | 默认 Redis 集成可选 |

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`authentik`** — SSO 后端（模板 D）
- **`bookstack`** — 替代品（互斥选）
- **`postgres-profile`** — 不需要（Wiki.js 自带 PG 容器）

## 排错

### 安装向导卡住

```bash
docker logs wikijs
docker logs wikijs-db

# DB 还没 ready
docker exec wikijs-db pg_isready -U wikijs

# 重启
docker compose restart
```

### 上传附件失败

```bash
# 反代 client_max_body_size 太小
sudo nano /etc/nginx/...
client_max_body_size 100M;
sudo nginx -s reload
```

### 改配置不生效

Wiki.js 配置存数据库——UI 里改了立即生效。容器 env 改了重启容器：

```bash
docker compose restart wiki
```

### Git 同步冲突

Wiki UI → Storage → Git → Manual sync → 看错误 + 解决冲突。

## 验证

```bash
docker ps | grep wiki
curl http://127.0.0.1:3500/healthz                  # {"status":"ok"}
docker exec wikijs-db psql -U wikijs wiki -c "\dt"  # 看表
```

## 多次运行

`installMode: skip-existing`。docker-compose.yml 重写。**db-data 保留**——所有页面 / 用户 / 设置不丢。

## ⚠️ 敏感性

**review** — Wiki 内容可能含**敏感业务信息**。

强制：

1. 公网必须 HTTPS
2. 启用 2FA（admin 账号）
3. 公开 wiki 关 Allow guests
4. 备份目录加密

## 隐私说明

- 不发遥测
- 数据本地存储 PG
- Git 同步会推送到外部仓库（按选择）
- 上传附件存 PG（默认）或 S3 / Azure / 等（可选）
