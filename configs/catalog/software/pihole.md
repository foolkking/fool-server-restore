# Pi-hole 网络广告屏蔽

Pi-hole 是 **本地 DNS 服务器 + 广告 / 跟踪域名屏蔽 + Web 管理面板**——把它设为路由器 DHCP 的 DNS，**全网所有设备**（手机 / 电视 / IoT / 等）的广告都被挡。**家庭网关 / VPN 出口最常装的服务之一**。

## 你将得到什么

- 📦 **pihole/pihole** Docker 容器
- ✅ DNS 服务监听 53/tcp + 53/udp
- ✅ Web 管理面板（默认 8081 端口）
- ✅ 默认上游 DNS：Cloudflare 1.1.1.1
- ✅ DNSSEC 默认启用
- ✅ 自动屏蔽 100k+ 广告 / 跟踪域名（默认 blocklist）
- ✅ Query Log + 实时统计
- ✅ 自动停用 systemd-resolved（释放 53 端口）

## ⚠️ 重要：与 systemd-resolved 冲突

现代 Ubuntu / Debian / RHEL **默认启用 systemd-resolved**——占用 53 端口（虽然只在 127.0.0.53）。Pi-hole Docker 部署会**自动**：

1. `systemctl disable --now systemd-resolved`
2. 替换 `/etc/resolv.conf` 软链为静态文件（`nameserver 1.1.1.1`）
3. 然后 Pi-hole 容器才能 bind 53

**副作用**：本机 DNS 解析现在走 1.1.1.1（绕过 Pi-hole）。要让本机也走 Pi-hole，配完 Pi-hole 后改：

```bash
echo 'nameserver 127.0.0.1' | sudo tee /etc/resolv.conf
```

## 表单字段说明

### `pihole_admin_password`

Web 面板登录密码。留空 = 自动生成 24 位强密码。

### `pihole_dns_upstream`

上游 DNS（分号分隔）：

| URL | 运营 | 特点 |
|---|---|---|
| `1.1.1.1;1.0.0.1` | Cloudflare（默认） | 最快，全球 |
| `8.8.8.8;8.8.4.4` | Google | 稳定 |
| `9.9.9.9;149.112.112.112` | Quad9 | 含恶意域名屏蔽 |
| `223.5.5.5;223.6.6.6` | 阿里 | 国内最快 |
| `114.114.114.114` | 114DNS | 国内备用 |

### `pihole_web_port`

Web 面板端口。默认 8081（避免与 nginx 80 冲突）。

### `pihole_dns_port`

DNS 端口。默认 53。仅当无法腾出时改非标（客户端配置同步改）。

### `pihole_timezone`

时区——影响 Query Log 时间戳。

### `pihole_dnssec`

启用 DNSSEC 验证（防 DNS 投毒）。强烈建议开。

## 配置文件 / 目录速查

```
/opt/pihole/
├── docker-compose.yml                    # ← EnvForge 写入
├── etc-pihole/                            # ← Pi-hole 主数据
│   ├── pihole-FTL.db                       # 查询日志（SQLite）
│   ├── gravity.db                          # 广告域名库（SQLite）
│   ├── adlists.list                         # 已订阅的 blocklist URL
│   ├── custom.list                          # 本地 DNS 记录（局域网设备）
│   ├── setupVars.conf                       # 主配置
│   ├── dns-servers.conf                      # 内置 DNS 列表
│   ├── pihole.toml                            # FTL daemon 配置
│   └── ...
└── etc-dnsmasq/                              # dnsmasq 配置（DNS 后端）
    └── 01-pihole.conf

# 容器内
/etc/pihole/         → /opt/pihole/etc-pihole/
/etc/dnsmasq.d/      → /opt/pihole/etc-dnsmasq/
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker（仅，本 Playbook） |
| 镜像 | `pihole/pihole:latest`（多架构 amd64 / arm64 / arm/v7） |
| 53 占用 | **必须**关 systemd-resolved |
| 容器 capability | `NET_ADMIN` `SYS_NICE` |

## 常见配置模板

### 模板 A — 路由器配置（让全网走 Pi-hole）

#### 方式 1：路由器 DHCP DNS（推荐）

路由器管理界面 → DHCP / LAN 设置 → DNS Server 改为 Pi-hole 主机 IP（如 `192.168.1.5`）。所有 DHCP 客户端自动用此 DNS。

#### 方式 2：单设备改 DNS

```
手机/电脑 → 网络设置 → DNS → 192.168.1.5
```

#### 方式 3：Pi-hole 当 DHCP（替代路由器）

需路由器 DHCP 关掉。Pi-hole admin → Settings → DHCP → Enable。**慎用**：路由器双 DHCP 网络会乱。

### 模板 B — Web 面板首次操作

```
http://<server-ip>:8081/admin/
```

输入密码登录。看到：

- **Dashboard** — 实时查询数 / 屏蔽率（典型 20-40%）
- **Query Log** — 每个 DNS 查询的时间戳 / 客户端 / 域名 / 是否屏蔽
- **Long-term Data** — 历史统计图
- **Adlists** — 订阅的屏蔽列表
- **Whitelist / Blacklist** — 手动放行 / 屏蔽
- **Disable** — 临时关 5/30 秒（看不出广告时切回原 DNS 测）

### 模板 C — 添加额外屏蔽列表

Settings → Adlists → 加 URL：

```
# 推荐 lists（覆盖广告 / 恶意软件 / Tracker）
https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts                # 经典综合
https://urlhaus.abuse.ch/downloads/hostfile/                                       # 恶意软件
https://raw.githubusercontent.com/PolishFiltersTeam/KADhosts/master/KADhosts.txt   # 网络威胁
https://raw.githubusercontent.com/AdAway/adaway.github.io/master/hosts.txt        # 移动广告
https://gitlab.com/curben/urlhaus-filter/-/raw/master/urlhaus-filter-domains.txt    # URLhaus
https://oisd.nl/                                                                     # OISD（综合，~50 万域名）
```

加完点 **Tools → Update Gravity** 拉取。

### 模板 D — 局域网域名解析（自定义 DNS）

让 `nas.local` / `printer.local` 等局域网域名解析到本机：

UI → Local DNS → DNS Records → Add：

```
Domain: nas.local       → IP: 192.168.1.10
Domain: printer.local   → IP: 192.168.1.20
```

或编辑 `/opt/pihole/etc-pihole/custom.list`：

```
192.168.1.10 nas.local
192.168.1.20 printer.local
```

### 模板 E — DNS over HTTPS / TLS 上游（更安全）

Pi-hole + cloudflared（DoH）：

```yaml
# docker-compose.yml 加
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    networks:
      - pihole-net
    command: proxy-dns --address 0.0.0.0 --port 5053 --upstream https://1.1.1.1/dns-query --upstream https://1.0.0.1/dns-query

  pihole:
    # ... 其它不变
    networks:
      - pihole-net
    environment:
      DNS1: cloudflared#5053                    # 上游 = 内部 cloudflared
      DNS2: ""

networks:
  pihole-net:
    driver: bridge
```

DNS 查询走加密通道到 Cloudflare，ISP 看不到。

### 模板 F — 与 WireGuard VPN 集成（自带广告屏蔽的 VPN）

WireGuard 配 DNS 指向 Pi-hole：

```ini
# 客户端 .conf
[Interface]
DNS = 10.10.0.1                                 # Pi-hole 在 VPN 网段的 IP
```

VPN 客户端连上后所有 DNS 走 Pi-hole——**手机出门用 4G 也广告屏蔽**。

### 模板 G — 备份 / 还原

```bash
# 备份（teleporter）
docker exec pihole pihole -a -t > /backup/pihole-$(date +%F).tar.gz

# 包含：所有 list / whitelist / blacklist / query log / 设置
```

或定期备份 `/opt/pihole/etc-pihole/`：

```bash
docker stop pihole
sudo tar czf /backup/pihole-$(date +%F).tar.gz -C /opt/pihole etc-pihole
docker start pihole
```

### 模板 H — 命令行管理

```bash
# 看状态
docker exec pihole pihole status

# 实时屏蔽率
docker exec pihole pihole -c

# 重置密码
docker exec pihole pihole -a -p

# 全文检索屏蔽规则
docker exec pihole pihole -q some-domain.com

# 临时关闭（30 分钟）
docker exec pihole pihole disable 30m

# 重启
docker restart pihole
```

## 关键参数调优速查

### 资源占用

| 网络规模 | RAM | 磁盘 |
|---|---|---|
| 家庭（< 10 设备） | 50 MB | < 100 MB |
| 中型（< 100 设备） | 200 MB | 1 GB |
| 大型（< 1k 设备） | 500 MB | 5 GB |

Pi-hole 极轻——树莓派 Zero 都能跑。

### 屏蔽率

| 场景 | 屏蔽率 |
|---|---|
| 默认 list（仅 Pi-hole 自带） | 5-15% |
| + StevenBlack hosts | 20-30% |
| + OISD + 多 list | 30-50% |
| 过度激进（很多假阳） | 50%+ → 网站打不开 |

### Query Log 大小

```bash
docker exec pihole pihole -a -d              # 关 query log（节省磁盘）
# 或保留时间
# UI → Settings → Privacy → Privacy mode
```

## 跨发行版兼容

容器化部署跨发行版一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅（SELinux 需 `setsebool -P container_manage_cgroup on`） |
| Alpine | ✅ |
| ARM64（树莓派） | ✅ |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`wireguard-vpn`** — 模板 F（自带广告屏蔽的 VPN）
- **`mosquitto-mqtt`** — Pi-hole 也能解析智能家居域名
- **`firewall-baseline`** — 开放 53/tcp + 53/udp（仅内网）
- **`certbot-ssl`** — Web admin 反代 + HTTPS

## 排错

### 53 端口被占（systemd-resolved）

```bash
sudo ss -tlnp | grep :53
# 显示 systemd-resolve

sudo systemctl disable --now systemd-resolved
sudo unlink /etc/resolv.conf
echo 'nameserver 1.1.1.1' | sudo tee /etc/resolv.conf
```

EnvForge Playbook 自动处理。

### Web admin 登录失败

```bash
# 重置密码
docker exec pihole pihole -a -p
# 输入新密码两次
```

### 客户端不走 Pi-hole

```bash
# 1. 路由器 DHCP DNS 设了？
nslookup pi.hole 192.168.1.1                  # 路由器 IP

# 2. 客户端真的拿到了 Pi-hole DNS？
# 手机：Wi-Fi 详情 → DNS 服务器
# Mac：scutil --dns | grep nameserver
# Linux：cat /etc/resolv.conf

# 3. 防火墙挡了 53？
sudo ufw allow from 192.168.0.0/16 to any port 53
```

### 某网站被错误屏蔽（白屏 / 加载失败）

```bash
# 测域名是否被 Pi-hole 屏蔽
nslookup blocked-site.com 127.0.0.1

# 查询 Pi-hole 哪个 list 屏蔽了它
docker exec pihole pihole -q blocked-site.com

# 加白名单
# UI → Whitelist → 加 blocked-site.com
# 或命令行
docker exec pihole pihole -w blocked-site.com
```

### 屏蔽率为 0%

```bash
# Pi-hole 没收到查询——客户端 DNS 没指向 Pi-hole
# 路由器 DHCP DNS 改对了？
# 重启客户端设备让 DHCP 生效
```

### Adlist 更新失败

```bash
# UI → Tools → Update Gravity
# 或命令行
docker exec pihole pihole -g

# 看错误（网络问题最常见）
docker logs pihole | grep -i gravity
```

### 容器健康检查失败

```bash
# 健康检查是 dig @127.0.0.1 google.com
# 容器内测试
docker exec pihole dig @127.0.0.1 google.com +short

# 上游 DNS 不通
docker exec pihole dig 1.1.1.1 google.com
```

### IPv6 DNS 没工作

```bash
# Pi-hole 默认仅 IPv4
# UI → Settings → DNS → 启用 IPv6 DNS（需上游也支持 IPv6）
# 路由器 DHCPv6 DNS 也要指向 Pi-hole
```

### Web admin 反代后 CSS 错乱

nginx 反代必须传 `X-Forwarded-Host` + 不改路径：

```nginx
location /admin/ {
    proxy_pass http://127.0.0.1:8081/admin/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 验证

```bash
# 1. 容器在跑
docker ps | grep pihole

# 2. 53 端口在听
sudo ss -ulnp | grep :53

# 3. DNS 解析正常
dig @127.0.0.1 google.com +short

# 4. 屏蔽生效（doubleclick 是 Google 广告域名）
dig @127.0.0.1 doubleclick.net +short
# 应返回 0.0.0.0 或 NXDOMAIN（被屏蔽）

# 5. Web admin
curl -I http://127.0.0.1:8081/admin/

# 6. 看 query 实时
docker exec pihole pihole -t

# 7. 看版本
docker exec pihole pihole -v
```

## 多次运行

`installMode: skip-existing`。**已存在的 docker-compose.yml 备份后重写**。**数据目录 `etc-pihole/` 保留**——所有 list / 设置 / query log 不丢。Web 密码每次按表单值更新。

要重置：

```bash
docker stop pihole
docker rm pihole
sudo rm -rf /opt/pihole
# 重跑 Playbook
```

## ⚠️ 敏感性

**privileged** — Pi-hole 占用关键 53 端口 + 容器 `NET_ADMIN` capability。

强制：

1. **不要 `--privileged`**——本 Playbook 仅用 NET_ADMIN（最小权限）
2. Web admin 端口（8081）**不要**直接公网暴露——内网 + 反代 + auth
3. **Pi-hole 是 SPOF**：挂了全网设备 DNS 失效。配 fallback DNS 到客户端
4. systemd-resolved 关了后**不能再启**（端口冲突）
5. **DNS 数据敏感**——Query Log 含每个设备访问的所有域名（隐私级别极高）

## 隐私说明

- Pi-hole **本地处理 DNS**——查询不发给第三方（除上游 DNS 1.1.1.1 等）
- Query Log（`pihole-FTL.db`）含**每个客户端 IP + 时间戳 + 查询的域名**——按合规需求处理
- 关闭 Query Log（隐私模式）：UI → Settings → Privacy → 选 anonymous（仅域名不存 IP）
- 上游 DNS（Cloudflare / Google / 等）能看到你 Pi-hole 服务器的 IP 和查询的域名（但看不到具体客户端）
- DNSSEC 仅验证签名，**不**加密查询（用模板 E 的 DoH 才加密）
- 不发遥测（Pi-hole 本身不联系任何 telemetry server）
- Adlist 更新时拉取公开 host 文件
