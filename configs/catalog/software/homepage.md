# Homepage 应用启动面板

Homepage（gethomepage.dev）是**自托管应用 dashboard**——书签 + 服务卡片 + **实时 widgets**（系统资源 / 天气 / 日历 / Plex 当前播放 / 等 100+ 集成）。**适合**：装了 5+ 自托管服务后没有入口页找不到 URL；homelab 给家人 / 同事一个"友好首页"。**轻量** ~100 MB RAM，配置纯 YAML 极简。

## 你将得到什么

- 📦 **Homepage 容器**（`ghcr.io/gethomepage/homepage:latest`）
- ✅ Web UI 监听 `127.0.0.1:3010`
- ✅ 5 个示例 yaml（settings / services / bookmarks / widgets / docker）首次自动生成
- ✅ Docker socket 挂载（自动发现带 `homepage.*` label 的容器）
- ✅ 系统资源 widget（CPU / RAM / 磁盘）
- ✅ 100+ 服务集成 widget（Sonarr / Radarr / Plex / Jellyfin / Pi-hole / Uptime Kuma / etc）
- ✅ Healthcheck

## 表单字段说明

### `hp_port`

本机端口，默认 3010。生产用反代到 https://home.example.com。

### `hp_data_dir`

```
{data_dir}/config/
├── settings.yaml         # 标题 / 主题 / 布局
├── services.yaml         # 服务卡片（你装的应用列表）
├── bookmarks.yaml        # 书签（GitHub / SO / 等外部链接）
├── widgets.yaml          # 顶部 widgets（系统资源 / 搜索 / 日期 / 天气 / 等）
└── docker.yaml           # Docker socket 配置（用于自动发现）
```

**所有定制都改 yaml 文件**——Homepage 没有 web 编辑器。改完容器自动 reload（约 5s 内生效）。

### `hp_page_title`

浏览器标题 + 顶部 heading 显示的名字。**仅首次安装写入** —— 改要手动编辑 settings.yaml。

## 配置文件 / 目录速查

```
{data_dir}/config/
├── settings.yaml         # 全局配置
├── services.yaml         # 服务列表（最常改）
├── bookmarks.yaml        # 书签
├── widgets.yaml          # widgets
├── docker.yaml           # docker 集成
├── kubernetes.yaml       # K8s 集成（可选）
└── custom.css            # 自定义 CSS（可选）

# Docker label 命名空间（用于自动发现）
homepage.group        # 哪个分组
homepage.name          # 显示名
homepage.icon          # 图标
homepage.href          # 链接
homepage.description   # 描述
homepage.widget.*      # widget 配置（如有）
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name home.example.com;

    ssl_certificate     /etc/letsencrypt/live/home.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/home.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 B — services.yaml 配你的服务

```yaml
---
- 监控:
    - Uptime Kuma:
        href: https://status.example.com
        description: 服务存活监控
        icon: uptime-kuma.svg                # https://github.com/walkxcode/dashboard-icons 找
        widget:                              # 可选——直接拉数据
          type: uptimekuma
          url: https://status.example.com
          slug: my-status

    - Grafana:
        href: https://grafana.example.com
        description: 指标可视化
        icon: grafana.svg

- 媒体:
    - Jellyfin:
        href: https://media.example.com
        description: 视频流媒体
        icon: jellyfin.svg
        widget:
          type: jellyfin
          url: https://media.example.com
          key: <Jellyfin API key>
          enableNowPlaying: true

    - Navidrome:
        href: https://music.example.com
        description: 音乐流媒体
        icon: navidrome.svg

- 工具:
    - Vaultwarden:
        href: https://vault.example.com
        description: 密码管理
        icon: vaultwarden.svg

    - Nextcloud:
        href: https://cloud.example.com
        description: 私有云盘
        icon: nextcloud.svg
        widget:
          type: nextcloud
          url: https://cloud.example.com
          username: <user>
          password: <app-password>           # 不是登录密码——NC 设置中专门生成
```

改完保存——Homepage 几秒内自动 reload。

### 模板 C — widgets.yaml（顶部资源 + 搜索 + 日期）

```yaml
---
# 系统资源
- resources:
    label: System
    cpu: true
    memory: true
    disk: /
    cputemp: true                            # 容器需挂 /sys/class/thermal
    uptime: true

# 多盘
- resources:
    label: Storage
    disk:
      - /
      - /mnt/data
      - /mnt/backup

# 搜索框
- search:
    provider: duckduckgo                     # google / brave / startpage
    target: _blank
    focus: true                              # 进首页就聚焦

# 日期时间
- datetime:
    text_size: xl
    format:
      dateStyle: long
      timeStyle: short
      hour12: false
      timeZone: Asia/Shanghai

# 天气（OpenWeatherMap）
- openweathermap:
    label: Beijing
    apiKey: <你的 key>
    cacheDuration: 1800
    units: metric
    lat: 39.9042
    lng: 116.4074
```

### 模板 D — Docker label 自动发现

让服务自动加入 Homepage——不用每次手动改 services.yaml：

```yaml
# 在你的应用 docker-compose.yml 加 labels
services:
  myapp:
    image: nginx
    # ... 其他配置
    labels:
      - homepage.group=工具
      - homepage.name=My App
      - homepage.icon=mdi-application
      - homepage.href=https://app.example.com
      - homepage.description=My web app
      # 可选 widget
      - homepage.widget.type=customapi
      - homepage.widget.url=https://app.example.com/api/stats
```

启动后 Homepage 自动检测——无需手动改配置。

### 模板 E — bookmarks.yaml（外部书签）

```yaml
---
- 开发:
    - GitHub:
        - abbr: GH
          href: https://github.com
    - GitLab:
        - abbr: GL
          href: https://gitlab.com
    - Stack Overflow:
        - abbr: SO
          href: https://stackoverflow.com

- 资讯:
    - Hacker News:
        - abbr: HN
          href: https://news.ycombinator.com
    - selfh.st:
        - abbr: SH
          href: https://selfh.st

- 工具:
    - URLEncode:
        - icon: si-encode
          href: https://www.urlencoder.org
```

### 模板 F — 自定义 CSS（深度个性化）

```css
/* {data_dir}/config/custom.css */

/* 隐藏 Homepage 标志 */
.homepage-logo {
  display: none;
}

/* 自定义背景 */
body {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
}

/* 服务卡片悬停效果 */
.services-block .service-card:hover {
  transform: scale(1.05);
  transition: transform 0.2s;
}
```

settings.yaml 加：

```yaml
useEqualHeights: true
hideVersion: true
```

### 模板 G — 接 Authelia（要登录才能看面板）

如果 Homepage 显示了内网服务的链接 + 状态——别公网公开。**用 Authelia 保护**：

```yaml
# 应用 docker-compose.yml 加（前提：已部署 sso-stack combo）
services:
  homepage:
    # ... 现有配置
    networks:
      - default
      - sso-stack_sso
    labels:
      - traefik.enable=true
      - traefik.http.routers.homepage.rule=Host(`home.example.com`)
      - traefik.http.routers.homepage.entrypoints=websecure
      - traefik.http.routers.homepage.tls.certresolver=le
      - traefik.http.routers.homepage.middlewares=authelia-auth@docker
      - traefik.http.services.homepage.loadbalancer.server.port=3000
```

### 模板 H — 备份

```bash
# config/ 目录就是全部
sudo tar -czf homepage-backup-$(date +%F).tar.gz -C /opt/homepage config

# 还原（新机器）
sudo tar -xzf homepage-backup.tar.gz -C /opt/homepage
docker compose -f /opt/homepage/docker-compose.yml up -d
```

## 关键参数调优速查

### 资源占用

| 服务数 + widget 数 | RAM | CPU |
|---|---|---|
| < 20 / 5 widget | 80 MB | 极低 |
| < 100 / 20 widget | 200 MB | 1-2% |
| 实时拉数据多 | 400 MB | 5% |

### Widget 刷新

```yaml
# settings.yaml
providers:
  longhorn:
    url: https://longhorn.example.com
    interval: 1500           # ms（默认 1500——一些 widget 1.5s 拉一次）
```

频繁拉数据的 widget（CPU / RAM / Plex 当前播放）每 1.5s 拉。改长省资源。

### 缓存

Homepage 自身**不缓存** —— 直接拉服务 API。被监控的服务才管缓存（Prometheus 抓 90% 命中等）。

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64（树莓派 / Apple Silicon） | ✅（多架构镜像） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提（Docker 自动发现要 socket）
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`uptime-kuma`** — 互补（UK 监控存活，Homepage 是入口）
- **`netdata-monitoring` / `prometheus-monitoring`** — Homepage widget 集成可拉数据
- **`sso-stack`** — 加 SSO 保护（推荐，模板 G）
- 几乎所有自托管 catalog 项都可在 services.yaml 列出

## 排错

### 改 yaml 后没生效

```bash
# 1. 容器自动 reload，约 5s 内生效。强制重启：
docker restart homepage

# 2. yaml 语法错？
docker logs homepage | head -50
# 看是否有 YAML parse error

# 3. 浏览器刷新（Ctrl + F5 强制）
```

### widget 显示 "API Error"

```bash
# 1. URL 对吗？容器从内部访问目标
docker exec homepage curl -fsS https://target-service.example.com/api/something

# 2. 凭据对吗？
# 服务的 API key / app password 重新生成

# 3. 网络可达？
docker exec homepage ping target-service-host
```

### Docker 自动发现不工作

```bash
# 1. socket 挂上了？
docker exec homepage ls -l /var/run/docker.sock

# 2. labels 写对了？key 必须 homepage.xxx（小写）
docker inspect myapp | grep -A20 Labels

# 3. docker.yaml 配了？
cat /opt/homepage/config/docker.yaml
```

### 反代后图标不显示

```bash
# Homepage 默认从 dashboard-icons CDN 拉图标
# 确认 nginx 没拦截外部资源 / CSP 不阻止

# 或本地化图标:
docker exec homepage ls /app/public/icons   # 容器自带的图标

# services.yaml 用相对路径:
icon: vaultwarden.svg                       # 自动从 walkxcode 仓库拉
icon: /icons/local-logo.png                 # 自托管图标（需挂载到容器）
```

### 系统资源 widget 显示 0%

```bash
# Linux 容器化系统资源信息有局限
# 容器需有 host PID 命名空间或挂载额外路径

# docker-compose.yml 加：
security_opt:
  - seccomp:unconfined
volumes:
  - /sys/class/thermal:/sys/class/thermal:ro
```

### 修改 hp_page_title 不生效

正常——hp_page_title **仅首次安装时**写入 settings.yaml。改要直接编辑：

```bash
sudo vi /opt/homepage/config/settings.yaml
# 改 title: 字段
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=homepage

# 2. Web UI 响应
curl -fsS http://127.0.0.1:3010/ -o /dev/null -w '%{http_code}\n'
# 200

# 3. 配置文件存在
ls /opt/homepage/config/

# 4. yaml 解析正常
docker logs homepage 2>&1 | grep -iE 'error|fatal' | head
# 无输出 = 配置 OK
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——**`config/` 内的 yaml 文件首次创建后不再覆盖**（已有 `*.yaml` 时 Playbook 跳过）。**手动改的全部保留**。

## ⚠️ 敏感性

**review** — Homepage 暴露你所有自托管服务的 URL。**别公开 Homepage 给陌生人**。

强制：

1. **公网必须 HTTPS**
2. 加 SSO 保护（模板 G）—— Homepage 一打开就看到所有服务列表，不要给爬虫
3. widget 含 API key 时（如 OpenWeatherMap key），yaml 文件权限 0640
4. 避免 services.yaml 写明真实 IP（用域名 / VPN-only 域名更安全）

## 隐私说明

- **完全本地**——所有配置在本机
- **无遥测**（开源）
- 图标默认从 dashboard-icons GitHub 仓库拉（出方向 HTTPS）—— 可以本地化
- widget 拉数据出方向连配置的目标服务（按你的 services.yaml）
- OpenWeatherMap / 其他公网 widget 会暴露你的服务器 IP 到对应 API
