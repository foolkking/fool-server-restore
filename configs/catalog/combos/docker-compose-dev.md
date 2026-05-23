# Docker + Compose + Buildx 开发环境

Docker + Docker Compose 是**现代开发环境的容器化标准**：通过容器隔离应用依赖、Compose 编排多容器服务、Buildx 多平台构建。装这一套就够开发 / CI / 部署用。

## 你将得到什么

- 📦 **Docker Engine**（来自 Docker 官方仓库，**不是发行版自带的旧版**）
- 📦 **docker-compose-plugin**（`docker compose` v2，**取代旧 docker-compose v1**）
- 📦 **docker-buildx-plugin**（多架构构建 + BuildKit）
- ✅ daemon.json 配好日志轮转 + 镜像加速
- ✅ 当前用户加入 `docker` 组（**等同 root**，慎给）

## 表单字段说明

### `registry_mirrors`

国内拉镜像加速。多个用逗号分隔（按顺序尝试）。

| URL | 运营 |
|---|---|
| `https://docker.m.daocloud.io` | DaoCloud |
| `https://hub-mirror.c.163.com` | 网易 |
| `https://docker.mirrors.ustc.edu.cn` | 中科大 |
| `https://[id].mirror.aliyuncs.com` | 阿里云（去 cr.console.aliyun.com 拿） |

### `add_user_to_docker_group`

> ⚠️ docker 组 = root 权限。仅给信任用户。

详见 `docker-host-profile.md`。

## 配置文件 / 目录速查

```
/etc/docker/daemon.json                  # ← 主配置
/var/lib/docker/                          # 数据目录
~/.docker/config.json                      # 用户级配置（含 registry 凭据）

# CLI
/usr/bin/docker
/usr/libexec/docker/cli-plugins/
├── docker-compose
└── docker-buildx
```

详见 `docker-host-profile.md`。

## 常见配置模板

> **多数模板与 `docker-host-profile.md` 一致**——本 combo 只是更聚焦"开发场景"的便利组合。下面仅列开发场景特有的。

### 模板 A — 镜像加速 daemon.json

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
sudo systemctl restart docker
```

### 模板 B — 加用户到 docker 组（免 sudo）

```bash
sudo usermod -aG docker $USER
# 重新登录（exit + ssh）让组生效
newgrp docker                                       # 或当前 shell 立即生效

# 验证
docker run --rm hello-world                          # 无 sudo
```

### 模板 C — 开发场景 docker-compose.yml 起手式

最常用的本地开发栈：

```yaml
version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      - api

  api:
    image: node:22-alpine
    working_dir: /app
    volumes:
      - ./api:/app
    command: npm run dev
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://dev:dev@db:5432/devdb
      REDIS_URL: redis://redis:6379
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: devdb
    ports:
      - "127.0.0.1:5432:5432"                         # 仅本机暴露 DB
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data

  mailhog:
    image: mailhog/mailhog                            # SMTP 测试 server
    ports:
      - "1025:1025"                                    # SMTP
      - "8025:8025"                                    # Web UI

volumes:
  db-data:
  redis-data:
```

```bash
docker compose up -d
docker compose ps
docker compose logs -f api                           # 跟单服务日志
docker compose exec api sh                            # 进容器
docker compose down                                    # 停 + 清理
docker compose down -v                                  # 同时删 volumes（**丢数据**）
```

### 模板 D — Buildx 多架构构建

```bash
# 创建 multi-arch builder（首次）
docker buildx create --name multiarch --use --bootstrap

# 看支持架构
docker buildx ls

# 构建 + push（多架构）
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t my-registry/myapp:1.0 \
    --push \
    .

# 仅本机用 amd64（不 push）
docker buildx build --load -t myapp .
```

### 模板 E — 常用开发镜像速查

```bash
# 语言 runtime
docker pull node:22-alpine python:3.12-slim golang:1.22-alpine rust:1.81-slim

# 数据库
docker pull postgres:16-alpine mysql:8 mariadb:11 mongo:7 redis:7-alpine

# Web server
docker pull nginx:alpine caddy:2-alpine httpd:2.4-alpine

# 工具
docker pull alpine:latest debian:12-slim ubuntu:24.04 busybox:latest
```

### 模板 F — 磁盘清理

```bash
docker system df                                       # 看占用
docker system prune                                     # 清未用容器 / 网络 / 悬空镜像
docker system prune -a                                   # + 所有未引用镜像
docker system prune -a --volumes                          # + 未用 volumes（**慎用**）

# 自动每周清
echo "0 4 * * 0 /usr/bin/docker system prune -af --filter 'until=168h'" | sudo crontab -
```

## 关键参数调优速查

详见 `docker-host-profile.md`。本 combo 推荐：

| 参数 | 推荐 |
|---|---|
| `log-opts max-size` | 10m（开发够用） |
| 镜像加速 | 必配（国内服务器） |
| docker 组 | 仅给信任用户 |
| BuildKit | 默认开（v23+） |

## 跨发行版兼容

详见 `docker-host-profile.md`。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅（走 CentOS 仓库） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 本 combo 的核心组件
- **`portainer`** — Web UI 管理 Docker
- **`traefik-proxy`** — 自动发现容器
- **`nodejs-pm2`** — PM2 是 Docker 替代方案（裸金属部署）
- 几乎所有数据库 / service Playbook — 都支持 `deployModes: ["docker"]`

## 排错

### `Cannot connect to the Docker daemon`

```bash
sudo systemctl status docker

# 用户不在 docker 组
sudo usermod -aG docker $USER
exec $SHELL                                            # 重启 shell
docker ps
```

### 拉镜像超时

配镜像加速器（模板 A）。或临时：

```bash
docker pull docker.m.daocloud.io/library/nginx:alpine
docker tag docker.m.daocloud.io/library/nginx:alpine nginx:alpine
```

### `docker-compose` 命令找不到

v1 已弃用，**用 `docker compose`**（带空格）：

```bash
docker compose version                                  # ✅
docker-compose version                                   # ❌（v1 命令）

# 老脚本兼容（添加 alias）
echo "alias docker-compose='docker compose'" >> ~/.bashrc
```

### 容器无法访问外网（firewalld）

见 `firewalld.md` / `docker-host-profile.md` 模板 F。

### 磁盘吃光

```bash
docker system df
docker system prune -a --volumes
```

### Compose 健康检查超时

```yaml
services:
  app:
    depends_on:
      db:
        condition: service_healthy           # 等 db healthcheck 通过

  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s
```

## 验证

```bash
# 1. 命令存在
docker --version
docker compose version
docker buildx version

# 2. 服务在跑
systemctl is-active docker

# 3. Hello world
docker run --rm hello-world

# 4. 加进 docker 组的用户
groups | grep docker
docker ps                                                # 无 sudo

# 5. 镜像加速器生效
docker info | grep -A3 "Registry Mirrors"

# 6. Compose
mkdir /tmp/dc-test && cd /tmp/dc-test
cat > compose.yaml <<'EOF'
services:
  hello:
    image: alpine
    command: echo hello
EOF
docker compose up
docker compose down
cd / && rm -rf /tmp/dc-test

# 7. Buildx
docker buildx ls
```

## 多次运行

`installMode: skip-existing`。包不重装。**`daemon.json` 每次按表单值重写**——你**手动加的镜像加速地址会被覆盖**。

## ⚠️ 敏感性

**privileged** — Docker daemon = root。

强制：

1. **不给不信任用户加 docker 组**
2. **不 `--privileged` 跑不信任镜像**
3. 定期清理（防磁盘爆）
4. 镜像 layer 不要含 secret

详见 `docker-host-profile.md` 敏感性章节。

## 隐私说明

- Docker daemon 不发遥测（`buildx` 在某些场景发匿名 telemetry）
- 拉镜像 Docker Hub / 国内镜像方能看到拉取记录
- `~/.docker/config.json` 含 base64 私库密码 — 权限自动 0600
