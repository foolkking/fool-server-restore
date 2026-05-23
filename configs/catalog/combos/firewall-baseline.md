# 防火墙基线（UFW / firewalld 自适应）

公网 Linux 服务器开机第一件事——配防火墙。本组合按发行版自动选 **UFW**（Ubuntu/Debian）或 **firewalld**（RHEL/Anolis）：默认拒绝入站、放行 22/80/443、SSH 速率限制、记录拒绝日志。

## 你将得到什么

- ✅ 入站默认 `deny`，仅放行 22 / 80 / 443
- ✅ 出站默认 `allow`（允许更新、外部 API）
- ✅ SSH 端口启用速率限制（每秒 6 次，防自动爆破）
- ✅ 拒绝包写日志（`/var/log/ufw.log` 或 firewalld 日志）
- ✅ 自动检测发行版选择 `ufw`（debian-family）或 `firewalld`（rhel-family）

## 表单字段说明

### `extra_ports`

逗号分隔，格式 `<port>/<proto>`。如 `8080/tcp,51820/udp`。

### `ssh_port`

如已改 sshd 端口，**必须同步改这里**——否则 fail2ban + UFW 会挡你自己。

### `enable_rate_limit`

启用 SSH 速率限制（UFW 自带 `limit` 规则；firewalld 用 rich rule）。**强烈建议开**。

### `log_denied`

记录被 drop 的包到日志。debug 用。生产可关（日志量大）。

## 配置文件 / 目录速查

```
# Ubuntu/Debian (UFW)
/etc/default/ufw                          # 主配置（默认策略 / IPv6 / log level）
/etc/ufw/
├── before.rules / after.rules             # 自定义 iptables 规则
├── before6.rules / after6.rules            # IPv6
├── user.rules                              # ufw 命令生成的规则
├── ufw.conf                                # ENABLED=yes / no
└── applications.d/                          # 预定义 app 规则
/var/log/ufw.log                            # 拒绝包日志

# RHEL/Anolis (firewalld) — 见 firewalld.md
/etc/firewalld/
├── firewalld.conf
├── zones/
└── ...
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 防火墙工具 | `ufw` | `firewalld` |
| 包名 | `ufw` | `firewalld`（默认装） |
| 服务 | `ufw.service` | `firewalld.service` |
| 默认状态 | 不启用（需 `ufw enable`） | 启用 |

> ⚠️ **不要同时启 UFW 和 firewalld**——会互相覆盖规则。EnvForge 按发行版二选一。

## 常见配置模板

### 模板 A — UFW 速查

```bash
# 基础
sudo ufw status verbose
sudo ufw show added                            # 看 pending 规则
sudo ufw enable                                 # 启用（确认 SSH 已开！）
sudo ufw disable

# 默认策略
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 加规则
sudo ufw allow 22/tcp
sudo ufw allow ssh                              # 等价（按 service 名）
sudo ufw allow 80,443/tcp                        # 多端口
sudo ufw allow 3000:3010/tcp                     # 端口范围
sudo ufw allow from 10.0.0.0/8 to any port 3306  # 限源 IP
sudo ufw deny from 1.2.3.4

# SSH 速率限制（默认每秒 6 次）
sudo ufw limit 22/tcp                            # 自动黑名单短期连接

# 删规则
sudo ufw delete allow 22/tcp
sudo ufw delete <NUM>                             # 按 status numbered 编号

# 顺序敏感
sudo ufw status numbered                          # 看序号
sudo ufw insert 1 deny from 1.2.3.4               # 插到首位

# 重置
sudo ufw reset
```

### 模板 B — UFW 推荐基线（EnvForge 已自动）

```bash
# 默认策略
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw default deny routed                       # 不当路由用

# 必备
sudo ufw limit 22/tcp                               # SSH 速率限制
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 启用
sudo ufw logging on                                  # 记日志
sudo ufw enable
sudo ufw status verbose
```

### 模板 C — firewalld 速查

见 `firewalld.md`（同 catalog 单独项）。EnvForge Playbook 会自动配 SSH / HTTP / HTTPS。

### 模板 D — 自定义服务规则（避免误关业务）

```bash
# Ubuntu — 看应用预定义
sudo ufw app list

# 自定义应用文件 /etc/ufw/applications.d/myapp
[myapp]
title=My Application
description=My internal app
ports=3000,3001/tcp

# 用
sudo ufw app update myapp
sudo ufw allow myapp
```

## 关键参数调优速查

### 速率限制（防爆破）

```bash
# UFW limit：6 次/30s 内同 IP 来同端口 → 临时 ban
sudo ufw limit 22/tcp

# 自定义 iptables（更细粒度）
# /etc/ufw/before.rules
# -A ufw-before-input -p tcp --dport 22 -m state --state NEW \
#     -m recent --update --seconds 60 --hitcount 4 --name SSH -j DROP
```

### 日志

```bash
# 调日志级别
sudo ufw logging low                              # 仅丢的（默认）
sudo ufw logging medium                            # + 通过的
sudo ufw logging high                              # + 详细
sudo ufw logging full                              # 全部
```

`/var/log/ufw.log` 可用 logrotate 自动归档。

### 默认策略陷阱

```bash
# 错：先 enable，规则后加 → SSH 断
sudo ufw enable                                    # 此时已 deny incoming
sudo ufw allow 22                                   # 太晚

# 对：先开规则再 enable
sudo ufw allow 22/tcp
sudo ufw enable
```

EnvForge Playbook 自动遵循正确顺序。

## 跨发行版兼容

| 发行版 | 默认防火墙 | EnvForge 行为 |
|---|---|---|
| Ubuntu 22 / 24 | UFW | 装 + 配 UFW |
| Debian 12 | UFW（需装） | 装 + 配 UFW |
| RHEL 9 / Anolis 9 | firewalld（默认装） | 配 firewalld |
| Rocky / Alma 9 | firewalld | 同 |

## 与其它 catalog 项的配合

- **`firewalld`** — RHEL 系单独 Playbook，本 combo 已含
- **`fail2ban-protection`** — fail2ban 通过 UFW / firewalld 添加 ban 规则
- **`ssh-hardening`** — 改 SSH 端口前先在防火墙加新端口
- **`security-baseline`** combo — 包含本 combo + fail2ban + ssh-hardening + 自动安全更新

## 排错

### 改 ssh_port 后连不上

**在改 sshd_config 前先在防火墙加新端口**：

```bash
sudo ufw allow 22222/tcp
sudo firewall-cmd --add-port=22222/tcp --permanent --reload
# 再改 sshd
```

### `ufw enable` 后 SSH 断

确认 22 已 allow：

```bash
sudo ufw show added | grep 22
# 没有就先加再 enable
```

应急：通过云控制台 web ssh 进入 → `sudo ufw disable`。

### Docker 容器不通外网

见 `firewalld.md` / `docker-host-profile.md`：UFW + Docker 共存需特殊配置。常见解决：

```bash
# /etc/ufw/after.rules 加（Docker iptables 规则不被 UFW 覆盖）
*nat
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING ! -o docker0 -s 172.17.0.0/16 -j MASQUERADE
COMMIT
```

或用 [ufw-docker](https://github.com/chaifeng/ufw-docker) 工具自动处理。

### 规则不生效

```bash
# 1. UFW enabled?
sudo ufw status

# 2. 规则顺序（UFW 按 user.rules 顺序匹配）
sudo ufw status numbered

# 3. iptables 实际规则
sudo iptables -L INPUT -n -v
```

### IPv6 没加规则

UFW 默认同时管 IPv4 + IPv6。如果只 IPv4 规则：

```bash
sudo nano /etc/default/ufw
IPV6=yes
sudo ufw disable && sudo ufw enable
```

## 验证

```bash
# Ubuntu/Debian (UFW)
sudo ufw status verbose
sudo ufw show added

# RHEL/Anolis (firewalld)
sudo firewall-cmd --list-all
sudo firewall-cmd --list-services

# 通用：iptables 实际规则
sudo iptables -L INPUT -n -v | head -30

# 测试 SSH 仍可达
ssh -o ConnectTimeout=5 user@server
```

## 多次运行

`installMode: replace-existing`。**每次按表单值重置规则**——你**手动加的规则会丢失**。要保留：

- 把自定义规则放 `/etc/ufw/applications.d/` + 用 `ufw allow myapp`（UFW）
- 或用 firewalld zone / rich rules + Playbook 不动 zone

## ⚠️ 敏感性

**privileged** — 防火墙 = 网络层最重要的安全屏障。

强制：

1. **永远先确认 SSH 已加白名单再 enable**
2. **留备用通道**（云控制台 / 物理 console / VPN）
3. 改 ssh_port 时先加新端口再改 sshd
4. 速率限制启用（防爆破）
5. Docker / K8s 共存需特殊处理（见排错）

## 隐私说明

- 端口暴露情况可能透露服务结构（用什么数据库 / dev port 等）——公开分享防火墙规则前脱敏
- 拒绝包日志（`/var/log/ufw.log`）含**源 IP / 目的端口**——按合规需求保留
- UFW / firewalld 不发遥测
- 规则本地存储 `/etc/ufw/` 或 `/etc/firewalld/`，不上传不同步
