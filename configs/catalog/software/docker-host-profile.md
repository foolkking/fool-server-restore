# Docker 容器引擎

Docker CE 来自官方仓库（不是发行版自带的，那个版本太老）。一并装 Compose 插件 + buildx。

## 你将得到什么

- 📦 **docker-ce** + **docker-ce-cli** + **containerd.io**
- 📦 **docker-compose-plugin**（`docker compose` 命令）
- 📦 **docker-buildx-plugin**（多架构构建）
- ✅ daemon.json 配好日志轮转（防止单个容器吃光磁盘）
- ✅ 可选：镜像加速器
- ✅ 可选：data-root 改路径
- ✅ 当前用户自动加 docker 组

## 表单字段说明

### 镜像加速器 `registry_mirrors`

国内服务器拉 Docker Hub 镜像慢得离谱（连不上或 1MB/s）。常用镜像：
- `https://docker.m.daocloud.io` — DaoCloud
- `https://hub-mirror.c.163.com` — 网易
- `https://docker.mirrors.ustc.edu.cn` — 中科大
- `https://[your-id].mirror.aliyuncs.com` — 阿里云容器镜像服务（每个阿里云账号一个 URL，去 cr.console.aliyun.com 拿）

多个用逗号分隔，Docker 会按顺序尝试。

### 数据目录 `data_root`

默认 `/var/lib/docker`。改大盘步骤：
```bash
sudo systemctl stop docker
sudo rsync -aHAX /var/lib/docker/ /data/docker/
# 改 daemon.json 的 data-root
sudo systemctl start docker
sudo rm -rf /var/lib/docker.bak  # 确认无问题后清旧路径
```

### 日志驱动 `log_driver`

`json-file`（默认）最常用，**容器的 stdout/stderr 写到磁盘文件**。本 Playbook 已配每个容器
最多 100MB × 3 文件轮转，避免单容器吃光磁盘。

`journald` 把日志写到 systemd journal，配合 journalctl 统一查询。

### 把用户加 docker 组 `add_user_to_docker_group`

⚠️ **加进 docker 组 = 等于 root 权限**（用户能跑 `docker run -v / --privileged` 之类
拿到 host 的 root）。仅给信任用户。

## 安装后

### 验证

```bash
sudo docker run --rm hello-world

# 加进 docker 组的用户**重新登录**（exit 再 ssh）后无需 sudo:
docker run --rm hello-world
docker compose version
```

### docker compose 用法

```bash
# 在含 docker-compose.yml 的目录
docker compose up -d        # 后台启动
docker compose logs -f      # 跟日志
docker compose ps           # 看状态
docker compose down         # 停止 + 清理
```

注意：是 `docker compose`（带空格），新版 Compose v2 是 docker 的子命令。
旧的 `docker-compose`（带连字符）是 v1 已废弃。

### 常用命令

```bash
docker ps                       # 当前运行的
docker ps -a                    # 包含已停止的
docker images                   # 镜像列表
docker logs my-container -f     # 跟日志
docker exec -it my-container sh # 进容器
docker stats                    # 实时资源占用
docker system df                # 看 Docker 占用磁盘
docker system prune -a          # 清理未使用的镜像/容器（节省空间）
```

### 备份 / 迁移

```bash
# 导出一个容器为镜像
docker commit my-container my-image:1
# 把镜像保存到 tar
docker save my-image:1 -o my-image.tar
# 在另一台机器
docker load -i my-image.tar
```

或者更优雅：用 docker compose + named volumes，备份 volumes 目录。

### 修改配置后重启

```bash
sudo systemctl restart docker     # 会重启所有容器
# 或者不重启（仅热加载部分配置）
sudo systemctl reload docker      # 更受限，但很多配置不能这样改
```

## ⚠️ 敏感性

**privileged** — Docker daemon 以 root 跑，能起特权容器（实质等于 root 权限）。
1. 不要把不信任的用户加 docker 组
2. 不要 `docker run --privileged` 跑不信任的镜像
3. 用 rootless docker 减少风险（高级，本 Playbook 不含）

## 验证

```bash
sudo docker --version
sudo docker compose version
systemctl status docker --no-pager
sudo docker info
```

## 排错

- **`Cannot connect to the Docker daemon`** — 服务没起来或当前用户没权限。`sudo systemctl start docker` 或重新登录让 docker 组生效。
- **拉镜像超时** — 配镜像加速器（`registry_mirrors`）。
- **磁盘吃光** — `docker system df` 看哪部分占多，`docker system prune -a` 清理。
- **跨发行版**：Docker 官方仓库覆盖 Ubuntu / Debian / RHEL / CentOS。Anolis 用 centos 仓库。

## 多次运行

`installMode: skip-existing`。已装就跳过包安装，但 daemon.json 每次重写——你手动改的镜像加速地址会被表单值覆盖。

## 隐私说明

- Docker 不发遥测（`buildx` 在某些场景发匿名 telemetry，可关）。
- 拉镜像会和 Docker Hub 通信（除非配了私有 registry）。
