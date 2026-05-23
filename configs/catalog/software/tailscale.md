# Tailscale Mesh VPN

Tailscale 是**基于 WireGuard 的零配置 mesh VPN**——设备间自动 P2P 握手（穿 NAT），不需要公网 IP / 不需要端口转发 / 不需要交换 keypair。**适合**：远程办公（笔电连家里 NAS）、多机房组网、SSH 跳板替代、CI 跑端到端测试。**与 WireGuard 关系**：底层是 WG，多了协调层 + ACL + Magic DNS。**自托管要求 100%** 时改用 Headscale + WG。

## 你将得到什么

- 📦 **tailscale**（来自 Tailscale 官方仓库）
- ✅ tailscaled 守护进程 + systemd 自启
- ✅ 自动 P2P 握手（WireGuard 内核模块或 userspace fallback）
- ✅ Magic DNS（节点名直接 ping）
- ✅ 子网路由（subnet router）支持
- ✅ 可选 Tailscale SSH（替代 OpenSSH）
- ✅ Pre-auth key 自动注册（无需浏览器交互）

## 表单字段说明

### `ts_auth_key`

Tailnet 注册凭据。从 https://login.tailscale.com/admin/settings/keys 创建。

| 选项 | 推荐值 | 说明 |
|---|---|---|
| Reusable | ✅ | 同一 key 可注册多次（脚本 / 多机部署） |
| Ephemeral | ✅ 服务器 / 容器 | 节点离线 24h 自动删除（避免僵尸） |
| Tags | `tag:server` | 可在 ACL 里精细控制权限 |
| Expiration | 90 天 | 太长不安全，太短折腾 |

留空 = Playbook 跑完后手动 `sudo tailscale up` + 浏览器登录。

### `ts_hostname`

Tailnet 控制台 + MagicDNS 中显示的名字。`my-vps` → `my-vps.your-tailnet.ts.net`。

### `ts_advertise_routes`

本机作 subnet router 时填——比如服务器在公司内网 `10.0.0.0/24`，外部 tailnet 客户端通过它访问公司内网。

```
ts_advertise_routes: "10.0.0.0/24,192.168.1.0/24"
```

⚠️ **必须去 Admin 控制台批准**：https://login.tailscale.com/admin/machines → 本机 → ⋯ → Edit route settings → 启用 routes。否则路由不生效。

### `ts_accept_dns`

`true`（默认）= 接受 tailnet MagicDNS。`false` = 保持本机 `/etc/resolv.conf`（已用 `pihole` / `adguard-home` 等本地 DNS 时关闭）。

### `ts_shields_up`

`true` = 拒绝所有入站连接（包括 tailnet 内 ping）。仅适合"我只想用本机连出去"的场景（如笔电只连家里 NAS，但不希望 NAS 反连笔电）。

### `ts_ssh_enabled`

`true` = Tailscale 接管 SSH。**激进**：

- 端口 22 仍开但**只接受 tailnet 入站**
- 不需要 `~/.ssh/authorized_keys`——用 tailnet ACL 控权限
- 用户依然走系统账号

**生产不建议**——失去 tailnet 连接 = 没人能 SSH。家庭 / 实验机适合（省了 SSH key 管理）。

## 配置文件 / 目录速查

```
/etc/default/tailscaled                          # 启动参数
/var/lib/tailscale/tailscaled.state              # 节点状态（保持登录）
/var/run/tailscale/tailscaled.sock               # CLI 通信 socket
/etc/sysctl.d/99-tailscale.conf                  # ip_forward（subnet router 才有）

# 服务
tailscaled.service

# 端口
41641/udp                                         # WireGuard P2P（出站，能动态变）
DERP relay (TCP 443)                              # NAT 失败时的中转（自动）
```

## 常见配置模板

### 模板 A — 基础 mesh（家庭 + 笔电）

```bash
# 服务器（家里 NAS）
sudo tailscale up --hostname=nas

# 笔电（外面）
sudo tailscale up --hostname=laptop

# 然后从笔电:
ping nas                                         # 解析为 nas.tailnet.ts.net
ssh user@nas                                     # 走 tailnet
```

### 模板 B — Subnet Router（VPN 进公司内网）

```bash
# 公司内网一台机器（IP 10.0.0.5）
sudo tailscale up --advertise-routes=10.0.0.0/24

# 控制台批准 routes（手动！）
# https://login.tailscale.com/admin/machines

# 客户端启用 subnet routes
sudo tailscale up --accept-routes

# 现在能 ping 10.0.0.X 了
ping 10.0.0.100
```

### 模板 C — Exit Node（流量出口）

让一台 tailnet 节点作为**出口**——所有客户端的互联网流量走它（绕开本地 ISP 限制 / 公司 WiFi 等）。

```bash
# 公网服务器作为 exit node
sudo tailscale up --advertise-exit-node

# 控制台批准 exit node（手动）
# https://login.tailscale.com/admin/machines → 服务器 → ⋯ → Allow used as exit node

# 客户端使用
sudo tailscale up --exit-node=<exit-node-name>
```

### 模板 D — Tailscale SSH

```bash
sudo tailscale up --ssh

# 然后从其他 tailnet 节点
ssh user@hostname
# 不需 SSH 密钥，权限由 tailnet ACL 决定
```

ACL 例（在控制台 Access Controls 编辑）：

```jsonc
{
  "ssh": [
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["tag:server"],
      "users": ["root", "admin", "ubuntu"]
    }
  ]
}
```

### 模板 E — Funnel（公网暴露 tailnet 服务）

把 tailnet 内的服务公开到互联网（Tailscale 帮你做反代 + HTTPS）。

```bash
# 启用 Funnel（Admin 控制台先 enable feature）
tailscale serve --bg https / http://127.0.0.1:8080
tailscale funnel --bg 443 on

# 现在公网能访问
# https://<hostname>.<tailnet>.ts.net/
```

⚠️ Funnel 仅 80/443/8443，且要在控制台 ACL 里允许节点用 Funnel。

### 模板 F — 节点退出 / 重新登录

```bash
# 退出（保留状态，下次 up 不需 auth-key）
sudo tailscale logout

# 重新登录（用新 auth-key）
sudo tailscale up --auth-key=tskey-xxx --reset

# 完全清空（连状态文件都删）
sudo tailscale logout
sudo rm /var/lib/tailscale/tailscaled.state
sudo systemctl restart tailscaled
```

## 关键参数调优速查

### 性能

| 场景 | 吞吐 | 说明 |
|---|---|---|
| 直连 P2P（同 NAT）| 接近裸 WG（~95% 链路） | 内核模块 |
| 直连 P2P（穿 NAT）| ~80% 链路 | UDP 打洞 |
| DERP relay（NAT 穿透失败）| 50-200 Mbps | TCP 中转 |

加速：

```bash
# 启用 userspace WireGuard（部分内核不支持时）
sudo tailscale up --tun=userspace-networking
```

### 资源占用

| 项 | RAM | CPU |
|---|---|---|
| Idle | 30 MB | < 0.1% |
| 1 Gbps 流量 | 100 MB | 1 核 100% |
| Subnet router（多 client） | 200 MB | 2-5% |

### ACL 例（精细化权限）

控制台 Access Controls：

```jsonc
{
  "groups": {
    "group:admin": ["alice@example.com"],
    "group:dev":   ["bob@example.com", "carol@example.com"]
  },
  "tagOwners": {
    "tag:server":   ["group:admin"],
    "tag:database": ["group:admin"]
  },
  "acls": [
    // admin 全通
    { "action": "accept", "src": ["group:admin"], "dst": ["*:*"] },
    // dev 仅能访问 dev tag 的节点的 80/443/22
    { "action": "accept", "src": ["group:dev"], "dst": ["tag:server:80,443,22"] }
  ]
}
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `pkgs.tailscale.com/stable/$DISTRO` | `pkgs.tailscale.com/stable/rhel/9` |
| 包名 | `tailscale` | `tailscale` |
| 服务 | `tailscaled.service` | `tailscaled.service` |
| WG 内核模块 | ✅ 5.6+ 内置 | ✅ RHEL 9 内置 |
| Anolis 9 | – | ✅（用 rhel/9 仓库） |
| ARM64 | ✅ | ✅ |
| 容器内 | 需 `--cap-add NET_ADMIN`，userspace mode 推荐 | 同 |

## 与其它 catalog 项的配合

- **`wireguard-vpn`** — Tailscale 是 WG 的"全管家"版——选一个用即可
- **`pihole` / `adguard-home`** — Tailscale 节点可指定 DNS 走 pihole
- **`firewall-baseline`** — Tailscale 创建 `tailscale0` 接口，UFW 默认放行
- **`ssh-hardening`** — Tailscale SSH 启用时可禁系统 OpenSSH 端口 22 公网入

## 排错

### `tailscale up` 卡住 / 不显示登录链接

```bash
# 检查 tailscaled 是否运行
systemctl status tailscaled

# 服务起来但卡住 → 看日志
sudo journalctl -u tailscaled -f

# 防火墙阻止出站？
sudo ufw status                          # 41641/udp 应放行
```

### 节点显示 "Idle / Last seen N分钟前" 但实际在线

DERP relay 中断（罕见）。强制刷新：

```bash
sudo tailscale down
sudo tailscale up
```

### Subnet route 不生效

```bash
# 1. 控制台批准了吗？
# https://login.tailscale.com/admin/machines → 节点 → ⋯ → Edit route settings

# 2. ip_forward 开了吗？
sysctl net.ipv4.ip_forward                # 应为 1

# 3. 客户端 --accept-routes 加了吗？
tailscale status

# 4. 路由表有？
ip route | grep tailscale
```

### 性能慢（~50 Mbps，预期 1Gbps）

DERP relay 中（直连失败）。

```bash
tailscale netcheck
# 看 "Relay" 是否非 0
# Region: hkg = 香港 DERP（中国大陆访问最快）

# 检查防火墙是否阻止 41641/udp
sudo iptables -L -n | grep 41641
```

### Tailscale SSH 卡住

```bash
# 系统 OpenSSH 仍在跑？
sudo systemctl status sshd

# 默认端口 22 同时被两者抢——Tailscale SSH 优先 tailnet IP
# 普通 SSH（非 tailnet 客户端）走 OpenSSH
```

### 多个 tailnet 切换

```bash
# 退出当前 tailnet
sudo tailscale logout

# 用另一个 auth-key 注册
sudo tailscale up --auth-key=tskey-yyy --reset
```

## 验证

```bash
# 1. 服务跑着
systemctl is-active tailscaled

# 2. 已登录 + 节点在线
tailscale status
# 期望：本机 IP / 其他节点列表

# 3. 本机 tailnet IP
tailscale ip -4
# 期望：100.x.x.x

# 4. ping 其他 tailnet 节点（如果有）
ping <hostname>           # MagicDNS 解析

# 5. NAT / relay 检查
tailscale netcheck
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**已登录的节点重跑不会被注销**——`tailscale up` 会用现有状态。要换 tailnet → `tailscale logout` 后再跑 + 新 auth-key。

## ⚠️ 敏感性

**review** — Tailscale 用 Tailscale 公司的协调服务（control plane）—— SaaS 后端。

强制：

1. **隐私敏感场景考虑 Headscale**（自托管协调服务，开源） + 普通 `wireguard-vpn`
2. Pre-auth key 当 secret 管理（写代码仓库 = 滚 key）
3. ACL 严格化——按 `tag:` 而不是默认全通
4. Tailscale SSH 启用前确认有备用入口（不能 100% 依赖它）
5. Subnet router 路由必须在控制台手动批准（防止流氓节点声明假路由）

## 隐私说明

- **Control plane**（节点元数据 / ACL / Magic DNS 解析）走 Tailscale SaaS（login.tailscale.com）
- **数据流量**全部 P2P（端到端 WG 加密）—— Tailscale 看不到内容
- DERP relay（NAT 穿透失败时）也是 WG 加密的密文中转
- 完全自托管 → 装 Headscale（开源，自己跑 control plane）+ 关掉 Tailscale 自带的协调
- Tailscale 节点有遥测（默认开），可在 admin 控制台关闭
