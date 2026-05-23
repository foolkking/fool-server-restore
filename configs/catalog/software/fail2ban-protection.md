# Fail2Ban 入侵防护

Fail2Ban 监控系统日志，自动把连续失败的源 IP 加入防火墙黑名单。**最经典用法是防 SSH 暴力破解**——5 次密码失败 ban 1 小时。也支持 nginx 401 / postfix 认证失败 / mosquitto / 等十几种常见服务。

## 你将得到什么

- 📦 **fail2ban**
- ✅ `/etc/fail2ban/jail.local` 按表单生成（不动 jail.conf，避免被包升级覆盖）
- ✅ SSH jail 默认开启
- ✅ ban 时长 / 失败窗口 / 阈值按表单生效
- ✅ `127.0.0.1/8` 默认白名单（建议加你的运维 IP）
- ✅ 服务自动启动 + 开机自启

## 表单字段说明

### `bantime`

ban 时长。格式：`10m` / `1h` / `1d` / `1w` / `-1`（永久）。

| 值 | 适用 |
|---|---|
| `10m` | 开发测试 |
| `1h`（默认） | 一般爆破足够 |
| `1d` | 生产推荐 |
| `1w` | 高风险环境 |
| `-1` | 永久（**慎用**：动态 IP 合法用户会被误封） |

### `findtime`

失败计数窗口。窗口越短越严格。`10m` 是经典值。

### `maxretry`

`findtime` 内失败超此数则 ban。SSH 默认 5；自己常输错调到 10。

### `ssh_enabled`

强烈建议开。仅当：(1) 已禁密码认证 (2) sshd 不暴露公网（VPN 内）才考虑关。

### `ssh_port`

如已改 sshd Port，本字段同步改，否则 fail2ban 监控错端口。

### `ignoreip`

> ⚠️ **务必加你自己的运维 IP**——否则手抖 5 次就锁出去。

格式：空格分隔的 IP / CIDR：

```
127.0.0.1/8 ::1 203.0.113.42 10.0.0.0/8
```

### `destemail`

ban 时发邮件。需机器配过 MTA（postfix / msmtp）。空 = 仅写日志。

## 配置文件 / 目录速查

```
/etc/fail2ban/
├── fail2ban.conf                       # 主程序配置（不要改）
├── fail2ban.d/                          # fail2ban 自身配置 override
├── jail.conf                             # 默认 jail（不要改，被包升级覆盖）
├── jail.local                            # ← EnvForge 写这里（**主配置**）
├── jail.d/                                # 自定义 jail（**推荐放这里**，不被 Playbook 覆盖）
│   └── *.conf
├── filter.d/                              # 过滤规则（用 regex 解析日志）
│   ├── sshd.conf
│   ├── nginx-http-auth.conf
│   └── ...
├── action.d/                               # ban 动作（iptables / firewalld / mailx 等）
└── paths-*.conf                            # 各发行版日志路径

/var/lib/fail2ban/
└── fail2ban.sqlite3                       # 状态数据库（含 ban 历史）

/var/log/fail2ban.log                       # fail2ban 自身日志

# CLI
/usr/bin/fail2ban-client                   # 主命令
/usr/bin/fail2ban-regex                     # 测试 regex 匹配
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `fail2ban` | `fail2ban`（EPEL） |
| 服务 | `fail2ban` | `fail2ban` |
| 日志 backend | `systemd`（journal）/ `auto` | `systemd`（journal）/ `auto` |
| 默认 banaction | `iptables-multiport` | `firewallcmd-rich-rules`（firewalld 集成） |

EnvForge preflight 启 EPEL，跨发行版无碍。

## 常见配置模板

### 模板 A — 推荐 `/etc/fail2ban/jail.local`（生产基线）

```ini
[DEFAULT]
# 全局默认（被 jail 继承）
bantime  = 1h
findtime = 10m
maxretry = 5

# 白名单（**务必加自己 IP**）
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 203.0.113.0/24

# 监控的日志后端
backend = systemd

# 默认动作
banaction = iptables-multiport
banaction_allports = iptables-allports

# 邮件提醒
destemail = admin@example.com
sender = fail2ban@example.com
mta = sendmail
action = %(action_mwl)s              # mwl = mail with whois + log

# 累计累罚（同一 IP 反复触发，ban 时间指数增长）
bantime.increment = true
bantime.factor = 2
bantime.maxtime = 30d
bantime.rndtime = 1m

# 默认 ports 列表（按需扩展）
port = ssh,http,https

[sshd]
enabled  = true
port     = 22                         # 改非标 SSH 端口同步改这里
maxretry = 3                           # SSH 更严格（与 [DEFAULT] 不同）
findtime = 10m
bantime  = 1h
filter   = sshd

[sshd-ddos]
enabled = true
port    = 22
filter  = sshd-ddos
maxretry = 6

[nginx-http-auth]
enabled = true
filter  = nginx-http-auth
port    = http,https
logpath = /var/log/nginx/error.log
maxretry = 6

[nginx-noscript]
enabled = true
filter  = nginx-noscript
port    = http,https
logpath = /var/log/nginx/access.log
maxretry = 6

[nginx-badbots]
enabled = true
filter  = nginx-badbots
port    = http,https
logpath = /var/log/nginx/access.log
maxretry = 2

[nginx-noproxy]
enabled = true
filter  = nginx-noproxy
port    = http,https
logpath = /var/log/nginx/access.log
maxretry = 2

[postfix-sasl]
enabled = false                       # 装了 postfix 时改 true

[apache-auth]
enabled = false                       # 装了 apache 时改 true
```

应用：`sudo systemctl reload fail2ban`。

### 模板 B — RHEL / firewalld 集成

`/etc/fail2ban/jail.local` 加：

```ini
[DEFAULT]
banaction = firewallcmd-rich-rules
banaction_allports = firewallcmd-rich-rules
```

或用 firewalld 的 ipset：

```ini
banaction = firewallcmd-ipset
```

### 模板 C — 添加自定义 jail（如某 Web 应用）

`/etc/fail2ban/jail.d/myapp.conf`:

```ini
[myapp-auth]
enabled = true
port = http,https
filter = myapp-auth
logpath = /var/log/myapp/auth.log
maxretry = 5
findtime = 10m
bantime = 1h
```

`/etc/fail2ban/filter.d/myapp-auth.conf`:

```ini
[Definition]
failregex = ^.*Failed login for user .* from <HOST>.*$
            ^.*Invalid token from <HOST>.*$
ignoreregex =
```

测试 regex：

```bash
sudo fail2ban-regex /var/log/myapp/auth.log /etc/fail2ban/filter.d/myapp-auth.conf
```

### 模板 D — Cloudflare / DigitalOcean 等 API 集成（云上自动屏蔽）

```ini
[DEFAULT]
action_cf = cloudflare[cfuser="you@example.com", cftoken="api-key"]
action = %(action_)s
         %(action_cf)s
```

需要 `/etc/fail2ban/action.d/cloudflare.conf`（fail2ban 自带）。Cloudflare API key 写到独立文件 + 600 权限。

### 模板 E — 命令行管理速查

```bash
# 看所有 jail
sudo fail2ban-client status

# 看具体 jail
sudo fail2ban-client status sshd
# Status for the jail: sshd
# |- Filter
# |  |- Currently failed: 2
# |  |- Total failed:     45
# |  `- File list:        ...
# `- Actions
#    |- Currently banned: 3
#    |- Total banned:     127
#    `- Banned IP list:   1.2.3.4 5.6.7.8 9.10.11.12

# 手动 ban / unban
sudo fail2ban-client set sshd banip 1.2.3.4
sudo fail2ban-client set sshd unbanip 1.2.3.4

# 重载配置（不重启）
sudo fail2ban-client reload

# 测试 regex
sudo fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf

# 看哪些 ban 是 fail2ban 加的（iptables 模式）
sudo iptables -L -n | grep f2b
```

### 模板 F — Whitelist 长 IP 段不动 fail2ban

```bash
# 在 jail.local [DEFAULT] 里
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8

# 或动态添加（不持久化，重启失效）
sudo fail2ban-client set sshd addignoreip 192.168.1.100

# 持久化：改 jail.local 后 reload
```

### 模板 G — 给 ban 加更智能的 hook（Slack / 钉钉通知）

`/etc/fail2ban/action.d/notify-slack.conf`:

```ini
[Definition]
actionban = curl -X POST -H 'Content-Type: application/json' \
              -d '{"text":"🚨 fail2ban: <ip> banned by <name> on '$(hostname)'"}' \
              <slack_webhook>
actionunban = curl -X POST -H 'Content-Type: application/json' \
                -d '{"text":"✅ fail2ban: <ip> unbanned by <name>"}' \
                <slack_webhook>

[Init]
slack_webhook = https://hooks.slack.com/services/T.../B.../...
```

`jail.local` 加：

```ini
[sshd]
action = %(action_)s
         notify-slack
```

## 关键参数调优速查

### Backend 选择

| Backend | 适用 |
|---|---|
| `systemd` | 现代发行版（systemd 系），从 journal 读日志，最可靠 |
| `auto`（默认） | 自动选 polling / pyinotify / gamin |
| `pyinotify` | 文件 inotify 监控 |
| `polling` | fallback，效率低 |

```ini
[DEFAULT]
backend = systemd
```

### 累计累罚

```ini
bantime.increment = true                    # 重复犯 ban 时间指数增长
bantime.factor = 2                           # 每次 × 2
bantime.maxtime = 30d                        # 上限 30 天
bantime.rndtime = 1m                         # 加随机抖动避免同时解封
```

第一次 1h，第二次 2h，第三次 4h... 第 9 次到 30d 上限。

### 性能（高流量服务器）

```ini
[DEFAULT]
# 减少日志读取频率
findtime = 60m                               # 加大窗口
maxretry = 10                                 # 阈值放宽

# 不要给 nginx-noscript 设太低的 maxretry——爬虫一会儿就触发，IP 池太大
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `fail2ban` 包 | 默认仓库 | EPEL ✅ |
| 默认 banaction | `iptables-multiport` | `firewallcmd-rich-rules`（firewalld） |
| systemd journal | 支持 | 支持 |
| nginx 默认日志路径 | `/var/log/nginx/` | 同 |

EnvForge preflight 启 EPEL。

## 与其它 catalog 项的配合

- **`firewall-baseline`** / **`firewalld`** — 防火墙底层，fail2ban 用其 API 加规则
- **`ssh-hardening`** — 配合 fail2ban + SSH 加固双保险
- **`security-baseline` combo** — 自动启用 fail2ban + UFW + 自动安全更新（终极组合）
- **`nginx-web-service`** — nginx-http-auth jail 防 nginx basic auth 爆破
- **`mosquitto-mqtt`** — fail2ban 可加 jail 防 MQTT 暴破

## 排错

### 服务起不来

```bash
sudo journalctl -u fail2ban -n 50

# 99% 是 jail.local 语法错
sudo fail2ban-client -t           # 测试配置

# 常见
# 1. logpath 文件不存在
# 2. filter.d/xxx.conf 引用错
# 3. systemd backend 但 journald 没启
```

### `Found no accessible config files`

包没装齐：

```bash
sudo apt-get install --reinstall fail2ban       # Ubuntu
sudo dnf reinstall fail2ban                      # RHEL
```

### 不生效（IP 应该被 ban 但没有）

```bash
# 1. 测 regex 是否匹配
sudo fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf

# 2. 看 fail2ban 自己的日志
sudo tail -50 /var/log/fail2ban.log

# 3. SSH 改了端口但忘改 jail.local
grep ^port /etc/fail2ban/jail.local

# 4. jail enabled?
sudo fail2ban-client status
```

### 把自己 ban 了

应急方案：

```bash
# 方案 1：从云控制台 web ssh / 物理 console 进
sudo fail2ban-client set sshd unbanip MY_IP
sudo iptables -D INPUT -s MY_IP -j REJECT          # iptables 备用

# 方案 2：临时关 fail2ban
sudo systemctl stop fail2ban

# 方案 3：备用通道（务必提前留）
# - 云厂商 web ssh
# - 第二个用户 + 不同密钥
# - VPN 进入
```

**永远留备用通道**——不要依赖单一 SSH 密钥 + fail2ban。

### Bantime 增长后无法手动 unban

```bash
# 连续累罚的 ban 数据在 SQLite 里
sudo sqlite3 /var/lib/fail2ban/fail2ban.sqlite3 \
    "DELETE FROM bantimerecord WHERE ip='1.2.3.4';"
sudo systemctl restart fail2ban
```

### `WARNING [sshd] Determined action ... requires <name>`

action 配置语法错。检查 `action.d/` 下的对应文件。

### nginx-noscript 误伤合法爬虫（Google bot）

调高 maxretry 或加 ignoreregex：

```ini
[nginx-noscript]
maxretry = 20
ignoreregex = .*(googlebot|bingbot).*
```

### systemd backend 时 logpath 报错

systemd backend 用 journal，**不需要 logpath**：

```ini
[sshd]
backend = systemd
# logpath = /var/log/auth.log         ← 删掉这行
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active fail2ban

# 2. 列 jail
sudo fail2ban-client status

# 3. SSH jail 状态
sudo fail2ban-client status sshd

# 4. 配置语法
sudo fail2ban-client -t

# 5. 看日志
sudo tail -20 /var/log/fail2ban.log

# 6. iptables / firewalld 规则
sudo iptables -L -n | grep f2b           # iptables 模式
sudo firewall-cmd --list-rich-rules      # firewalld 模式
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`jail.local` 每次按表单值重写**——你**手动加的 jail 在 jail.local 里会丢**！

**保留扩展**：把自定义 jail 放 `/etc/fail2ban/jail.d/myextra.conf`——fail2ban 自动 include 这个目录，本 Playbook 不动。

## ⚠️ 敏感性

**review** — fail2ban 配错最大风险是**把自己锁出去**。

强制：

1. **务必 ignoreip 加自己 IP**
2. **留备用通道**（云控制台 / 物理控制台 / VPN）
3. 累计累罚启用前先用低 bantime 测试

## 隐私说明

- ban 列表本地存储 `/var/lib/fail2ban/fail2ban.sqlite3`——**不上传不同步**
- 邮件提醒含被 ban 的 IP（含 whois 信息，配 `action_mwl` 时）
- fail2ban 日志（`/var/log/fail2ban.log`）含每次 ban / unban 的 IP / jail / time
- 第三方 hook（如 Slack / Cloudflare）会把 IP 发给该服务方
