# Forgejo 自托管 Git

Forgejo 是 **Gitea 的社区驱动 fork**——2022 年 Gitea 公司化（Gitea Ltd.）后由 Codeberg / FSF 接手，**完全开源治理 / 无商业单一控制**。功能 100% 兼容 Gitea（同 schema / 同配置 / 同 API），可双向迁移。**适合**：与 `gitea-server` 替代品——若你看重"完全社区开源 / 无商业接管风险"选 Forgejo。**资源轻**（200 MB RAM）—— 比 GitLab CE 轻 20 倍。

## 你将得到什么

- 📦 **Forgejo 容器**（`codeberg.org/forgejo/forgejo:latest`）
- 📦 **PostgreSQL 16**（专用 DB 容器）
- ✅ Web UI 监听 `127.0.0.1:3000`
- ✅ Git SSH 监听 `:222`（与系统 SSH 22 区分）
- ✅ 内置 Forgejo Actions（GitHub Actions 兼容）
- ✅ Webhooks / API / OAuth provider
- ✅ Issue / PR / Wiki / 项目板
- ✅ Git LFS 支持

## 表单字段说明

### `fj_domain`

公开域名。**改了 = 所有 webhook URL 失效**——慎重。

### `fj_admin_email`

Web 安装向导的预填值。**Playbook 不自动建 admin**——首次访问 `/install` 后手动走完向导（含创建 admin）。

### `fj_db_password`

PG 容器密码。

### `fj_data_dir`

```
{data_dir}/
├── data/                   # **所有 git 仓库 + uploads + LFS**
│   ├── gitea-repositories/  # 真正的 git 仓库（裸仓库）
│   ├── lfs/
│   └── attachments/
├── postgres-data/          # PG 数据（issue / PR / 用户）
└── config/                 # app.ini
```

**每日备份 `data/` + `postgres-data/`**。

### `fj_http_port`

Web UI 端口，仅 127.0.0.1。

### `fj_ssh_port`

⚠️ **关键字段**——Git SSH clone 用。

| 系统 SSH | Forgejo SSH | 说明 |
|---|---|---|
| 22 | 222 / 2222 | 默认（不冲突） |
| 2222（已改） | 22 | 不推荐——系统 SSH 调试更难 |

**这个端口必须公网开放**——否则 SSH clone 不可用。`git clone ssh://git@host:222/user/repo.git`。

## 配置文件 / 目录速查

```
{data_dir}/config/app.ini       # 主配置（环境变量 FORGEJO__xxx 优先级更高）
{data_dir}/data/gitea-repositories/<owner>/<repo>.git/  # 裸仓库

# 容器名
forgejo
forgejo-db

# 端口
3000  HTTP（容器内 127.0.0.1）
222   SSH（公网 git clone 用）
```

## 常见配置模板

### 模板 A — 首次安装（必跑）

```
1. 浏览器打开 http://server-ip:3000/install
2. 大部分字段已预填（DB / 路径）—— 不要乱改
3. 关键字段：
   - Server Domain:    git.example.com         ← 与 Playbook fj_domain 一致
   - Forgejo Base URL: https://git.example.com/
   - SSH Server Domain: git.example.com
   - SSH Port:         222
   - Run As Username:  git

4. Optional Settings → 展开
   Administrator Account Settings → 必填
   Username:  admin
   Password:  <你的密码>
   Email:    <admin@example.com>

5. Install Forgejo

6. 自动跳到登录页 → 用 admin 登录
```

⚠️ 装完后**`{data_dir}/config/app.ini` 内 `INSTALL_LOCK = true`** —— 之后访问 /install 会被拒。要重装：删 `app.ini` 内此行 + 重启容器。

### 模板 B — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name git.example.com;

    ssl_certificate     /etc/letsencrypt/live/git.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.example.com/privkey.pem;

    # 大仓库 / git push 不缓冲
    client_max_body_size 1G;
    proxy_read_timeout 600s;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 C — 客户端 git 操作

```bash
# HTTPS（用密码 / token）
git clone https://git.example.com/user/repo.git

# SSH（推荐——用 ssh key）
git clone ssh://git@git.example.com:222/user/repo.git

# ~/.ssh/config 简化
Host git.example.com
    Port 222
    User git
    IdentityFile ~/.ssh/id_ed25519
# 然后:
git clone git@git.example.com:user/repo.git
```

### 模板 D — 启用 Forgejo Actions（GitHub Actions 兼容）

```yaml
# 加 docker-compose.yml 服务
  forgejo-runner:
    image: code.forgejo.org/forgejo/runner:latest
    container_name: forgejo-runner
    restart: unless-stopped
    depends_on:
      - forgejo
    volumes:
      - {{ fj_data_dir }}/runner:/data
      - /var/run/docker.sock:/var/run/docker.sock
    command: /bin/sh -c 'sleep 5; forgejo-runner daemon'

  # 首次需注册:
  # docker compose run --rm forgejo-runner forgejo-runner register --no-interactive \
  #   --token <从 Web UI Site Administration → Runners 拿> \
  #   --instance http://forgejo:3000 --name 'docker-runner' \
  #   --labels 'self-hosted,linux,x64'
```

仓库 `.forgejo/workflows/test.yml`（同 GitHub Actions 语法）：

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - run: |
          npm ci
          npm test
```

### 模板 E — 启用邮件通知

```bash
# /opt/forgejo/config/app.ini 加（或用 FORGEJO__mailer__ 环境变量）
[mailer]
ENABLED = true
PROTOCOL = smtps
SMTP_ADDR = smtp.gmail.com
SMTP_PORT = 465
USER = you@gmail.com
PASSWD = <gmail-app-password>
FROM = "Forgejo <noreply@example.com>"

docker restart forgejo
```

### 模板 F — OAuth provider（让其他应用用 Forgejo 登录）

```
Forgejo: Site Administration → Applications → OAuth2 Applications → Create
  Application Name: My App
  Redirect URIs:    https://myapp.example.com/oauth/callback
  Confidential:     ✓

# 拿到 Client ID + Client Secret
# 在你的 App 里配 OIDC：
issuer:    https://git.example.com
client_id: <从 Forgejo>
client_secret: <从 Forgejo>
```

### 模板 G — 从 Gitea 迁移过来

```bash
# 1. 在原 Gitea 关停服务
sudo systemctl stop gitea

# 2. 备份数据
sudo tar -czf gitea-backup.tar.gz /var/lib/gitea /etc/gitea

# 3. 在 Forgejo 主机解压（路径对齐）
sudo tar -xzf gitea-backup.tar.gz -C /

# 4. 启动 Forgejo（同样数据 + DB）
docker compose up -d

# Forgejo 自动检测 Gitea schema 并 migrate
docker logs -f forgejo
```

### 模板 H — 备份

```bash
#!/bin/bash
# /etc/cron.daily/forgejo-backup
DEST=/backup/forgejo

# PG 备份
docker exec forgejo-db pg_dump -U forgejo forgejo | gzip > $DEST/pg-$(date +%F).sql.gz

# data 目录（git 仓库）
rsync -az --delete /opt/forgejo/data/ $DEST/data/

# 旧备份
find $DEST -name '*.sql.gz' -mtime +30 -delete
```

或用内置 dump：

```bash
docker exec -it forgejo gitea dump -c /etc/gitea/app.ini -t /tmp
docker cp forgejo:/tmp/forgejo-dump-XXXX.zip ./
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU | 磁盘 |
|---|---|---|---|
| < 10 | 200 MB | < 0.5% | 仓库大小 |
| < 100 | 500 MB | 1-2% | – |
| < 1k | 1 GB | 5% | – |

### 大仓库 / LFS

```ini
# app.ini
[server]
LFS_START_SERVER = true
LFS_JWT_SECRET = <生成: openssl rand -base64 32>

[lfs]
PATH = /var/lib/gitea/lfs
```

### Pull Request 性能

```ini
# 大型项目（10k+ commits）
[git]
GC_ARGS = --aggressive --prune=now
```

### Actions runner 资源

```yaml
# 限 runner 容器资源
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 4G
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Docker 部署 | ✅ | ✅ |
| ARM64 | ✅ | ✅ |
| Anolis 9 | – | ✅ |

## 与其它 catalog 项的配合

- **`gitea-server`** — **互斥替代品**（同样的 schema / 配置 / API）
- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`postgres-profile`** — 不用（自带 PG 容器）
- **`gitlab-ce`** — 重量级替代品（CI/CD + 容器仓库 + 等）
- **`authentik` / `authelia` / `keycloak`** — Forgejo 可作为 OAuth provider 或被这些 SSO 接入

## 排错

### 安装向导一直卡 / "Database connection failed"

```bash
# PG 真起来了？
docker ps --filter name=forgejo-db
docker logs forgejo-db

# DB 信息对吗？
# Database Type: PostgreSQL
# Host:          forgejo-db:5432    (容器名，不是 localhost)
# User:          forgejo
# Password:      <Playbook 生成的>
# Database:      forgejo
```

### 装完 Login 报错 "User does not exist"

首次登录用**安装向导里创建的 admin 账号**。Playbook **不自动建 admin**。

### Git push 慢 / 超时

```bash
# 反代 timeout 调长
proxy_read_timeout 600s;
client_max_body_size 1G;

# 大仓库 push 用 SSH 而不是 HTTPS（更快）
git clone ssh://git@git.example.com:222/user/repo.git
```

### SSH clone 失败 `Connection refused`

```bash
# 1. 容器 22 端口映射对外了？
docker ps | grep forgejo
# PORTS 应有 0.0.0.0:222->22/tcp

# 2. 防火墙
sudo ufw allow 222/tcp
sudo firewall-cmd --add-port=222/tcp --permanent && sudo firewall-cmd --reload
```

### Webhook 不触发

```bash
# 1. 容器内 → 反代 是否能反查？
docker exec forgejo curl -fsS https://hookcatcher.example.com -o /dev/null

# 2. 看 webhook 历史（Repo → Settings → Webhooks → 点条目）

# 3. 内部域名解析
docker exec forgejo nslookup hookcatcher.example.com
```

### Forgejo Actions 不跑

```bash
# 1. runner 注册了？
docker logs forgejo-runner

# 2. labels 匹配？workflow.yml runs-on 的 label 必须和 runner labels 至少有一个匹配
docker exec forgejo-runner cat /data/runner/runner.yaml | grep -A5 labels

# 3. Web UI 看 runner 状态
# Site Administration → Runners → online 必须 ✓
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=forgejo

# 2. API healthz
curl -fsS http://127.0.0.1:3000/api/healthz
# {"status": "ok", ...}

# 3. PG 健康
docker exec forgejo-db pg_isready -U forgejo

# 4. SSH 端口
ss -tlnp | grep :222

# 5. SSH clone 测（已加 SSH key 后）
git clone ssh://git@127.0.0.1:222/admin/test.git /tmp/forgejo-test
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——**已配的 admin / 仓库 / 用户全部保留**（在 PG + data/）。安装向导在首次跑后 `INSTALL_LOCK = true`，重跑不会让你重装。

## ⚠️ 敏感性

**review** — Forgejo 持有源代码——攻陷 = 泄露所有私有项目。

强制：

1. **公网必须 HTTPS**
2. 创建 admin 后**禁公开注册**（Site Administration → Service Settings → Disable Self-Registration）或限邮箱白名单
3. 所有 push / clone 强制 SSH key（在仓库设置里启用 "Disallow HTTPS Git operations"）
4. 备份每日（PG + data/）
5. 公网 SSH 端口建议改非默认（fj_ssh_port = 22222 而非 222）

## 隐私说明

- **完全本地**——代码 / issue / 用户全在你服务器
- **无遥测**（Forgejo 治理强调——比 Gitea 更严格）
- 默认不连任何外部服务（不像 GitLab 会发使用统计）
- Avatar / Gravatar 集成默认关（不暴露邮箱 hash 到外部）
- Webhook 调用是出方向（你定义的目标），按需控制
