# Docker 部署指南

> 本文从零开始，详细到每一条命令——目标读者是**第一次拿到一台空服务器、想把 EnvForge 跑起来**的运维或自托管玩家。

适用场景：
- 一台 VPS / 物理机 / 内网服务器（推荐 Ubuntu 22.04+ / Debian 12+ / RHEL 9+ / Anolis 9+ / Alma 9+）
- 想用 Docker 部署、不想折腾 Node 版本和 npm 工作区
- 数据需要持久化（重启 / 重建容器后用户、连接、Playbook、任务历史不丢）

如果你只想本地开发跑跑：参见 [README.md](../README.md) 的 "快速开始" 段落即可，本文不讨论。

---

## 一、系统要求

| 项目 | 最低 | 推荐 | 备注 |
|---|---|---|---|
| CPU | 1 vCPU | 2 vCPU | EnvForge 本身轻量；并发跑 Playbook 时多核更稳 |
| 内存 | 512 MB | 1 GB+ | Node 进程 + 任务并发会吃约 300-500 MB |
| 磁盘 | 2 GB | 5 GB+ | 镜像 ~500 MB；任务日志 / 快照随使用增长 |
| 操作系统 | Linux x86_64 / arm64 | 同左 | 已在 Ubuntu / Debian / RHEL / Anolis 验证 |
| 网络 | 出站 443（拉镜像 + npm） | 同左 | 入站 5173 给浏览器；公网部署建议挂 nginx + HTTPS |
| Docker | 24.0+ | 25.0+ | 必须支持 `docker compose` 子命令（v2，**不是** `docker-compose`） |

> ⚠️ **不支持 Windows / macOS 作为部署主机**——开发可以，但生产部署 SSH 行为有差异。本文假设 Linux。

---

## 二、安装前置依赖

如果服务器已经有 Docker，跳过本节。

### Ubuntu / Debian

```bash
# 1. 卸载发行版自带的旧 docker（如果有）
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# 2. 装 Docker 官方仓库（比发行版自带版本新很多）
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Debian 把 ubuntu 改成 debian
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 3. 启动并设开机自启
sudo systemctl enable --now docker

# 4. 把当前用户加 docker 组（免 sudo 跑 docker 命令；高危，只给信任用户）
sudo usermod -aG docker $USER
# 重新登录或运行：
newgrp docker
```

### RHEL / CentOS / Anolis / Alma / Rocky 9

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Anolis / Alma / Rocky 是 RHEL 克隆，复用 centos repo 即可
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### 验证 Docker 装好了

```bash
docker --version              # Docker version 25.x.x 或更新
docker compose version        # Docker Compose version v2.x.x（注意是 'compose' 不是 'compose'）
docker run --rm hello-world   # 跑一个最小镜像测试
```

> ❗ 如果 `docker compose version` 报 "is not a docker command"，你装的是过期的 v1（`docker-compose`，带连字符）。
> v1 已经 EOL，本文档**只支持 v2**。请按上面的步骤重新装。

---

## 三、生成 Master Key

EnvForge 用 AES-256-GCM 加密用户保存的 SSH 密码 / 密钥。**Master key 一旦丢失，所有加密的凭据都解不开**——同样，**部署后切勿换 key**，会让所有现有用户的连接失效。

```bash
# 任选其一：

# A. 用 openssl（任何 Linux 都装了）
openssl rand -base64 32

# B. 临时用 docker 跑 node（如果你还没装 node）
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# C. 已装 node
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

输出形如：`m9tHHk0xZ+vN2fK8jL3pQ4...`（44 字符的 base64 字符串）。

⚠️ **立刻做两件事**：

1. **复制保存到密码管理器**（1Password / Bitwarden / Vaultwarden / 等）—— 离线备份
2. **写到下一步的 `.env` 文件里**—— 容器启动需要

---

## 四、拉取代码 + 准备配置

### 4.1 选个数据目录

EnvForge 的所有运行时数据（用户账号、SSH 凭据、连接、任务历史、Playbook 快照）都存在 docker volume 里。代码本身只放仓库目录，不大。

```bash
# 推荐放到 /opt 或 /srv（系统级服务的常见位置）
sudo mkdir -p /opt/envforge
sudo chown $USER:$USER /opt/envforge
cd /opt/envforge
```

### 4.2 git clone

```bash
git clone https://github.com/foolkking/envforge.git .
# 注意末尾的 . —— 把仓库内容直接拉到 /opt/envforge，不再多一层目录

# 或者拉某个稳定 tag（推荐生产环境用 tag 而不是 main 分支）：
# git clone -b v0.1.0 https://github.com/foolkking/envforge.git .
```

> 私有 fork 或镜像？把上面 URL 替换成你的仓库地址即可。私有仓库需要先在服务器上配好 SSH key 或 GitHub PAT。

验证关键文件存在：

```bash
ls -la Dockerfile docker-compose.yml docker-compose.demo.yml .env.example
# 4 个文件都应该存在
```

### 4.3 创建 `.env`

```bash
cp .env.example .env
nano .env       # 或 vim / vi
```

**最少要改的 1 项** —— 把第三步生成的 master key 填进去。`.env` 里改这行：

```ini
# 必填：32 字节随机 key 的 base64 形式
ENVFORGE_MASTER_KEY=你刚才生成的 base64 字符串
```

**强烈建议同时设的 2 项**：

```ini
# 把你的邮箱设为 admin（注册后自动有 admin 角色，能管理 catalog）
ENVFORGE_ADMIN_EMAILS=your-email@example.com

# 公网部署改成你的真实 URL（影响 OAuth callback / 生成的链接）
PUBLIC_BASE_URL=https://envforge.example.com
```

其它项（SMTP、GitHub OAuth）按需启用，没填的话功能降级但不影响主流程。

保存退出。

> 🔒 `.env` 含 master key，**不要 commit 到 git**——`.gitignore` 已默认忽略 `.env`。
> 也不要在团队 IM 里发原文。

### 4.4 检查端口是否冲突

EnvForge 默认监听 5173。`docker-compose.yml` 默认绑定到 `127.0.0.1:5173`（仅本机可访问，需要反代）。

如果服务器上这个端口已被占用：

```bash
sudo ss -tlnp | grep ':5173 '
# 没输出 = 端口空闲
```

被占了的话，编辑 `docker-compose.yml`，把 `ports:` 段改成别的端口，例如：

```yaml
ports:
  - "127.0.0.1:8080:5173"     # 宿主机 8080（仅本机）→ 容器内 5173
```

后续反代到 `127.0.0.1:8080`。

> 想直接公网暴露（**仅测试 / 内网可信场景**）：改成 `"5173:5173"`（不加 `127.0.0.1:` 前缀）。生产强烈不建议——见第六节。

---

## 五、启动

### 5.1 模式 A：纯 EnvForge（生产推荐）

只跑主服务，不带 sandbox VM。你需要自己另外有要管理的 Linux 主机（VPS / 同内网的别的服务器）。

```bash
# 先 build 镜像（首次约 3-5 分钟，依赖网速 + CPU）
docker compose build

# 跑起来（后台）
docker compose up -d

# 看日志
docker compose logs -f envforge
# Ctrl+C 退出 logs，容器继续跑
```

启动成功的标志（日志里看到）：

```
[envforge] API listening on http://0.0.0.0:5173
[envforge] Serving Web UI from apps/web/dist
[envforge] catalog: 115 items loaded
```

打开浏览器访问 `http://server-ip:5173/`（如果改成 `127.0.0.1:5173:5173`，需要先配反代——见第六节）。

第一次访问 → 点 "Register" → 用 4.3 里 `ENVFORGE_ADMIN_EMAILS` 填的邮箱注册，登录后会自动有 admin 角色。

### 5.2 模式 B：Demo 沙盒（含一台目标 VM）

适合"先试试再决定"的玩家。会同时启动：

- `envforge-demo` — 主服务，端口 5173
- `envforge-sandbox-vm` — 一台 Ubuntu 22.04 容器，开 sshd 在端口 2222（宿主机外）/ 22（容器网络内），预置 `demo / demo` 账号

```bash
# 必须导出 master key（demo compose 文件强制要求）
export ENVFORGE_MASTER_KEY=$(grep '^ENVFORGE_MASTER_KEY=' .env | cut -d= -f2-)

# 启动
docker compose -f docker-compose.demo.yml up -d

# 看 sandbox 起来没（首次启动会装 openssh-server 等，约 30-60 秒）
docker compose -f docker-compose.demo.yml logs -f sandbox-vm
# 看到 "Server listening on 0.0.0.0 port 22" 即就绪
```

打开 `http://server-ip:5173/`，注册后到 VM Manager 添加连接：

- Host: `sandbox-vm`（Docker 内部 DNS）
- Port: `22`（容器内 sshd 端口；从宿主机外部连用 2222，但 EnvForge 在 docker 网络内）
- User: `demo`
- Password: `demo`

测试连接 → 跑任意 Playbook 都不会污染你的真实机器，玩坏了 `down -v` 重建即可。

> 不想要 demo 后切回模式 A：
>
> ```bash
> docker compose -f docker-compose.demo.yml down -v   # -v 删 volumes（demo 数据）
> docker compose up -d                                # 启正式服务
> ```

### 5.3 验证健康

```bash
# 服务自检
curl http://127.0.0.1:5173/api/health
# 应返回 {"status":"ok","uptime":...,"version":"0.1.0"}

# 容器状态
docker compose ps
# State 应该都是 'running' 或 'healthy'

# 容器健康检查（Dockerfile 里定义的 HEALTHCHECK）
docker inspect envforge --format '{{.State.Health.Status}}'
# 第一次启动 15 秒后应该是 'healthy'

# 看 catalog 项数（应是 115）
curl -s http://127.0.0.1:5173/api/catalog | python3 -c 'import json, sys; d = json.load(sys.stdin); print(f"items: {len(d[\"items\"])}")'
```

---

## 六、生产环境加固

模式 A 跑起来后，公网部署还需要加上 HTTPS + 反代。**绝不要把 5173 端口直接挂公网**——HTTP 明文 + 弱 brute-force 防护。

> 💡 **想偷懒？** 如果你不想手写 nginx + certbot 配置，可以用 EnvForge 自己来配——见 [DEPLOY_SELF.md](./DEPLOY_SELF.md)，6 次 UI 点击替代本节 100 行手工配置。

### 6.1 nginx 反向代理 + Let's Encrypt（推荐）

在宿主机（**容器外**）装 nginx + certbot：

```bash
# Ubuntu
sudo apt-get install -y nginx certbot python3-certbot-nginx

# RHEL/Anolis
sudo dnf install -y nginx certbot python3-certbot-nginx
```

写 `/etc/nginx/conf.d/envforge.conf`：

```nginx
server {
    listen 80;
    server_name envforge.example.com;        # ← 改成你的真实域名
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name envforge.example.com;        # ← 同上

    ssl_certificate     /etc/letsencrypt/live/envforge.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/envforge.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 长连接：任务流式日志（SSE）需要
    proxy_read_timeout    3600s;
    proxy_send_timeout    3600s;

    # 文件上传（SSH 私钥、playbook 等）
    client_max_body_size  20m;

    location / {
        proxy_pass         http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;

        # SSE 流式（任务进度）— 必须的两行
        proxy_buffering    off;
        proxy_cache        off;

        # WebSocket 升级
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $http_connection;
    }
}
```

```bash
# 校验 nginx 语法
sudo nginx -t

# 用 certbot 自动签证书 + 改 nginx 配置
sudo certbot --nginx -d envforge.example.com

# 续签（certbot 自动装了 timer，不用手工跑）
sudo systemctl status certbot.timer
```

如果你之前改了 docker-compose.yml 的 ports 暴露成 `0.0.0.0:5173`（即没加 `127.0.0.1:` 前缀），**现在需要改回**：

```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:5173:5173"     # 仅本机可访问，外网必须走 nginx
```

```bash
docker compose up -d            # 重建容器应用新端口绑定
```

防火墙：

```bash
# Ubuntu
sudo ufw allow 80,443/tcp
sudo ufw delete allow 5173/tcp 2>/dev/null || true

# RHEL/Anolis
sudo firewall-cmd --add-service={http,https} --permanent
sudo firewall-cmd --remove-port=5173/tcp --permanent 2>/dev/null || true
sudo firewall-cmd --reload
```

打开 `https://envforge.example.com/` 验证 HTTPS + 反代正常。

### 6.2 系统级开机自启

Docker daemon 默认会在开机时启动已经 `restart: unless-stopped` 的容器（compose 文件里已经声明了）。
所以只要 `sudo systemctl enable docker` 跑过，**EnvForge 容器开机会自动起来**，不需要额外的 systemd unit。

可选：写一个 systemd unit 让 compose stack 作为系统服务（更优雅，可以 `systemctl status envforge`）：

```bash
sudo tee /etc/systemd/system/envforge.service <<'EOF'
[Unit]
Description=EnvForge (Docker Compose)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/envforge
EnvironmentFile=/opt/envforge/.env
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now envforge.service
sudo systemctl status envforge.service
```

---

## 七、备份 / 恢复

### 7.1 备份内容

EnvForge 全部状态都在 docker volume `envforge_data` 里：

```bash
# 看 volume 信息
docker volume inspect envforge_data

# 备份脚本
mkdir -p /opt/envforge/backups
docker run --rm \
  -v envforge_data:/data:ro \
  -v /opt/envforge/backups:/backup \
  alpine \
  tar czf /backup/envforge-$(date +%F-%H%M%S).tar.gz -C /data .

# 同时备份 .env（含 master key，加密存储或离线保存）
sudo cp /opt/envforge/.env /opt/envforge/backups/.env.$(date +%F)
```

建议：

- 至少**每天一次**备份 `envforge_data`
- 把 `.env`（含 master key）**离线**保存（U 盘 / 密码管理器）
- 备份文件**加密**后再上传到云存储（rclone crypt / borg / age）

cron 自动备份示例（每天凌晨 3 点）：

```bash
echo '0 3 * * * cd /opt/envforge && docker run --rm -v envforge_data:/d:ro -v /opt/envforge/backups:/b alpine tar czf /b/envforge-$(date +\%F).tar.gz -C /d . && find /opt/envforge/backups -name "envforge-*.tar.gz" -mtime +30 -delete' | sudo crontab -
```

### 7.2 恢复到新机器

在新服务器上：

```bash
# 1. 重新走第 1-4 步（装 Docker、clone 仓库、放回原来的 .env）

# 2. 创建 volume（compose up 时会自动创建，但手动也行）
docker volume create envforge_data

# 3. 把备份解到 volume 里
docker run --rm \
  -v envforge_data:/data \
  -v /path/to/backup-dir:/backup:ro \
  alpine \
  tar xzf /backup/envforge-2024-01-15-120000.tar.gz -C /data

# 4. 启动
docker compose up -d
```

注意 **`.env` 必须用原来那一份**（含相同的 `ENVFORGE_MASTER_KEY`），否则 SSH 凭据全部解不开。

---

## 八、升级到新版本

```bash
cd /opt/envforge

# 先备份（见上节）！

# 拉新代码
git fetch origin
git checkout v0.2.0          # 或 git pull origin main 拉最新

# 重新 build + 滚动重启
docker compose build
docker compose up -d

# 看新版本起来了
docker compose logs -f envforge
```

`docker compose up -d` 是幂等的——已存在的 volume 不会被动，只重建容器进程。任务历史 / 用户 / 凭据都保留。

升级失败回滚：

```bash
git checkout v0.1.0
docker compose build
docker compose up -d
# 把 7.1 备份的 envforge_data tar 解压恢复
```

> 💡 **catalog 改动后**：仓库新增 / 修改了 catalog 项（`apps/api/src/catalog.ts` 或 `configs/catalog/` 里的文件），**必须重 build 镜像**（`docker compose build`）—— 直接 `up -d` 不会重 build，前端看不到新增项。

---

## 九、卸载

```bash
cd /opt/envforge

# 停服务
docker compose down

# 删数据（⚠️ 不可逆，所有用户 / 凭据 / 任务历史全部丢）
docker compose down -v
docker volume rm envforge_data 2>/dev/null || true

# 删镜像
docker rmi envforge:latest 2>/dev/null || true

# 删代码 + 配置
sudo rm -rf /opt/envforge

# 删 systemd unit（如果装过）
sudo systemctl disable --now envforge.service
sudo rm /etc/systemd/system/envforge.service
sudo systemctl daemon-reload
```

---

## 十、常见问题排查

### 容器起不来 / 立刻退出

```bash
docker compose logs envforge
# 看 stderr 输出
```

最常见原因：

- **`ENVFORGE_MASTER_KEY required`** — `.env` 没设或没被读到。检查：

  ```bash
  cat /opt/envforge/.env | grep MASTER_KEY        # 应该有这行且非空
  docker compose config | grep MASTER_KEY          # docker compose 应该能解析到
  ```

  > 注意：`docker-compose.yml` 用 `${ENVFORGE_MASTER_KEY:?...}` 强制要求此变量，没设时 compose 直接拒启。

- **`Port 5173 already in use`** — 宿主机的 5173 被占。改 compose ports（见 4.4）。
- **`EACCES: permission denied, open '/app/data/...'`** — volume 权限问题。重建：

  ```bash
  docker compose down
  docker volume rm envforge_data
  docker compose up -d                   # 重新创建 volume，权限会自动修
  ```

### 前端配置市场显示的 catalog 数量与代码不一致

新增 catalog 项后必须**重 build 镜像**，不是只 `up -d`：

```bash
docker compose build
docker compose up -d
docker compose restart envforge   # 强制重启确认拿到新 dist
```

校验：

```bash
curl -s http://127.0.0.1:5173/api/catalog | grep -o '"id":"[^"]*"' | wc -l
# 应等于当前 catalog.ts 里的项数
```

### 连不上目标 VM（"connection refused / timeout"）

- 目标 VM 的 sshd 起没？`ssh user@target-vm`（在 EnvForge 容器外测试）
- 防火墙开 22 没？
- 用密钥的话，密钥在 EnvForge 容器里读得到没？默认 compose 把宿主机 `~/.ssh` 只读挂进去（`/home/envforge/.ssh:ro`），适合 root 跑 docker 的场景。如果用普通用户跑 docker：

  ```yaml
  # 在 .env 设
  SSH_KEY_DIR=/home/your-user/.ssh
  # docker-compose.yml 的 ${SSH_KEY_DIR:-~/.ssh} 会读取此值
  ```

### Web UI 打开是白屏

- 浏览器开 DevTools → Network → 看 `/api/health` 返回什么
- 看 nginx 日志：`sudo tail -f /var/log/nginx/error.log`
- 反代时 `proxy_buffering off` 必须设，否则 SSE 流式接口会卡

### 任务卡住 / 日志断流

EnvForge 用 SSE 推任务进度。如果挂在反代后面：

- nginx 必须 `proxy_buffering off` 和 `proxy_cache off`（见 6.1）
- Cloudflare 等 CDN 默认会缓冲 SSE，前面这层要设 "Proxy → DNS only" 或专门的 EventSource 兼容配置

### 重启后 admin 权限丢了

`ENVFORGE_ADMIN_EMAILS` 是登录时检查并提权的，**不会持久化覆盖角色**。把你的邮箱加到 `.env` 的 `ENVFORGE_ADMIN_EMAILS` 里，下次登录自动恢复 admin。

### 镜像 build 慢 / npm install 卡住

国内服务器到 `registry.npmjs.org` 慢。本仓库 `Dockerfile` 已支持 `NPM_REGISTRY` build arg：

```bash
docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com
docker compose up -d
```

或在镜像构建时**临时**用代理：

```bash
docker compose build --build-arg HTTP_PROXY=http://your-proxy:port \
                     --build-arg HTTPS_PROXY=http://your-proxy:port
```

### 怎么进容器排查

```bash
# 进容器 shell（只读看东西）
docker compose exec envforge sh

# 看容器内的数据目录
ls -la /app/data/
cat /app/data/runtime-db.json | head

# 看 catalog 已编译的版本
ls /app/apps/api/dist/catalog.js
grep -c 'kind: "software"' /app/apps/api/dist/catalog.js

# 退出
exit
```

### `tini` 没用上 / Ctrl-C 不优雅退出

`Dockerfile` 已用 `tini` 作 PID 1。如果你自己 fork 改了 ENTRYPOINT，确保保留 `["/sbin/tini", "--"]`，否则 SIGTERM 不会传给 node 进程。

---

## 十一、参考链接

- [README.md](../README.md) — 项目总览
- [docs/DEPLOY_SELF.md](./DEPLOY_SELF.md) — 用 EnvForge 自管：用 6 次 UI 点击替代本文第六节 100 行手工配置
- [docs/PRODUCT.md](./PRODUCT.md) — 产品定位 / 信息架构 / 隐私模型
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — 工程架构 / 引擎设计 / 测试
- [docs/CATALOG.md](./CATALOG.md) — 完整 115 项 catalog 清单
- [Docker 官方文档 — Compose](https://docs.docker.com/compose/)
- [Let's Encrypt — Certbot](https://certbot.eff.org/)
