# OpenVPN 服务器

OpenVPN 是经典的 VPN 解决方案——成熟、跨平台、生态完善。比 WireGuard 复杂得多
（需要 PKI、证书签发流程），但在受限网络里有更强的伪装能力（TCP/443 模式）。

如果对 VPN 没有特殊要求，**推荐用 WireGuard**（同样在 catalog 里）：配置简单 100 倍、
性能强 3-10 倍。

## 你将得到什么

- 📦 **openvpn** + **easy-rsa**
- ✅ PKI 自动初始化（CA + 服务端证书 + DH 参数 + tls-auth key）
- ✅ `/etc/openvpn/server/server.conf` 写好（端口、协议、子网、cipher、DNS push）
- ✅ NAT MASQUERADE 规则（让客户端经本机访问外网）
- ✅ `openvpn-server@server` 服务启动并设开机自启

**首次运行需要 1-2 分钟**——生成 DH 参数比较慢。

## 表单字段说明

### 监听端口 `port`

默认 1194。**特殊用法：选 443 + 协议 TCP** 可以伪装成 HTTPS，在受限网络里穿透。

### 传输协议 `protocol`

**几乎总是 UDP**——OpenVPN over TCP 会有 "TCP-over-TCP meltdown" 性能问题（双层重传放大）。
仅在网络对 UDP 有严重 QoS 限制时才选 TCP。

### VPN 子网 `vpn_subnet` / `vpn_netmask`

VPN 内部地址段，**不能与机器现有网卡 IP 段重叠**。

### 推送给客户端的 DNS `push_dns`

客户端连上 VPN 用的 DNS。

### 加密算法 `cipher`

- **AES-256-GCM**（默认）：行业标准，所有 x86 + 现代 ARM 都有硬件加速
- **AES-128-GCM**：稍快但加密强度也够
- **CHACHA20-POLY1305**：CPU 没有 AES-NI 时更快（旧 ARM / 低端嵌入式）

## 安装后

服务端就绪，但**还没有任何客户端证书**。每个客户端要单独签证书。

### 添加一个客户端

```bash
cd /etc/openvpn/easy-rsa
sudo ./easyrsa build-client-full alice nopass
# 在 pki/issued/alice.crt + pki/private/alice.key
```

### 生成 .ovpn 配置文件给客户端

```bash
sudo cat <<EOF > ~/alice.ovpn
client
dev tun
proto $PROTOCOL
remote $YOUR_PUBLIC_IP 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3

<ca>
$(sudo cat /etc/openvpn/server/ca.crt)
</ca>

<cert>
$(sudo cat /etc/openvpn/easy-rsa/pki/issued/alice.crt)
</cert>

<key>
$(sudo cat /etc/openvpn/easy-rsa/pki/private/alice.key)
</key>

<tls-auth>
$(sudo cat /etc/openvpn/server/ta.key)
</tls-auth>
key-direction 1
EOF
```

把 `alice.ovpn` 发给客户端，导入 OpenVPN Connect / Tunnelblick 等客户端 App。

### 撤销证书

```bash
cd /etc/openvpn/easy-rsa
sudo ./easyrsa revoke alice
sudo ./easyrsa gen-crl
sudo cp pki/crl.pem /etc/openvpn/server/
sudo systemctl restart openvpn-server@server
```

server.conf 里启用 CRL（取消注释 `crl-verify`）后才会真的拒绝撤销的证书。

### 防火墙

```bash
sudo ufw allow 1194/udp                                # Ubuntu
sudo firewall-cmd --add-port=1194/udp --permanent && sudo firewall-cmd --reload  # RHEL
```

云厂商安全组也要开。

### 看连接

```bash
sudo cat /var/log/openvpn/openvpn-status.log
# 列出当前所有连接的客户端
```

## ⚠️ 敏感性

**privileged** — PKI 操作 + iptables NAT + 系统服务。OpenVPN 是 30+ 年的成熟项目，
攻击面较小，但密钥管理出错（比如客户端私钥泄露）就等于把 VPN 通行证给了对方。

## 验证安装

```bash
systemctl status openvpn-server@server --no-pager
sudo ss -ulnp | grep 1194
ip link show tun0
```

## 排错

- **`Cannot allocate TUN/TAP dev`** — `sudo modprobe tun` + 检查 `/dev/net/tun` 存在。
- **`TLS Error: TLS handshake failed`** — 通常是客户端时间偏差太大（证书还没生效），或 ta.key 服务端和客户端不一致。
- **客户端连上但不通外网** — `net.ipv4.ip_forward` 没生效 / iptables NAT 规则被覆盖（ufw / firewalld 改了）。
- **DH 参数生成慢** — 首次运行需要 1-2 分钟，是正常的（CPU 算大素数）。
- **跨发行版**：`openvpn` 在 RHEL 上需要 EPEL（已自动启用）。`easy-rsa` 在 RHEL 上是同名包但路径在 `/usr/share/easy-rsa/3` 而不是 `/usr/share/easy-rsa`，Playbook 已用 fallback 兼容。

## 多次运行

`installMode: skip-existing`。已经初始化的 PKI **不会**被覆盖（不然所有签发的客户端证书都失效）。但 server.conf + iptables NAT 规则每次都重写。

## 隐私说明

- 所有私钥（CA 私钥、服务端私钥、客户端私钥）都在 `/etc/openvpn/easy-rsa/pki/private/` 下，仅 root 可读，**不会**被 EnvForge 上传。
- CA 私钥 (`pki/private/ca.key`) 是最敏感的——丢了就要废掉所有签发过的证书。建议安装完成后离线备份这个目录。
