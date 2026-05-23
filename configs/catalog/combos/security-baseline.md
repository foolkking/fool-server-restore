# 安全基线（终极组合：防火墙 + Fail2Ban + SSH 加固 + 自动安全更新）

服务器**安全加固一站式方案**——四层联防：UFW/firewalld 防火墙 + Fail2Ban 入侵防护 + SSH 加固 + 系统自动安全更新。**所有面向公网的 Linux 服务器开机第一件事**就该跑这个。

## 你将得到什么

- ✅ **UFW 防火墙**（debian-family）/ **firewalld**（rhel-family）— 默认 deny + 放行 22/80/443
- ✅ **Fail2Ban** + SSH jail（5 次失败 ban 1h）
- ✅ **SSH 加固** — 禁 root / 禁密码 / 限速 / 闲置超时
- ✅ **unattended-upgrades**（debian）/ **dnf-automatic**（rhel）— 每日自动安全补丁
- ✅ 全部按表单值生效，可关掉单项

## 表单字段说明

### `enable_firewall` / `enable_fail2ban` / `enable_ssh_hardening` / `enable_auto_updates`

四个开关。**全开是默认推荐**——除非你已用其它工具管。

### SSH 相关字段

见 [`ssh-hardening` md](./ssh-hardening.md) 详细说明。

### `extra_allow_ports`

逗号分隔的额外开放端口（默认仅 22/80/443）。

## 配置文件 / 目录速查

### 防火墙

```
/etc/ufw/ ...                       # Ubuntu/Debian（见 firewall-baseline.md）
/etc/firewalld/ ...                  # RHEL/Anolis
```

### Fail2Ban

```
/etc/fail2ban/jail.local             # ← 主配置
/etc/fail2ban/jail.d/                 # 子配置
/var/log/fail2ban.log                  # 日志
/var/lib/fail2ban/fail2ban.sqlite3      # ban 历史
```

### SSH 加固

```
/etc/ssh/sshd_config                  # 主配置
/etc/ssh/sshd_config.envforge.bak      # 备份
```

### 自动更新

```
# Ubuntu/Debian
/etc/apt/apt.conf.d/50unattended-upgrades        # 主配置
/etc/apt/apt.conf.d/20auto-upgrades              # 调度（每日 / 每周）
/var/log/unattended-upgrades/                     # 日志

# RHEL/Anolis
/etc/dnf/automatic.conf                            # 主配置
/usr/lib/systemd/system/dnf-automatic.timer         # systemd timer
sudo journalctl -u dnf-automatic                     # 日志
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 防火墙 | UFW | firewalld |
| 自动更新 | unattended-upgrades | dnf-automatic |
| Fail2Ban | 默认仓库 | EPEL（preflight 启用） |

## 常见配置模板

### 模板 A — 完整推荐流程（按顺序，避免锁出）

```bash
# 1. 装包（EnvForge Playbook 自动）
sudo apt-get install -y ufw fail2ban unattended-upgrades            # Ubuntu
# RHEL: sudo dnf install -y firewalld fail2ban dnf-automatic

# 2. 防火墙（先加规则再 enable，**SSH 必须开**）
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp                                                 # 改了端口同步改这里
sudo ufw allow 80,443/tcp
sudo ufw limit 22/tcp                                                  # SSH 速率限制
sudo ufw enable

# 3. Fail2Ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd                                       # 验证

# 4. SSH 加固（先备用通道 + 公钥可用）
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.envforge.bak
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
sudo sshd -t                                                            # 校验
sudo systemctl reload sshd

# 5. 自动安全更新
# Ubuntu
sudo dpkg-reconfigure -plow unattended-upgrades                          # 选 Yes

# RHEL
sudo systemctl enable --now dnf-automatic.timer
```

### 模板 B — UFW 基线规则

```bash
# 重置（首次或重新配）
sudo ufw --force reset

# 默认策略
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw default deny routed                          # 不做路由

# 必备
sudo ufw limit 22/tcp                                  # SSH 速率限制（防爆破）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 限源 IP（管理后台等敏感端口）
sudo ufw allow from 10.0.0.0/8 to any port 3306        # MySQL 仅内网
sudo ufw allow from 1.2.3.4 to any port 9000           # MinIO 仅运维 IP

# 启用 + 日志
sudo ufw logging on
sudo ufw enable
sudo ufw status verbose
```

### 模板 C — Fail2Ban 基线 jail.local

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

# 累计累罚（同 IP 反复触发）
bantime.increment = true
bantime.factor    = 2
bantime.maxtime    = 30d

# 白名单（**务必加自己 IP**）
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 203.0.113.0/24

# 后端
backend = systemd

# 邮件通知（机器配过 MTA 时）
destemail = admin@example.com
sender = fail2ban@example.com
action = %(action_mwl)s

[sshd]
enabled  = true
port     = 22
maxretry = 3                                            # SSH 更严
bantime  = 1h
filter   = sshd

[sshd-ddos]
enabled = true
port    = 22
filter  = sshd-ddos

[nginx-http-auth]
enabled = false                                         # 装 nginx 后改 true

[postfix]
enabled = false                                          # 装邮件服务器后改 true
```

### 模板 D — SSH 加固关键项

`/etc/ssh/sshd_config`（仅改这些 key，保留其它）：

```
Port 22                                                  # 改 22222 等非标
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
MaxAuthTries 3
MaxStartups 3:50:10
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
LogLevel VERBOSE                                          # 审计用
```

详见 `ssh-hardening.md`。

### 模板 E — Ubuntu unattended-upgrades

`/etc/apt/apt.conf.d/50unattended-upgrades`（关键项）：

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    // "${distro_id}:${distro_codename}-updates";       // 启用 = 也装非安全更新（更激进）
};

Unattended-Upgrade::Package-Blacklist {
    // "linux-image-*";                                   // 不自动升级内核（避免 reboot）
    // "kubectl";                                          // 锁定某些包版本
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";              // 不自动重启
Unattended-Upgrade::Automatic-Reboot-Time "03:00";          // 启用时凌晨 3 点
Unattended-Upgrade::Mail "admin@example.com";                // 升级日志邮件
```

`/etc/apt/apt.conf.d/20auto-upgrades`：

```
APT::Periodic::Update-Package-Lists "1";                  // 每天更新 apt cache
APT::Periodic::Unattended-Upgrade "1";                     // 每天跑升级
APT::Periodic::AutocleanInterval "7";                       // 每周清 apt cache
APT::Periodic::Verbose "1";
```

### 模板 F — RHEL dnf-automatic

`/etc/dnf/automatic.conf`：

```ini
[commands]
upgrade_type = security                                     # 仅安全更新（推荐）
# upgrade_type = default                                     # 全部更新
random_sleep = 360
download_updates = yes
apply_updates = yes                                          # **执行**升级（false = 仅下载）

[emitters]
emit_via = stdio,motd                                        # stdio + 写到 /etc/motd
# emit_via = email                                            # 启用邮件通知

[email]
email_from = root@localhost
email_to = admin@example.com
email_host = localhost
```

启用：

```bash
sudo systemctl enable --now dnf-automatic.timer
sudo systemctl list-timers dnf-automatic.timer
```

### 模板 G — 加额外加固（可选）

```bash
# 禁不需要的服务
sudo systemctl disable --now cups avahi-daemon bluetooth 2>/dev/null

# .ssh 权限（防 SSH 拒绝公钥）
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# sysctl 内核参数加固
sudo tee /etc/sysctl.d/99-security.conf > /dev/null <<'EOF'
# IP forward 关（除非是路由 / VPN gateway）
net.ipv4.ip_forward = 0

# 抗 SYN flood
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096

# 不响应 broadcast ping
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Reverse path filter
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# 不接受 source-routed 包
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# 不接受 ICMP redirect
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# 记录可疑包
net.ipv4.conf.all.log_martians = 1
EOF
sudo sysctl --system

# 设置默认 umask（新建文件默认权限）
echo "umask 027" | sudo tee /etc/profile.d/umask.sh
```

## 关键参数调优速查

### Bantime 升级（防长期攻击）

```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime.increment = true
bantime.factor    = 2
bantime.maxtime    = 30d
```

第 1 次 ban 1h，第 2 次 2h，第 3 次 4h... 最多 30 天。

### 自动更新策略

| 策略 | 适用 |
|---|---|
| **仅 security**（推荐生产） | `Allowed-Origins: -security` only |
| 安全 + bug fix | + `-updates` |
| 全部 | + main / multiverse |
| 不自动重启 | `Automatic-Reboot "false"` |
| 凌晨自动重启（接受短暂停机） | `"true"` + `"03:00"` |

### 监控

```bash
# 看 ban 列表
sudo fail2ban-client status sshd

# 看自动升级历史
sudo cat /var/log/unattended-upgrades/unattended-upgrades.log    # Ubuntu
sudo journalctl -u dnf-automatic -n 50                            # RHEL

# 看防火墙拒绝包
sudo grep -i "uf w block" /var/log/syslog | tail
```

## 跨发行版兼容

| 工具 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 防火墙 | UFW | firewalld |
| Fail2Ban | 默认仓库 | EPEL ✅ |
| SSH 服务名 | `ssh` | `sshd`（PACKAGE_ALIASES + SERVICE_ALIASES 翻译） |
| 自动更新 | `unattended-upgrades` | `dnf-automatic` |

EnvForge 全自动。

## 与其它 catalog 项的配合

- **`firewall-baseline`** + **`ssh-hardening`** + **`fail2ban-protection`** — 单独 Playbook 版本
- **`certbot-ssl`** — 配 80/443 让 LE 续证可达
- **任何业务 Playbook** — 跑业务前先跑本 combo 加固

## 排错

### 跑完连不上

99% 是 SSH 端口改了 + 防火墙没同步加：

```bash
# 备用通道（云控制台 / 物理 console）
sudo cp /etc/ssh/sshd_config.envforge.bak /etc/ssh/sshd_config
sudo systemctl reload sshd

# 或临时关防火墙
sudo ufw disable                                          # Ubuntu
sudo systemctl stop firewalld                             # RHEL
```

### Fail2Ban 把自己 ban 了

```bash
sudo fail2ban-client set sshd unbanip MY_IP

# 永久白名单
sudo nano /etc/fail2ban/jail.local
# ignoreip = 127.0.0.1/8 ::1 MY_IP/32
sudo systemctl reload fail2ban
```

### 自动更新装了重要包导致服务挂

```bash
# 看升级了什么
sudo cat /var/log/unattended-upgrades/unattended-upgrades.log

# 回滚
sudo apt-get install <package>=<old-version>            # Ubuntu
sudo dnf history undo <ID>                                # RHEL

# 添加包到黑名单（不自动升级）
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
# Unattended-Upgrade::Package-Blacklist {
#     "kubectl";
# };
```

### 自动重启在错误时间

```bash
# Ubuntu
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
# Unattended-Upgrade::Automatic-Reboot "false";
# Unattended-Upgrade::Automatic-Reboot-Time "03:00";

# RHEL
sudo systemctl edit dnf-automatic.timer
# [Timer]
# OnCalendar=
# OnCalendar=*-*-* 03:00:00
```

### 防火墙日志爆磁盘

```bash
# 调日志级别
sudo ufw logging low                                      # 仅 deny

# 或加 logrotate
sudo nano /etc/logrotate.d/ufw                             # 调小 rotate
```

## 验证

```bash
# 1. 防火墙启用 + SSH 在白名单
sudo ufw status verbose                                    # Ubuntu
sudo firewall-cmd --list-all                                # RHEL

# 2. Fail2Ban 在跑 + SSH jail 启用
systemctl is-active fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd

# 3. SSH 加固生效
sudo grep -E '^(PermitRootLogin|PasswordAuthentication|MaxAuthTries)' /etc/ssh/sshd_config

# 4. 自动更新启用（Ubuntu）
sudo systemctl is-enabled unattended-upgrades
sudo cat /etc/apt/apt.conf.d/20auto-upgrades

# 4. 自动更新启用（RHEL）
sudo systemctl is-enabled dnf-automatic.timer
sudo systemctl list-timers dnf-automatic.timer
```

## 安全检查清单（部署后逐条核对）

- [ ] 防火墙启用，仅开放必要端口
- [ ] SSH 已加白名单（避免锁自己）
- [ ] Fail2Ban 在跑，SSH jail 启用
- [ ] Root SSH 登录已禁用
- [ ] 密码认证已禁用（仅密钥）
- [ ] **公钥可用**（测试新开 shell ssh -i 能进）
- [ ] 自动安全更新启用
- [ ] 不需要的服务已禁用（cups / avahi 等）
- [ ] 留有备用通道（云控制台 / 物理 console / VPN）
- [ ] sysctl 内核加固（模板 G）
- [ ] sshd 端口非 22（可选但推荐）

## 多次运行

`installMode: replace-existing`。每次按表单值重置规则——**手动改的 sshd_config / jail.local / 防火墙规则会被覆盖**！

要保留：

- SSH 自定义放 `/etc/ssh/sshd_config.d/`
- Fail2Ban 自定义 jail 放 `/etc/fail2ban/jail.d/`
- UFW 自定义 app 放 `/etc/ufw/applications.d/`

## ⚠️ 敏感性

**privileged** — 同时改 4 个安全层。**任何一项配错都可能锁出去**。

**强制清单**：

1. 跑前**留备用通道**（云控制台 web ssh / 物理 console）
2. SSH 改端口前**先在防火墙加新端口**
3. 关密码认证前**确认密钥可用**（新 shell 测）
4. AllowUsers 含**自己当前账号**
5. fail2ban ignoreip **加自己 IP**
6. 自动更新黑名单**关键 production 包**

## 隐私说明

- 所有配置文件本地存储，不上传不同步
- Fail2Ban ban 列表 / 自动更新历史 / 防火墙日志含**源 IP / 时间**——按合规处理
- 邮件通知（如配 destemail）含被 ban IP / 升级包列表——发到外部邮箱
- 自动更新会从发行版仓库 / 第三方仓库下载（请求暴露 IP）
