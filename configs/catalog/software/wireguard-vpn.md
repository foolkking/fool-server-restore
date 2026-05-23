# WireGuard VPN 服务器

WireGuard 是现代 VPN 协议——**比 OpenVPN 配置简单 100×、性能强 3-10×、代码量少 50×**。Linux 内核内置（5.6+），无用户空间组件。EnvForge 把目标机器配成 WireGuard 服务器，生成密钥、写好接口配置、开启 IP 转发。客户端 peer 在服务跑起来后单独添加。

## 你将得到什么

- ✅ **wireguard** + **wireguard-tools**
- ✅ 服务端密钥对生成在 `/etc/wireguard/server_{private,public}.key`（仅 root 可读）
- ✅ `/etc/wireguard/wg0.conf` 写好接口（地址、端口、PostUp/PostDown NAT 规则）
- ✅ `net.ipv4.ip_forward=1` 持久化
- ✅ `wg-quick@wg0.service` 自动启动 + 开机自启

## 表单字段说明

### `listen_port`

UDP 端口，默认 51820。建议改非标（35821 / 42173 等）减少扫描，客户端配置同步改。

### `vpn_subnet` / `server_address`

VPN 内部私有网段。**不能与机器现有网卡 IP 冲突**——例如内网网卡 192.168.1.x，VPN 选 10.10.0.0/24。

服务端 IP 是子网首个地址（一般 .1）。

### `dns_servers`

客户端连上后用的 DNS：

| 值 | 适用 |
|---|---|
| `1.1.1.1` | Cloudflare，最快 |
| `8.8.8.8` | Google |
| `223.5.5.5` | 阿里 DNS（国内） |
| 内网 DNS | VPN 客户端要解析内网域名 |

### `enable_ip_forward`

| 值 | 行为 |
|---|---|
| ✅ 开启（默认） | **全流量 VPN**——客户端所有流量经服务器到外网（科学上网 / 全局代理） |
| ❌ 关闭 | **Split tunnel**——客户端只能访问 VPN 子网内资源（典型企业 VPN） |

## 配置文件 / 目录速查

```
/etc/wireguard/
├── wg0.conf                        # ← 主配置（接口 + 所有 peer）
├── server_private.key              # 服务端私钥（**仅 root**，权限 0600）
├── server_public.key                # 服务端公钥（给客户端用）
├── clients/                         # 推荐的客户端配置存档目录
│   ├── alice.conf
│   └── bob.conf
└── *.psk                             # 预共享密钥（可选，每 peer 一个，加双重保护）

# 内核接口
ip link show wg0                      # 接口状态
ip addr show wg0                       # IP 地址
wg show                                # WireGuard 状态（peer 握手时间 / 流量）

# Sysctl
/etc/sysctl.d/99-envforge-wireguard.conf    # ip_forward=1

# systemd
/lib/systemd/system/wg-quick@.service        # 模板化 unit
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `wireguard` 包 | 默认仓库（22.04+） | EPEL ✅ |
| `wireguard-tools` 包 | 默认 | EPEL ✅ |
| 内核模块 | 内置（5.6+） | 内置（5.14 内核） |
| 安装位置 | `/usr/bin/wg` `wg-quick` | `/usr/bin/wg` `wg-quick` |

## 常见配置模板

### 模板 A — 推荐 `/etc/wireguard/wg0.conf`（服务端）

```ini
[Interface]
PrivateKey = <SERVER_PRIVATE_KEY>
Address = 10.10.0.1/24
ListenPort = 51820

# 启用 NAT + IP forward（客户端走 wg0 出 eth0）
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# 保存路由表（可选）
SaveConfig = false

# Peer 区段（每个客户端一段）
[Peer]
# alice's laptop
PublicKey = <ALICE_PUBLIC_KEY>
PresharedKey = <OPTIONAL_PSK>            # 可选：增加抗量子破解
AllowedIPs = 10.10.0.2/32                 # 仅这一个 IP 走给该 peer

[Peer]
# bob's phone
PublicKey = <BOB_PUBLIC_KEY>
AllowedIPs = 10.10.0.3/32
```

> **WAN 接口名识别**：默认 `eth0`。云厂商 / 不同发行版可能是 `ens3` `enp0s3` `eno1`。看：
>
> ```bash
> ip route | awk '/default/ {print $5}'
> ```
>
> EnvForge Playbook 自动检测并替换 `eth0`。

### 模板 B — 添加客户端 peer（完整流程）

#### 1. 客户端生成密钥（本机）

**Linux 客户端**：

```bash
wg genkey | tee client_private.key | wg pubkey > client_public.key
chmod 600 client_private.key
cat client_public.key                 # 给服务端用
```

**iOS / Android**：装 WireGuard App，"Add tunnel" → "Create from scratch"，App 自动生成 keypair。导出公钥贴给服务端管理员。

#### 2. 服务端添加 peer

```bash
# 临时添加（不写文件）
sudo wg set wg0 peer <ALICE_PUBLIC_KEY> allowed-ips 10.10.0.2/32

# 持久化到 wg0.conf（重启后保留）
sudo tee -a /etc/wireguard/wg0.conf > /dev/null <<EOF

[Peer]
# alice's laptop
PublicKey = <ALICE_PUBLIC_KEY>
AllowedIPs = 10.10.0.2/32
EOF
```

#### 3. 客户端配置（给客户端用）

```ini
# alice.conf
[Interface]
PrivateKey = <ALICE_PRIVATE_KEY>
Address = 10.10.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>           # cat /etc/wireguard/server_public.key
PresharedKey = <OPTIONAL_PSK>
Endpoint = <SERVER_PUBLIC_IP>:51820
AllowedIPs = 0.0.0.0/0, ::/0              # 全流量；或 10.10.0.0/24 仅 VPN 子网
PersistentKeepalive = 25                   # NAT 后保持
```

#### 4. 客户端导入

| 平台 | 操作 |
|---|---|
| Windows / macOS | WireGuard 官方 App "Import tunnel from file" |
| iOS / Android | App "Create tunnel from QR code"（用 `qrencode` 生成 QR）或导入文件 |
| Linux | `sudo wg-quick up alice.conf` 或 NetworkManager-wireguard |

iOS / Android 推荐生成 QR 码：

```bash
sudo apt-get install qrencode
qrencode -t ansiutf8 < alice.conf       # 终端显示 QR，手机扫描导入
```

### 模板 C — 给客户端配 Pre-Shared Key（PSK，抗量子可选）

```bash
# 生成 PSK
wg genpsk > /etc/wireguard/alice.psk

# 服务端 wg0.conf 的 [Peer] 段加
PresharedKey = <PSK>

# 客户端 [Peer] 段也加同样 PSK
```

### 模板 D — Split Tunnel（仅 VPN 内资源走隧道）

```ini
# 服务端不变

# 客户端配置改 AllowedIPs
[Peer]
PublicKey = ...
Endpoint = ...
AllowedIPs = 10.10.0.0/24, 192.168.0.0/16    # 仅这两个网段走 VPN
```

适合企业 VPN——办公网走 VPN，看 YouTube 走本地。

### 模板 E — 客户端到客户端通信（site-to-site）

默认 peer 只能与 server 通信。要 peer ↔ peer：

```ini
# 服务端 wg0.conf 的 PostUp 加 forward
PostUp = ...; iptables -A FORWARD -i wg0 -o wg0 -j ACCEPT
```

每个客户端的 AllowedIPs 包含其它 peer 的 IP：

```ini
# Alice 客户端
[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = ...:51820
AllowedIPs = 10.10.0.0/24                 # 整个 VPN 子网（含其它客户端）
```

### 模板 F — Site-to-Site VPN（两个内网互联）

公司 A 网（10.0.1.0/24）与公司 B 网（10.0.2.0/24）通过 WireGuard 互联：

```ini
# Site A wg0.conf
[Interface]
PrivateKey = ...
Address = 10.10.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Site B
PublicKey = <SITE_B_PUBKEY>
Endpoint = <SITE_B_PUBLIC_IP>:51820
AllowedIPs = 10.10.0.2/32, 10.0.2.0/24      # B 端 VPN IP + B 端内网
PersistentKeepalive = 25
```

A 端机器加路由：

```bash
ip route add 10.0.2.0/24 via 10.10.0.2 dev wg0
```

## 关键参数调优速查

### 性能

WireGuard 性能在所有 VPN 协议里**几乎最快**——内核态 + ChaCha20-Poly1305。

| 测试 | 吞吐 |
|---|---|
| Gigabit LAN，AES-NI 主机 | ~900 Mbps（near line rate） |
| 100 Mbps WAN | ~95 Mbps |
| 4G LTE | ~50 Mbps |

无需调优。极端场景（跨洋 / 高延迟）：

```ini
# 调大 socket buffer（macOS / BSD）
# Linux 自动管理
```

### MTU

默认 1420（IPv4）/ 1280（IPv6）。NAT/PPPoE 后可能需调小：

```ini
[Interface]
MTU = 1380
```

测试 MTU：

```bash
ping -M do -s 1452 1.1.1.1               # 最大无分片包大小（DF flag）
```

### `PersistentKeepalive`

NAT 后必加。默认 0（关）。设 25 秒（小于一般 NAT 超时 30s）：

```ini
[Peer]
PersistentKeepalive = 25
```

### 带宽限制

WireGuard 自身无限速。用 `tc`：

```bash
sudo tc qdisc add dev wg0 root tbf rate 10mbit burst 32kbit latency 400ms
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `wireguard` `wireguard-tools` | 同（EPEL） |
| 内核要求 | 5.6+ | 5.14（RHEL 9 内核） |
| 内核模块 | 内置 | 内置 |
| firewall | iptables / nftables / ufw | firewalld |
| 客户端 App | 跨平台一致 | 同 |

EnvForge Playbook 自动适配。

## 与其它 catalog 项的配合

- **`openvpn-server`** — 老一代 VPN，**不要同机部署**（端口冲突 + 配置混乱）
- **`firewall-baseline` / `firewalld`** — 必须开 51820/UDP（或你设的端口）
- **`fail2ban-protection`** — 给 wg 端口加 jail
- **`prometheus-monitoring`** — `wireguard_exporter` 暴露 Prometheus 指标

## 排错

### `wg-quick@wg0.service: Failed`

```bash
sudo journalctl -u wg-quick@wg0 -n 50

# 常见
# 1. 内核模块没加载（旧内核需 DKMS）
sudo modprobe wireguard
echo wireguard | sudo tee /etc/modules-load.d/wireguard.conf

# 2. wg0.conf 语法错（PrivateKey 行被截断、Address 缺 /CIDR）
sudo wg-quick up wg0                  # 看具体错误

# 3. 端口被占
sudo ss -ulnp | grep 51820
```

### 客户端连不上

排查清单（按顺序）：

```bash
# 1. 服务器公网防火墙开 51820/UDP？
sudo ufw status                        # Ubuntu
sudo firewall-cmd --list-ports         # RHEL
# 云厂商安全组也要开

# 2. 客户端配置 Endpoint 是公网 IP（不是内网）
ping <SERVER_PUBLIC_IP>

# 3. 客户端公钥已加进服务端 wg0.conf
sudo grep -A3 alice /etc/wireguard/wg0.conf

# 4. AllowedIPs 配对了
# 服务端给 peer：alice 的 wg IP 单独 IP /32
# AllowedIPs = 10.10.0.2/32

# 5. 客户端配置的服务端公钥对得上
sudo cat /etc/wireguard/server_public.key

# 6. 看握手日志
sudo wg show wg0                        # latest handshake 行
```

### 连上但不通外网

```bash
# 1. ip_forward 生效？
sudo sysctl net.ipv4.ip_forward         # 应为 1

# 2. iptables MASQUERADE 在？
sudo iptables -t nat -L POSTROUTING -n -v | grep MASQUERADE

# 3. PostUp 网卡名对？
ip route | awk '/default/{print $5}'    # 默认网关接口名
sudo grep PostUp /etc/wireguard/wg0.conf

# 4. SELinux（RHEL）
sudo ausearch -m avc -ts recent | grep wg0
```

### 重启后接口没起来

`wg-quick@wg0` 没 enable：

```bash
sudo systemctl enable wg-quick@wg0
sudo systemctl is-enabled wg-quick@wg0
```

### 性能比预期低

```bash
# 1. 看 CPU 是不是瓶颈（特别是无 AES-NI 的老机器）
top -p $(pgrep -d, wg-crypt)

# 2. MTU 不对
# 调到 1380 或更低（PPPoE）

# 3. UDP 包过大被丢
# 服务端 sysctl
sudo sysctl -w net.core.rmem_max=2097152
sudo sysctl -w net.core.wmem_max=2097152
```

### 客户端切网络后连接断

`PersistentKeepalive` 没设。所有 NAT 后客户端必须设：

```ini
[Peer]
PersistentKeepalive = 25
```

### 找不到 `eth0`

云厂商接口名不同。看：

```bash
ip route | awk '/default/ {print $5}'
```

改 wg0.conf 的 PostUp / PostDown 里的 `eth0` 为实际名（`ens3` / `enp0s3` 等）。

## 验证

```bash
# 1. 接口存在
ip link show wg0
ip addr show wg0                       # 应有 10.10.0.1/24

# 2. 服务在跑
systemctl is-active wg-quick@wg0

# 3. 端口
sudo ss -ulnp | grep 51820

# 4. ip_forward
sysctl net.ipv4.ip_forward             # 1

# 5. peer 状态
sudo wg show wg0
# interface: wg0
#   public key: ...
#   private key: (hidden)
#   listening port: 51820
# peer: <PUBKEY>
#   allowed ips: 10.10.0.2/32
#   latest handshake: ...
#   transfer: ... received, ... sent

# 6. NAT 规则
sudo iptables -t nat -L POSTROUTING -v -n | grep MASQUERADE
```

## 多次运行

`installMode: skip-existing`。**已生成的服务端密钥不会重新生成**（防止把所有客户端的旧密钥作废）。`wg0.conf` 的 `[Interface]` 段每次按表单值重写，**`[Peer]` 段保留**——手动加的客户端不会丢失。

要重置密钥（极少需要）：

```bash
sudo systemctl stop wg-quick@wg0
sudo rm /etc/wireguard/server_*.key
# 重跑 Playbook —— 会重新生成
# **所有客户端的服务端公钥都要更新**
```

## ⚠️ 敏感性

**privileged** — 启用 IP 转发 + iptables NAT 规则 + 系统服务。配错风险：

- 防火墙规则冲突（PostUp 与 ufw / firewalld 不打架）
- 路由失效（VPN 子网与现有内网冲突）

但 WireGuard 协议本身极简洁——攻击面比 OpenVPN 小得多。

## 隐私说明

- 服务端私钥在 `/etc/wireguard/server_private.key`（root 600 权限），**EnvForge 不上传**
- 客户端密钥应**在客户端本地生成**——服务端永远不接触客户端私钥
- 千万别把客户端私钥发邮件 / IM——会暴露
- WireGuard **不记录连接日志**（这是设计目标）。`wg show` 只看到当前握手时间和数据量
- 不发遥测
- PSK（如启用）增加抗量子破解能力——量子计算成熟后仍安全
- DNS 设了 `1.1.1.1` 等公共 DNS 时，DNS 查询走 VPN 隧道但 Cloudflare 等仍能看到查询记录
