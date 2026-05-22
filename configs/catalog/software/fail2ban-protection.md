# Fail2Ban 入侵防护

Fail2Ban 监控系统日志，自动把连续失败的源 IP 加入防火墙黑名单。最经典的用法
是防 SSH 暴力破解——5 次密码失败就把对方 ban 1 小时。也支持 nginx 401、
postfix 认证失败等十几种常见服务。

## 你将得到什么

- 📦 **fail2ban**
- ✅ `/etc/fail2ban/jail.local` 按表单生成（不动 jail.conf，避免被包升级覆盖）
- ✅ SSH jail 默认开启（最常用的保护）
- ✅ ban 时长 / 失败窗口 / 阈值按表单生效
- ✅ 你自己的 IP 默认在白名单（`127.0.0.1/8 ::1`，但建议加上你的运维机 IP）
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### Ban 时长 `bantime`

源 IP 触发规则后被禁多久。从松到紧：
- **10 分钟**：开发测试，错了能很快试回
- **1 小时**：默认，应付一般爆破足够
- **1 天**：生产环境推荐
- **1 周**：高风险环境
- **永久**：到手动 unban 才解封。慎用！动态 IP 的合法用户可能会被误封

### 失败计数窗口 `findtime`

在这段时间内统计失败次数。窗口越短越严格但容错越少。**10 分钟**是经典平衡点。

### 失败次数阈值 `maxretry`

`findtime` 窗口内失败超过此数就 ban。SSH 默认 5 次（一般够），如果常自己输错密码先调到 10。

### 启用 SSH 保护 `ssh_enabled`

强烈建议开启，是 fail2ban 最常用的功能。关闭仅当：
- 你已经把 sshd 改成密钥认证、禁用密码（这种情况爆破已经无意义）
- 你完全靠 VPN 进入，sshd 不暴露公网

### SSH 端口 `ssh_port`

如果你已经改过 sshd 的 Port，这里要同步改。否则 fail2ban 监控错端口，规则不生效。

### 白名单 IP/CIDR `ignoreip`

**最重要的字段——务必加上你自己的运维 IP**，否则手抖输错密码 5 次就把自己锁出去了。

格式：空格分隔的 IP 或 CIDR：
```
127.0.0.1/8 ::1 203.0.113.42 10.0.0.0/8
```

### 邮件提醒 `destemail`

触发 ban 时发邮件给这个地址。需要机器上已经配好 MTA（sendmail / postfix / msmtp）。
留空则不发邮件，只写日志。

## 安装后

### 看哪些 IP 被 ban 了

```bash
sudo fail2ban-client status sshd
# 显示当前被 ban 的 IP 列表 + 失败次数

sudo fail2ban-client status
# 列出所有启用的 jail
```

### 手动 unban / ban

```bash
# 解封某个 IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# 手动 ban 某个 IP
sudo fail2ban-client set sshd banip 1.2.3.4
```

### 启用更多 jail（按需）

`/etc/fail2ban/jail.local` 里追加：

```ini
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log

[nginx-noscript]
enabled = true
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 6

[postfix-sasl]
enabled = true

[apache-auth]
enabled = true
```

每个 jail 用的过滤规则在 `/etc/fail2ban/filter.d/` 里能找到。改完 `sudo systemctl reload fail2ban`。

### 测试规则（不实际 ban）

```bash
sudo fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf
# 看哪些行匹配了规则
```

## ⚠️ 敏感性

**review** — fail2ban 配错最大的风险是**把自己锁出去**。两个保险：
1. 务必把自己 IP 加 `ignoreip`
2. 留一个备用通道（云控制台 web ssh / 物理控制台），万一锁了能手动 unban

## 验证安装

```bash
systemctl status fail2ban --no-pager
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

## 排错

- **服务起不来** — 看 `sudo journalctl -u fail2ban -n 50`。最常见是 `jail.local` 语法错误。
- **`Found no accessible config files`** — 包没装好，重跑 Playbook。
- **不生效** — 用 `fail2ban-regex` 测试规则是否能匹配你的日志格式。SSH 改了端口但忘了改 jail.local 是经典错误。
- **跨发行版**：`fail2ban` 在 RHEL 上需要 EPEL 仓库（EnvForge preflight 已自动启用）。
- **SystemD vs file backend** — 新系统都用 `backend = systemd`（Playbook 默认），从 systemd journal 读日志更可靠。如果不工作（比如某些 minimal 系统没装 systemd），改回 `backend = auto`。

## 多次运行

`installMode: skip-existing`。每次运行会重新生成 `jail.local`，**手动加的其它 jail 会被覆盖**。如果你扩展了配置，建议把扩展放到 `/etc/fail2ban/jail.d/myextra.conf` 里——fail2ban 自动 include 这个目录，不会被本 Playbook 覆盖。

## 隐私说明

- ban 列表本地存储在 `/var/lib/fail2ban/`，不上传不同步。
- 邮件提醒会把被 ban 的 IP 发给你设定的邮箱。
