# K3s 轻量 Kubernetes

K3s 是 **Rancher 出品的轻量 Kubernetes 发行版**——单二进制、500 MB RAM 起步、去掉 etcd（默认用 SQLite）+ in-tree 云驱动。**适合**：homelab 学 K8s、边缘设备、单节点生产、CI 集群、树莓派玩具。**不适合**：超大规模生产（用 vanilla K8s + etcd）。**与 `kubernetes-tools` 关系**：`kubernetes-tools` 仅装 kubectl/helm/k9s 客户端，K3s **装真集群**——两者配合用。

## 你将得到什么

- 📦 **K3s 二进制**（来自 get.k3s.io 官方安装脚本）
- ✅ Server / Agent 二合一二进制（按角色启动）
- ✅ 内置 SQLite（小集群，<= 5 节点推荐）/ 可切换 etcd
- ✅ Containerd（默认）/ 可选 Docker
- ✅ 内置：CoreDNS / Traefik / ServiceLB / local-path（默认；按需禁用）
- ✅ kubectl 自动可用（K3s 二进制即 kubectl）
- ✅ kubeconfig 自动写入 `/etc/rancher/k3s/k3s.yaml` + 用户 `~/.kube/config`
- ✅ systemd 服务 + 开机自启

## 表单字段说明

### `k3s_cluster_init_mode`

| 模式 | 用途 | 端口 |
|---|---|---|
| `single` | 单机所有事情都跑（默认，推荐家庭） | 6443（API） |
| `server` | 多节点集群的 control plane | 6443（API） |
| `agent` | 加入现有集群的 worker | 无（仅出方向连 server） |

### `k3s_token`

| 模式 | 处理 |
|---|---|
| single | 留空——自动生成 |
| server（多节点） | 自定义长 token（如 `openssl rand -hex 32`），所有 agent 用此 token join |
| agent | 必须填——从 server 的 `/var/lib/rancher/k3s/server/node-token` 复制 |

### `k3s_server_url`

仅 agent 模式必填。指向 control plane API：`https://<server-ip>:6443`。

### `k3s_disable_components`

K3s 默认捆绑很多组件——自托管常需禁用：

| 组件 | 默认 | 禁用情境 |
|---|---|---|
| `traefik` | 启用 | 与 nginx-web-service 冲突 / 想用 ingress-nginx 替代 |
| `servicelb` | 启用 | 裸金属用 MetalLB / 云用 cloud LB |
| `local-storage` | 启用 | 用 longhorn / rook-ceph |
| `coredns` | 启用 | 用外部 DNS（少见） |
| `metrics-server` | 启用 | 一般保留 |

默认禁 `traefik`。多个用逗号：`traefik,servicelb`。

### `k3s_cluster_cidr` / `k3s_service_cidr`

⚠️ **避免与你内网段冲突**——内网 `10.42.0.0/24` 时必须改 K3s 默认。

### `k3s_data_dir`

```
/var/lib/rancher/k3s/
├── server/
│   ├── db/state.db                   # SQLite（默认）
│   ├── tls/                           # CA / cert
│   ├── node-token                     # **重要**——agent join 用
│   └── token                          # cluster token
└── agent/
    └── containerd/                    # 容器运行时数据（最大）
```

**备份**：仅 single / server 模式需要——`server/db/` + `server/tls/` 是关键。

## 配置文件 / 目录速查

```
/etc/rancher/k3s/k3s.yaml             # kubeconfig（系统）
/var/lib/rancher/k3s/server/db/        # SQLite 数据
/var/lib/rancher/k3s/server/tls/       # CA / cert
/var/lib/rancher/k3s/agent/containerd/  # 镜像 + 容器
~/.kube/config                          # 用户 kubeconfig（Playbook 自动复制）

# systemd
k3s.service           (server / single)
k3s-agent.service     (agent)

# 端口（出 / 入）
6443/tcp     API server（server / single 监听；agent 出向连）
10250/tcp    kubelet（节点间通信）
8472/udp     Flannel VXLAN（默认 CNI）
51820/udp    WireGuard（若用 wireguard-native CNI）
```

## 常见配置模板

### 模板 A — 单机集群（最常见）

```bash
# Playbook 默认就是 single 模式
# 装完直接用：
sudo kubectl get nodes
sudo kubectl get pods -A

# 部署一个测试应用
sudo kubectl create deployment nginx --image=nginx
sudo kubectl expose deployment nginx --port=80 --type=NodePort
sudo kubectl get svc
# 拿 NodePort 访问：curl http://localhost:<nodeport>
```

### 模板 B — 多节点集群（1 server + 多 agent）

```bash
# 在第一台机器（control plane）跑此 Playbook：
mode = server
token = <生成长 token: openssl rand -hex 32>

# 装完，拿 token：
sudo cat /var/lib/rancher/k3s/server/node-token
# K10... 开头的字符串

# 在 agent 节点（worker）跑此 Playbook：
mode = agent
server_url = https://<control-plane-ip>:6443
token = <上面拿到的 node-token>

# control plane 上看节点
sudo kubectl get nodes
```

### 模板 C — HA control plane（多 server）

> 单机 K3s 适合 80% 自托管场景。HA 仅企业 / 关键服务需要。

```bash
# Server 1 (init):
curl -sfL https://get.k3s.io | sh -s - server \
    --cluster-init \
    --token=<token>

# Server 2/3:
curl -sfL https://get.k3s.io | sh -s - server \
    --server=https://<server1-ip>:6443 \
    --token=<token>

# 多 server 模式自动切换 SQLite → embedded etcd
```

### 模板 D — 装 Helm + 部署应用

```bash
# 装 Helm（与 kubernetes-tools Playbook 一起）
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Helm chart 部署 cert-manager
helm repo add jetstack https://charts.jetstack.io
helm repo update
sudo kubectl create namespace cert-manager
helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --set installCRDs=true

# 看
sudo kubectl get pods -n cert-manager
```

### 模板 E — 启用 Ingress（Traefik 默认 / 用 nginx 替代）

K3s 默认含 Traefik（除非禁用）：

```bash
sudo kubectl get svc -n kube-system
# traefik   LoadBalancer   10.43.x.x   <pending>   80:80/TCP,443:443/TCP

# 部署应用并暴露
cat <<EOF | sudo kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hello-ingress
spec:
  rules:
  - host: hello.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: hello
            port:
              number: 80
EOF
```

用 ingress-nginx 替代（先禁用 K3s traefik，见 disable_components）：

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx --create-namespace
```

### 模板 F — 持久化存储（用 longhorn）

K3s 默认 local-path（仅本机）。多节点用 longhorn：

```bash
# 装依赖（每个节点）
sudo apt install -y open-iscsi nfs-common
sudo systemctl enable --now iscsid

# 装 Longhorn
helm repo add longhorn https://charts.longhorn.io
helm install longhorn longhorn/longhorn \
    --namespace longhorn-system --create-namespace

# 默认 storage class 改 longhorn
sudo kubectl patch storageclass longhorn \
    -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### 模板 G — 卸载 K3s（小心）

```bash
# server / single
sudo /usr/local/bin/k3s-uninstall.sh

# agent
sudo /usr/local/bin/k3s-agent-uninstall.sh

# 仅停 K3s 不卸载
sudo systemctl stop k3s
sudo systemctl disable k3s
```

### 模板 H — 备份（关键）

```bash
# single / server
# 1. 停 K3s
sudo systemctl stop k3s

# 2. 备份关键目录
sudo tar -czf k3s-backup-$(date +%F).tar.gz \
    /var/lib/rancher/k3s/server/db \
    /var/lib/rancher/k3s/server/tls \
    /var/lib/rancher/k3s/server/token \
    /var/lib/rancher/k3s/server/node-token \
    /etc/rancher/k3s/

# 3. 重启
sudo systemctl start k3s
```

或备份 etcd（多 server 模式）：

```bash
sudo k3s etcd-snapshot save --name pre-upgrade
```

## 关键参数调优速查

### 资源占用

| 模式 | 节点数 | 集群规模 | RAM/节点 | 推荐 SQLite/etcd |
|---|---|---|---|---|
| single | 1 | < 50 pods | 1 GB | SQLite |
| server | 1 | < 200 pods | 2 GB | SQLite |
| HA server x3 | 3+ | < 1k pods | 4 GB | etcd |
| 大型 | – | > 1k pods | – | 装 vanilla K8s |

### 镜像加速（中国大陆）

```yaml
# /etc/rancher/k3s/registries.yaml
mirrors:
  docker.io:
    endpoint:
      - "https://registry.cn-hangzhou.aliyuncs.com"
      - "https://docker.mirrors.ustc.edu.cn"
  k8s.gcr.io:
    endpoint:
      - "https://registry.aliyuncs.com/k8sxio"
```

```bash
sudo systemctl restart k3s
```

### kubelet 资源预留

```bash
# /etc/systemd/system/k3s.service.d/override.conf
[Service]
ExecStart=
ExecStart=/usr/local/bin/k3s server \
    --kubelet-arg=system-reserved=cpu=200m,memory=512Mi \
    --kubelet-arg=kube-reserved=cpu=200m,memory=512Mi \
    --kubelet-arg=eviction-hard=memory.available<200Mi
```

### Pod 调度优先级

```yaml
# 给系统 pod 加 priority
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: system-critical
value: 1000000
globalDefault: false
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | `curl get.k3s.io | sh` | 同（注意 SELinux） |
| 内核要求 | ≥ 4.15 | ≥ 4.18（RHEL 9 默认 5.x） |
| cgroup v2 | Ubuntu 22+ 默认 | RHEL 9 默认 |
| SELinux | – | 1.27+ 支持，自动加 `--selinux` |
| Anolis 9 | – | ✅（同 RHEL） |
| ARM64（树莓派） | ✅ | ✅ |

## 与其它 catalog 项的配合

- **`kubernetes-tools`** — **核心配合**——Playbook 装客户端（kubectl / helm / k9s），K3s 装集群
- **`docker-host-profile`** — 互斥（K3s 默认用 containerd，不要装 Docker；除非加 `--docker` flag）
- **`firewall-baseline`** — 配合放行 6443（API）+ 10250（kubelet）+ 8472/udp（flannel）
- **`prometheus-monitoring`** — 抓 K3s metrics + kube-state-metrics
- **`certbot-ssl`** — 用 cert-manager 替代（K8s 内集成更好）

## 排错

### `k3s` 服务起不来 / 一直 restart

```bash
# 看错误
sudo journalctl -u k3s -n 100 --no-pager

# 常见：
# - "open /etc/rancher/k3s/k3s.yaml: permission denied" → chmod 644
# - "address already in use" → 6443 / 10250 端口冲突
# - "Failed to validate cluster cidr" → cluster_cidr 与节点 IP 冲突
```

### `kubectl get nodes` 显示 NotReady

```bash
# 看节点详细
sudo kubectl describe node <node-name>
# 看 Conditions / Events 段

# 常见：
# - 网络：containerd 启动慢 → 等 1-2 分钟
# - kubelet 资源不够 → 加内存 / 减 reserved
# - cgroup v1 + 高版本 K3s → 升级 cgroup 到 v2
```

### Pod 一直 Pending

```bash
sudo kubectl describe pod <pod-name>
# 看 Events 段

# 常见：
# - "0/1 nodes are available" → 没有节点满足 nodeSelector / taint
# - "Insufficient memory" → 节点内存不够，调度失败
# - "no nodes available to schedule pods" → 所有节点 NotReady
```

### 镜像拉取失败 `ImagePullBackOff`

```bash
# 1. containerd 能直接拉吗？
sudo crictl pull nginx:latest

# 2. 私有仓库认证
# /etc/rancher/k3s/registries.yaml
configs:
  myregistry.com:
    auth:
      username: xxxx
      password: yyyy

# 3. 镜像加速（中国大陆，见上面）
```

### Service ClusterIP 不通

```bash
# 1. iptables / nftables 配置乱
sudo iptables-save | grep KUBE-

# 2. flannel 网络问题
sudo kubectl logs -n kube-system -l app=flannel

# 3. 重启 K3s
sudo systemctl restart k3s
```

### 多节点 join 失败

```bash
# 1. 网络通？
ping <server-ip>
nc -zv <server-ip> 6443
nc -zv <server-ip> 10250

# 2. token 对？
# 在 server 上：
sudo cat /var/lib/rancher/k3s/server/node-token

# 3. 时间同步？K8s 强制要求节点间时差 < 5s
sudo timedatectl status
sudo systemctl enable --now systemd-timesyncd
```

### 升级 K3s

```bash
# 自动升级（Rancher 推荐）
sudo curl -sfL https://get.k3s.io | sh -

# 手动指定版本
sudo curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.30.1+k3s1 sh -

# 看版本
k3s --version
```

### 卸载后重装报错 / 残留

```bash
# 完全清理
sudo /usr/local/bin/k3s-uninstall.sh
sudo rm -rf /var/lib/rancher
sudo rm -rf /etc/rancher
sudo rm -rf /var/lib/cni
sudo iptables -F
sudo systemctl daemon-reload

# 重装
curl -sfL https://get.k3s.io | sh -
```

## 验证

```bash
# 1. 服务跑着
systemctl is-active k3s

# 2. 节点 Ready
sudo kubectl get nodes
# NAME           STATUS   ROLES                  AGE   VERSION
# my-host        Ready    control-plane,master   1m    v1.30.1+k3s1

# 3. 系统 pod 健康
sudo kubectl get pods -A
# coredns / metrics-server / local-path-provisioner 都应 Running

# 4. API 响应
sudo kubectl version
# Client / Server 都有版本

# 5. 部署测试
sudo kubectl run test --image=nginx --restart=Never --rm -it -- echo hello
# hello
```

## 多次运行

`installMode: skip-existing`。**已装的 K3s 重跑会触发升级**——拉最新版二进制 + 重启服务。**业务 deployment / pod / service / namespace 全部保留**（在 SQLite/etcd）。要彻底重装：跑 `k3s-uninstall.sh` 后重跑 Playbook。

## ⚠️ 敏感性

**privileged** — K3s **运行容器有 root 权限**，攻陷 = 整机失守。

强制：

1. **API 端口 6443 仅内网开放**（公网 NEVER 暴露——上 VPN）
2. **强 token**（多节点时）—— 长 hex
3. **SELinux 保留 Enforcing**（K3s 1.27+ 已支持）
4. 别用 `--disable-default-policy`
5. 公网部署 + 反代加 mTLS 才考虑暴露 API
6. `kubeconfig` 文件即 root 凭据——0600 权限 + 不要存 git

## 隐私说明

- **完全本地**——所有 K8s 状态在你机器
- 安装脚本来自 get.k3s.io（首次安装时拉二进制）
- 默认禁遥测（K3s 不发数据回 Rancher）
- 容器镜像默认从 Docker Hub 拉（可换成自己的 registry）
- Helm chart 从公网仓库拉（按你 helm repo 配置）
