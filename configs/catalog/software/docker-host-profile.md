# Docker 容器引擎

Docker CE 来自**官方仓库**（不是发行版自带的旧版）。一并装 Compose 插件 + buildx 多架构构建。当前生产容器化部署的事实标准。

## 你将得到什么

- 📦 **docker-ce** + **docker-ce-cli** + **containerd.io**
- 📦 **docker-compose-plugin**（`docker compose` 命令，v2，**取代旧 docker-compose**）
- 📦 **docker-buildx-plugin**（多架构构建 buildkit）
- ✅ daemon.json 配好日志轮转（防单容器吃光磁盘）
- ✅ 可选：镜像加速器
- ✅ 可选：data-root 改路径
- ✅ 当前用户自动加 docker 组（**等同 root 权限**，慎用）

## 表单字段说明

### `registry_mirrors`

国内服务器拉 Docker Hub 慢得离谱。常用镜像（多个用逗号分隔，按顺序尝试）：

| URL | 运营 |
|---|---|
| `https://docker.m.daocloud.io` | DaoCloud |
| `https://hub-mirror.c.163.com` | 网易 |
| `https://docker.mirrors.ustc.edu.cn` | 中科大 |
| `https://[your-id].mirror.aliyuncs.com` | 阿里云容器镜像服务（每账号唯一 URL，去 cr.console.aliyun.com 拿） |

> ⚠️ 国内镜像偶发不可用，建议同时配 2-3 个。

### `data_root`

默认 `/var/lib/docker`。改大盘见模板 D。

### `log_driver`

| 值 | 适用 |
|---|---|
| `json-file`（默认） | 容器 stdout/stderr 写文件，每容器最多 100MB×3 文件轮转 |
| `journald` | 写 systemd journal，与系统日志统一 |
| `local` | 类似 json-file 但更紧凑 |
| `none` | 不存日志（性能极佳，调试不便） |

### `add_user_to_docker_group`

> ⚠️ **加进 docker 组 = 等同 root**——用户能 `docker run -v / --privileged` 拿到 host 的 root。仅给信任用户。

## 配置文件 / 目录速查

```
/etc/docker/
├── daemon.json                          # ← 主配置
├── certs.d/                              # 私有 registry 证书
│   └── my-registry.com:5000/
│       └── ca.crt
└── seccomp.json                            # 默认 seccomp profile

/var/lib/docker/                          # 数据 root（按 daemon.json）
├── containers/                            # 容器元数据 + 日志（**最占空间**）
├── image/                                  # 镜像元数据
├── overlay2/                                # 镜像 + 容器层（最大）
├── volumes/                                  # named volumes
├── network/                                  # 网络配置
└── tmp/

# systemd
/lib/systemd/system/docker.service
/lib/systemd/system/docker.socket
/lib/systemd/system/containerd.service

# CLI
/usr/bin/docker
/usr/libexec/docker/cli-plugins/
├── docker-compose                         # docker compose 命令
├── docker-buildx                           # docker buildx
└── ...

# 用户配置
~/.docker/
├── config.json                              # 凭据（**含 base64 密码**！）
└── buildx/
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `download.docker.com/linux/{ubuntu,debian}` | `download.docker.com/linux/centos` |
| 包名 | `docker-ce docker-ce-cli containerd.io` | 同 |
| 服务名 | `docker` | `docker` |
| Anolis 9 | – | 走 RHEL/CentOS 9 仓库 ✅ |

## 常见配置模板

### 模板 A — 推荐 `/etc/docker/daemon.json`（生产基线）

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3",
    "compress": "true"
  },
  "data-root": "/var/lib/docker",
  "storage-driver": "overlay2",
  "default-address-pools": [
    { "base": "172.20.0.0/16", "size": 24 }
  ],
  "live-restore": true,
  "max-concurrent-downloads": 6,
  "max-concurrent-uploads": 6,
  "default-runtime": "runc",
  "features": {
    "buildkit": true
  },
  "userland-proxy": false,
  "iptables": true,
  "ip-forward": true
}
```

应用：

```bash
sudo systemctl reload docker
# 或重启（影响所有容器）
sudo systemctl restart docker
```

### 模板 B — Docker Compose 起手式

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"           # 仅本机绑定，反代后挂公网
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}     # 从 .env 读
    volumes:
      - app-data:/data
      - ./config:/etc/myapp:ro
    depends_on:
      db:
        condition: service_healthy
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 10s

volumes:
  app-data:
  db-data:

networks:
  backend:
    driver: bridge
```

`.env`:

```bash
DATABASE_URL=postgresql://app:secret@db:5432/app
DB_PASSWORD=secret
```

启动：

```bash
docker compose up -d
docker compose ps
docker compose logs -f app
docker compose down
docker compose pull && docker compose up -d        # 升级
```

### 模板 C — 多阶段 Dockerfile（小镜像）

```dockerfile
# Build 阶段
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# 运行阶段（仅含 runtime + 产物）
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

最终镜像 ~150 MB，对比 `node:22` 完整镜像 ~1.1 GB。

### 模板 D — 改 data-root 到大磁盘

```bash
sudo systemctl stop docker
sudo rsync -aHAX /var/lib/docker/ /data/docker/

# 改 daemon.json
sudo jq '. + {"data-root": "/data/docker"}' /etc/docker/daemon.json | sudo tee /etc/docker/daemon.json.new
sudo mv /etc/docker/daemon.json.new /etc/docker/daemon.json

sudo systemctl start docker
docker info | grep "Docker Root Dir"            # 应是 /data/docker

# 验证 OK 后清旧
sudo rm -rf /var/lib/docker.bak
```

### 模板 E — buildx 多架构构建

```bash
# 创建 builder
docker buildx create --name multiarch --use --bootstrap

# 看支持架构
docker buildx ls

# 构建 + push 多架构镜像
docker buildx build \
    --platform linux/amd64,linux/arm64,linux/arm/v7 \
    -t my-registry.com/myapp:1.0 \
    --push \
    .

# 仅本机用 amd64（不 push）
docker buildx build --platform linux/amd64 --load -t myapp .
```

### 模板 F — 私有 registry

```bash
# 启动 registry
docker run -d -p 5000:5000 --restart=always \
    --name registry \
    -v /opt/registry:/var/lib/registry \
    registry:2

# 配自签证书
sudo mkdir -p /etc/docker/certs.d/my-registry.com:5000
sudo cp ca.crt /etc/docker/certs.d/my-registry.com:5000/

# 推 / 拉
docker tag myapp:1.0 my-registry.com:5000/myapp:1.0
docker push my-registry.com:5000/myapp:1.0
docker pull my-registry.com:5000/myapp:1.0
```

或用 Harbor / GitLab Container Registry / GitHub Packages（更完整）。

### 模板 G — 资源限制 + 安全

```bash
# CPU / Memory
docker run -d --cpus="2" --memory="1g" --memory-swap="1g" myapp

# Read-only root + tmpfs
docker run -d --read-only --tmpfs /tmp:rw,size=64M myapp

# 限制 capability
docker run -d --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp

# 无 root
docker run -d --user 1000:1000 myapp

# Seccomp
docker run -d --security-opt seccomp=/etc/docker/seccomp-strict.json myapp

# 不挂 docker.sock（避免容器逃逸）
# 不要：-v /var/run/docker.sock:/var/run/docker.sock
```

### 模板 H — Healthcheck + 自动重启

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
```

或 compose：

```yaml
services:
  app:
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

`unless-stopped`：容器或 Docker 重启时自动起，但手动停后不自动起。

### 模板 I — 清理老镜像 / 容器（防磁盘爆）

```bash
# 看占用
docker system df
# TYPE            TOTAL   ACTIVE  SIZE     RECLAIMABLE
# Images          15      5       6.4GB    3.1GB (48%)
# Containers      8       3       1.2GB    800MB (66%)
# Local Volumes   12      8       4GB      1GB (25%)
# Build Cache     30      0       2GB      2GB (100%)

# 清理（保留正在用的）
docker system prune -a --volumes        # 删未用镜像 + 已停容器 + 悬空 volume
docker image prune -a --filter "until=720h"   # 删 30 天前镜像
docker volume prune                       # 删未用 volume

# 自动清理（cron）
echo "0 4 * * * /usr/bin/docker system prune -af --filter 'until=168h'" | sudo crontab -
```

## 关键参数调优速查

### 性能

| 参数 | 默认 | 推荐 |
|---|---|---|
| `storage-driver` | overlay2 | overlay2（最快，**不要改**） |
| `live-restore` | false | **true**（升级 docker daemon 时容器不停） |
| `userland-proxy` | true | false（性能略好，但某些场景需要） |
| `max-concurrent-downloads` | 3 | 6-10 |
| BuildKit | 否（旧）/ 是（新） | 是（DOCKER_BUILDKIT=1） |

### 资源占用

Docker daemon 自身极轻：

| 项 | RAM |
|---|---|
| daemon | 50-100 MB |
| 每空闲容器 | 5-20 MB |
| 镜像存储 | 按镜像大小 |

### 日志

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

**默认无限制**——单容器吐日志几天能吃光磁盘。本 Playbook 默认配 100m × 3。

## 跨发行版兼容

Docker 官方仓库覆盖：

| 发行版 | 仓库 | 状态 |
|---|---|---|
| Ubuntu 22 / 24 | `docker.com/linux/ubuntu` | ✅ |
| Debian 12 | `docker.com/linux/debian` | ✅ |
| RHEL 9 / Rocky / Alma | `docker.com/linux/centos`（兼容） | ✅ |
| **Anolis 9** | 走 CentOS 9 仓库 | ✅ |
| Alpine | apk add docker | 部分功能限制 |

**RHEL 系特殊**：

```bash
# 卸载 podman / 旧 docker
sudo dnf remove -y podman buildah runc docker-common docker-client

# 装
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

## 与其它 catalog 项的配合

- **`docker-compose-dev` combo** — 一键装 Docker + Compose + buildx
- **`portainer`** — Web UI 管理 Docker
- **`traefik-proxy`** — 自动发现容器（Docker provider）
- **`prometheus-monitoring`** — `cadvisor` 容器指标采集
- **`firewalld`** — 见 firewalld md 模板 F 处理共存
- **几乎所有 catalog 项** — 都可走 `deployModes: ["docker"]`

## 排错

### `Cannot connect to the Docker daemon`

```bash
# 1. 服务在跑？
sudo systemctl status docker

# 2. 当前用户在 docker 组？
groups | grep docker
sudo usermod -aG docker $USER
# 重新登录（exit + ssh）

# 3. socket 路径
ls -la /var/run/docker.sock

# 4. SELinux（RHEL）
sudo setsebool -P container_manage_cgroup on
```

### 拉镜像超时

配镜像加速器：

```bash
sudo nano /etc/docker/daemon.json
# 加 "registry-mirrors": [...]
sudo systemctl restart docker

# 或临时
docker pull docker.m.daocloud.io/library/nginx:latest
```

### 磁盘吃光

```bash
docker system df                        # 看哪部分占
docker system prune -a --volumes        # 清

# 持续问题：日志没轮转
sudo nano /etc/docker/daemon.json
# 加 log-opts max-size

# 或单容器查看日志大小
sudo du -sh /var/lib/docker/containers/*
```

### 容器无法访问外网（firewalld）

见 `firewalld.md` 模板 F。

### `WARNING: bridge-nf-call-iptables is disabled`（K8s 集成时）

```bash
sudo modprobe br_netfilter
echo 'br_netfilter' | sudo tee /etc/modules-load.d/k8s.conf
sudo sysctl -w net.bridge.bridge-nf-call-iptables=1
sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=1
echo "net.bridge.bridge-nf-call-iptables = 1" | sudo tee /etc/sysctl.d/99-k8s.conf
echo "net.bridge.bridge-nf-call-ip6tables = 1" | sudo tee -a /etc/sysctl.d/99-k8s.conf
sudo sysctl --system
```

### 容器 OOM Killed（exit code 137）

容器内存超限：

```bash
docker inspect mycontainer | grep -i oom

# 调高
docker run --memory=2g ...
```

或减少应用内存使用。

### `image not found` 但能 push

镜像名拼写或 tag 不对：

```bash
docker images
docker pull <full-name>:<tag>
```

### `failed to create endpoint: Pool overlaps with other one`

子网冲突：

```bash
docker network ls
docker network rm <unused-network>

# 改默认地址池（daemon.json）
"default-address-pools": [{"base": "172.20.0.0/16", "size": 24}]
```

## 验证

```bash
# 1. 命令存在
docker --version
docker compose version
docker buildx version

# 2. 服务在跑
systemctl is-active docker

# 3. info
sudo docker info | head -30

# 4. Hello world
sudo docker run --rm hello-world

# 5. 加进 docker 组的用户（重新登录后）
groups | grep docker
docker run --rm hello-world

# 6. 镜像加速器生效
docker info | grep -A3 "Registry Mirrors"

# 7. 日志驱动
docker info | grep "Logging Driver"
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`daemon.json` 每次按表单值重写**——你**手动加的镜像加速地址会被覆盖**。

## ⚠️ 敏感性

**privileged** — Docker daemon 以 root 跑。

强制：

1. **不要把不信任用户加 docker 组**（等同 root）
2. **不要 `--privileged` 跑不信任镜像**
3. 用 rootless docker / podman 减少风险（高级）
4. 定期 `docker system prune` 防磁盘爆
5. 限制容器 capability（`--cap-drop=ALL`）
6. seccomp profile（默认已启用）
7. 不挂 docker.sock 给容器（`-v /var/run/docker.sock:...`）—— 等同 root

## 隐私说明

- Docker daemon 不发遥测
- buildx 在某些场景发匿名 telemetry：`export BUILDX_TELEMETRY_ENABLED=0`
- 拉镜像时 Docker Hub / 国内镜像方能看到拉取记录（IP / 镜像名）
- `~/.docker/config.json` 含 base64 编码的私库密码——权限自动 0600
- 容器日志（`/var/lib/docker/containers/<id>/*.log`）含 stdout/stderr——可能含敏感信息
- 镜像 layer 含构建时的所有文件——**不要 COPY 含 secret 的文件进镜像**（用 build args + 多阶段 / docker secret）
