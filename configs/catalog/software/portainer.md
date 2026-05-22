# Portainer Docker 管理 UI

Portainer 是 Docker / Kubernetes 的 web 管理面板——浏览器里看容器、改环境变量、看日志、
进 shell、管 stack（compose）。比命令行直观得多，新手友好。

## 你将得到什么

- ✅ Portainer Community Edition 容器
- ✅ 自动挂 Docker socket（管整台机器的 Docker）
- ✅ 数据持久化在 Docker 卷 `portainer_data`
- ✅ 自动重启（容器或 Docker 重启时一起起来）
- ✅ HTTP 端口 9000，HTTPS 9443

**前置依赖**：必须先装好 Docker。EnvForge 的 catalog 里有 `docker-host-profile` Playbook 装 Docker。

## 安装后

### 第一次访问

`http://server-ip:9000`（或 `https://server-ip:9443`）

打开后**有 5 分钟时限创建管理员账号**——超过会停止接受初始化请求（安全机制，防止有人趁
管理员还没设密码就抢着创建账号）。

### 常用操作

- **Containers**：查看 / 停止 / 重启 / 进 shell / 看日志 / 看资源占用
- **Images**：拉取 / 删除 / 查 layer
- **Stacks**：上传 docker-compose.yml 部署一组服务
- **Volumes / Networks**：管理 Docker 卷和网络
- **Templates**：一键部署常见应用（gitlab / wordpress / nextcloud / minio / 等）

### 添加远程 Docker 主机（多机管理）

Portainer 可以一个 UI 管多台机器：
1. UI → Environments → Add environment → Docker Standalone
2. 选 "API"，URL 填 `tcp://其他机器IP:2376`（远程机器要开 Docker remote API + TLS）
3. 上传 cert / key / CA

或者：远程机器装 Portainer Agent（小容器），通过 Agent URL 注册。

### 反向代理 + HTTPS（生产推荐）

```nginx
server {
    listen 443 ssl;
    server_name portainer.example.com;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 升级 Portainer

```bash
sudo docker stop portainer
sudo docker rm portainer
sudo docker pull portainer/portainer-ce:latest
# 重新跑 Playbook 或手动 docker run（数据保留在 portainer_data 卷里）
```

## ⚠️ 敏感性

**privileged** — Portainer 挂载了 `docker.sock`，有 docker.sock 等于 root 权限（能起特权容器、绑定主机文件系统）。所以：
1. **登录密码必须强**——admin 账号的密码 = 整台机器的 root 密码
2. **不要 9000 端口直接公网暴露**——务必反向代理 + HTTPS + 防火墙限源 IP
3. 用 RBAC 创建受限账号给非管理员（CE 版限制大，需要 BE 才有完整 RBAC）

## 验证

```bash
sudo docker ps | grep portainer
curl -I http://localhost:9000/    # 应返回 200 / 302
sudo docker logs portainer | tail
```

## 排错

- **`Cannot connect to Docker daemon`** — Portainer 容器读不到 docker.sock。检查 sock 路径（标准是 /var/run/docker.sock），SELinux 可能阻止跨容器访问 sock（RHEL 上 `sudo setsebool -P container_manage_cgroup 1`）。
- **首次访问超过 5 分钟没设密码** — 重启容器即可：`sudo docker restart portainer`，会重新开放 5 分钟初始化窗口。
- **跨发行版**：用 Docker 容器部署，无包管理器差异。

## 多次运行

`installMode: skip-existing`。已运行的容器不会被重新创建（保留用户数据），但会确保是 running 状态。

## 隐私说明

- Portainer 数据（admin 账号、远程主机配置）在 Docker 卷 `portainer_data` 里。
- Portainer CE 默认开启匿名遥测，可在 UI 设置里关。
