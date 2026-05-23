# OpenVPN 服务器

OpenVPN 是经典 VPN 解决方案——成熟、跨平台（Windows/macOS/Linux/iOS/Android）、生态完善。比 WireGuard 复杂得多（需 PKI 证书签发流程），但在受限网络里有更强的伪装能力（TCP/443 over TLS）。

> **如对 VPN 无特殊要求**，**强烈推荐 WireGuard**（同 catalog 有 `wireguard-vpn`）：配置简单 100×、性能强 3-10×、代码量少 50×。

## 你将得到什么

- 📦 **openvpn** + **easy-rsa**
- ✅ PKI 自动初始化（CA + 服务端证书 + DH 参数 + tls-auth key）
- ✅ `/etc/openvpn/server/server.conf` 写好（端口、协议、子网、cipher、DNS push）
- ✅ NAT MASQUERADE 规则（让客户端经本机访问外网）
- ✅ `net.ipv4.ip_forward=1` 持久化
- ✅ `openvpn-server@server` 服务自动启动 + 开机自启

> ⏱ **首次运行 2-5 分钟**——DH 参数生成慢（CPU 算大素数）。

## 表单字段说明

### `port`

默认 1194。**特殊用法**：`port=443` + `protocol=tcp` 可伪装 HTTPS，受限网络里穿透。

### `protocol`

| 值 | 适用 |
|---|---|
| `udp`（**默认推荐**） | 性能最好，无 TCP-over-TCP meltdown 问题 |
| `tcp` | 仅当 UDP 被严重 QoS / 阻断时（机场 / 受限网络） |

### `vpn_subnet` / `vpn_netmask`

VPN 内部地址段，**不能与机器现有网卡 IP 段重叠**。常用 `10.8.0.0/24`。

### `push_dns`

客户端连上 VPN 后用的 DNS。常用 `1.1.1.1` / `8.8.8.8`。

### `cipher`

| 算法 | 适用 |
|---|---|
| `AES-256-GCM`（**默认**） | x86 + 现代 ARM 有 AES-NI 硬件加速 |
| `AES-128-GCM` | 稍快但安全度也够 |
| `CHACHA20-POLY1305` | 老 ARM / 嵌入式（无 AES-NI） |

## 配置文件 / 目录速查

```
/etc/openvpn/
├── server/                                  # 服务端配置 + 证书
│   ├── server.conf                           # ← 主配置
│   ├── ca.crt                                # CA 公钥（**给客户端**）
│   ├── server.crt / server.key                # 服务端证书 + 私钥
│   ├── dh.pem                                 # DH 参数
│   ├── ta.key                                 # tls-auth 密钥（**给客户端**）
│   └── crl.pem                                # 证书撤销列表（CRL）
├── client/                                  # 客户端配置模板
└── easy-rsa/                                # PKI 工具 + 数据
    ├── easyrsa                                 # 命令行工具
    └── pki/
        ├── ca.crt                              # 同上（CA 公钥）
        ├── private/
        │   ├── ca.key                          # ⚠️ CA 私钥（极敏感，离线备份）
        │   ├── server.key                      # 服务端私钥
        │   └── alice.key                       # 客户端私钥（按名）
        ├── issued/
        │   ├── server.crt
        │   └── alice.crt                       # 已签发的客户端证书
        ├── reqs/                                # CSR 请求
        ├── revoked/                             # 已撤销
        ├── certs_by_serial/
        ├── crl.pem                               # CRL
        └── index.txt                             # 证书数据库

/var/log/openvpn/
├── openvpn-status.log                          # 当前连接状态（每分钟更新）
└── openvpn.log                                  # 主日志

/etc/sysctl.d/99-envforge-openvpn.conf            # ip_forward=1 持久化
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `openvpn` `easy-rsa` | `openvpn` `easy-rsa`（EPEL） |
| 服务名 | `openvpn-server@<conf-name>` | 同 |
| easy-rsa 路径 | `/usr/share/easy-rsa` | `/usr/share/easy-rsa/3` |
| 配置目录 | `/etc/openvpn/server` | 相同 |

EnvForge preflight 自动启 EPEL；easy-rsa 路径差异自动兼容。

## 常见配置模板

### 模板 A — `server.conf` 推荐配置

```conf
port 1194
proto udp
dev tun

# 证书
ca   /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key  /etc/openvpn/server/server.key
dh   /etc/openvpn/server/dh.pem
tls-auth /etc/openvpn/server/ta.key 0      # 0 = server side

# Tunnel
server 10.8.0.0 255.255.255.0
ifconfig-pool-persist /var/log/openvpn/ipp.txt    # 客户端 IP 分配持久化
client-config-dir /etc/openvpn/server/ccd          # 给特定客户端固定 IP / 推送特定路由

# 全流量 VPN（push 默认路由）—关掉 = split tunnel
push "redirect-gateway def1 bypass-dhcp"

# DNS
push "dhcp-option DNS 1.1.1.1"
push "dhcp-option DNS 8.8.8.8"

# Keepalive
keepalive 10 120                                    # 每 10s 发，120s 无响应断
explicit-exit-notify 1                              # UDP 客户端断时通知（仅 UDP）

# Crypto
cipher AES-256-GCM
auth SHA256
data-ciphers AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305
data-ciphers-fallback AES-256-CBC                    # 老客户端兼容

# Privilege drop
user nobody
group nogroup                                        # RHEL 用 nobody
persist-key
persist-tun

# 日志
status /var/log/openvpn/openvpn-status.log
log-append  /var/log/openvpn/openvpn.log
verb 3                                                # 0=安静 / 4=debug

# 性能
max-clients 100
sndbuf 0
rcvbuf 0
push "sndbuf 524288"
push "rcvbuf 524288"

# CRL（启用证书撤销，先生成 crl.pem）
# crl-verify /etc/openvpn/server/crl.pem

# Compression（**生产关闭**——VORACLE 攻击）
# compress lz4-v2
# push "compress lz4-v2"

# 多 CPU（仅 multi-threaded build）
# 默认单线程，多客户端可起多 server.conf 占不同端口

# 客户端到客户端（给同 VPN 内主机互联）
# client-to-client
```

### 模板 B — 添加客户端（完整流程）

```bash
# 1. 在 easy-rsa 目录里签证书
cd /etc/openvpn/easy-rsa

# 无密码（适合服务）
sudo ./easyrsa build-client-full alice nopass

# 有密码（更安全，每次连接输密码）
sudo ./easyrsa build-client-full alice

# 输出：
# pki/issued/alice.crt
# pki/private/alice.key

# 2. 生成 .ovpn 配置文件
sudo bash -c 'cat > /tmp/alice.ovpn <<EOF
client
dev tun
proto udp
remote YOUR-SERVER-PUBLIC-IP 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
data-ciphers AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305
verb 3
key-direction 1

<ca>
'$(cat /etc/openvpn/server/ca.crt)'
</ca>

<cert>
'$(cat /etc/openvpn/easy-rsa/pki/issued/alice.crt)'
</cert>

<key>
'$(cat /etc/openvpn/easy-rsa/pki/private/alice.key)'
</key>

<tls-auth>
'$(cat /etc/openvpn/server/ta.key)'
</tls-auth>
EOF
'

# 3. 把 alice.ovpn 安全发给客户端
# - SCP / SFTP
# - 加密邮件（pgp / age）
# - 二维码（mobile：用 OpenVPN Connect App 扫）
```

#### 客户端连接

| 平台 | 客户端 |
|---|---|
| Windows | OpenVPN Connect / OpenVPN GUI |
| macOS | Tunnelblick / OpenVPN Connect |
| Linux | `sudo openvpn --config alice.ovpn` 或 NetworkManager-openvpn |
| iOS / Android | OpenVPN Connect（App Store） |

### 模板 C — 撤销证书（员工离职 / 设备丢失）

```bash
cd /etc/openvpn/easy-rsa
sudo ./easyrsa revoke alice
sudo ./easyrsa gen-crl

sudo cp pki/crl.pem /etc/openvpn/server/
sudo chmod 644 /etc/openvpn/server/crl.pem

# server.conf 里取消 crl-verify 注释
sudo sed -i 's|^# crl-verify|crl-verify|' /etc/openvpn/server/server.conf

sudo systemctl restart openvpn-server@server

# 验证撤销生效
sudo openssl x509 -in pki/issued/alice.crt -noout -serial
sudo openssl crl -in pki/crl.pem -text -noout | grep Serial
```

### 模板 D — 给客户端固定 IP（CCD）

```bash
sudo mkdir -p /etc/openvpn/server/ccd
sudo bash -c 'echo "ifconfig-push 10.8.0.50 10.8.0.51" > /etc/openvpn/server/ccd/alice'
# alice 客户端总是分到 10.8.0.50

# server.conf 已含 client-config-dir /etc/openvpn/server/ccd
```

### 模板 E — Split Tunnel（仅 VPN 内资源走隧道）

把 `server.conf` 的：

```conf
push "redirect-gateway def1 bypass-dhcp"
```

改为：

```conf
push "route 10.0.0.0 255.0.0.0"        # 仅 10.0.0.0/8 走 VPN
push "route 192.168.0.0 255.255.0.0"   # 仅 192.168.0.0/16 走 VPN
```

适合企业内网 VPN（用户其它流量走本地）。

## 关键参数调优速查

### 性能

| 参数 | 默认 | 推荐 |
|---|---|---|
| `sndbuf` / `rcvbuf` | 64 KB | 0（让 OS 自调） |
| `tun-mtu` | 1500 | 1400（NAT 后避免分片） |
| `mssfix` | 1450 | 1360（同上） |
| `fragment` | 0 | 1300（UDP 大包分片） |
| `tcp-nodelay` | – | 启用（TCP 模式时） |

### 加密性能（基准 hardware AES-NI 启用）

| Cipher | 速度（吞吐） |
|---|---|
| AES-128-GCM | ~500 Mbps（gigabit 吞吐） |
| AES-256-GCM | ~400 Mbps |
| CHACHA20-POLY1305（无 AES-NI） | ~250 Mbps |
| BF-CBC（**老 cipher，已弃用**） | ~50 Mbps |

### 服务并发

OpenVPN 单实例**单线程** ——多核机器要多 server.conf（不同端口）拆开。

```bash
# /etc/openvpn/server/server-1.conf 端口 1194
# /etc/openvpn/server/server-2.conf 端口 1195
sudo systemctl enable --now openvpn-server@server-1
sudo systemctl enable --now openvpn-server@server-2

# 客户端配置 remote 多个负载均衡
remote vpn1.example.com 1194
remote vpn2.example.com 1195
remote-random
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `openvpn` 包 | 默认仓库 | EPEL ✅ |
| `easy-rsa` 包 | 默认仓库 | EPEL ✅ |
| easy-rsa 路径 | `/usr/share/easy-rsa` | `/usr/share/easy-rsa/3` |
| systemd unit | `openvpn-server@<conf>.service` | 相同 |
| `nogroup` 用户组 | 存在 | **不存在**（用 `nobody`） |
| TUN/TAP 模块 | 默认加载 | `modprobe tun` |
| iptables MASQUERADE | iptables 命令直接 | `firewall-cmd --add-masquerade` |

EnvForge preflight 启 EPEL + 处理 group / 模块 / firewall 差异。

## 与其它 catalog 项的配合

- **`wireguard-vpn`** — 推荐替代品。除非有特殊需求否则用 WireGuard
- **`firewall-baseline` / `firewalld`** — 必须开 1194/UDP（或你设的端口）
- **`fail2ban-protection`** — 给 OpenVPN 端口加 jail（防扫描）
- **`certbot-ssl`** — 不直接用——OpenVPN 用自签 PKI 而非 Let's Encrypt

## 排错

### `Cannot allocate TUN/TAP dev`

TUN 模块没加载或 /dev/net/tun 不存在：

```bash
sudo modprobe tun
ls -l /dev/net/tun           # crw-rw-rw- ... /dev/net/tun
echo tun | sudo tee /etc/modules-load.d/tun.conf

# 容器中（Docker）需 --cap-add=NET_ADMIN --device=/dev/net/tun
```

### `TLS Error: TLS handshake failed`

最常见原因：

1. **客户端时间偏差**（证书未生效）—— `sudo timedatectl status`
2. **ta.key 不一致**——服务端和客户端的 tls-auth key 不同
3. **CA 证书错**——客户端的 `<ca>` 段不是这个 server 的 CA
4. **撤销了证书**但 CRL 没更新

### 客户端连上但不通外网

```bash
# 1. ip_forward 生效？
sudo sysctl net.ipv4.ip_forward         # 应为 1

# 2. iptables MASQUERADE 在？
sudo iptables -t nat -L POSTROUTING -n -v | grep MASQUERADE

# 3. 防火墙没拦
sudo ufw status
sudo firewall-cmd --list-all

# 4. server.conf 推了 redirect-gateway?
grep redirect /etc/openvpn/server/server.conf
```

### DH 参数生成极慢

正常——CPU 密集任务，512 位 ~10 秒，2048 位 ~2 分钟，4096 位 ~10 分钟。本 Playbook 默认用 2048 位。

加速方案（首次安装一次性）：

```bash
# 用 ECDSA 替代 RSA（无需 DH 参数，速度极快）
cd /etc/openvpn/easy-rsa
EASYRSA_ALGO=ec EASYRSA_CURVE=secp384r1 sudo ./easyrsa init-pki
# 后续按正常流程，但建 CA / server cert 都用 ECDSA
```

### `WARNING: 'cipher' is used inconsistently, local='cipher AES-256-GCM', remote='cipher BF-CBC'`

老客户端用 BF-CBC 但服务端只支持 GCM。两条路：

1. 升级客户端（推荐）
2. server.conf 加 `data-ciphers-fallback AES-256-CBC`（容忍老客户端）

### CA 私钥泄露怎么办

**所有签发的客户端证书都得废**。流程：

```bash
# 1. 重新初始化 PKI
cd /etc/openvpn/easy-rsa
sudo ./easyrsa init-pki              # 这会清空所有证书！
sudo ./easyrsa build-ca

# 2. 重新签 server cert
sudo ./easyrsa build-server-full server nopass

# 3. 重新签所有客户端 cert + 重发 .ovpn

# 4. 重启服务
sudo systemctl restart openvpn-server@server
```

### `WARNING: file 'private/server.key' is group or others accessible`

权限错：

```bash
sudo chmod 600 /etc/openvpn/server/server.key
sudo chmod 600 /etc/openvpn/easy-rsa/pki/private/*.key
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active openvpn-server@server

# 2. 端口
sudo ss -ulnp | grep 1194

# 3. TUN 接口
ip link show tun0

# 4. ip_forward
sysctl net.ipv4.ip_forward             # 1

# 5. iptables NAT
sudo iptables -t nat -L POSTROUTING -v -n | grep MASQUERADE

# 6. 当前连接
sudo cat /var/log/openvpn/openvpn-status.log

# 7. 日志
sudo tail -50 /var/log/openvpn/openvpn.log
```

## 多次运行

`installMode: skip-existing`。**已生成的 PKI 不会被重新初始化**（避免作废所有客户端证书）。`server.conf` + iptables NAT 每次按表单值重写。

要彻底重置：

```bash
sudo systemctl stop openvpn-server@server
sudo rm -rf /etc/openvpn/easy-rsa/pki
sudo rm -f /etc/openvpn/server/{ca.crt,server.crt,server.key,ta.key,dh.pem}
# 重跑 Playbook
```

## ⚠️ 敏感性

**privileged** — PKI 操作 + iptables NAT + 内核 IP forward + 系统服务。OpenVPN 是 30+ 年成熟项目，攻击面较小，但**密钥管理出错**（客户端私钥泄露）= VPN 通行证给了对方。

## 隐私说明

- 所有私钥在 `/etc/openvpn/easy-rsa/pki/private/`，权限 600 仅 root 可读
- **EnvForge 不上传任何私钥**
- **CA 私钥**（`pki/private/ca.key`）最敏感——丢了就要废全部签发证书。**强烈建议安装完成后离线备份这个目录**（U 盘 / 加密 ZIP）
- 客户端 `.ovpn` 文件含**完整 CA + 客户端证书 + 客户端私钥 + tls-auth key**——发送给客户端时务必走加密通道
- 连接日志（`openvpn-status.log` / `openvpn.log`）含客户端 IP / 用户名——按合规需求保留 / 加密
- OpenVPN 不发遥测
