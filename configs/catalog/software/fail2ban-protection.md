# Fail2Ban 入侵防护

## 概述

Fail2Ban 是一个入侵防护框架，通过监控系统日志检测暴力破解等恶意行为，自动封禁攻击者 IP。是 Linux 服务器安全加固的必备工具。

## 安装内容

- `fail2ban` — 入侵防护守护进程
- 配置目录：`/etc/fail2ban/`
- 日志文件：`/var/log/fail2ban.log`

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 安装后配置

### 1. 创建本地配置（不要直接修改主配置）

```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

### 2. SSH 防护配置

编辑 `/etc/fail2ban/jail.local`：

```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
```

参数说明：
- `maxretry` — 最大失败次数（5 次）
- `bantime` — 封禁时长（3600 秒 = 1 小时）
- `findtime` — 检测时间窗口（600 秒 = 10 分钟）

### 3. 渐进式封禁（可选）

```ini
[recidive]
enabled = true
logpath = /var/log/fail2ban.log
banaction = %(banaction_allports)s
bantime = 604800
findtime = 86400
maxretry = 3
```

### 4. 白名单

```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 your_trusted_ip
```

### 5. 重启服务

```bash
sudo systemctl restart fail2ban
```

## 验证安装

```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

## 常用命令

```bash
# 查看被封禁的 IP
sudo fail2ban-client status sshd

# 手动解封 IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# 查看日志
sudo tail -f /var/log/fail2ban.log
```

## 隐私说明

Fail2Ban 配置中的白名单 IP 可能包含内部网络信息，建议审查后再同步。
