# Ansible 自动化工具

Ansible 是无 agent 的运维自动化框架——通过 SSH 跑 Playbook 配置远程机器。EnvForge 内部用 TypeScript 实现的兼容子集（mini-Ansible）；本 Playbook 装的是**真正的 Ansible CLI**，让你能跑社区 role / 由 EnvForge 导出的 Playbook / `ansible-galaxy` 生态。

## 你将得到什么

- 📦 **ansible**（含 `ansible` / `ansible-playbook` / `ansible-galaxy` / `ansible-vault` 等命令）
- 📦 Python 3 + pip + venv 依赖（由 `python-toolchain` 或本 Playbook 自动装）
- ✅ pip 装到系统 Python 还是 pipx（推荐）由表单决定

## 配置文件 / 目录速查

```
# 系统级（很少用）
/etc/ansible/
├── ansible.cfg                       # 全局默认
├── hosts                             # 默认 inventory
└── roles/                            # 全局 roles 目录

# 用户级（常用）
~/.ansible.cfg                        # 用户配置（高于系统级）
~/.ansible/
├── collections/                      # ansible-galaxy collection install 装这里
├── roles/                            # ansible-galaxy install 装这里
├── tmp/                              # 远程目标机临时文件
└── cp/                               # SSH ControlPath 套接字

# 项目级（最佳实践）
<project>/
├── ansible.cfg                       # ← 项目级配置（最高优先级）
├── inventory/
│   ├── hosts.yml                     # 主机清单
│   └── group_vars/
│       └── all.yml                   # 所有主机共享变量
├── roles/                            # 自定义 roles
├── playbooks/
│   └── site.yml                      # 主入口
└── requirements.yml                  # galaxy 依赖
```

| 包安装方式 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 发行版仓库（旧版） | `ansible`（apt） | `ansible-core` 在 AppStream，完整 `ansible` 在 EPEL |
| pip 安装（推荐） | `pipx install --include-deps ansible` | 同左 |
| 装的是 ansible-core 还是完整 | EPEL 上完整 `ansible` 含 community.general 等 | 默认 ansible-core 仅核心模块 |

EnvForge 默认走 pipx 路径——版本最新（10+），且不污染系统 Python。

## 常见配置模板

### 模板 A — 项目级 `ansible.cfg`（推荐起手式）

```ini
[defaults]
inventory          = inventory/hosts.yml
roles_path         = roles:~/.ansible/roles
collections_path   = collections:~/.ansible/collections
host_key_checking  = False
timeout            = 30
forks              = 20
deprecation_warnings = False
stdout_callback    = yaml
callbacks_enabled  = profile_tasks, timer
gathering          = smart
fact_caching       = jsonfile
fact_caching_connection = .ansible/facts
fact_caching_timeout = 86400

[ssh_connection]
pipelining = True
control_path = ~/.ansible/cp/%%h-%%p-%%r
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null

[privilege_escalation]
become = True
become_method = sudo
become_user = root
become_ask_pass = False
```

### 模板 B — Inventory（YAML 格式）

```yaml
# inventory/hosts.yml
all:
  vars:
    ansible_user: deploy
    ansible_ssh_private_key_file: ~/.ssh/deploy_key
    ansible_python_interpreter: /usr/bin/python3
  children:
    webservers:
      hosts:
        web1.example.com:
          ansible_host: 10.0.1.10
        web2.example.com:
          ansible_host: 10.0.1.11
      vars:
        nginx_port: 8080
    databases:
      hosts:
        db1.example.com:
          ansible_host: 10.0.2.10
      vars:
        pg_max_connections: 200
```

### 模板 C — Playbook（最小可运行）

```yaml
# playbooks/site.yml
- name: Deploy web servers
  hosts: webservers
  become: true
  vars:
    app_version: "1.2.3"

  pre_tasks:
    - name: Update apt cache
      ansible.builtin.apt:
        update_cache: true
        cache_valid_time: 3600
      when: ansible_os_family == "Debian"

  roles:
    - common
    - nginx
    - app

  post_tasks:
    - name: Notify Slack
      ansible.builtin.uri:
        url: "{{ slack_webhook }}"
        method: POST
        body_format: json
        body: { text: "Deployed {{ app_version }} to {{ inventory_hostname }}" }
      delegate_to: localhost
      run_once: true
```

跑：

```bash
ansible-playbook -i inventory/hosts.yml playbooks/site.yml
ansible-playbook -i inventory/hosts.yml playbooks/site.yml --check         # dry-run
ansible-playbook -i inventory/hosts.yml playbooks/site.yml --diff           # 显示文件变化
ansible-playbook -i inventory/hosts.yml playbooks/site.yml --limit web1    # 仅一台
ansible-playbook -i inventory/hosts.yml playbooks/site.yml --tags nginx    # 仅特定 tag
```

### 模板 D — Vault 加密敏感变量

```bash
# 生成 vault 密码（保存到 ~/.vault_pass，权限 0600）
openssl rand -base64 32 > ~/.vault_pass
chmod 600 ~/.vault_pass

# 加密单个值
ansible-vault encrypt_string 'super_secret_password' --name 'db_password' >> group_vars/all.yml

# 加密整个文件
ansible-vault encrypt group_vars/secrets.yml

# 编辑加密文件
ansible-vault edit group_vars/secrets.yml

# 跑 playbook 时自动解密
ansible-playbook --vault-password-file ~/.vault_pass playbooks/site.yml
# 或 ansible.cfg 里设
# [defaults]
# vault_password_file = ~/.vault_pass
```

### 模板 E — 跑 EnvForge 导出的 Playbook（兼容 Ansible 格式）

```bash
# 1. 从 EnvForge 导出（在 web UI 点 export）
# 2. 准备 inventory
echo '[webservers]' > hosts
echo 'web1 ansible_host=1.2.3.4 ansible_user=root' >> hosts

# 3. 跑
ansible-playbook -i hosts /path/to/nginx-web-service.yaml \
  --extra-vars "listen_port=80 enable_reverse_proxy=true"
```

EnvForge mini-Ansible 子集：`package` / `service` / `template` / `copy` / `lineinfile` / `shell` / `cron` / `user` / `file` / `sysctl` / `ufw` / `acme` / `systemd_unit` / `env_path`——这些都是真 Ansible 兼容的模块名。

## 关键参数调优速查

### 性能

| 参数 | 推荐 | 说明 |
|---|---|---|
| `forks` | `20-100`（机器数 / 5） | 并行连接数；默认 5 太保守 |
| `pipelining = True` | 永远开 | SSH 减少 round-trip，快 2-3× |
| `ControlPersist=60s` | 永远开 | SSH 复用连接，快 5× |
| `gather_facts: false` | 不需要 facts 时关 | 节省 1-3 秒/host |
| `strategy: free` | 主机间无依赖 | 各 host 独立推进，不等齐 |

### 调试

```bash
# 看每个 task 多久（profile_tasks callback）
ANSIBLE_CALLBACKS_ENABLED=profile_tasks ansible-playbook ...

# 详细输出
ansible-playbook -v site.yml         # info
ansible-playbook -vv site.yml        # task vars
ansible-playbook -vvv site.yml       # connection
ansible-playbook -vvvv site.yml      # SSH debug

# 只跑某个 task（用 tag）
ansible-playbook site.yml --start-at-task="Install nginx"
ansible-playbook site.yml --step       # 每个 task 询问 y/n
```

### Galaxy 装依赖

```bash
# requirements.yml
collections:
  - name: community.general
    version: ">=8.0.0"
  - name: community.docker
roles:
  - src: geerlingguy.docker

# 装
ansible-galaxy install -r requirements.yml
```

## 跨发行版兼容

Ansible 控制端（跑 `ansible-playbook` 的机器）支持：

| 发行版 | 支持 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| **Anolis 9** | ✅（与 RHEL 9 一致） |
| Alpine | ⚠️ 装 `py3-pip py3-cryptography` 后可用 |
| Windows | ❌ 用 WSL2 |

**目标机器**只需要 Python 3（默认每个现代 Linux 都装）。

## 与其它 catalog 项的配合

- **`python-toolchain`** — Ansible 是 Python 包，依赖 Python 3.9+
- **`git-version-control`** — playbook 一般在 git 仓库管理
- **`vault-secrets`** — HashiCorp Vault 与 ansible-vault 不冲突，前者管运行时机密，后者管 playbook 里的敏感变量
- **EnvForge mini-Ansible** — EnvForge 自己实现的子集；导出的 playbook 可直接喂给真 Ansible CLI

## 排错

### `python: command not found` 在目标机器

目标机器需要 Python 3：

```bash
# 在 inventory 显式指定
ansible_python_interpreter: /usr/bin/python3
```

### `Permission denied (publickey)` 连接目标机器

```bash
# 测试 SSH 直接能不能通
ssh -i ~/.ssh/deploy_key deploy@target

# inventory 设对
ansible_ssh_private_key_file: ~/.ssh/deploy_key
ansible_user: deploy
```

### `sudo: a password is required`

目标机器 sudo 要密码：

```bash
# 加 -K 提示输入
ansible-playbook --ask-become-pass site.yml

# 或目标机器 sudoers 加 NOPASSWD
echo "deploy ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/deploy
```

### `Failed to connect to the host via ssh: kex_exchange_identification`

目标机器 sshd 有连接频率限制（fail2ban）。降并发：

```bash
ansible-playbook --forks 5 site.yml
```

### `ERROR! conflicting action statements: ...` 跑 EnvForge 导出的 playbook

EnvForge 的 mini-Ansible 兼容子集之外的语法。逐个 task 改成纯 Ansible 模块：

- EnvForge 的 `module: package` → Ansible `ansible.builtin.package`
- EnvForge 的 `module: shell` → `ansible.builtin.shell` 或 `command`

### `ansible-galaxy collection install` 网络慢

```bash
# Galaxy 没官方镜像，但可改 server
ansible-galaxy collection install community.general --server https://galaxy.ansible.com

# 或离线包
ansible-galaxy collection download community.general
ansible-galaxy collection install community-general-X.Y.Z.tar.gz
```

### Vault 文件改完忘了加密

```bash
# 看是否加密
head -1 group_vars/secrets.yml      # 应是 $ANSIBLE_VAULT;1.1;AES256

# 没加密的话立即加密
ansible-vault encrypt group_vars/secrets.yml
```

## 验证

```bash
# 1. 命令可用
ansible --version
ansible-playbook --version
ansible-galaxy --version

# 2. 跑个 ad-hoc ping localhost
ansible localhost -m ping

# 3. 跑个 ad-hoc shell
ansible localhost -m shell -a 'uptime'

# 4. 看 collections 列表
ansible-galaxy collection list
```

## 多次运行

`installMode: skip-existing`。pipx / pip 装包幂等——已装就跳过。要升级：

```bash
pipx upgrade ansible
# 或
pip install --upgrade ansible      # 系统 Python 装时
```

## ⚠️ 敏感性

**safe** — 装客户端工具，本身不动业务。但 ansible-playbook **运行时**会改远程目标机器（按 playbook 内容），风险等级取决于 playbook 内容。

## 隐私说明

- Ansible 不发遥测
- ansible-galaxy install 时会把请求发给 `galaxy.ansible.com`（含 collection 名，不含个人信息）
- Vault 加密用 AES-256，密码不存仓库里——`vault_password_file` 路径在 `~`，权限 0600
- inventory 里的密码 / API token / SSH key 路径会出现在 ansible 任务日志（`-v` 以上 verbose 时）。生产建议用 ansible-vault 或外部 secrets manager（HashiCorp Vault）
