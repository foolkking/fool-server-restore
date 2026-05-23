# 自托管必备四件套

家庭 NAS / 小团队 NAS **一键开荒**——4 个最高频使用的自托管服务，docker compose 一键起：

- 📦 **Traefik** — 反代 + 自动 HTTPS（内置 Let's Encrypt）
- 📦 **Vaultwarden** — 密码管理（Bitwarden 服务端 Rust 重写）
- 📦 **Pi-hole** — 网络广告屏蔽 DNS
- 📦 **Home Assistant** — 智能家居中枢

## 你将得到什么

- ✅ 4 个核心容器，docker compose 编排
- ✅ Traefik 自动给 vault.example.com 签 LE 证书
- ✅ Vaultwarden + Pi-hole 通过 Traefik label 自动反代
- ✅ Home Assistant 用 host network（自动发现 IoT）
- ✅ 数据持久化 `/opt/selfhost/`
- ✅ Pi-hole 替代 systemd-resolved 占 53 端口
- ✅ Vaultwarden admin token + Pi-hole 密码自动生成

## 表单字段说明

### `selfhost_acme_email`

LE 邮箱。证书续期失败通知。

### `selfhost_data_dir`

所有数据根目录。

### `selfhost_vaultwarden_domain`

Vaultwarden 公开域名。**DNS 必须已指向本机公网 IP**——Traefik 用 HTTP-01 challenge 签 LE 证书。

### `selfhost_pihole_password`

Pi-hole admin 密码。

### `selfhost_ha_timezone`

时区。

## 配置文件 / 目录速查

```
/opt/selfhost/
├── docker-compose.yml                       # ← EnvForge 写入
├── traefik/
│   └── letsencrypt/
│       └── acme.json                          # ← LE 证书（**0600**）
├── vaultwarden/                                # 密码 DB
├── pihole/
│   ├── etc-pihole/
│   └── etc-dnsmasq/
└── home-assistant/                              # HA 配置
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker compose |
| 内存 | ~2 GB（HA 600M + 其他） |
| 端口占用 | 80 / 443（Traefik）+ 53/tcp 53/udp（Pi-hole）+ 8123（HA） |

## 常见配置模板

### 模板 A — 部署前准备

1. **DNS 解析**：`vault.example.com` 的 A 记录指向本机公网 IP（让 Traefik 签 LE）
2. **80 + 443 端口**：防火墙开放（HTTP-01 challenge 需要）
3. **53 端口**：systemd-resolved 必须关（本 Playbook 自动处理）
4. **物理内存**：至少 2 GB（推荐 4 GB）

### 模板 B — 启动后第一步操作

#### Vaultwarden

```
https://vault.example.com/admin
```

输入运行结束日志显示的 Admin Token → 进 admin 面板：

1. Settings → General → 检查 Domain URL
2. Users → Invite User → 邀请你自己（如启用 SMTP）

或临时开 signup → 注册 → 关 signup（`SIGNUPS_ALLOWED=false`）。

#### Pi-hole

```
http://server-ip/admin
```

输入运行结束日志显示的密码：

1. Tools → Update Gravity（拉取广告 list）
2. **路由器 DHCP DNS 改为本机 IP**（全网走 Pi-hole）

#### Home Assistant

```
http://server-ip:8123/
```

走引导：

1. 创建 Owner 账号
2. 选位置 / 时区 / 国家
3. HA 自动扫描 IoT 设备 → Setup integrations

#### Traefik dashboard（可选启用）

默认未启用 dashboard（生产更安全）。要看当前 routers / services：

```bash
# 看实际配置
docker exec traefik traefik show
```

或加 dashboard 路由（**仅自己 IP**）—— 编辑 docker-compose.yml 加 traefik 服务的 labels。

### 模板 C — 加更多服务（动态扩展）

要让 Traefik 自动反代任意新容器：

```yaml
# 加到 /opt/selfhost/docker-compose.yml
services:
  myapp:
    image: myapp:latest
    labels:
      - traefik.enable=true
      - traefik.http.routers.myapp.rule=Host(`myapp.example.com`)
      - traefik.http.routers.myapp.entrypoints=websecure
      - traefik.http.routers.myapp.tls.certresolver=letsencrypt
      - traefik.http.services.myapp.loadbalancer.server.port=8080
```

```bash
docker compose up -d
```

Traefik 自动签 LE 证书 + 配反代。

### 模板 D — Vaultwarden 客户端配置

浏览器装 Bitwarden 插件 → 设置 → Self-hosted → URL `https://vault.example.com` → 登录。

iOS / Android：装 Bitwarden App → 设置 → 服务器 URL → 同上。

详见 `vaultwarden.md`。

### 模板 E — 让本机也走 Pi-hole

```bash
echo 'nameserver 127.0.0.1' | sudo tee /etc/resolv.conf
```

或路由器 DHCP DNS 设为本机 IP，本机 DHCP 自动续约后用 Pi-hole。

### 模板 F — 备份策略

```bash
# 1. 停所有服务
cd /opt/selfhost
docker compose stop

# 2. tar 全部
sudo tar czf /backup/selfhost-$(date +%F).tar.gz -C /opt selfhost

# 3. 启
docker compose start

# 4. 加密 + 异地
gpg -c /backup/selfhost-$(date +%F).tar.gz
```

### 模板 G — 升级

```bash
cd /opt/selfhost
docker compose pull
docker compose up -d                            # 滚动更新
```

升级前**必备份**——HA / Vaultwarden / Pi-hole 偶有 breaking change。

## 关键参数调优速查

### 资源占用

| 服务 | RAM |
|---|---|
| Traefik | 50 MB |
| Vaultwarden | 100 MB |
| Pi-hole | 100 MB |
| Home Assistant | 600 MB |
| **总计** | ~1 GB（峰值 1.5 GB） |

### 性能

| 项 | 推荐 |
|---|---|
| Traefik 自动 HTTPS | 自动续期，无需 cron |
| Vaultwarden SQLite | < 1k 用户够用 |
| Pi-hole | 极快（< 1ms 解析延迟） |
| HA 历史数据库 | SQLite 默认；> 50 设备建议外接 InfluxDB |

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- 单独 catalog 项（`vaultwarden` / `pihole` / `home-assistant` / `traefik-proxy`）—— 替代品（按需选其中一个独立部署）
- **`certbot-ssl`** — 不需要（Traefik 自带 ACME）
- **`firewall-baseline`** — 配合保护 80/443/53

## 排错

### Traefik 证书签不下来

```bash
docker logs traefik | grep -i acme

# 1. DNS 解析
dig +short vault.example.com

# 2. 80 端口可达
curl -I http://vault.example.com/

# 3. acme.json 权限
ls -la /opt/selfhost/traefik/letsencrypt/acme.json    # 必须 -rw-------
```

### Pi-hole 53 端口被占

```bash
sudo ss -tlnp | grep :53
# 仍看到 systemd-resolved → Playbook 应已自动关
sudo systemctl disable --now systemd-resolved
docker compose restart pihole
```

### HA 自动发现失效

`network_mode: host` 必须——bridge 模式 mDNS 不工作。本 Playbook 已用 host 网络。

### 容器互相访问 hostname 不通

Traefik label 模式不需容器间通信。HA 用 host network，本身就能访问宿主机所有服务（`localhost`）。

### 内存不够

```bash
free -h

# 临时停 HA（最大头）
docker compose stop homeassistant

# 加 swap（catalog swap-config）
```

## 验证

```bash
# 所有容器 Up
docker ps | grep -E '(traefik|vaultwarden|pihole|homeassistant)'

# Traefik 在 80 / 443
sudo ss -tlnp | grep -E ':(80|443) '

# Pi-hole 在 53
sudo ss -ulnp | grep :53

# HA 在 8123（host network）
sudo ss -tlnp | grep :8123

# Vaultwarden 健康
curl -k -H "Host: vault.example.com" https://127.0.0.1/alive

# Pi-hole 健康
docker exec pihole pihole status

# HA 健康
curl http://127.0.0.1:8123/manifest.json
```

## 多次运行

`installMode: skip-existing`。compose 重写。**所有数据保留**。

## ⚠️ 敏感性

**privileged** —

- HA 用 privileged + host network = 等同 root
- Vaultwarden 持有所有密码
- Pi-hole 持 NET_ADMIN capability
- Traefik 挂 docker.sock = 等同 root

强制：

1. **公网 DNS 仅 vault.example.com 暴露**——其它服务限内网
2. Pi-hole 53 端口仅内网（防火墙）
3. HA 启用 2FA
4. Vaultwarden admin token / Pi-hole 密码离线备份
5. Traefik dashboard **不要**公网暴露

## 隐私说明

- 所有数据本地存储
- Traefik / Vaultwarden / HA / Pi-hole 都不发遥测
- Pi-hole DNS 查询走配置的上游（默认 Cloudflare）
- HA 集成的云服务（Tuya / Aqara 等）会走厂商云
- LE 注册邮箱在 LE 账号里
- LE 证书的 domain 透明化记录到 CT log
