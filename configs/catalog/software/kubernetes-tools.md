# Kubernetes 工具集

装 K8s 客户端工具：**kubectl** / **helm** / **k9s**。**这些只是客户端**，**不会**在本机启动 K8s 集群（要装集群用 minikube / kind / k3s 单独 Playbook）。

## 你将得到什么

- 📦 **kubectl** — K8s 官方 CLI（与集群交互的主要工具）
- 📦 **helm** — K8s 包管理器（部署 chart）
- 📦 **k9s** — 终端里的 K8s UI（看 pods / 进容器 / 看日志，比 kubectl 快得多）
- ✅ Bash / zsh / fish 自动补全已配置

## 配置文件 / 目录速查

```
~/.kube/
├── config                              # ← 默认 kubeconfig（**含集群凭据**，权限 600）
└── cache/                                # discovery 缓存（自动）

~/.config/k9s/
├── config.yml                            # k9s 偏好
├── views.yml                              # 自定义视图
└── plugin.yml                              # 插件

~/.config/helm/
├── repositories.yaml                      # 添加的 helm repo
├── repository/                              # repo 缓存
└── plugins/

# 二进制
/usr/local/bin/kubectl
/usr/local/bin/helm
/usr/local/bin/k9s
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制下载 / apt 仓库 | 二进制下载 / dnf 仓库 |
| kubectl 仓库 | `pkgs.k8s.io/core:/stable:/<version>/deb/` | `pkgs.k8s.io/core:/stable:/<version>/rpm/` |
| helm 仓库 | `baltocdn.com/helm/stable/debian/` | 二进制下载 |
| k9s | 二进制下载 | 同 |

## 表单字段说明

### `kubernetes_version`

kubectl 客户端版本。**与目标集群版本差不超过 1 minor**（K8s skew policy）。常用：

| 值 | 适用 |
|---|---|
| `1.31` | 最新（2024-08） |
| `1.30` | 稳定（2024-04） |
| `1.29` | 维护中 |

### `install_helm` / `install_k9s`

可选组件。

## 常见配置模板

### 模板 A — 配置 kubectl 连远程集群

```bash
# 1. 把集群的 kubeconfig 放到 ~/.kube/config
mkdir -p ~/.kube
cp my-cluster-kubeconfig.yaml ~/.kube/config
chmod 600 ~/.kube/config

# 2. 测试
kubectl version --client
kubectl cluster-info
kubectl get nodes
```

#### 多集群切换

```bash
# 用 KUBECONFIG 环境变量
export KUBECONFIG=~/.kube/cluster1:~/.kube/cluster2

# 或合并到一个文件
KUBECONFIG=~/.kube/cluster1:~/.kube/cluster2 kubectl config view --merge --flatten > ~/.kube/config

# 看所有 context
kubectl config get-contexts

# 切 context
kubectl config use-context production-cluster
kubectl config current-context

# 切 namespace（持久）
kubectl config set-context --current --namespace=production
```

#### 用 kubectx / kubens 加速切换

```bash
# 装
sudo curl -L https://github.com/ahmetb/kubectx/releases/latest/download/kubectx -o /usr/local/bin/kubectx
sudo curl -L https://github.com/ahmetb/kubectx/releases/latest/download/kubens -o /usr/local/bin/kubens
sudo chmod +x /usr/local/bin/kubectx /usr/local/bin/kubens

# 用
kubectx                                     # 列 context
kubectx prod-cluster                         # 切 context
kubens                                       # 列 namespace
kubens production                            # 切 namespace
```

### 模板 B — kubectl 速查

```bash
# 看 pods
kubectl get pods                                          # 当前 namespace
kubectl get pods -n production                            # 指定 ns
kubectl get pods --all-namespaces                          # 所有 ns（缩写 -A）
kubectl get pods -w                                         # watch 模式
kubectl get pods -o wide                                     # 含 node / IP
kubectl get pods -o yaml                                      # YAML 详情
kubectl get pods --selector app=myapp                          # 按 label

# Describe（详情，含 events）
kubectl describe pod my-pod -n prod

# 日志
kubectl logs my-pod -n prod                                   # 单容器
kubectl logs -f my-pod -n prod                                 # 跟踪
kubectl logs -p my-pod -n prod                                  # 上次崩溃前的日志
kubectl logs my-pod -c sidecar -n prod                           # 多容器选指定
kubectl logs -l app=myapp --max-log-requests=10 --tail=100 -f    # 多 pod 聚合

# Exec
kubectl exec -it my-pod -n prod -- /bin/sh
kubectl exec -it my-pod -n prod -c sidecar -- /bin/sh
kubectl exec my-pod -- env                                         # 一次性命令

# Port-forward（本地访问 cluster 内服务）
kubectl port-forward svc/grafana 3000:80 -n monitoring
kubectl port-forward pod/my-pod 8080:8080

# Apply / Delete
kubectl apply -f deployment.yaml
kubectl apply -f ./manifests/                                      # 整目录
kubectl apply -k ./overlays/prod/                                  # kustomize
kubectl delete -f deployment.yaml
kubectl delete pod my-pod                                            # 强删

# Rollout
kubectl rollout status deployment/my-app -n prod
kubectl rollout history deployment/my-app -n prod
kubectl rollout restart deployment/my-app -n prod                    # 不改 spec 重启
kubectl rollout undo deployment/my-app -n prod                        # 回滚

# Scale
kubectl scale deployment/my-app --replicas=5 -n prod
kubectl autoscale deployment/my-app --min=2 --max=10 --cpu-percent=70 -n prod   # HPA

# 编辑（在线改 manifest）
kubectl edit deployment my-app -n prod                                  # 打开 EDITOR

# 资源占用
kubectl top nodes
kubectl top pods -A --sort-by=memory

# 调试 pod
kubectl debug -it my-pod --image=nicolaka/netshoot --target=my-container

# Cordon / Drain（节点维护）
kubectl cordon my-node                                                    # 不再调度新 pod 上来
kubectl drain my-node --ignore-daemonsets                                  # 排空 pod
kubectl uncordon my-node                                                    # 恢复

# Apply YAML 来源
kubectl apply -f https://example.com/manifest.yaml                         # 从 URL
echo 'apiVersion: ...' | kubectl apply -f -                                  # 从 stdin
```

### 模板 C — 推荐 alias（生产力 + 10×）

```bash
# 加到 ~/.bashrc / ~/.zshrc
alias k='kubectl'
alias kg='kubectl get'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deploy'
alias kga='kubectl get all'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias klf='kubectl logs -f'
alias kex='kubectl exec -it'
alias kapply='kubectl apply -f'
alias kdel='kubectl delete'
alias kctx='kubectx'
alias kns='kubens'
alias k9='k9s'

# Bash 自动补全（加到 ~/.bashrc）
source <(kubectl completion bash)
complete -F __start_kubectl k

# Zsh
source <(kubectl completion zsh)
compdef __start_kubectl k

# Fish
kubectl completion fish | source
```

### 模板 D — Helm 速查

```bash
# 添加 repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 搜
helm search repo postgres
helm search repo bitnami/wordpress

# 看 chart 详情
helm show readme bitnami/wordpress
helm show values bitnami/wordpress > wordpress-values.yaml

# 安装
helm install myapp bitnami/wordpress
helm install myapp bitnami/wordpress -f my-values.yaml
helm install myapp bitnami/wordpress \
    --set replicaCount=3 \
    --set service.type=LoadBalancer \
    -n production --create-namespace

# 升级
helm upgrade myapp bitnami/wordpress -f my-values.yaml
helm upgrade --install myapp bitnami/wordpress -f values.yaml      # install 或 upgrade

# 列 release
helm list -A

# 卸载
helm uninstall myapp

# 看历史
helm history myapp
helm rollback myapp 2                                                # 回滚到 revision 2

# 自定义 chart
helm create my-chart
helm lint my-chart
helm package my-chart
helm install my-app ./my-chart-1.0.0.tgz

# 看待应用的 manifests（dry-run）
helm template my-chart                                                # 渲染但不 apply
helm install --dry-run --debug my-app bitnami/wordpress
```

### 模板 E — k9s（终端 UI）

启动：

```bash
k9s
k9s -n production                # 进特定 namespace
k9s --context prod-cluster        # 进特定 cluster
```

主要快捷键：

| Key | 作用 |
|---|---|
| `:pods<Enter>` | 切到 pods 视图 |
| `:deploy` | deployments |
| `:svc` | services |
| `:ns` | namespaces |
| `:secrets` | secrets |
| `:configmaps` / `:cm` | configmaps |
| `/<text>` | 过滤 |
| `Esc` | 返回 |
| `?` | 帮助 |
| `:q` | 退出 |

在 pod 行上按字母：

| Key | 作用 |
|---|---|
| `d` | describe |
| `l` | logs（实时） |
| `s` | shell（exec /bin/sh） |
| `f` | port-forward |
| `Ctrl+d` | 删除 |
| `e` | edit |
| `o` | YAML 详情 |
| `y` | YAML 全文 |

### 模板 F — 自定义 kubectl 输出格式

```bash
# 自定义列
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName

# JSONPath
kubectl get pods -o jsonpath='{.items[*].metadata.name}'
kubectl get pod my-pod -o jsonpath='{.spec.containers[*].image}'

# 排序
kubectl get pods --sort-by=.status.startTime
kubectl get nodes --sort-by=.status.capacity.memory

# 过滤
kubectl get pods --field-selector=status.phase=Running
kubectl get events --field-selector type=Warning -n prod
```

### 模板 G — 国内镜像加速

下载 K8s / Helm 时 `storage.googleapis.com` / `github.com` 慢：

```bash
# kubectl 走腾讯云镜像
VER="v1.31.0"
curl -fsSL "https://mirrors.aliyun.com/kubernetes/release/${VER}/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl
sudo chmod +x /usr/local/bin/kubectl

# helm 走清华镜像
HELM_VER="v3.16.1"
curl -fsSL "https://mirrors.tuna.tsinghua.edu.cn/helm/${HELM_VER}/helm-${HELM_VER}-linux-amd64.tar.gz" | sudo tar -xz -C /tmp
sudo mv /tmp/linux-amd64/helm /usr/local/bin/

# Helm chart 仓库国内镜像
helm repo add bitnami-cn https://hub.kubeapps.com/charts
```

EnvForge Playbook 默认走官方源，访问慢时手动调整。

## 关键参数调优速查

### kubectl 性能

| 参数 | 推荐 |
|---|---|
| `KUBECONFIG` 单文件 | 多集群合并到一个文件，避免每次设环境变量 |
| `KUBECTL_EXTERNAL_DIFF` | `kdiff3` / `meld` 等图形 diff 工具（apply 前预览变化） |
| Discovery cache | 自动 24h 过期，慢可手动 `kubectl api-resources --cached=false` 刷新 |

### kubeconfig 安全

```bash
# 权限必须 600
ls -la ~/.kube/config
sudo chmod 600 ~/.kube/config

# 不要 commit 到 git
echo '.kube/' >> ~/.gitignore_global
```

### Helm

```bash
# 看实际渲染的 manifests（部署前预览）
helm template my-chart
helm get manifest my-release

# 看 values
helm get values my-release

# 看 hook
helm install --debug ...
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制 / apt 仓库 | 二进制 / dnf 仓库 |
| K8s 仓库 | `pkgs.k8s.io` deb | `pkgs.k8s.io` rpm |
| Helm | 二进制 | 二进制 |
| k9s | 二进制（GitHub releases） | 同 |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — kubectl 不需要 Docker，但本机用 kind / minikube 起集群时需要
- **`prometheus-monitoring`** — kubectl 可装 kube-state-metrics 给 Prometheus 抓 K8s 指标
- **`grafana-dashboard`** — 多 K8s dashboard（Grafana ID 6417 / 13332）
- **`gitlab-runner`** — Runner 通过 kubectl 部署到 K8s

## 排错

### `Unable to connect to the server`

```bash
# 1. kubeconfig 在哪
echo $KUBECONFIG
ls -la ~/.kube/config

# 2. 集群信息
kubectl cluster-info
kubectl cluster-info dump | head

# 3. 集群挂了？
ping <api-server-host>

# 4. 证书过期（自管 K8s）
kubectl version
# 看 Server Version 报 X509 错
```

### `error: You must be logged in to the server (Unauthorized)`

token / cert 过期：

```bash
# 重新生成 kubeconfig（云厂商）
aws eks update-kubeconfig --region us-east-1 --name my-cluster
gcloud container clusters get-credentials my-cluster --region us-central1
```

### `kubectl get pods` 卡住

API server 慢或网络问题：

```bash
kubectl --request-timeout=10s get pods       # 限制超时
kubectl get pods -v=6                          # 详细日志看哪步慢
```

### Helm chart 装失败 `Error: INSTALLATION FAILED: cannot patch`

通常老版本 release 残留：

```bash
helm list -A | grep my-release
helm uninstall my-release
# 清残留 resources
kubectl delete deployment,svc,cm -l app.kubernetes.io/instance=my-release
```

### k9s 启动慢 / 卡

```bash
# 用低 refresh rate
k9s --refresh 5

# 限定 namespace
k9s -n production
```

### kubectl 自动补全不工作

```bash
# Bash
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc
echo "complete -F __start_kubectl k" >> ~/.bashrc      # alias 也补全

# Zsh
source <(kubectl completion zsh)
compdef __start_kubectl k

# 或重装 bash-completion 包
sudo apt-get install bash-completion
sudo dnf install bash-completion
```

### `error: error executing jsonpath ...`

JSONPath 表达式错。学习模板：

```bash
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\n"}{end}'
```

## 验证

```bash
# 1. 命令存在
kubectl version --client
helm version
k9s version

# 2. kubeconfig 配了
ls -la ~/.kube/config

# 3. 连集群（如配了）
kubectl cluster-info
kubectl get nodes
kubectl get ns

# 4. Helm repo
helm repo list
```

## 多次运行

`installMode: skip-existing`。二进制下载有 `creates` 守卫——已装跳过。

升级：

```bash
# kubectl
sudo curl -L "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl
sudo chmod +x /usr/local/bin/kubectl

# helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

## ⚠️ 敏感性

**review** — kubectl 的 kubeconfig **等于集群的访问权限**（按 RBAC 配置）。`cluster-admin` token = 整个集群 root。

强制：

1. kubeconfig **权限 600**
2. **不要 commit 到 git**
3. 用 RBAC 限制权限（不给所有人 cluster-admin）
4. 用短期 token（OIDC / service account token），不用永久凭据
5. 多集群分别 kubeconfig，避免单文件被泄全部失守

## 隐私说明

- kubeconfig 含集群凭据（client-cert / token / username:password）——**不上传不同步**
- kubectl 不发遥测
- helm 不发遥测；某些 chart 默认装 metrics-server / kube-state-metrics 等会上报本机 IP / 集群信息到外部
- k9s 完全本地运行
- 命令历史含敏感信息（如 `kubectl create secret generic foo --from-literal=password=...`）—— 用 `setopt HIST_IGNORE_SPACE` + 命令前加空格
- `kubectl describe secret` 默认 base64 编码（不脱敏）—— 可读
