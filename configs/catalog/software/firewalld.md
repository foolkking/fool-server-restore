# firewalld 动态防火墙

firewalld 是 RHEL / CentOS / Fedora / Anolis / Alma / Rocky 系统**默认**的防火墙管理器（取代 iptables 的高层 API）。和 UFW 不同：firewalld 用 **zone** 概念组织规则——同台机器不同网卡可属于不同 zone。

> ⚠️ **UFW 和 firewalld 不能同时启用**。RHEL 系用 firewalld，Ubuntu 用 UFW（`firewall-baseline` Playbook）。

## 你将得到什么

- 📦 **firewalld**
- ✅ 服务自动启动 + 开机自启
- ✅ 默认 zone 是 `public`：允许 SSH，拒绝其它入站
- ✅ SSH 服务已加入默认 zone 白名单
- ✅ NetworkManager 集成（多网卡切 zone 自动）

## 配置文件 / 目录速查

```
/etc/firewalld/
├── firewalld.conf                       # 主配置（默认 zone / 日志级别）
├── zones/                                 # zone 定义（XML）
│   ├── public.xml                          # 公网 zone（默认）
│   ├── trusted.xml                          # 完全信任（all allow）
│   ├── internal.xml                          # 内网
│   ├── dmz.xml                                # DMZ
│   ├── work.xml / home.xml                    # 工作 / 家庭
│   ├── drop.xml / block.xml                    # 完全拒绝
│   └── external.xml                            # NAT 出口
├── services/                               # 自定义 service 定义
├── ipsets/                                  # IP set
└── helpers/                                  # connection tracking helpers

/usr/lib/firewalld/                         # 系统预设（不要改）
├── zones/
└── services/                                 # 大量预定义 service（http / ssh / samba / nfs 等）

# CLI
/usr/bin/firewall-cmd                        # 主命令
/usr/bin/firewall-config                      # GUI（仅桌面）
```

| 项 | RHEL/Anolis 9 | Ubuntu/Debian |
|---|---|---|
| 包名 | `firewalld`（默认装） | `firewalld`（替代 UFW） |
| 默认状态 | 启用 | 不启用（用 UFW） |
| 后端 | nftables（RHEL 9 默认） | nftables 或 iptables |

## 表单字段说明

### `default_zone`

通常 `public`（默认）。其它 zone 见模板 D。

### `allow_services`

逗号分隔的 service 名（`firewall-cmd --get-services` 列所有）。常用：`ssh,http,https,samba`。

### `allow_ports`

逗号分隔的端口，格式 `<port>/<proto>`。如 `8080/tcp,51820/udp`。

### `enable_masquerade`

NAT 出口（让本机当路由器 / VPN gateway 用）。默认关。

## 常见配置模板

### 模板 A — 看当前规则

```bash
# 默认 zone
sudo firewall-cmd --get-default-zone           # 应输出 public

# 当前 zone 详情
sudo firewall-cmd --list-all
# public (active)
#   target: default
#   icmp-block-inversion: no
#   interfaces:
#   sources:
#   services: cockpit dhcpv6-client ssh
#   ports:
#   protocols:
#   forward: yes
#   masquerade: no
#   forward-ports:
#   source-ports:
#   icmp-blocks:
#   rich rules:

# 列所有 zone
sudo firewall-cmd --get-zones
sudo firewall-cmd --get-active-zones

# 看具体 zone
sudo firewall-cmd --zone=public --list-all
```

### 模板 B — 开放端口 / 服务

```bash
# 按 service 名（推荐，自动包含端口和协议）
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=samba
sudo firewall-cmd --reload

# 按端口
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=51820/udp
sudo firewall-cmd --permanent --add-port=3000-3010/tcp     # 端口范围
sudo firewall-cmd --reload

# 删除
sudo firewall-cmd --permanent --remove-port=8080/tcp
sudo firewall-cmd --reload

# 看支持哪些 service
sudo firewall-cmd --get-services | tr ' ' '\n' | head -30
```

### 模板 C — Rich rules（限源 IP / 高级规则）

```bash
# 仅允许 1.2.3.4 访问 3306
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="1.2.3.4" port port=3306 protocol=tcp accept'

# 仅允许 10.0.0.0/8 访问 SSH
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" service name=ssh accept'

# 拒绝某 IP 全部
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="9.9.9.9" reject'

# 限速（每秒最多 10 个新连接到 80）
sudo firewall-cmd --permanent --add-rich-rule='rule service name=http accept limit value="10/s"'

# 端口转发
sudo firewall-cmd --permanent --add-rich-rule='rule family=ipv4 forward-port port=80 protocol=tcp to-port=8080'

sudo firewall-cmd --reload
```

### 模板 D — Zone 切换（多网卡场景）

```bash
# 看每个网卡的 zone
sudo firewall-cmd --get-active-zones

# 把 eth1 划到 internal zone（更宽松规则）
sudo firewall-cmd --permanent --zone=internal --change-interface=eth1

# 临时给 docker0 划 trusted（让 docker 容器无障碍出网）
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0

sudo firewall-cmd --reload
```

zone 信任级别（从松到严）：

| Zone | 适用 |
|---|---|
| `trusted` | 完全信任（all allow） |
| `home` | 家庭网络 |
| `internal` | 内部网络 |
| `work` | 办公网络 |
| `public`（默认） | 公网，仅显式开放服务可访问 |
| `external` | NAT 出口 |
| `dmz` | DMZ 网段 |
| `block` | 完全 block，仅显式 |
| `drop` | 完全 drop（不响应 ICMP） |

### 模板 E — 临时 vs 持久化（**关键区别**）

```bash
# 不带 --permanent 立即生效，但重启后失效
sudo firewall-cmd --add-port=8080/tcp

# 带 --permanent 持久化，但需 reload 才生效
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# 工作流：先临时测试 → 测通后 permanent
sudo firewall-cmd --add-port=8080/tcp                # 临时
# ... 测试 OK ...
sudo firewall-cmd --permanent --add-port=8080/tcp    # 持久化
sudo firewall-cmd --reload

# 一次性把当前 runtime 全部固化
sudo firewall-cmd --runtime-to-permanent
```

### 模板 F — 与 Docker 共存（关键）

Docker 启动时会写大量 iptables 规则到 `DOCKER` 链。firewalld 默认会刷新 iptables，导致 Docker 规则丢失，容器无法访问外网。**两种解决方案**：

#### 方案 1（推荐）：让 firewalld 不去碰 docker 接口

```bash
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0
sudo systemctl restart firewalld
sudo systemctl restart docker
```

#### 方案 2：禁用 Docker 自管 iptables

```json
// /etc/docker/daemon.json
{
  "iptables": false
}
```

然后手动写所有规则——**不推荐**，太麻烦。

### 模板 G — IP set（批量管理 IP 列表）

```bash
# 创建 ipset
sudo firewall-cmd --permanent --new-ipset=blacklist --type=hash:ip

# 添加 IP
sudo firewall-cmd --permanent --ipset=blacklist --add-entry=1.2.3.4
sudo firewall-cmd --permanent --ipset=blacklist --add-entry=5.6.7.8

# 用 rich rule 引用 ipset
sudo firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source ipset=blacklist drop'

sudo firewall-cmd --reload

# 查看
sudo firewall-cmd --permanent --ipset=blacklist --get-entries
```

### 模板 H — 自定义 service 定义

`/etc/firewalld/services/myapp.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<service>
  <short>MyApp</short>
  <description>My custom application</description>
  <port protocol="tcp" port="3000"/>
  <port protocol="tcp" port="3001"/>
  <port protocol="udp" port="3000"/>
</service>
```

```bash
sudo firewall-cmd --permanent --add-service=myapp
sudo firewall-cmd --reload
```

之后 `firewall-cmd --get-services` 可见 `myapp`。

## 关键参数调优速查

### 日志

```ini
# /etc/firewalld/firewalld.conf
LogDenied=all                              # 记录所有 drop 包到 /var/log/messages
# 选项: off / unicast / broadcast / multicast / all
```

```bash
sudo firewall-cmd --set-log-denied=all
```

### Backend

```ini
# /etc/firewalld/firewalld.conf
FirewallBackend=nftables                   # nftables（默认 RHEL 9）
# FirewallBackend=iptables                  # iptables（兼容老应用）
```

切换需重启 firewalld。

### 性能

| 场景 | 建议 |
|---|---|
| 大量 rich rules（> 100 条） | 改 ipset + 一条 rule 引用 ipset |
| 高频规则变更 | 用 firewalld API（D-Bus）而非 CLI |

## 跨发行版兼容

| 项 | RHEL/Anolis 9 | Ubuntu/Debian |
|---|---|---|
| `firewalld` 包 | 默认装 | `apt install firewalld`（替代 UFW） |
| 默认启用 | ✅ | ❌（用 UFW） |
| 后端 | nftables | nftables |
| systemd unit | `firewalld.service` | `firewalld.service` |

> Ubuntu 装 firewalld 需先关 UFW：`sudo systemctl disable --now ufw`。

## 与其它 catalog 项的配合

- **`firewall-baseline` (UFW)** — **互斥**！RHEL 用 firewalld，Ubuntu 用 UFW（不要同时启用）
- **`fail2ban-protection`** — fail2ban 通过 firewalld 的 `firewallcmd-rich-rules` 加 ban 规则（模板 B）
- **`docker-host-profile`** — 见模板 F 处理 docker 共存
- **`wireguard-vpn` / `openvpn-server`** — 需开 51820/UDP 或 1194/UDP

## 排错

### `Failed to start firewalld`

通常是 iptables-services 在跑：

```bash
sudo systemctl disable --now iptables 2>/dev/null
sudo systemctl disable --now ip6tables 2>/dev/null
sudo systemctl restart firewalld
```

### 规则不生效

```bash
# 99% 是忘了 --permanent 或 --reload
sudo firewall-cmd --permanent --add-port=8080/tcp     # 持久化
sudo firewall-cmd --reload                             # 生效
```

### 重启后规则丢失

只加了 runtime 没加 permanent：

```bash
sudo firewall-cmd --runtime-to-permanent              # 立刻固化所有 runtime
```

### Docker 容器突然不通外网

firewalld 重启后 DOCKER 链消失：

```bash
# 临时
sudo systemctl restart docker

# 永久（模板 F）
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0
sudo systemctl restart firewalld
sudo systemctl restart docker
```

### 已加 service 但还是不通

```bash
# 1. 看 zone
sudo firewall-cmd --list-all

# 2. 入站接口在哪个 zone（多网卡）
sudo firewall-cmd --get-active-zones

# 3. 服务真的添加了？
sudo firewall-cmd --list-services | grep my-svc

# 4. nftables / iptables 实际规则
sudo nft list ruleset | head -30
sudo iptables -L INPUT -n | head
```

### 把自己锁出去

应急：

```bash
# 云控制台 web ssh / 物理 console
sudo systemctl stop firewalld

# 改完后
sudo systemctl start firewalld
```

### LogDenied 日志在哪

```bash
sudo tail -f /var/log/messages | grep -i firewalld         # RHEL
sudo journalctl -u firewalld -n 50

# 或单独的 kernel log
sudo dmesg | grep FINAL_REJECT
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active firewalld
sudo firewall-cmd --state                              # running

# 2. 默认 zone
sudo firewall-cmd --get-default-zone

# 3. 当前规则
sudo firewall-cmd --list-all

# 4. 关键服务在白名单
sudo firewall-cmd --list-services | grep ssh           # 应有 ssh

# 5. nftables 实际规则（底层）
sudo nft list ruleset | head -30
```

## 多次运行

`installMode: skip-existing`。包不重装。**SSH 始终在白名单**（防自锁）。其他规则仅在 runtime / permanent 缺失时添加。

## ⚠️ 敏感性

**privileged** — 防火墙是网络层最重要的安全屏障。

强制：

1. **永远先确认 SSH 已开**（EnvForge 自动加），再加其它规则
2. 公网机器默认 zone 用 `public`，仅显式开放服务
3. **`--reload` 不会断现有连接**——比 systemctl restart 安全
4. Docker 用 trusted zone 加接口，不要 disable docker 的 iptables

## 隐私说明

- 防火墙规则 / ipset 本地存储 `/etc/firewalld/`，不上传不同步
- LogDenied 启用后会记录所有被拒绝包的源 IP / 端口到 `/var/log/messages`——按合规处理
- firewalld 通过 D-Bus 暴露管理 API——root 可访问，不暴露到网络
