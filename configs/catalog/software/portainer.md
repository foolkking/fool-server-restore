# Portainer Docker 管理 UI

Portainer 是 Docker / Kubernetes / Swarm 的 Web 管理面板——浏览器里看容器、改环境变量、看日志、进 shell、管 stack（compose）。**比命令行直观得多，新手友好**。CE（Community Edition）免费且功能足够；BE（Business）付费版多 RBAC / GitOps 等高级特性。

## 你将得到什么

- ✅ Portainer Community Edition 容器
- ✅ 自动挂 Docker socket（管整台机器的 Docker）
- ✅ 数据持久化在 Docker 卷 `portainer_data`
- ✅ 自动重启策略（`unless-stopped`）
- ✅ HTTP 端口 9000，HTTPS 9443

> **前置依赖**：必须先装好 Docker。EnvForge catalog 里有 `docker-host-profile` Playbook 装 Docker。

## 表单字段说明

### `http_port` / `https_port`

默认 9000 (HTTP) / 9443 (HTTPS)。

### `enable_https`

打开后 Portainer 启动时自动签自签证书（不是 LE）。生产建议**关 HTTPS + 用 nginx 反代**（模板 D）。

### `restart_policy`

| 值 | 行为 |
|---|---|
| `unless-stopped`（默认） | 容器或 Docker 重启时自动起 |
| `always` | 同上 + 手动停止后仍重启 |
| `on-failure` | 仅 exit code 非 0 时重启 |
| `no` | 不重启 |

## 配置文件 / 目录速查

```
# Portainer 是容器化部署，配置全在 Docker 卷
# 数据卷
docker volume inspect portainer_data
# 默认在 /var/lib/docker/volumes/portainer_data/_data/

/var/lib/docker/volumes/portainer_data/_data/
├── portainer.db                                # SQLite（用户 / 配置 / endpoints）
├── compose/                                     # 部署的 stack 文件
├── chisel/                                       # Edge agent
├── certs/                                        # TLS 证书（如启用）
└── ...

# 容器本身
docker ps | grep portainer
docker logs portainer
docker exec -it portainer sh

# Docker socket（极敏感）
/var/run/docker.sock                              # 挂进 Portainer 容器，等同 root
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 部署方式 | Docker 容器 | Docker 容器 |
| 镜像 | `portainer/portainer-ce:latest` | 同 |
| 端口 | 9000 (HTTP) / 9443 (HTTPS) | 同 |
| Socket 路径 | `/var/run/docker.sock` | 同 |
| SELinux | – | **关键**：`container_manage_cgroup=on` |

## 常见配置模板

### 模板 A — Portainer 启动命令（本 Playbook 已自动）

```bash
docker volume create portainer_data

docker run -d \
  --name portainer \
  --restart unless-stopped \
  -p 9000:9000 \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \      # ro 限制只读（更安全，但少功能）
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

> ⚠️ **socket 模式选择**：
>
> - `:ro`（只读）：能看，能 ps，但**不能 start/stop/run 容器**——只读监控
> - 无 `:ro`（读写，默认）：能管全部 Docker 操作（**等同 root 权限**）
>
> 本 Playbook 默认读写（功能完整）。要安全可改 `:ro` + 用 socket proxy 中间层（Tecnativa）。

### 模板 B — 第一次访问

`http://server-ip:9000`（或 `https://server-ip:9443`）

> ⏱ **5 分钟时限创建管理员账号**——超时停止接受初始化请求（安全机制，防止 admin 还没设密码就被抢）。

如果错过：

```bash
sudo docker restart portainer       # 重新开放 5 分钟窗口
```

设密码（≥ 12 位强密码）。

### 模板 C — 常用操作速查

UI 主要功能：

| Tab | 作用 |
|---|---|
| **Containers** | 查看 / 停 / 重启 / 进 shell / 看日志 / CPU/Mem 实时图 |
| **Images** | 拉取 / 删除 / 查 layer / 推送私库 |
| **Stacks** | 上传 docker-compose.yml 部署一组服务 |
| **Volumes / Networks** | 管 Docker 卷和网络 |
| **Templates** | 一键部署常见应用（GitLab / WordPress / Nextcloud / MinIO 等） |
| **Endpoints** | 添加远程 Docker 主机（多机管理） |

### 模板 D — Nginx 反代 + Let's Encrypt（生产推荐）

不要直接公网暴露 9000/9443：

```nginx
upstream portainer { server 127.0.0.1:9000; }

server {
    listen 443 ssl http2;
    server_name portainer.example.com;

    ssl_certificate /etc/letsencrypt/live/portainer.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portainer.example.com/privkey.pem;

    # IP 白名单（仅自己 IP 能访问）
    allow 1.2.3.4;
    deny all;

    location / {
        proxy_pass http://portainer;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;     # WebSocket（实时图表 / shell）
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

修改 docker run 让 Portainer 仅本机绑定：

```bash
docker run ... -p 127.0.0.1:9000:9000 ...           # 仅 127.0.0.1 监听
```

### 模板 E — 添加远程 Docker 主机（多机管理）

UI → Environments → Add environment：

#### 选项 1：Portainer Agent（推荐，端口自由）

在远程机器上：

```bash
docker run -d \
  --name portainer_agent \
  --restart unless-stopped \
  -p 9001:9001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/docker/volumes:/var/lib/docker/volumes \
  portainer/agent:latest
```

Portainer UI 输入 `<remote-ip>:9001`。

#### 选项 2：Docker API + TLS（高级，需配证书）

远程机器开 Docker remote API + TLS（参 docker daemon.json `tlscacert/tlscert/tlskey/hosts`）。Portainer 上传客户端证书。

### 模板 F — 部署一个 Stack（compose）

UI → Stacks → Add stack → Web editor，粘贴：

```yaml
version: '3.8'
services:
  myapp:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - mydata:/data
    restart: unless-stopped

volumes:
  mydata:
```

→ Deploy。Portainer 自动 `docker compose up -d`。

或绑定 Git 仓库（Stacks → Add → Repository），改 git 后自动 redeploy。

### 模板 G — 用户 / 团队（CE 版有限）

UI → Users → Create user。CE 限制：

- 不限用户数
- 仅 2 角色：admin / standard user
- BE 版有自定义 RBAC、team-based 权限、external auth（LDAP / OAuth）

### 模板 H — 升级 Portainer

```bash
# 推荐方式：重新 docker run（数据卷保留所有数据）
sudo docker stop portainer
sudo docker rm portainer
sudo docker pull portainer/portainer-ce:latest
sudo docker run -d --name portainer \
  --restart unless-stopped \
  -p 9000:9000 -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

# 数据自动迁移
```

或重跑本 Playbook（带 `--pull always` 选项）。

## 关键参数调优速查

### 资源占用

| 部署 | RAM | CPU |
|---|---|---|
| 单机 | 50 MB | < 1% |
| 管 5 个远程 endpoints | 100 MB | 1-2% |
| 管 50+ endpoints | 500 MB | 5% |

Portainer 极轻量。

### 安全模式（socket 访问）

| 模式 | 风险 |
|---|---|
| 直接挂 socket（默认） | Portainer admin = root（**最高权限**） |
| `:ro` 只读 socket | 只读监控 |
| Tecnativa Socket Proxy | 限定可调用 API（如禁 `containers:create`，只允许 `containers:list`） |

#### Tecnativa Socket Proxy（更安全）

```yaml
# docker-compose.yml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - VOLUMES=1
      - NETWORKS=1
      - EXEC=0                   # 禁止 docker exec
      - POST=0                    # 禁止所有 POST（即所有写操作）
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "127.0.0.1:2375:2375"

  portainer:
    image: portainer/portainer-ce:latest
    command: -H tcp://socket-proxy:2375
    ports:
      - "9000:9000"
    depends_on:
      - socket-proxy
```

## 跨发行版兼容

容器化部署，跨发行版一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅ |
| Alpine | ✅ |
| ARM64 | ✅（自动 multi-arch image） |

**RHEL/Anolis SELinux**：

```bash
sudo setsebool -P container_manage_cgroup on
```

EnvForge Playbook 自动处理。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** — 反代 + HTTPS（模板 D）
- **`certbot-ssl`** — LE 证书
- **`fail2ban-protection`** — 给 9000/9443 加 jail（防爆破）

## 排错

### `Cannot connect to Docker daemon`

Portainer 容器读不到 docker.sock：

```bash
# 1. socket 路径标准是 /var/run/docker.sock
ls -la /var/run/docker.sock

# 2. 容器 mount 对了？
docker inspect portainer | grep docker.sock

# 3. SELinux（RHEL 系）
sudo setsebool -P container_manage_cgroup on
sudo ausearch -m avc -ts recent | grep portainer
sudo restorecon -Rv /var/run/docker.sock
```

### 首次访问超 5 分钟没设密码

```bash
sudo docker restart portainer            # 重新开启 5 分钟窗口
```

### 升级后数据丢失

Portainer 数据在 `portainer_data` 卷里。**只要不 `docker volume rm portainer_data` 就不会丢**：

```bash
docker volume ls | grep portainer        # 应有 portainer_data
docker volume inspect portainer_data
```

### 9000 / 9443 端口被占

```bash
sudo ss -tlnp | grep -E ':(9000|9443) '

# 改端口
docker rm -f portainer
docker run -p 19000:9000 -p 19443:9443 ...
```

### Stack 部署失败 `compose file is invalid`

YAML 缩进 / 版本不对：

```bash
# 命令行测试
sudo docker compose -f /tmp/stack.yml config           # 解析检查
```

### Edge Agent 连不上

```bash
# 远程 agent 看日志
docker logs portainer_agent

# 防火墙开 9001
sudo ufw allow 9001
```

### 用户管理：BE 功能在 CE 上看到但用不了

CE 版限制角色为 admin / user。要细粒度权限需要 BE（按机器收费）。

## 验证

```bash
# 1. 容器在跑
sudo docker ps | grep portainer
sudo docker inspect portainer --format '{{.State.Status}}'        # running

# 2. 端口
sudo ss -tlnp | grep -E ':(9000|9443) '

# 3. HTTP 响应
curl -I http://localhost:9000/                                       # 200 / 302

# 4. 看日志
sudo docker logs portainer | tail -20

# 5. 数据卷
sudo docker volume inspect portainer_data
```

## 多次运行

`installMode: skip-existing`。已运行的容器**不会重新创建**（保留用户数据），但会确保 running 状态。要强制升级镜像见模板 H。

## ⚠️ 敏感性

**privileged** — Portainer 挂载了 `docker.sock`，**等同 root 权限**（能起特权容器、绑定主机文件系统）。

强制：

1. **登录密码必须强**（≥ 16 位）——admin 账号 = 整台机器的 root
2. **绝不 9000/9443 端口直接公网暴露**——务必反代 + HTTPS + 防火墙限源 IP
3. 用 Tecnativa Socket Proxy 限制可调 API（最安全）
4. 启用 2FA（UI → Account → Two-factor authentication）
5. 监控 Portainer 日志，关注异常登录

## 隐私说明

- Portainer 数据（admin 账号 / 远程主机配置 / stack 文件）在 Docker 卷 `portainer_data`
- `portainer.db` 含用户密码 hash + 远程 endpoint 凭据（Docker API token / 证书）——按合规需求加密备份
- **Portainer CE 默认开匿名遥测**——发送匿名使用统计给 Portainer 公司
    - 关：UI → Account → User Settings → 取消 "Allow collection of anonymous usage statistics"
- 容器内的环境变量 / secrets 在 UI 里**明文可见**——Portainer admin 能看到所有应用的密码
- 反代 access log 会记录 admin 的每次操作 IP
