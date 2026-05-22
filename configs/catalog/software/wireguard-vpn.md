# WireGuard VPN 服务器

WireGuard 是现代 VPN 协议——比 OpenVPN 配置简单 100 倍、性能强 3-10 倍、代码量少几十倍。
EnvForge 把目标机器配成 WireGuard 服务器，生成密钥、写好接口配置、开启 IP 转发、
启动服务。客户端 peer 在服务跑起来后单独添加。

## 你将得到什么

- 📦 **wireguard** + **wireguard-tools**
- ✅ 服务端密钥对生成在 `/etc/wireguard/server_{private,public}.key`（仅 root 可读）
- ✅ `/etc/wireguard/wg0.conf` 写好接口配置（地址、端口、PostUp/PostDown NAT 规则）
- ✅ `net.ipv4.ip_forward=1` 启用（持久化到 sysctl）
- ✅ `wg-quick@wg0` 服务启动并设开机自启

## 表单字段说明

### WireGuard 端口 `listen_port`

UDP 端口，默认 51820。建议改成非标的高位端口（如 35821）减少扫描，但客户端配置要同步改。

### VPN 子网 `vpn_subnet` / 服务端 VPN IP `server_address`

VPN 内部用的私有网段。**必须和机器现有网卡 IP 不冲突**——比如机器内网网卡是 192.168.1.x，
那 VPN 子网别选 192.168.1.0/24，选 10.10.0.0/24 之类。

服务端 IP 是子网的第一个地址（一般 .1）。

### 推送给客户端的 DNS `dns_servers`

客户端连上 VPN 后用的 DNS。常见选择：
- `1.1.1.1`（Cloudflare，最快）
- `8.8.8.8`（Google）
- 内网 DNS（多个 VPN 客户端要访问内网域名时）

### 启用 IP 转发 `enable_ip_forward`

- ✅ 勾上：**全流量 VPN**，客户端所有出站流量经过本机到外网（科学上网/全局代理模式）
- ❌ 不勾：**Split tunnel**，客户端只能访问 VPN 子网内的资源（典型企业内网 VPN 用法）

## 安装后

服务端就绪，但**还没有任何客户端**。每个客户端要走一次"生成密钥 + 互换公钥"流程。

### 添加一个客户端 peer

**在客户端机器**生成密钥：

```bash
# 客户端 Linux
wg genkey | tee client_private.key | wg pubkey > client_public.key
cat client_public.key   # 拷贝这个值给服务器
```

或者：iOS / Android 客户端 App 自动生成。

**在服务器上**把客户端公钥加进来：

```bash
# 客户端公钥用 <CLIENT_PUBKEY> 占位
sudo wg set wg0 peer <CLIENT_PUBKEY> allowed-ips 10.10.0.2/32

# 持久化到 wg0.conf 文件，避免重启丢失
sudo tee -a /etc/wireguard/wg0.conf > /dev/null <<EOF

[Peer]
# Friendly name: alice's laptop
PublicKey = <CLIENT_PUBKEY>
AllowedIPs = 10.10.0.2/32
EOF
```

**生成客户端配置**给客户端用：

```ini
[Interface]
PrivateKey = <CLIENT_PRIVKEY>
Address = 10.10.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <服务端公钥，从 cat /etc/wireguard/server_public.key 拿>
Endpoint = <服务器公网 IP>:51820
AllowedIPs = 0.0.0.0/0     # 全流量 VPN；只想 VPN 内资源就改 10.10.0.0/24
PersistentKeepalive = 25
```

把这个 ini 文件给客户端，导入 WireGuard App 即可连接。

### 看连接状态

```bash
sudo wg show
# 显示所有 peer 的最后握手时间、收发流量
```

### 防火墙

记得在防火墙开 51820/UDP：

```bash
sudo ufw allow 51820/udp                                # Ubuntu
sudo firewall-cmd --add-port=51820/udp --permanent && sudo firewall-cmd --reload  # RHEL
```

## ⚠️ 敏感性

**privileged** — 启用了 IP 转发 + iptables NAT 规则 + 系统级 systemd 服务。配错可能导致：
- 防火墙规则冲突（iptables PostUp 和 ufw / firewalld 不打架）
- 路由失效（VPN 子网与现有内网冲突）

## 验证安装

```bash
sudo wg show wg0
sudo ss -ulnp | grep 51820
sysctl net.ipv4.ip_forward    # 应显示 1
```

## 排错

- **`wg-quick@wg0.service: Failed`** — 看 `journalctl -u wg-quick@wg0 -n 50`。常见：
  - 内核模块没加载（旧内核需要 DKMS：`sudo apt-get install wireguard-dkms`）
  - wg0.conf 语法错（PrivateKey 行被截断、Address 缺 /CIDR）
- **客户端连不上** — 检查清单：
  1. 服务端公网防火墙开了 UDP 51820 没？（云厂商安全组也要开）
  2. 客户端配置的 Endpoint IP 是公网 IP 不是内网 IP？
  3. 客户端公钥确实加进了服务端 `/etc/wireguard/wg0.conf` 的 `[Peer]` 段？
  4. AllowedIPs 配对了？（服务端给 peer 配的是 `10.10.0.2/32`，客户端配的是 `0.0.0.0/0`）
- **连上但不通外网** — `enable_ip_forward` 没生效；MASQUERADE 规则错了（看 PostUp 里的 WAN_IF 网卡名）。
- **跨发行版**：`wireguard` 包在 RHEL 上需要 EPEL（preflight 已自动启用）。

## 多次运行

`installMode: skip-existing`。已生成的服务端密钥**不会**被重新生成（防止把所有客户端的旧密钥作废）。但 wg0.conf 的 [Interface] 段会按表单值重写，[Peer] 段不会被动（手动加的客户端不会丢）。

## 隐私说明

- 服务端私钥在 `/etc/wireguard/server_private.key`（root 600 权限），**不会**被 EnvForge 上传或同步。
- 客户端密钥应在客户端本地生成，不要把客户端私钥发邮件/IM 等不安全通道。
- WireGuard 不记录连接日志，但 `wg show` 能看到最后握手时间和数据量。
