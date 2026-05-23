# Homelab 控制中心

**给 homelab 一个完整的"管理控制台"**——三件套一键部署：

- 📦 **Homepage** — 应用入口面板（书签 + 服务卡片 + 实时 widgets）
- 📦 **Uptime Kuma** — 服务存活监控 + 公开状态页 + 多渠道告警
- 📦 **Dozzle** — 实时 Docker 容器日志（毫秒延迟，Web 直接看）

**适合**：装了 5+ 自托管服务后必备——一个入口看到所有应用 + 它们的健康 + 实时日志，不用再到处找 URL / SSH 进容器看 logs。

## 你将得到什么

- ✅ Homepage 监听 `127.0.0.1:3010` —— 服务入口 + 系统资源 widget
- ✅ Uptime Kuma 监听 `127.0.0.1:3001` —— 监控所有服务 + 状态页
- ✅ Dozzle 监听 `127.0.0.1:9999` —— 实时日志（默认 admin 密码已生成）
- ✅ 3 个 yaml 配置首次自动生成（settings / services / widgets）
- ✅ Docker socket 挂载（自动发现容器）
- ✅ Healthcheck

## 表单字段说明

### `hd_data_dir`

```
{data_dir}/
├── homepage/config/      # YAML 配置（首次自动生成示例）
├── uptime-kuma/data/     # SQLite + 监控配置
└── dozzle/users.yml      # 用户认证
```

### `hd_uk_port` / `hd_hp_port` / `hd_dz_port`

3 个服务的本机绑定端口。生产用反代到不同子域。

### `hd_admin_password`

仅给 Dozzle 用（Homepage 默认无认证，Uptime Kuma 首次访问注册）。

## 常见配置模板

### 模板 A — 三子域反代

```nginx
# Homepage
server {
    listen 443 ssl http2;
    server_name home.example.com;
    ssl_certificate     /etc/letsencrypt/live/home.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/home.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# Uptime Kuma
server {
    listen 443 ssl http2;
    server_name status.example.com;
    ssl_certificate     /etc/letsencrypt/live/status.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/status.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# Dozzle
server {
    listen 443 ssl http2;
    server_name logs.example.com;
    ssl_certificate     /etc/letsencrypt/live/logs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logs.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:9999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 7200s;
    }
}
```

### 模板 B — Homepage 加你的服务

```yaml
# /opt/homelab-dashboard/homepage/config/services.yaml
---
- 监控:
    - Uptime Kuma:
        href: https://status.example.com
        description: 服务存活监控
        icon: uptime-kuma.svg
    - Dozzle:
        href: https://logs.example.com
        description: 实时日志
        icon: si-docker

- 工具:
    - Vaultwarden:
        href: https://vault.example.com
        description: 密码管理
        icon: vaultwarden.svg
    - Nextcloud:
        href: https://cloud.example.com
        description: 私有云盘
        icon: nextcloud.svg
    - FileBrowser:
        href: https://files.example.com
        description: 文件管理
        icon: filebrowser.svg

- 媒体:
    - Jellyfin:
        href: https://media.example.com
        icon: jellyfin.svg
    - Immich:
        href: https://photos.example.com
        icon: immich.svg
```

改完保存——Homepage 自动 reload。

### 模板 C — Uptime Kuma 监控所有服务

```
1. Uptime Kuma 首次访问 → 注册 admin
2. + Add New Monitor → HTTP(s)
   Name:     Vaultwarden
   URL:      https://vault.example.com/alive
   Interval: 60s
3. 重复给所有服务

4. Settings → Notifications → 配 Discord/Telegram → Test
5. Status Pages → New → 创建公开状态页
```

### 模板 D — 三件套加 SSO 保护（强烈建议）

如果已部署 `sso-stack`：

```yaml
# 改 docker-compose.yml 加 networks + labels
networks:
  default:
  sso:
    external: true
    name: sso-stack_sso

services:
  homepage:
    # ... 现有
    networks:
      - default
      - sso
    labels:
      - traefik.enable=true
      - traefik.http.routers.homepage.rule=Host(`home.example.com`)
      - traefik.http.routers.homepage.middlewares=authelia-auth@docker
      # ... 同样给 uptime-kuma / dozzle 加
```

### 模板 E — 备份

```bash
sudo tar -czf homelab-dashboard-$(date +%F).tar.gz -C /opt homelab-dashboard
```

## 关键参数调优速查

### 资源占用（三件套总和）

| 服务规模 | RAM | CPU |
|---|---|---|
| < 20 监控 / 简单 dashboard | 250 MB | 1% |
| < 100 监控 / 实时 widgets | 500 MB | 2-5% |

## 跨发行版兼容

容器化跨发行版一致，ARM64 完美支持。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`sso-stack`** — **强烈建议**（保护 Dozzle 看日志权限）
- 其他自托管 catalog 项 —— Homepage 都可在 services.yaml 列出

## 排错

### Homepage 配置改后没生效

```bash
# 自动 reload 慢——强制
docker restart dashboard-homepage

# yaml 语法错？
docker logs dashboard-homepage | head
```

### Uptime Kuma WebSocket 失败 / 进入空白

```bash
# nginx 必有 Upgrade / Connection: upgrade（见模板 A）
sudo nginx -t && sudo nginx -s reload
```

### Dozzle 看不到容器

```bash
# socket 挂上了？
docker exec dashboard-dozzle ls -l /var/run/docker.sock
```

### 三个端口都已被占

修改 vars 用其他端口（如 3011 / 3012 / 9998）。

## 验证

```bash
# 三个容器都跑着
docker ps --filter name=dashboard-homepage \
          --filter name=dashboard-uptime \
          --filter name=dashboard-dozzle

# Web 各自响应
curl -fsS http://127.0.0.1:3010/ -o /dev/null -w 'homepage %{http_code}\n'
curl -fsS http://127.0.0.1:3001/ -o /dev/null -w 'uptime %{http_code}\n'
curl -fsS http://127.0.0.1:9999/ -o /dev/null -w 'dozzle %{http_code}\n'
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——三个组件的数据 / 配置全部保留（Homepage yaml 仅首次创建）。

## ⚠️ 敏感性

**privileged** —

- Dozzle 看所有容器日志（含敏感信息）
- Homepage 暴露所有服务 URL
- Docker socket 挂载（即使 read-only，泄露 = 看到所有容器）

强制：

1. **公网必须 HTTPS + SSO**
2. Dozzle 强密码
3. Homepage 别公开（加 SSO 或 IP 白名单）
4. socket 仅 read-only 挂载（已默认）

## 隐私说明

- **完全本地**——所有配置 / 监控数据 / 用户在你服务器
- 各组件无遥测（Homepage / UK 开源；Dozzle 默认开 Plausible 自托管 analytics——可关）
- Uptime Kuma 主动探测被监控目标（暴露你的服务器 IP）
- 通知 webhook 出方向连第三方（按你配置）
