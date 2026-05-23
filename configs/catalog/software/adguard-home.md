# AdGuard Home 网络广告屏蔽 + 加密 DNS

AdGuard Home 是 **Pi-hole 的现代替代品**——本地 DNS 服务器 + 广告 / 跟踪域名屏蔽 + **内建 DoH / DoT / DoQ 加密 DNS 服务端**。Web UI 比 Pi-hole 更现代，配置更简单。**适合**：家庭网关 DNS、VPN 出口节点、小团队办公网。

## 你将得到什么

- 📦 **AdGuard Home 容器**（`adguard/adguardhome:latest`，host network 模式）
- ✅ DNS 服务监听 `0.0.0.0:53`（UDP + TCP）
- ✅ Web 管理面板 `http://server-ip:8080`
- ✅ 默认上游 = Cloudflare DoH + Google DoH + AdGuard DoQ（**全加密**）
- ✅ 默认屏蔽列表 3 个（AdGuard DNS / AdAway / EasyPrivacy）—— 数十万条规则
- ✅ DNSSEC 启用
- ✅ 4MB 缓存 + 24h 统计 + 7d 查询日志
- ✅ admin 用户密码 bcrypt 存储

## 表单字段说明

### `agh_admin_user` / `agh_admin_password`

Web 登录凭据。密码留空 = 自动生成 24 位（运行结束日志显示一次，**记下来**——AdGuard 用 bcrypt 存储，丢了只能重置数据目录）。

### `agh_web_port`

Web UI 端口，默认 8080。**生产建议挂反代到 :443**（不要直暴 8080 在公网）。

### `agh_dns_port`

DNS 服务端口。**必须是 53**——否则客户端要带端口号（多数路由器 DHCP 设置不支持自定义 DNS 端口）。

⚠️ **systemd-resolved 冲突**：现代 Ubuntu / Debian 默认开启 systemd-resolved，占用 `127.0.0.53:53`。AdGuard 要监听 `0.0.0.0:53` **必须先禁用**：

```bash
sudo systemctl disable --now systemd-resolved
sudo rm /etc/resolv.conf
sudo bash -c 'echo "nameserver 1.1.1.1" > /etc/resolv.conf'
```

### `agh_data_dir`

数据目录。包含：

- `conf/AdGuardHome.yaml` — 主配置（用户 / 上游 DNS / 屏蔽规则 / 加密设置）
- `work/data/querylog.json` — 查询日志（**含所有 DNS 请求**——隐私敏感）
- `work/data/stats.db` — 统计 SQLite
- `work/data/filters/` — 已下载屏蔽列表缓存

**备份此目录** = 备份完整 AdGuard 配置（迁移服务器仅复制目录就行）。

## 配置文件 / 目录速查

```
/opt/adguard-home/
├── docker-compose.yml
├── conf/
│   └── AdGuardHome.yaml                       # 主配置
├── work/
│   ├── AdGuardHome.yaml.bak                   # AdGuard 自动备份
│   ├── data/
│   │   ├── querylog.json                       # 查询日志（轮转）
│   │   ├── stats.db                            # 统计 SQLite
│   │   ├── filters/                            # 屏蔽列表缓存
│   │   └── sessions.db                         # Web 会话
│   └── leases.db                               # DHCP（如启用）
```

## 常见配置模板

### 模板 A — 路由器全网生效（推荐）

最简单部署：路由器 DHCP 设置 → DNS 改为 AdGuard 服务器 IP。

```
[路由器管理面板] → DHCP / LAN 设置
  Primary DNS:   192.168.1.10        ← AdGuard 服务器
  Secondary DNS: <留空>              ← **不要填 8.8.8.8 等**，否则设备会绕过 AdGuard
```

家中所有设备（手机 / 电视 / IoT / 笔电）自动用 AdGuard 解析 → 全网无广告。

### 模板 B — 单设备测试（不动路由器）

手机 / 笔电 WiFi 设置 → DNS 改静态：

- iOS：设置 → WiFi → 已连接网络 ⓘ → 配置 DNS → 手动 → 改成 AdGuard IP
- Android：WiFi 长按 → 修改网络 → IP 设置 = 静态 → DNS1 = AdGuard IP
- macOS：系统设置 → 网络 → 详细信息 → DNS → 改

测试：浏览器开 https://www.adguard.com/test.html

### 模板 C — 反代 + HTTPS（生产）

`nginx` 反代到 8080，开 HTTPS：

```nginx
server {
    listen 443 ssl http2;
    server_name adguard.example.com;

    ssl_certificate     /etc/letsencrypt/live/adguard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/adguard.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # AdGuard 会用 X-Forwarded-For 识别真实 IP（用于 client 设置）
    }
}
```

证书用 `certbot-ssl` Playbook 自动签。

### 模板 D — 启用 DoH 服务端（给客户端加密）

Web UI → Settings → Encryption settings：

- HTTPS port: `443`（与 web 反代冲突——改 `4443`）
- DoH path: `/dns-query`
- 上传 cert + key（同 nginx 用同一份 LE 证书）

iOS / Android 客户端配 DoH：

```
DoH URL: https://adguard.example.com/dns-query
```

iOS 14+ / Android 9+ 设置 → 私人 DNS 直接填上面 URL（不需 VPN App）。

### 模板 E — 自定义屏蔽规则

Web UI → Filters → Custom filtering rules，写 hosts / AdBlock 格式：

```
# 屏蔽指定域名
||tracking.example.com^

# 例外（始终允许）
@@||cdn.example.com^

# 重定向
0.0.0.0 ads.example.com
192.168.1.100 nas.lan          # 内网域名解析

# 屏蔽整域 + 子域
||doubleclick.net^

# 仅特定客户端（client = 192.168.1.5 才屏蔽）
||social.example.com^$client=192.168.1.5
```

详见 https://adguard.com/kb/general/dns-filtering-syntax/

### 模板 F — 与 WireGuard 集成（VPN 出口广告屏蔽）

`wireguard-vpn` 配置改 DNS：

```ini
# 客户端 .conf
[Interface]
PrivateKey = ...
Address = 10.10.0.2/24
DNS = 10.10.0.1                                 # AdGuard 在 VPN 网段的 IP

[Peer]
...
```

VPN 客户端连上后所有 DNS 走 AdGuard——**手机 4G 出门也广告屏蔽**。

### 模板 G — 备份 / 还原

```bash
# 备份（含历史日志 + 统计）
tar -czf adguard-backup-$(date +%F).tar.gz -C /opt adguard-home

# 还原（新机器）
mkdir -p /opt
tar -xzf adguard-backup-YYYY-MM-DD.tar.gz -C /opt
docker compose -f /opt/adguard-home/docker-compose.yml up -d
```

仅备份配置（不带日志）：

```bash
cp /opt/adguard-home/conf/AdGuardHome.yaml /backup/
```

## 关键参数调优速查

### 资源占用

| 客户端规模 | RAM | CPU |
|---|---|---|
| 1-5 设备 | 100 MB | 1% |
| 5-20 设备（家庭） | 200 MB | 2% |
| 50+ 设备（小办公） | 500 MB | 5-10% |

### 屏蔽列表选择

`conf/AdGuardHome.yaml` 的 `filters:` 段。**默认 3 个够 80% 场景**：

| 列表 | 重点 | 推荐 |
|---|---|---|
| **AdGuard DNS filter** | 通用广告 | ✅ 默认 |
| **AdAway** | 移动设备 | ✅ 默认 |
| **EasyPrivacy** | 跟踪器 | ✅ 默认 |
| **EasyList** | 桌面浏览器广告（已被 AdGuard filter 覆盖） | 可选 |
| **OISD** | 极激进（误伤多） | 高级用户 |
| **Steven Black hosts** | unified hosts，含色情 / 赌博 | 家长控制 |

加列表：Web UI → Filters → DNS blocklists → Add blocklist。

### 上游 DNS 选择

| 类型 | 例 | 推荐场景 |
|---|---|---|
| 加密（DoH） | `https://dns.cloudflare.com/dns-query` | **默认**——ISP 看不到 |
| 加密（DoT） | `tls://1.1.1.1` | 同上 |
| 加密（DoQ） | `quic://dns.adguard-dns.com` | 抗封锁强 |
| 明文 | `8.8.8.8` | **不推荐**——ISP 能看 + 抓包 |

国内推荐：`https://dns.alidns.com/dns-query` + `https://doh.pub/dns-query`

### 缓存调优

```yaml
# conf/AdGuardHome.yaml
dns:
  cache_size: 4194304        # 4 MB（默认）—— 5+ 设备调到 16777216 (16 MB)
  cache_ttl_min: 60           # 强制最小 TTL 60s（少 ISP 抖动）
  cache_ttl_max: 86400        # 最大 TTL 1 天（高命中率）
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Docker 部署 | ✅ | ✅ |
| systemd-resolved 冲突 | ⚠️ 必关 | ⚠️ 部分版本有 |
| 防火墙 53/udp | UFW `allow 53` | firewalld `--add-service=dns` |
| Anolis 9 | – | ✅ 容器化无差异 |
| ARM64（树莓派） | ✅ 多架构镜像 | ✅ |

## 与其它 catalog 项的配合

- **`pihole`** — **互斥替代品**（同占 53 端口）。新装首选 AdGuard Home（加密 DNS / 现代 UI）
- **`docker-host-profile`** — 必装前提
- **`wireguard-vpn`** — 模板 F（VPN 自带广告屏蔽）
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`firewall-baseline`** — 配合放行 53/udp（仅内网）

## 排错

### 启动失败 — 53 端口被占

```bash
sudo ss -tlnp | grep :53
# 看到 systemd-resolved 占了 127.0.0.53:53

# 关闭 systemd-resolved
sudo systemctl disable --now systemd-resolved
sudo rm /etc/resolv.conf
sudo bash -c 'echo "nameserver 1.1.1.1" > /etc/resolv.conf'

# 重启 AdGuard
docker restart adguardhome
```

### Web UI 显示 "Initial setup" 但已经设置过

```bash
# 配置文件被破坏 → 用 work/AdGuardHome.yaml.bak 还原
sudo cp /opt/adguard-home/work/AdGuardHome.yaml.bak /opt/adguard-home/conf/AdGuardHome.yaml
docker restart adguardhome
```

### 客户端 DNS 不通（设了 AdGuard 后无网）

```bash
# 1. AdGuard 服务真起来了？
docker ps --filter name=adguardhome
sudo ss -ulnp | grep :53

# 2. 防火墙放行？
sudo ufw status                         # Debian
sudo firewall-cmd --list-all            # RHEL

# 3. 客户端能连？
nslookup google.com <adguard-ip>
# 失败 → 服务器问题
# 成功但客户端不通 → 路由器 DHCP 配错了
```

### 屏蔽列表更新失败

```bash
# 服务器无外网？
docker exec adguardhome curl -fsS https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt | head

# 看 AdGuard 日志
docker logs --tail 100 adguardhome | grep -i filter
```

### 大量误屏蔽（合法网站打不开）

```
Web UI → Filters → Custom rules → 加白名单：
  @@||legitimate-site.com^

# 或 Query log 里点已屏蔽条目 → "Unblock"
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=adguardhome

# 2. DNS 服务响应
dig @127.0.0.1 google.com +short

# 3. 屏蔽生效（应返回 0.0.0.0 或拒绝）
dig @127.0.0.1 doubleclick.net +short
# 期望: 0.0.0.0

# 4. Web UI 响应
curl -fsS http://127.0.0.1:8080/ -I
# HTTP/1.1 200 OK 或 302
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写，**`AdGuardHome.yaml` 仅首次写入**——重跑不会覆盖你在 Web UI 里的修改。要重置：删除 `/opt/adguard-home/work/` 后重跑。

## ⚠️ 敏感性

**privileged** — DNS 是网络的"地图"。AdGuard **看到所有客户端访问的域名**——包括银行 / 邮箱 / 私密服务。

强制：

1. **公网必须 HTTPS**（反代 + LE）
2. admin 强密码 + 2FA（Web UI 设置中开 TOTP）
3. 别勾"Allow signup"或开放外网 53 端口
4. 查询日志默认存 7 天——隐私敏感时调短或禁用
5. 与 VPN 配合时确认 DNS leak（https://dnsleaktest.com 测）

## 隐私说明

- **DNS 查询日志** 含所有客户端访问的域名——**最敏感**
- 默认存 7 天 + 6 个月统计聚合（可在 Settings 调）
- 上游 DNS 看到查询；用 DoH 时**仅 ISP 看不到**，DNS 服务商仍看到
- 屏蔽列表 24h 自动更新——发起对 `adguardteam.github.io` 的 HTTPS 请求
- AdGuard 软件本身**无遥测**（开源）
