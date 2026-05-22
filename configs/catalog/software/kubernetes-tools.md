# Kubernetes 工具集

装 Kubernetes 的客户端工具——`kubectl` / `helm` / `k9s`。**这些只是客户端**，不会在本机
启动 K8s 集群（要装集群用 minikube / kind / k3s 单独的 Playbook）。

## 你将得到什么

- 📦 **kubectl** — K8s 官方 CLI
- 📦 **helm** — K8s 包管理器
- 📦 **k9s** — 终端里的 K8s UI（看 pods / 进容器 / 看日志，比 kubectl 快多了）

## 用法

### 配置 kubectl 连远程集群

```bash
# 把集群的 kubeconfig 放到 ~/.kube/config
mkdir -p ~/.kube
cp my-cluster.yaml ~/.kube/config
chmod 600 ~/.kube/config

# 或者用环境变量
export KUBECONFIG=~/.kube/my-cluster.yaml

# 多 kubeconfig 合并
KUBECONFIG=~/.kube/cluster1:~/.kube/cluster2 kubectl config view --merge --flatten > ~/.kube/config
```

### kubectl 速查

```bash
kubectl get nodes
kubectl get pods --all-namespaces
kubectl get pods -n production -w     # watch（实时变化）
kubectl describe pod my-pod -n prod
kubectl logs -f my-pod -n prod
kubectl exec -it my-pod -n prod -- /bin/sh
kubectl apply -f deployment.yaml
kubectl rollout restart deployment/my-app -n prod
kubectl scale deployment/my-app --replicas=5 -n prod
```

### kubectl 别名（强烈推荐）

```bash
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias klog='kubectl logs -f'
alias kexec='kubectl exec -it'
```

### Bash 自动补全

```bash
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc

# 给 alias k 也加补全
echo 'complete -F __start_kubectl k' >> ~/.bashrc
```

### Helm 用法

```bash
# 添加 repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 装包
helm install myapp bitnami/wordpress

# 升级
helm upgrade myapp bitnami/wordpress --set replicas=3

# 卸载
helm uninstall myapp

# 看 values
helm show values bitnami/nginx > values.yaml
# 编辑后用
helm install myapp bitnami/nginx -f values.yaml
```

### k9s（最强终端 UI）

```bash
k9s                     # 启动
:pods<Enter>            # 看 pods
:deploy<Enter>          # 看 deployments
:ns<Enter>              # 切 namespace
:svc<Enter>             # 看 services
```

按字母在 pod 上：
- `d` — describe
- `l` — logs（实时）
- `s` — shell 进容器
- `f` — port-forward
- `Ctrl+d` — 删除
- `?` — 帮助

### 国内镜像

下载 K8s 工具的二进制有时 storage.googleapis.com 慢：
```bash
# kubectl 走腾讯云镜像
curl -fsSL "https://mirrors.tencent.com/kubernetes/release/stable.txt" -o /tmp/v.txt
VER=$(cat /tmp/v.txt)
curl -fsSL "https://mirrors.tencent.com/kubernetes/release/${VER}/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl
sudo chmod +x /usr/local/bin/kubectl
```

## ⚠️ 敏感性

**review** — kubectl 的 kubeconfig 等于集群的 root 权限。kubeconfig 文件务必：
1. 权限 600
2. 不要 commit 到 git
3. 用 RBAC 限制权限（不要给所有人 cluster-admin）

## 验证

```bash
kubectl version --client
helm version
k9s version
```

## 排错

- **`Unable to connect to the server`** — kubeconfig 不对、集群挂了、网络不通。`kubectl cluster-info` 看具体哪步失败。
- **`error: You must be logged in to the server (Unauthorized)`** — token 过期，重新拿 kubeconfig。
- **跨发行版**：kubectl 不在默认仓库，Playbook 用 K8s 官方仓库（apt.kubernetes.io / rpm-yum）。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

- kubeconfig 含集群凭据，不要上传或同步。
- kubectl 不发遥测。
