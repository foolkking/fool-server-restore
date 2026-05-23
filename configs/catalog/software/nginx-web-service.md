# Nginx Web 服务部署与配置指南

一键安装并配置 Nginx，支持静态站点和反向代理两种模式。

## 🎯 你将得到什么

- ✅ Nginx 主程序（来自系统包源，会自动处理 dnf module 启用、SELinux 标签等）
- ✅ 一份名为 `envforge-default.conf` 的 server 块（写入 `/etc/nginx/conf.d/`），声明为 `default_server`
- ✅ **自动清理冲突**：自动禁用发行版自带的抢占式 default（备份到 `.envforge.bak`，可恢复）
- ✅ **网络权限放通**：RHEL 系自动设置 SELinux 布尔值，让 Nginx 能反代任意本地端口
- ✅ **安全启动**：启动、开机自启、重启时优先执行 `nginx -t` 校验配置
- ✅ **独立日志**：独立的访问/错误日志存放在 `/var/log/nginx/envforge-access.log` 和 `envforge-error.log`

> ⚠️ **注意**：如果已有 Web 服务（如 Apache2 / Httpd / Caddy）占用了 80 端口，请改用其他端口（例如 8080）或先停止旧服务。EnvForge 会在执行前预检并提示。

## 📝 表单字段说明

填写右侧表单，EnvForge 会把这些值代入 Playbook 模板。

| 字段 | 说明 |
| --- | --- |
| **网站域名 `domain`** | 你的网站访问地址。还没域名填本机 IP（如 `47.251.x.x`）。绑定域名时建议使用二级域名（`web.example.com` 而非裸域名），便于后续扩展。 |
| **监听端口 `listen_port`** | 默认 `80`。如遇启动失败提示 `Address already in use`，改成 `8080` / `8088` 等高位端口即可。 |
| **启用反向代理 `enable_reverse_proxy`** | **关闭**（默认）：作为静态文件服务器，指向 `/usr/share/nginx/html`。<br>**开启**：所有请求转发到后端应用（如 Node.js / Python / Go 等）。 |
| **后端地址 `upstream_url`**<br>（仅反向代理模式） | 后端应用监听的地址。如 `http://127.0.0.1:3000`（Node）、`http://127.0.0.1:8000`（Python）。EnvForge 会自动配好透传 Header 及 WebSocket 支持。 |
| **上传大小限制 `client_max_body_size`** | Nginx 默认仅允许 1 MB。普通网站选 10 MB，有文件上传需求选 100 MB，大文件场景选 1 GB。 |

## 📁 文件与目录速查

```text
/etc/nginx/
├── nginx.conf                      # 主配置（worker / events / http 全局段）
├── conf.d/                         # 存放独立站点配置（配置会自动引入到 http 段内）
│   ├── envforge-default.conf       # ← EnvForge 管的，每次运行会被覆盖
│   └── default.conf.envforge.bak   # ← 发行版自带的默认页，已被禁用
├── sites-available/ & enabled/     # Ubuntu/Debian 风格约定
├── snippets/                       # 公用配置片段（ssl-params.conf 等）
└── mime.types                      # MIME 映射（保持默认，不要改）

/var/log/nginx/
├── access.log & error.log          # 发行版默认全局日志
└── envforge-access.log             # EnvForge 当前站点的独立日志

/usr/share/nginx/html/              # 静态站点 webroot 默认位置
```

## 🛠️ 自定义你的站点（推荐做法）

`/etc/nginx/conf.d/envforge-default.conf` 由 EnvForge 管理，**重跑 Playbook 会被覆盖**。长期保留的配置请建立独立文件，文件名按业务命名（如 `myapp.conf`）。

> 最佳实践：**一个域名，一个独立的 `.conf` 文件**。

### 模板 A — 静态站点（带 Gzip + 长缓存 + SPA 路由回退）

适合 React / Vue / Angular 等前端框架打包后的 `dist`。

```nginx
server {
    listen 80;
    server_name app.example.com;
    root /var/www/myapp;
    index index.html;

    # SPA history 模式：找不到文件就回 index.html，让前端路由接管
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长缓存（带 hash 文件名，更新后浏览器自然换缓存）
    location ~* \.(?:css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # 单站点 Gzip 压缩覆盖
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

### 模板 B — 反向代理到后端 API（含 WebSocket）

> ⚠️ **重点提醒**：`upstream` 块必须放在 `server` 块的**外面**（即 http 块内部）。在 `/etc/nginx/conf.d/` 下的文件默认就在 http 块内。

```nginx
upstream backend_api {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    # 多机负载均衡：
    # server 10.0.0.11:3000;
    # server 10.0.0.12:3000 backup;
    keepalive 32;
}

server {
    listen 80;
    server_name api.example.com;
    client_max_body_size 50m;

    location / {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;

        # 传递真实客户端 IP 和协议
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持与 Keepalive 必备
        proxy_set_header Connection        "";
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $http_connection; # 如果主配置定义了 map，可用 $connection_upgrade

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # 给敏感接口（如 /metrics）加 IP 白名单
    location /metrics {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://backend_api;
    }
}
```

### 模板 C — 自动 HTTPS 与多服务同机部署 ⭐⭐⭐ 核心避坑

这是最常见的自托管场景：一台服务器同时跑 EnvForge、Vaultwarden 等多个服务，全部需要 HTTPS。

#### 🛑 避坑指南：Certbot 的"鸡生蛋"问题

**千万不要在 Nginx 里手动写入不存在的 443 端口和 `ssl_certificate` 路径去启动服务！** 这会导致 `nginx -t` 报错，进而导致 Certbot 无法运行。

正确的工作流（以新增 `vault.example.com` 为例）：

**第一步：写一个纯 HTTP（80 端口）的基础配置**

创建 `/etc/nginx/conf.d/vaultwarden.conf`：

```nginx
server {
    listen 80;
    server_name vault.example.com;
    client_max_body_size 256m;

    location / {
        proxy_pass http://127.0.0.1:8086;   # 你的后端端口
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

**第二步：让 Certbot 自动接管并生成 HTTPS**

执行以下命令。Certbot 会自动帮你把上面的配置加上 443 端口、写入证书路径，并配置 80 到 443 的强制跳转。

```bash
# 检查 Nginx 语法（此时一定能通过）
sudo nginx -t && sudo systemctl reload nginx

# 运行 Certbot 签发证书并自动改写配置
sudo certbot --nginx -d vault.example.com \
    --non-interactive --agree-tos -m admin@example.com \
    --redirect
```

### 模板 D — 拒绝陌生 IP 直接访问（防扫描神器）

当互联网上的爬虫或黑客直接访问你的服务器 IP 时，Nginx 会默认展示排在第一个的站点配置，这容易暴露你的隐蔽服务。建议建立一个专门的"黑洞"配置：

`/etc/nginx/conf.d/00-default-deny.conf`（`00` 开头确保优先级）：

```nginx
# 任何未匹配已有 server_name 的恶意/IP 直连请求 → 444（直接掐断连接，连错误页都不给）
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}
```

## 🔍 排错指南

当你遇到问题时，按以下顺序排查：

### 1. 检查语法与状态

```bash
sudo nginx -t                              # 检查配置文件语法是否正确
sudo systemctl status nginx --no-pager -l  # 查看服务运行状态
sudo journalctl -u nginx -n 50             # 查看 Nginx 最近 50 条系统日志
```

### 2. 解决 `502 Bad Gateway`

- **原因 1：后端没起来**。执行 `curl -v http://127.0.0.1:你的端口` 确认应用本身是否正常存活。
- **原因 2：SELinux 拦截**（仅限 RHEL/CentOS）。
  - 检查：`sudo ausearch -m avc -ts recent | grep nginx`
  - 修复：`sudo setsebool -P httpd_can_network_connect 1`

### 3. 解决 `Address already in use`（80 端口被占）

- 找出占用者：`sudo ss -tlnp | grep :80`
- 常见冲突进程：`apache2`、`httpd`，或系统自带残留的独立 `nginx` 进程。
- 清理僵尸 Nginx 进程：

```bash
sudo nginx -s quit
# 如果还杀不掉，暴力清理：
sudo pkill -KILL -f '^nginx:'
sudo rm -f /run/nginx.pid
sudo systemctl start nginx
```
