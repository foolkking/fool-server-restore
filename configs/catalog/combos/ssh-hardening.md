# SSH 服务器加固

按 SSH 安全最佳实践修改 `/etc/ssh/sshd_config`：改默认端口 / 禁用密码登录 / 禁止 root 直连 / 限制用户 / 缩短闲置超时。配合 fail2ban + 防火墙形成"洋葱式"防护。

## 你将得到什么

- ✅ SSH 端口按表单值修改
- ✅ root 直连默认禁用（`PermitRootLogin no`）
- ✅ 密码认证默认禁用（仅密钥）
- ✅ 闲置连接超时（ClientAliveInterval + CountMax）
- ✅ 单次连接最多 N 次认证尝试（MaxAuthTries）
- ✅ 可选 AllowUsers 白名单
- ✅ **改完用 reload 而非 restart**——保留你当前 SSH 连接
- ✅ 自动备份原 sshd_config 到 `.envforge.bak`

## ⚠️ 防自锁三原则（先看）

1. **改端口前**先在防火墙放行新端口：
    ```bash
    sudo ufw allow 22222/tcp                                          # Ubuntu
    sudo firewall-cmd --add-port=22222/tcp --permanent --reload       # RHEL
    ```
2. **关密码登录前**确认密钥可用：
    ```bash
    ssh -i ~/.ssh/your-key user@server                                 # 应直接进，无密码提示
    ```
3. **保留备用通道**：云控制台 web ssh / 物理 console。改 sshd 期间**不要关现有 SSH 窗口**。

## 表单字段说明

### `ssh_port`

改非标端口能挡 ~90% 自动扫描。常用：2222 / 22222 / 60022。

### `permit_root_login`

| 值 | 适用 |
|---|---|
| `no`（**推荐**） | 禁用 root SSH。需要 root 时先普通用户登录再 sudo |
| `prohibit-password` | 仅 root 密钥登录（自动化场景） |
| `yes` | 完全开放（**不推荐**） |

### `password_authentication`

| 值 | 适用 |
|---|---|
| `no`（**推荐**） | 仅密钥 |
| `yes` | 允许密码（必须配 fail2ban） |

### `allow_users`

留空 = 不限制。空格分隔，如 `alice bob ops@10.0.0.0/8`。**务必含你自己当前账号**。

### `client_alive_interval` / `client_alive_count_max`

服务端每 `interval` 秒发探测，连续 `count_max` 次无响应断开。

| 配置 | 行为 |
|---|---|
| `interval=300, count_max=2` | 闲置 10 分钟自动断 |
| `interval=60, count_max=3` | 闲置 3 分钟自动断（严格） |
| `interval=0` | 不发探测（依赖网络层） |

### `max_auth_tries`

单次连接最多失败次数。配 fail2ban 双保险。

## 配置文件 / 目录速查

```
/etc/ssh/
├── sshd_config                           # ← 主配置
├── sshd_config.envforge.bak              # ← EnvForge 备份
├── sshd_config.d/                          # 子配置（推荐放自定义，不被覆盖）
│   └── 99-custom.conf
├── moduli                                  # DH 参数（影响 KEX 性能）
└── ssh_host_*_key                          # 服务器主机密钥（不要丢！）

# 用户级
~/.ssh/
├── authorized_keys                          # 允许登录的公钥
├── known_hosts                              # 见过的服务器指纹
├── config                                   # 客户端配置
└── id_*                                      # 私钥（仅本机）

# systemd
/lib/systemd/system/ssh.service              # Ubuntu（服务名 ssh）
/lib/systemd/system/sshd.service             # RHEL（服务名 sshd）

# 日志
/var/log/auth.log                            # Ubuntu
/var/log/secure                              # RHEL
sudo journalctl -u ssh                        # systemd journal
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 服务名 | `ssh` | `sshd` |
| 主配置 | `/etc/ssh/sshd_config` | 相同 |
| 包名 | `openssh-server` | `openssh-server` |
| 默认端口 | 22 | 22 |

## 常见配置模板

### 模板 A — 推荐 sshd_config（生产基线）

```
# ====== 网络 ======
Port 22222                                    # 改非标
ListenAddress 0.0.0.0
# AddressFamily inet                           # 仅 IPv4

# ====== 协议 + Crypto ======
Protocol 2                                     # 隐式（SSH-2，SSH-1 不支持）

# 现代 KEX / Cipher / MAC（去掉老旧不安全算法）
KexAlgorithms curve25519-sha256@libssh.org,curve25519-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com
HostKeyAlgorithms ssh-ed25519,rsa-sha2-512,rsa-sha2-256

# ====== 认证 ======
PermitRootLogin no                              # 禁止 root SSH
PasswordAuthentication no                       # 仅密钥
PermitEmptyPasswords no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# ====== 限制 ======
MaxAuthTries 3                                  # 单连接最多 3 次失败
MaxStartups 3:50:10                             # 未认证连接：3 个起限速 50%，10 个全 drop
LoginGraceTime 30                                # 30s 内必须完成登录

# ====== 闲置超时 ======
ClientAliveInterval 300                         # 5 分钟探一次
ClientAliveCountMax 2                            # 连续 2 次无响应断（10 分钟）
TCPKeepAlive yes

# ====== 用户白名单（可选）======
AllowUsers alice bob ops@10.0.0.0/8

# ====== 转发 / Tunneling ======
AllowAgentForwarding no                          # 禁 agent forward（防 ssh agent 劫持）
AllowTcpForwarding yes                            # 允许 TCP 转发（如 ssh -L）
GatewayPorts no                                    # 不让 -L 绑 0.0.0.0
PermitTunnel no                                     # 禁 SSH VPN
X11Forwarding no                                     # 禁 X11（除非真要 GUI 转发）

# ====== 其它 ======
UsePAM yes
PrintMotd no                                          # 不打印 motd（自定义可改 yes）
PrintLastLog yes                                       # 显示上次登录信息（防异常登录被发现）
ClientAliveCountMax 2
LogLevel VERBOSE                                       # VERBOSE 记录每次密钥指纹（审计有用）
StrictModes yes
IgnoreRhosts yes
HostbasedAuthentication no
DenyUsers root www-data nobody                          # 显式拒绝某些系统账号

# Subsystem
Subsystem sftp /usr/lib/openssh/sftp-server -f AUTHPRIV -l INFO

# 子配置
Include /etc/ssh/sshd_config.d/*.conf
```

应用：

```bash
sudo sshd -t                                      # 校验语法
sudo systemctl reload ssh                          # Ubuntu
sudo systemctl reload sshd                         # RHEL
```

### 模板 B — Match 块（按用户 / IP 不同规则）

```
# 默认：所有用户密钥认证
PasswordAuthentication no

# 但允许特定用户密码登录（如 backup 自动化）
Match User backup
    PasswordAuthentication yes
    AllowAgentForwarding no
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    ForceCommand /usr/local/bin/restic-backup.sh    # 强制只能跑这个命令

# 内网允许密码（只在内网 IP 段）
Match Address 10.0.0.0/8
    PasswordAuthentication yes

# 仅特定 group 允许 SSH
Match Group ssh-users
    PasswordAuthentication no
```

### 模板 C — 客户端 ~/.ssh/config（让 SSH 命令更省心）

```
# ~/.ssh/config

Host server-prod
    HostName 1.2.3.4
    Port 22222
    User alice
    IdentityFile ~/.ssh/id_ed25519_prod
    IdentitiesOnly yes
    ServerAliveInterval 60
    ForwardAgent no
    StrictHostKeyChecking accept-new

Host *.internal
    User deploy
    ProxyJump bastion.example.com                # 走跳板机
    ServerAliveInterval 30

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
```

之后只 `ssh server-prod` 就行。

### 模板 D — 双因子（Google Authenticator / TOTP）

```bash
# 装
sudo apt-get install libpam-google-authenticator    # Ubuntu
sudo dnf install google-authenticator                # RHEL（EPEL）

# 每用户初始化
google-authenticator                                  # 跟向导（扫 QR 给手机 App）

# /etc/pam.d/sshd 末尾加
auth required pam_google_authenticator.so

# /etc/ssh/sshd_config
ChallengeResponseAuthentication yes
KbdInteractiveAuthentication yes
UsePAM yes
AuthenticationMethods publickey,keyboard-interactive

sudo systemctl reload sshd
```

之后登录：先密钥，再输入 6 位 TOTP。

### 模板 E — 给 root 配仅 from 跳板机的 force command

```
Match User root Address 10.0.0.0/8
    PermitRootLogin yes
    AuthorizedKeysFile /etc/ssh/keys/root_authorized_keys
    ForceCommand /usr/local/bin/audit-shell    # 包装 shell 加审计
```

## 关键参数调优速查

### 安全 vs 性能

| 选项 | 默认 | 推荐 |
|---|---|---|
| `Port` | 22 | 非标（如 22222） |
| `PermitRootLogin` | yes | **no** |
| `PasswordAuthentication` | yes | **no**（仅密钥） |
| `MaxAuthTries` | 6 | 3 |
| `MaxStartups` | 10:30:100 | 3:50:10 |
| `LoginGraceTime` | 120 | 30 |
| `ClientAliveInterval` | 0 | 300 |
| `ClientAliveCountMax` | 3 | 2 |
| `LogLevel` | INFO | VERBOSE（审计） |

### 客户端持续连接（防 NAT 断）

```
# ~/.ssh/config（客户端）
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Connection multiplexing（同 host 复用 TCP，省时间）

```
# ~/.ssh/config
Host *
    ControlMaster auto
    ControlPath ~/.ssh/control/%r@%h:%p
    ControlPersist 10m
```

```bash
mkdir -p ~/.ssh/control
chmod 700 ~/.ssh/control
```

之后第二次 ssh 同 host **极快**（复用首次连接）。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 服务名 | `ssh.service` | `sshd.service` |
| 配置文件 | `/etc/ssh/sshd_config` | 相同 |
| 默认行为 | reload 不断现有连接 | 同 |
| SELinux | – | **改 Port 必须**：`sudo semanage port -a -t ssh_port_t -p tcp 22222` |

EnvForge SERVICE_ALIASES 自动翻译服务名。SELinux Port 上下文 EnvForge 自动处理。

## 与其它 catalog 项的配合

- **`firewall-baseline`** — 改 ssh_port 前先在防火墙加新端口
- **`fail2ban-protection`** — 防爆破，与 sshd 加固组合双保险
- **`security-baseline`** combo — 已含本 combo + fail2ban + UFW + 自动安全更新

## 排错

### 改完连不上

应急：

```bash
# 1. 通过云控制台 web ssh 进
sudo cp /etc/ssh/sshd_config.envforge.bak /etc/ssh/sshd_config
sudo systemctl reload sshd
```

### `Permission denied (publickey)`

```bash
# 在客户端
ssh -v user@server                                # 看认证流程
# 输出 "Authentications that can continue: publickey"
# 但没成功 = 公钥不对

# 确认服务端有你的公钥
cat ~/.ssh/authorized_keys                         # 在服务器上看

# 拷贝公钥
ssh-copy-id -p 22222 user@server                   # 装到服务器（仍能用密码时）
# 或手动
cat ~/.ssh/id_ed25519.pub | ssh user@server 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'

# 文件权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chown -R $USER:$USER ~/.ssh
```

### `Bad configuration option: ...`

sshd 版本太老不认识新选项：

```bash
sudo sshd -t                                       # 看哪行
# 删掉那行或改用兼容写法
```

### AllowUsers 把自己挡了

```bash
# 应急：通过备用通道恢复
sudo cp /etc/ssh/sshd_config.envforge.bak /etc/ssh/sshd_config
```

### SELinux 阻止新端口

```bash
sudo ausearch -m avc -ts recent | grep sshd
sudo semanage port -a -t ssh_port_t -p tcp 22222
sudo systemctl reload sshd
```

### `bind: Address already in use`

```bash
# 检查谁占
sudo ss -tlnp | grep :22

# 老 sshd 没退？
sudo systemctl restart sshd
```

### 改密码登录后 `sudo` 还问密码

`sudo` 用的是 PAM 不是 SSH——`sudo` 仍然要密码（除非配 NOPASSWD）。这是预期行为。

### 用 ssh-key 后还提示密码

```bash
ssh -v user@host

# 常见
# 1. 文件权限错
ls -la ~/.ssh/authorized_keys                       # 应是 -rw------- (600)

# 2. 服务端 home 目录权限
ls -ld ~                                             # 应是 drwx------ 或 drwxr-xr-x

# 3. SELinux context（RHEL）
restorecon -Rv ~/.ssh

# 4. PubkeyAuthentication no 关了
grep PubkeyAuthentication /etc/ssh/sshd_config       # 应是 yes
```

## 验证

```bash
# 1. 配置语法
sudo sshd -t

# 2. 服务在跑
systemctl is-active ssh || systemctl is-active sshd

# 3. 端口
sudo ss -tlnp | grep ssh

# 4. **新开终端测试新端口**（在改完之前不要关现有连接）
ssh -p 22222 user@server

# 5. 密码登录确实禁用
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password user@server
# 应被拒绝

# 6. 看登录日志
sudo tail -20 /var/log/auth.log                       # Ubuntu
sudo tail -20 /var/log/secure                         # RHEL
```

## 多次运行

`installMode: replace-existing`。**每次按表单值重写 7 个核心配置项**：Port / PermitRootLogin / PasswordAuthentication / MaxAuthTries / ClientAlive* / AllowUsers。**手动加的其它配置保留**（lineinfile 仅改特定 key）。

要保留所有手改：把自定义放 `/etc/ssh/sshd_config.d/99-custom.conf`，主配置不动。

## ⚠️ 敏感性

**privileged** — 直接修改 sshd 配置，配错就连不上。

**强制清单**：

1. **永远先备用通道**（云控制台 / 物理 console）
2. **改端口前防火墙加新端口**
3. **关密码前确认密钥可用**
4. **AllowUsers 含自己当前账号**
5. **不要 restart sshd（保留现有连接）**——用 reload

## 隐私说明

- sshd_config 不上传不同步
- AllowUsers / DenyUsers 字段会出现在任务日志（账号名公开但仍注意）
- SSH 主机密钥（`/etc/ssh/ssh_host_*_key`）**不要泄露**——其他人有了能 MITM 你的连接
- 客户端 `~/.ssh/known_hosts` 含你登录过的服务器指纹（按 hash 存，不直接暴露 IP）
- 登录日志（`/var/log/auth.log` / `secure`）含来源 IP / 用户名 / 成功失败——按合规处理
