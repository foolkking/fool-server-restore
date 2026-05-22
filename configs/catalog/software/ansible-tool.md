# Ansible 自动化工具

Ansible 是无 agent 的运维自动化工具——用 SSH 跑 Playbook 配置远程机器，是 EnvForge 的"远房亲戚"。

> **注意**：EnvForge 用的是 mini-Ansible（一个 TypeScript 实现的兼容子集）。装这个 Playbook 让你能用**真正的 Ansible CLI**（`ansible-playbook` 命令）跑由 EnvForge 导出的 Playbook 或社区 role。

## 你将得到什么

- 📦 **ansible**（Python 包形式）
- 📦 **python3-pip** + **python3-venv**（依赖）

## 用法

### 验证

```bash
ansible --version
ansible-playbook --version
```

### 跑一个 EnvForge 导出的 Playbook

EnvForge 的 catalog Playbook 是兼容 Ansible 格式的：

```bash
# 创建 inventory
echo '[webservers]' > hosts
echo 'web1 ansible_host=1.2.3.4' >> hosts

# 跑
ansible-playbook -i hosts /path/to/nginx-web-service.yaml
```

### Ad-hoc 命令（不写 playbook 直接跑）

```bash
# 在所有 webservers 主机上跑命令
ansible -i hosts webservers -m shell -a 'uptime'

# 装包
ansible -i hosts webservers -m apt -a 'name=nginx state=present' --become

# ping
ansible -i hosts all -m ping
```

### 装 Galaxy roles

```bash
ansible-galaxy install geerlingguy.docker
ansible-galaxy install geerlingguy.nginx
```

### 国内镜像

```bash
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
ansible-galaxy install geerlingguy.docker --server https://galaxy.ansible.com
# Ansible Galaxy 没有官方镜像，国内服务器装 role 慢
```

## ⚠️ 敏感性

**safe** — 装客户端工具。Ansible 跑 Playbook 时才会修改远程机器。

## 验证

```bash
ansible --version
ansible-playbook --version
```

## 排错

- **`No module named yaml`** — Python yaml 库没装。`pip install pyyaml`。
- **跨发行版**：Ansible 在 Ubuntu/Debian 上是 `ansible` 包，RHEL/Anolis 上需要 EPEL（preflight 自动启用）。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

不发遥测。
