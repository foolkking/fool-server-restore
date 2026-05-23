# GitLab Community Edition

GitLab CE 是**完整 DevOps 平台**——git + CI/CD + container registry + issue tracker + wiki + 代码评审。**重量级**，最低 4 GB RAM，推荐 8 GB。**资源紧张请用 `gitea-server`**（同等 git + issue 功能 200 MB RAM）。

## 你将得到什么

- 📦 **gitlab/gitlab-ce** Docker 容器
- ✅ HTTP 端口 8080 / HTTPS 端口 8443 / Git SSH 端口 **2222**（避免与 sshd 22 冲突）
- ✅ Root 密码自动设
- ✅ 关闭 Sign-up（公网防垃圾注册）
- ✅ 关闭 Pages / Mattermost / Container Registry（节省 RAM）
- ✅ 数据持久化 `/opt/gitlab/`
- ⚠️ **首次启动 5-10 分钟**（DB migration + Rails 启动）

## 表单字段说明

### `gitlab_external_url`

完整 URL（含协议）。**所有 webhook / clone URL 基于此**——改后整体重启。

### `gitlab_root_password`

root admin 密码。**仅首次启动有效**——之后改密码必须 UI。

### `gitlab_ssh_port`

**默认 2222**（不能与系统 sshd 22 冲突）。Git clone：

```
git clone ssh://git@host.example.com:2222/group/repo.git
```

或在 `~/.ssh/config` 配 host alias。

### `gitlab_data_dir`

数据目录。**会增长很大**——git 仓库 + LFS + uploads + Docker registry（如启用）。

## 配置文件 / 目录速查

```
/opt/gitlab/
├── docker-compose.yml                       # ← EnvForge 写入
├── config/                                    # ← /etc/gitlab（GITLAB_OMNIBUS_CONFIG 在 compose 里）
│   ├── gitlab.rb                              # 主配置（用 omnibus_config 自动生成）
│   └── ssl/                                   # TLS 证书（如启用内置 HTTPS）
├── logs/                                      # /var/log/gitlab
│   ├── gitlab-rails/                          # Rails 应用日志
│   ├── gitlab-shell/                           # SSH git 操作
│   ├── nginx/                                   # 内置 nginx
│   └── postgresql/
└── data/                                       # /var/opt/gitlab（**最大**）
    ├── git-data/repositories/                  # ← git 仓库（**最关键备份**）
    ├── postgresql/data/                          # PG 数据
    ├── redis/                                     # Redis
    └── gitlab-rails/uploads/                       # 附件 / avatar
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker（仅，本 Playbook）—— 也可走 omnibus 包 |
| 镜像 | `gitlab/gitlab-ce:latest`（仅 amd64 / arm64） |
| 内存 | **最低 4 GB，推荐 8 GB** |
| 磁盘 | 起步 5 GB，按 git 仓库 + LFS + uploads 增长 |

## 常见配置模板

### 模板 A — 首次登录

```
http://server-ip:8080/
```

用户：`root` / 密码：表单填的或自动生成的

**立刻**：

1. 改密码（Profile → Edit profile → Password）
2. Settings → General → Sign-up restrictions → 关 Sign-up enabled
3. Admin → Settings → 关闭你不用的功能（Container Registry / Pages / 等）

### 模板 B — Nginx 反代（推荐外部 HTTPS）

```nginx
upstream gitlab {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name gitlab.example.com;
    ssl_certificate /etc/letsencrypt/live/gitlab.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gitlab.example.com/privkey.pem;

    client_max_body_size 1G;                      # 大仓库 push / LFS
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://gitlab;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket（CI 实时日志）
    location ~ ^/(api/v4/projects/.*/issues/.*/notes/?|api/v4/projects/.*/wikis/.*) {
        proxy_pass http://gitlab;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`docker-compose.yml` 改 external_url：

```yaml
environment:
  GITLAB_OMNIBUS_CONFIG: |
    external_url 'https://gitlab.example.com'
    nginx['listen_port'] = 80
    nginx['listen_https'] = false                  # 反代终结 HTTPS
    nginx['real_ip_trusted_addresses'] = ['127.0.0.1']
    nginx['real_ip_header'] = 'X-Forwarded-For'
```

### 模板 C — SSH Git Clone 配置

由于 GitLab SSH 用 2222，clone URL 默认带端口：

```bash
git clone ssh://git@gitlab.example.com:2222/group/repo.git
```

或在客户端 `~/.ssh/config` 配 alias：

```
Host gitlab.example.com
    HostName gitlab.example.com
    User git
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
```

之后正常 `git clone git@gitlab.example.com:group/repo.git`。

### 模板 D — GitLab Runner 集成

EnvForge catalog 有 `gitlab-runner` Playbook（详见 `gitlab-runner.md`）。简版：

```bash
# 在 GitLab UI 拿 registration token
# Admin Area → CI/CD → Runners → Register an instance runner

# 在 runner 机器
sudo docker run -d --name gitlab-runner --restart always \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v gitlab-runner-config:/etc/gitlab-runner \
    gitlab/gitlab-runner:latest

sudo docker exec -it gitlab-runner gitlab-runner register \
    --non-interactive \
    --url "https://gitlab.example.com/" \
    --token "<TOKEN>" \
    --executor "docker" \
    --docker-image alpine:latest
```

### 模板 E — 启用 Container Registry

```yaml
# docker-compose.yml 改 GITLAB_OMNIBUS_CONFIG
registry_external_url 'https://registry.example.com'
registry['enable'] = true
```

之后项目里 → Container Registry tab → Push 镜像：

```bash
docker login registry.example.com
docker push registry.example.com/group/repo:latest
```

### 模板 F — 备份（**关键**）

```bash
# GitLab 内置备份
docker exec gitlab gitlab-backup create

# 备份产物在 data/backups/
sudo ls -la /opt/gitlab/data/backups/
# 1716480000_2026_05_23_17.0.1_gitlab_backup.tar

# 加密 + 异地
sudo gpg -c /opt/gitlab/data/backups/*.tar
sudo rm /opt/gitlab/data/backups/*.tar.gpg.bak     # 清明文

# 还原
docker exec gitlab gitlab-backup restore BACKUP=1716480000_2026_05_23_17.0.1
```

定时备份 cron：

```cron
0 3 * * * docker exec gitlab gitlab-backup create CRON=1
```

> **配置文件 + secrets** 不在 backup 里——单独备 `/opt/gitlab/config/gitlab-secrets.json`！

### 模板 G — 升级

```bash
cd /opt/gitlab
docker compose pull
docker compose up -d                               # 自动 reconfigure + migration

# 升级前**务必备份**
# 不要跨大版本升级（如 16.x → 18.x），按 release notes 一步步升
```

GitLab 升级路径强制：https://docs.gitlab.com/ee/update/

### 模板 H — 看版本 + 健康

```bash
docker exec gitlab cat /opt/gitlab/embedded/service/gitlab-rails/VERSION
docker exec gitlab gitlab-ctl status
docker exec gitlab gitlab-rake gitlab:check
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 个人（< 10 用户） | 4 GB | 2 vCPU | 10 GB |
| 小团队（< 100 用户） | 8 GB | 4 vCPU | 50 GB |
| 中型（< 1k 用户） | 16 GB | 8 vCPU | 200 GB |
| 大型（> 1k） | 多节点架构 | – | – |

### 内存优化（4 GB 配置）

```ruby
# /opt/gitlab/config/gitlab.rb 或 GITLAB_OMNIBUS_CONFIG
postgresql['shared_buffers'] = "256MB"
postgresql['max_worker_processes'] = 4
puma['worker_processes'] = 2
sidekiq['concurrency'] = 10
prometheus_monitoring['enable'] = false        # 关 Prometheus 节省 ~500 MB
gitlab_pages['enable'] = false
mattermost['enable'] = false
registry['enable'] = false                       # 不需要 container registry 时关
```

EnvForge Playbook 已默认这些配置。

### 性能：让 git push 快

```ruby
gitaly['ruby_max_rss'] = 200_000_000
gitlab_rails['gitlab_shell_keep_alive'] = 60
```

## 跨发行版兼容

容器化跨发行版一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅ |
| ARM64 | ✅（gitlab-ce arm64 镜像） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`gitea-server`** — **替代品**（轻量 1/10）
- **`gitlab-runner`** — CI 执行端（**catalog 单独 Playbook**）
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（模板 B）
- **`postgres-profile` / `redis-server`** — GitLab 自带，不需要外部

## 排错

### 容器起不来 / OOM

```bash
docker logs gitlab | grep -i error
free -h

# 内存不够 → 加 swap（catalog swap-config）+ 重启
# 或换 gitea-server
```

### 5 分钟没 ready

```bash
# GitLab 首次启动慢（DB migration + 静态资源构建 + Rails 加载）
docker logs -f gitlab

# 看 reconfigure 进度
docker exec gitlab tail -f /var/log/gitlab/reconfigure/*.log

# 重启 reconfigure
docker exec gitlab gitlab-ctl reconfigure
```

### 反代后 `502 Bad Gateway`

```bash
# 检查 GitLab 是否在 8080 监听
sudo ss -tlnp | grep 8080
docker logs gitlab | grep -i "Listening"

# 内置 nginx 配置
docker exec gitlab cat /var/opt/gitlab/nginx/conf/gitlab-http.conf | head -20
```

### Git clone via HTTP 失败

```bash
# 1. external_url 与实际访问 URL 不一致
docker exec gitlab grep external_url /etc/gitlab/gitlab.rb

# 2. 改后 reconfigure
docker exec gitlab gitlab-ctl reconfigure
```

### Git clone via SSH 失败

```bash
# 1. SSH 端口对（默认 2222）
git clone ssh://git@host:2222/group/repo.git

# 2. SSH key 加到 GitLab UI
# Profile → SSH Keys → 添加 ~/.ssh/id_ed25519.pub

# 3. 测试 SSH 连接
ssh -T -p 2222 git@host
# Welcome to GitLab, @user!
```

### Root 密码忘了

```bash
docker exec -it gitlab gitlab-rails console
> user = User.find_by(username: 'root')
> user.password = 'newpassword'
> user.password_confirmation = 'newpassword'
> user.save!
> exit
```

### 备份失败 / 太大

```bash
# 看具体错
docker exec gitlab gitlab-backup create | tee /tmp/backup.log

# 排除某些大数据（如 LFS）
docker exec gitlab gitlab-backup create SKIP=lfs,registry,artifacts

# 增量备份（CE 不支持 — EE 才有）
```

### 升级失败

```bash
# 必须按官方升级路径走（不能跨大版本）
# https://docs.gitlab.com/ee/update/
# e.g. 16.0 → 16.11 → 17.0 → 17.x

# 回滚（image lock 老版本）
docker compose stop
docker compose pull gitlab/gitlab-ce:17.0.0
docker compose up -d
```

## 验证

```bash
docker ps | grep gitlab
curl -fsS http://127.0.0.1:8080/-/health             # GitLab OK
docker exec gitlab gitlab-ctl status
docker exec gitlab gitlab-rake gitlab:env:info | head -20
```

## 多次运行

`installMode: skip-existing`。docker-compose.yml 重写。**Root 密码仅首次有效**。**数据保留**（git 仓库 / 用户 / 配置）。

## ⚠️ 敏感性

**privileged** — GitLab 持有**全部代码 + CI 凭据 + 部署 key**。攻陷 = 全部生产环境攻陷。

强制：

1. **公网必须 HTTPS**
2. 关 Sign-up（公网防垃圾用户）
3. 启用 2FA（admin → Settings → 强制）
4. Token 用 short-lived
5. **频繁备份**（至少每天）
6. 升级前必备份
7. 监控 audit log（admin → Audit events）

## 隐私说明

- usage_ping_enabled / version_check_enabled 已禁用
- 数据本地存储 `/opt/gitlab/data/`
- 备份文件含 git 仓库 + 用户密码 hash + 全部 secrets——**加密备份**
- `/opt/gitlab/config/gitlab-secrets.json` 是关键文件——丢了所有 token / OAuth 失效
