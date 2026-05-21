# 安全基线（UFW + Fail2Ban + SSH 加固 + 自动更新）

## 概述

服务器安全加固一站式方案，包含防火墙配置、入侵防护、SSH 安全加固和自动安全更新。适用于所有面向公网的 Linux 服务器。

## 包含组件

| 组件 | 说明 |
|------|------|
| UFW | 简易防火墙 |
| Fail2Ban | 暴力破解防护 |
| OpenSSH 加固 | SSH 安全配置 |
| Unattended Upgrades | 自动安全更新 |

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y ufw fail2ban unattended-upgrades
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 配置步骤

### 1. UFW 防火墙

```bash
# 默认策略：拒绝入站，允许出站
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 允许 SSH（重要！否则会锁定自己）
sudo ufw allow 22/tcp

# 允许 HTTP/HTTPS（Web 服务器）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status verbose
```

### 2. Fail2Ban 配置

创建 `/etc/fail2ban/jail.local`：

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200
```

```bash
sudo systemctl restart fail2ban
```

### 3. SSH 安全加固

编辑 `/etc/ssh/sshd_config`：

```conf
# 禁用 Root 登录
PermitRootLogin no

# 禁用密码认证（仅允许密钥）
PasswordAuthentication no

# 限制登录尝试
MaxAuthTries 3

# 限制并发未认证连接
MaxStartups 3:50:10

# 空闲超时断开
ClientAliveInterval 300
ClientAliveCountMax 2

# 禁用不安全的认证方式
ChallengeResponseAuthentication no
UsePAM yes
```

```bash
sudo systemctl restart sshd
```

> ⚠️ 警告：禁用密码认证前，确保已配置好 SSH 密钥登录！

### 4. 自动安全更新

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

编辑 `/etc/apt/apt.conf.d/50unattended-upgrades`：

```conf
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
```

### 5. 额外加固（可选）

```bash
# 禁用不需要的服务
sudo systemctl disable cups
sudo systemctl disable avahi-daemon

# 设置文件权限
sudo chmod 700 ~/.ssh
sudo chmod 600 ~/.ssh/authorized_keys

# 限制 su 命令
sudo dpkg-statoverride --update --add root sudo 4750 /bin/su
```

## 验证安装

```bash
sudo ufw status
sudo fail2ban-client status
sudo sshd -t
sudo systemctl status unattended-upgrades
```

## 安全检查清单

- [ ] UFW 已启用，只开放必要端口
- [ ] Fail2Ban 已运行，SSH jail 已激活
- [ ] Root 登录已禁用
- [ ] 密码认证已禁用（使用密钥）
- [ ] 自动安全更新已启用
- [ ] 不需要的服务已禁用

## 适用场景

- 所有面向公网的 Linux 服务器
- VPS / 云服务器初始化
- 生产环境安全加固
- 合规性要求的基线配置
