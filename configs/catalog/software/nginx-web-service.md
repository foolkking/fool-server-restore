# Nginx Web 服务

一键安装并配置 Nginx，支持静态站点和反向代理两种模式。

## 你将得到什么

- ✅ Nginx 主程序（来自系统包源，会自动处理 dnf module 启用、SELinux 标签等）
- ✅ 一份名为 `envforge-default.conf` 的 server 块（写入 `/etc/nginx/conf.d/`），声明为 `default_server`
- ✅ 自动禁用发行版自带的抢占式 default（备份到 `.envforge.bak`，可恢复）
- ✅ RHEL 系自动设置 SELinux 布尔，让 nginx 能反代任意本地端口
- ✅ 启动 + 开机自启 + 重启时优先 `nginx -t` 校验
- ✅ 独立的访问/错误日志：`/var/log/nginx/envforge-access.log`、`envforge-error.log`

> 已有 web 服务（apache2 / httpd / caddy）占用 80 端口时，请改用其他端口（例如 8080）或先停止旧服务。EnvForge 会在执行前预检并提示。

## 表单字段说明

填写右侧表单，EnvForge 会把这些值代入 Playbook 模板。

### 网站域名 `domain`

你的网站访问地址。还没有域名时，填本机 IP 即可（例如 `47.251.100.201`）。
绑定域名时建议使用二级域名（`web.example.com` 而非裸 `example.com`），便于后续扩展。

### 监听端口 `listen_port`

Nginx 监听的端口。**默认 80** 是标准 HTTP 端口，绑定后浏览器无需指定端口；
但 80 经常被其他服务占用（apache2/httpd/某些云监控）。如遇启动失败提示
"Address already in use"，改成 8080/8088 等高位端口即可。

### 启用反向代理 `enable_reverse_proxy`

- **关闭**（默认）：作为静态文件服务器，提供 `/usr/share/nginx/html` 目录。
- **开启**：所有请求转发到后端应用，适合 Node.js / Python / Go / Rust 写的动态站点。

### 后端地址 `upstream_url`（仅反向代理模式）

后端应用监听的地址。常见值：
- `http://127.0.0.1:3000`（Node.js 默认）
- `http://127.0.0.1:8000`（Django/Flask 默认）
- `http://127.0.0.1:8080`（Spring Boot/Tomcat 默认）

EnvForge 会自动配好 `Host`、`X-Real-IP`、`X-Forwarded-*` 头，以及 WebSocket 升级支持。

### 上传大小限制 `client_max_body_size`

`nginx` 默认只允许 1 MB 的请求体，对 API 够用但不够上传文件。普通网站选 10 MB，
有文件上传需求选 100 MB，大文件场景选 1 GB。

## 安装后

打开浏览器访问 `http://{domain}:{listen_port}` 即可看到 Nginx 默认页面（静态模式）
或被代理到后端的页面（代理模式）。

## 文件 / 目录速查

```
/etc/nginx/
├── nginx.conf                      # 主配置（worker / events / http 全局段）
├── conf.d/                         # http 段下的 server 块（RHEL 系约定）
│   ├── envforge-default.conf       # ← EnvForge 管的，每次运行会覆盖
│   └── default.conf.envforge.bak   # ← 发行版自带的，被禁用
├── sites-available/  + sites-enabled/   # Ubuntu/Debian 约定（include 在 nginx.conf）
├── snippets/                       # 公用配置片段（ssl-params.conf 等）
└── mime.types                      # MIME 映射（不要改）

/var/log/nginx/
├── access.log + error.log          # 发行版默认日志
└── envforge-access.log + envforge-error.log   # EnvForge 这个 server 的独立日志

/usr/share/nginx/html/              # 静态站点 webroot 默认位置
```

## 后续步骤

### 自定义你自己的站点（推荐做法）

`/etc/nginx/conf.d/envforge-default.conf` 由 EnvForge 管理，**重跑 Playbook 会被覆盖**。
长期保留的配置放到独立文件，文件名按业务命名：

```bash
# Ubuntu/Debian 风格（用 sites-available）
sudo nano /etc/nginx/sites-available/myapp.conf
sudo ln -s /etc/nginx/sites-available/myapp.conf /etc/nginx/sites-enabled/

# RHEL 风格（直接写到 conf.d）
sudo nano /etc/nginx/conf.d/myapp.conf

# 校验 + 平滑重载
sudo nginx -t && sudo systemctl reload nginx
```

下面给出几种最常用的 server 块模板，按需复制。

### 模板 A — 静态站点（带 gzip + 缓存 + history fallback）

适合 SPA（React / Vue / Angular）打包后的 dist。

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

    # gzip 压缩（http 段全局开也行，这里是单 site 覆盖）
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

### 模板 B — 反向代理到后端 API（含 WebSocket）

EnvForge 表单选 "启用反向代理" 时生成的就是这种结构，下面是手写版本（可加更多自定义）：

```nginx
upstream backend_api {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    # 多机时再加：
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
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";          # keepalive 必需
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # WebSocket / SSE 升级
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $http_connection;
    }

    # 仅给 /metrics 加 IP 白名单
    location /metrics {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://backend_api;
    }
}
```

### 模板 C — HTTPS（手填证书路径）

走 EnvForge 的 `Certbot SSL` Playbook 时这部分是自动写的；这里给手工版本：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;     # 全部跳 HTTPS
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 现代化 TLS（仅 TLS 1.2/1.3，禁 RC4/3DES 等弱加密）
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS（只有 100% 想全 HTTPS 才开，否则降级到 HTTP 就回不来）
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 安全相关 header
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/myapp;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 模板 D — PHP-FPM（LEMP 风格）

```nginx
server {
    listen 80;
    server_name myapp.example.com;
    root /var/www/myapp/public;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        # socket 路径按发行版/版本不同：
        #   Ubuntu 24 + PHP 8.3 → /run/php/php8.3-fpm.sock
        #   RHEL/Anolis        → /run/php-fpm/www.sock
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT   $realpath_root;
    }

    # 拒绝直接访问 .htaccess / .git 等
    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

### 模板 E — 限速（防爆破登录页 / API 限流）

```nginx
# 在 http 段（一般写在 /etc/nginx/conf.d/limits.conf 单独文件里）：
limit_req_zone  $binary_remote_addr zone=login:10m rate=5r/m;     # 登录每分钟 5 次
limit_req_zone  $binary_remote_addr zone=api:10m   rate=10r/s;    # API 每秒 10 次
limit_conn_zone $binary_remote_addr zone=conn:10m;

server {
    # ...

    location /api/login {
        limit_req zone=login burst=3 nodelay;
        limit_req_status 429;
        proxy_pass http://backend;
    }

    location /api/ {
        limit_req  zone=api burst=20 nodelay;
        limit_conn conn 50;
        proxy_pass http://backend;
    }
}
```

### 主配置 nginx.conf 关键参数（按需调）

`/etc/nginx/nginx.conf` 一般不需要动，但如下场景可调：

```nginx
# 进程数 = CPU 核数（默认 auto，一般不改）
worker_processes auto;

events {
    worker_connections 4096;     # 每个 worker 最大并发，默认 1024，高负载机器调到 4096+
    use epoll;                   # Linux 高性能事件模型，默认就是
    multi_accept on;             # worker 一次接受多个连接，默认 off
}

http {
    # 长连接 / 性能
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    types_hash_max_size 4096;
    server_tokens   off;         # 隐藏 nginx 版本号（响应 header / 错误页）

    # 客户端请求体上限（被本 Playbook 表单覆盖到 server 块；这里是全局兜底）
    client_max_body_size 100m;
    client_body_buffer_size 128k;

    # gzip 全局开（按需）
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/rss+xml image/svg+xml;
}
```

修改后：
```bash
sudo nginx -t                  # 必做：先校验
sudo systemctl reload nginx    # 平滑重载（不断现有连接）
```

### 让证书续签后自动 reload

Certbot 自动续签时不会自动 reload nginx。在 `/etc/letsencrypt/renewal-hooks/deploy/`
下放一个脚本：

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### 与其它组件配合

EnvForge catalog 里的常见组合：
- **Certbot SSL** — 给本 nginx 自动签证书并改写 server 块
- **PHP toolchain** — 配合做 LEMP stack（参见 `lemp-stack` combo）
- **Node.js + PM2** — 后端 PM2 跑应用，nginx 反代到 :3000（参见 `node-production-deploy` combo）
- **Fail2Ban** — 自动 ban 暴力破解 / 扫描 IP（jail 已有 `nginx-http-auth` / `nginx-noscript` 规则）

### 排错

```bash
sudo nginx -t                              # 配置语法检查
sudo systemctl status nginx --no-pager -l  # 查看启动状态
sudo journalctl -u nginx -n 50             # 查看最近日志
sudo ss -tlnp | grep :80                   # 看谁占了 80 端口
sudo nginx -T | grep envforge-default      # 确认我们的配置已生效
```

#### 浏览器看到小写 "nginx" 的 404 Not Found 页面

那是发行版自带的 default server 在拦截请求，不是我们配置的 server block 的输出。
EnvForge 已经会在安装时自动备份并禁用 `sites-enabled/default`（Ubuntu）和
`conf.d/default.conf`（RHEL），但如果你手动恢复了它们，会再次冲突。
确认：
```bash
ls /etc/nginx/conf.d/default.conf*       # RHEL: 应只有 .envforge.bak
ls /etc/nginx/sites-enabled/default*     # Ubuntu: 应为空或只有 .envforge.bak
sudo nginx -T | grep -E '^\s*(listen|server_name)' # 看 80 端口上有几个 server
```
然后 `sudo systemctl reload nginx`。

#### 反代模式下出现 502 Bad Gateway

- 后端没起来：`curl -v http://127.0.0.1:1027`（替换为你的 upstream_url 端口）
- SELinux 阻止（RHEL 系）：`sudo ausearch -m avc -ts recent | grep nginx`，
  解决：`sudo setsebool -P httpd_can_network_connect 1`
- 防火墙阻止 nginx 出向连接：罕见，但 firewalld + zone trusted 异常时会发生

#### 服务起不来 + journal 提示 "Address already in use"

EnvForge 会在 systemctl start 之前预检，但如果是手工跑的：
```bash
sudo ss -tlnp | grep :80                 # 看谁占着
sudo systemctl disable --now apache2     # 例：停掉 apache2
```

#### 孤儿 nginx 进程（systemctl status 显示 inactive 但端口仍被 nginx 占）

之前手工跑过 `sudo nginx`（不带 systemctl），那个 master 不在 systemd 控制下，
systemctl restart 不会停它。表现：
- `systemctl is-active nginx` → `failed` 或 `inactive`
- `sudo ss -tlnp \| grep :80` → 显示 `users:(("nginx",pid=N,...))`
- 重启时 journal 里反复出现 `bind() to 0.0.0.0:80 failed (98: Address already in use)`

EnvForge 现在会自动检测并清理（commit `*` 之后），但手工修：
```bash
sudo nginx -s quit                       # 先优雅关
sleep 3
pgrep -f '^nginx: master' && sudo pkill -KILL -f '^nginx:'   # 还在就强杀
sudo rm -f /run/nginx.pid                # 清过期 pid 文件
sudo systemctl start nginx               # systemd 接管
sudo systemctl enable nginx              # 设开机自启
```

## 隐私说明

证书私钥不进入 Playbook 模板，由 Certbot 在目标机器上独立生成。
