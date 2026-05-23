# Dozzle Docker 日志查看器

Dozzle 是**实时 Docker 容器日志 web 查看器**——挂 docker socket 就开看，**不需要 ELK / Loki / Promtail 等重栈**。**适合**：homelab / 小团队调试容器、临时看日志、追踪 bug。**~30 MB RAM**，单容器。**不适合**：长期日志归档（用 `loki-logging`）。

## 你将得到什么

- 📦 **Dozzle 容器**（`amir20/dozzle:latest`）
- ✅ Web UI 监听 `127.0.0.1:9999`
- ✅ 实时日志流（WebSocket，毫秒级延迟）
- ✅ 多容器并排查看
- ✅ 关键词过滤 + 正则
- ✅ 时间范围跳转
- ✅ Dark mode + 自动检测系统主题
- ✅ **认证已启用**（simple auth provider，bcrypt 存储）
- ✅ Container actions 默认禁用（不能 stop/restart 容器——纯只读）

## 表单字段说明

### `dz_port`

本机绑定端口，默认 9999。生产用反代。

### `dz_admin_user` / `dz_admin_password`

⚠️ Dozzle **默认无认证**——本 Playbook 自动配 simple auth + bcrypt 密码。

加用户：

```yaml
# /opt/dozzle/users.yml
users:
  admin:
    email: admin@localhost
    name: Administrator
    password: '$2y$10$...'    # bcrypt hash
  alice:
    email: alice@example.com
    name: Alice
    password: '$2y$10$...'
```

生成新密码 hash：

```bash
docker run --rm httpd:2-alpine htpasswd -nbBC 10 "" "NewPass" | tail -n1 | sed 's/^://'
```

### `dz_data_dir`

```
{data_dir}/
├── docker-compose.yml
└── users.yml                # 用户清单（bcrypt 密码）
```

Dozzle **没有持久状态**——日志直接读 docker daemon。重启不丢任何东西。

## 配置文件 / 目录速查

```
{data_dir}/users.yml          # 认证用户

# 容器内
/data/users.yml               # 挂载点

# 环境变量
DOZZLE_AUTH_PROVIDER          # simple / forward-proxy / none
DOZZLE_ENABLE_ACTIONS         # true / false（容器操作）
DOZZLE_LEVEL                  # 日志级别（info / debug）
DOZZLE_HOSTNAME               # 显示的主机名（多主机时区分）
DOZZLE_REMOTE_HOST            # 远程 Docker 主机
DOZZLE_REMOTE_AGENT           # 远程 agent
DOZZLE_NO_ANALYTICS           # true 关闭遥测
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name logs.example.com;

    ssl_certificate     /etc/letsencrypt/live/logs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logs.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9999;
        proxy_http_version 1.1;

        # WebSocket 必配（实时日志靠 WS）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 长连接（实时流）
        proxy_read_timeout 7200s;
        proxy_send_timeout 7200s;
    }
}
```

### 模板 B — 加用户

```bash
# 1. 生成新用户密码 hash
HASH=$(docker run --rm httpd:2-alpine htpasswd -nbBC 10 "" "AlicePass123" | tail -n1 | sed 's/^://')

# 2. 加到 users.yml
sudo tee -a /opt/dozzle/users.yml <<EOF
  alice:
    email: alice@example.com
    name: Alice
    password: '$HASH'
EOF

# 3. 重启容器
docker restart dozzle
```

### 模板 C — 启用容器操作（restart / stop）

```yaml
# docker-compose.yml 改
environment:
  DOZZLE_ENABLE_ACTIONS: "true"
```

⚠️ **危险**——开了之后任何 Dozzle 用户都能 stop/restart 容器（含 Dozzle 自己 → 死锁）。**仅信任管理员小圈子用**。

### 模板 D — 多主机集中查看（多 Docker 服务器）

Dozzle 1.55+ 支持 agent 模式——多台机器集中看日志。

**架构**：master 跑 Web UI，每个 agent 暴露本机 socket。

```yaml
# Master（本机，跑 Web UI）
services:
  dozzle:
    image: amir20/dozzle:latest
    container_name: dozzle
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./users.yml:/data/users.yml:ro
    ports:
      - "127.0.0.1:9999:8080"
    environment:
      DOZZLE_AUTH_PROVIDER: simple
      DOZZLE_REMOTE_AGENT: "agent2.lan:7007,agent3.lan:7007"
```

```yaml
# Agent（其他 Docker 主机，agent2.lan / agent3.lan）
services:
  dozzle-agent:
    image: amir20/dozzle:latest
    container_name: dozzle-agent
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "7007:7007"
    command: agent
    environment:
      DOZZLE_HOSTNAME: agent2     # 显示用
```

Web UI 顶部下拉切换主机。

### 模板 E — 自定义主机名 + 多种过滤

```bash
# 显示主机名（多主机时区分）
docker exec dozzle env | grep HOSTNAME

# 修改 docker-compose.yml
environment:
  DOZZLE_HOSTNAME: "production-vps-01"
```

Web UI 中：

- Container 列表过滤：`/regex/` 用正则
- 日志关键词过滤：顶部搜索框（实时）
- 时间范围：URL 加 `?since=2024-01-01&until=2024-01-02`

### 模板 F — 容器忽略列表

```yaml
# docker-compose.yml
environment:
  # 隐藏不重要的容器（不显示在列表）
  DOZZLE_FILTER: "label=app=ignore"
```

或在容器加 label：

```yaml
services:
  noisy-cron:
    image: ...
    labels:
      app: ignore       # Dozzle 不显示此容器
```

### 模板 G — Forward-proxy 认证（用 Authelia / Authentik）

如果你已部署 SSO：

```yaml
# docker-compose.yml
environment:
  DOZZLE_AUTH_PROVIDER: forward-proxy
  DOZZLE_AUTH_HEADER_USER: Remote-User
  DOZZLE_AUTH_HEADER_NAME: Remote-Name
  DOZZLE_AUTH_HEADER_EMAIL: Remote-Email
  DOZZLE_AUTH_HEADER_FILTER: Remote-Groups
```

不再需要 users.yml——SSO 决定谁能访问。

## 关键参数调优速查

### 资源占用

| 容器数 | RAM | CPU |
|---|---|---|
| < 20 | 30 MB | 极低 |
| < 100 | 80 MB | < 1% |
| 极活跃日志（多容器高频写） | 200 MB | 2-5% |

### 日志保留

Dozzle **不存日志**——直接读 docker daemon 的循环 buffer。

- Docker 默认保留：每容器 100 MB（json-file driver）/ 不限（journald driver）
- 调大：`/etc/docker/daemon.json`：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "10"
  }
}
```

### 大量容器（性能优化）

```yaml
environment:
  DOZZLE_FILTER: "label=traefik.enable=true"   # 只看带特定 label 的容器
  DOZZLE_NO_ANALYTICS: "true"                   # 关遥测（默认开）
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64 | ✅（多架构镜像） |
| Podman 替代 docker | ⚠️ 需改 socket 路径（podman.sock） |

### Podman 适配

```yaml
volumes:
  - /run/podman/podman.sock:/var/run/docker.sock:ro
```

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（**必装**——WebSocket）
- **`loki-logging`** — 互补（Dozzle 实时调试，Loki 长期归档 + 查询）
- **`prometheus-monitoring`** — 互补（Prom 监控，Dozzle 看日志）
- **`portainer`** — 互补（Portainer 管容器，Dozzle 看日志）
- **`sso-stack`** — 反代加 forward-auth（模板 G）

## 排错

### 容器列表空 / 看不到任何容器

```bash
# 1. socket 真挂上了？
docker exec dozzle ls -la /var/run/docker.sock
# 应是 srw-rw---- 权限

# 2. 容器内能调 docker API 吗？
docker exec dozzle wget -qO- --unix-socket /var/run/docker.sock http:/v1.40/containers/json | head -100

# 3. SELinux 阻挡？
sudo setsebool -P container_manage_cgroup on
```

### 反代后日志不实时（要刷新才更新）

```bash
# 99% 是 WebSocket 漏配
# nginx 必须有：
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

sudo nginx -t && sudo nginx -s reload
```

### 登录后立刻又退出

```bash
# 1. cookie domain 错（反代 + 浏览器禁第三方 cookie）
# 用同一根域：logs.example.com 而不是 logs.different-domain.com

# 2. users.yml 格式错？
docker logs dozzle | grep -i auth
```

### 性能慢（30+ 容器时）

```bash
# 1. 关分析
DOZZLE_NO_ANALYTICS: "true"

# 2. 过滤掉不重要的容器
DOZZLE_FILTER: "name=^(?!noise-).*"     # 隐藏 noise- 开头的容器

# 3. 升级到最新版（性能持续优化）
docker compose pull && docker compose up -d
```

### "container actions" 按钮显示但不工作

```bash
# DOZZLE_ENABLE_ACTIONS=true 才启用
# 看环境
docker exec dozzle env | grep ACTIONS

# 默认关——主动开会有警告（任何用户能停容器）
```

### 日志显示二进制 / 乱码

容器输出非 UTF-8 流（如 Java GC 日志带颜色码）：

```bash
# 应用容器加环境变量去色
LANG=C
TERM=dumb
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=dozzle

# 2. Web UI 响应
curl -fsS http://127.0.0.1:9999/ -o /dev/null -w '%{http_code}\n'
# 200 或 302（跳到登录）

# 3. socket 能访问
docker exec dozzle ls -l /var/run/docker.sock

# 4. 用户认证可用
curl -fsS http://127.0.0.1:9999/api/health
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` + `users.yml` 每次按表单值重写——**`users.yml` 内手动加的额外用户会被覆盖**（因为 admin 字段自动填入）。复杂用户管理建议手动改 yaml + 重启容器，不要重跑 Playbook。Dozzle 自身无持久状态，重启不丢任何东西。

## ⚠️ 敏感性

**privileged** — Dozzle **挂 docker socket 只读** —— 能看到所有容器的日志，**含敏感信息**（API key 错误堆栈 / SQL query / 用户密码尝试 / 等）。

强制：

1. **公网必须 HTTPS + 强密码**
2. 不要开 `DOZZLE_ENABLE_ACTIONS=true` 在公网
3. socket 仅 read-only 挂载（Playbook 默认 `:ro`）—— 不要改 `:rw`
4. 反代加 IP 白名单 / fail2ban-protection / 或更好上 SSO（模板 G）
5. 多主机 agent 之间通信走内网 / VPN（不要公网暴露 :7007）

## 隐私说明

- Dozzle **本身不存日志**——只是实时看 docker daemon 的输出
- 默认开 GA-style 遥测（Plausible Analytics 自托管）—— `DOZZLE_NO_ANALYTICS=true` 关闭
- 多用户场景所有用户看到所有容器（**没有按容器的细粒度权限**）—— 高敏感场景慎用
