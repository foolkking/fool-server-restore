# LEMP 全栈环境（Linux + Nginx + MySQL + PHP-FPM）

LEMP = LAMP 的现代版——**E**(nginx) 替代 **A**pache，性能更好、配置更清晰。**Nginx + PHP-FPM** 是当前 PHP 应用部署事实标准（WordPress / Laravel / 大部分 PHP 框架的官方推荐）。

## 你将得到什么

- 📦 **nginx**（高性能 web server + 反向代理）
- 📦 **MySQL Server**（关系型数据库；可选 MariaDB）
- 📦 **PHP-FPM**（FastCGI 进程管理器，跑 PHP 应用）
- 📦 PHP 常用扩展：`php-mysql` `php-curl` `php-mbstring` `php-xml` `php-gd` `php-zip` `php-intl` `php-bcmath`
- ✅ Nginx 监听 80 端口，根目录 `/var/www/html`
- ✅ `.php` 请求自动转给 PHP-FPM 处理
- ✅ MySQL 服务运行，root 密码已设
- ✅ 示例站点 `/etc/nginx/conf.d/envforge-lemp.conf`

## 表单字段说明

### `mysql_root_password`

留空 = 自动生成 24 位强密码（运行结束日志显示一次）。**保存好**——后续创建业务数据库要用。

### `php_version`

| 值 | 适用 |
|---|---|
| `8.3`（默认 Ubuntu 24） | 当前推荐 |
| `8.2` | 老版本兼容 |
| `8.1`（Ubuntu 22 默认） | – |
| `7.4` | **EOL 不推荐**（仅老应用需要） |

### `domain`

填上后 Nginx server_name 用此域名，配 Certbot 拿 HTTPS。

## 配置文件 / 目录速查

```
# Nginx
/etc/nginx/
├── nginx.conf
├── conf.d/                                # ← EnvForge 推荐放 vhost
│   └── envforge-lemp.conf
└── sites-available/  + sites-enabled/      # Ubuntu 习惯

/var/log/nginx/
├── access.log
└── error.log

# PHP-FPM
/etc/php/{8.3}/fpm/
├── php.ini                                  # ← 主配置（每版本独立）
├── php-fpm.conf                             # FPM master 配置
└── pool.d/                                   # 进程池
    └── www.conf                              # ← 默认 pool

/run/php/php{8.3}-fpm.sock                    # FPM Unix socket
/var/log/php{8.3}-fpm.log                     # FPM 日志

# MySQL（见 mysql-server.md）
/etc/mysql/mysql.conf.d/mysqld.cnf
/var/lib/mysql/

# 项目（典型）
/var/www/myapp/
├── public/                                   # web root（**仅此目录对外**）
│   ├── index.php
│   └── .htaccess
├── src/                                       # 业务代码
├── vendor/                                     # composer 依赖
└── .env                                         # 环境变量（**0600**）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| nginx 包 | `nginx` | `nginx` |
| PHP-FPM 包 | `php{8.3}-fpm` | `php-fpm`（用 `dnf module enable php:8.3`） |
| MySQL 包 | `mysql-server` | `mysql-community-server`（需 MySQL 官方 repo） |
| FPM socket | `/run/php/php8.3-fpm.sock` | `/run/php-fpm/www.sock` |
| nginx vhost | `sites-available/` + `sites-enabled/` | `conf.d/` |
| FPM pool | `/etc/php/8.3/fpm/pool.d/www.conf` | `/etc/php-fpm.d/www.conf` |

## 常见配置模板

### 模板 A — Nginx vhost（PHP 应用基础）

`/etc/nginx/conf.d/myapp.conf`:

```nginx
server {
    listen 80;
    server_name myapp.example.com;
    root /var/www/myapp/public;                       # Laravel/Symfony 等框架的 public 目录
    index index.php index.html;

    # 安全 header
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 日志
    access_log /var/log/nginx/myapp-access.log;
    error_log  /var/log/nginx/myapp-error.log warn;

    # 文件上传大小（按需）
    client_max_body_size 64m;

    # SPA / 框架风格 URL（Laravel / Symfony）
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # PHP 处理
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;        # ⚠️ 注意路径按 PHP 版本
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME  $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT    $realpath_root;
        fastcgi_param HTTPS            $https if_not_empty;

        # 性能
        fastcgi_buffer_size          16k;
        fastcgi_buffers              4 16k;
        fastcgi_read_timeout         300s;
    }

    # 静态文件直出 + 缓存
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # 隐藏 .git / .env 等
    location ~ /\. {
        deny all;
    }

    # 仅 public/ 入口（防直接访问 vendor / config / src）
    location ~ /(vendor|config|src|tests|storage)/ {
        deny all;
        return 404;
    }
}
```

应用：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 模板 B — 创建业务数据库 + 用户

```bash
mysql -uroot -p
```

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'myapp'@'localhost' IDENTIFIED BY 'app-password';
GRANT ALL PRIVILEGES ON myapp.* TO 'myapp'@'localhost';
FLUSH PRIVILEGES;
```

应用 `.env`（如 Laravel）：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=myapp
DB_USERNAME=myapp
DB_PASSWORD=app-password
```

### 模板 C — PHP-FPM pool 调优 `/etc/php/8.3/fpm/pool.d/www.conf`

```ini
[www]
user  = www-data
group = www-data
listen = /run/php/php8.3-fpm.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

# Process manager
pm = dynamic                                          ; static / dynamic / ondemand
pm.max_children       = 50                            ; 最大子进程
pm.start_servers       = 5                             ; 启动时
pm.min_spare_servers   = 5
pm.max_spare_servers   = 10
pm.max_requests        = 500                           ; 处理 500 个请求后 worker 重启（防内存泄漏）

# Slow log
slowlog = /var/log/php8.3-fpm-slow.log
request_slowlog_timeout = 5s

# 状态页（Prometheus exporter / 调优用）
pm.status_path = /fpm-status
ping.path = /ping
```

应用：`sudo systemctl reload php8.3-fpm`。

### 模板 D — `php.ini` 关键调优 `/etc/php/8.3/fpm/php.ini`

```ini
; 上传 / POST 大小（按业务调）
upload_max_filesize = 64M
post_max_size       = 64M
max_input_time      = 60
max_execution_time  = 60

; 内存（单请求）
memory_limit = 256M

; 日志
log_errors = On
error_log  = /var/log/php8.3-fpm-errors.log
display_errors = Off                                   ; 生产必关

; OPcache（PHP 性能加速器，**生产必开**）
[opcache]
opcache.enable                  = 1
opcache.enable_cli               = 0
opcache.memory_consumption       = 256                  ; MB
opcache.interned_strings_buffer  = 16
opcache.max_accelerated_files     = 20000
opcache.validate_timestamps        = 1                   ; 生产可设 0（更快但需手动 reload）
opcache.revalidate_freq            = 60                  ; 60s 检查一次文件变化

; Session
session.gc_maxlifetime          = 7200                  ; 2h
session.cookie_secure           = 1                      ; 仅 HTTPS 发 cookie
session.cookie_httponly         = 1
session.cookie_samesite         = "Lax"

; 时区
date.timezone = Asia/Shanghai
```

应用：`sudo systemctl reload php8.3-fpm`。

### 模板 E — HTTPS（与 Certbot 集成）

```bash
sudo certbot --nginx -d myapp.example.com \
    --email admin@example.com --agree-tos --non-interactive --redirect
```

certbot 自动改 vhost 加 SSL + 80 → 443 跳转 + 续签 hook。

详见 `certbot-ssl.md`。

### 模板 F — 验证 PHP 工作（**测完即删**）

```bash
echo "<?php phpinfo(); ?>" | sudo tee /var/www/html/info.php
curl http://localhost/info.php | head             # 应返回 HTML

# 测完立刻删（暴露 phpinfo 是常见安全洞）
sudo rm /var/www/html/info.php
```

### 模板 G — Nginx 限速 / 防爬（API 场景）

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=conn:10m;
}

server {
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_conn conn 10;
        ...
    }
}
```

## 关键参数调优速查

### PHP-FPM 进程模型

| `pm` | 适用 |
|---|---|
| `static` | 高流量稳定（固定进程数） |
| `dynamic`（默认） | 通用（按需扩缩） |
| `ondemand` | 低流量节省内存（首请求慢） |

### `pm.max_children` 计算

```
pm.max_children = (物理内存 - 系统占用) / 单 worker 内存
```

例：4 GB RAM，PHP worker 平均 30 MB：

```
pm.max_children = (4000 - 1000) / 30 ≈ 100
```

### Nginx worker

```nginx
worker_processes auto;                              # = CPU 核数
events {
    worker_connections 4096;                         # 单 worker 连接数
    multi_accept on;
}
```

### 性能堆叠

| 层 | 优化 |
|---|---|
| OPcache | 性能 +50% |
| Redis session | 同 |
| Nginx fastcgi_cache | 静态化页面 +200% |
| PHP-FPM unix socket | 比 TCP 快 5-10% |

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Nginx | 默认仓库 | 默认仓库 |
| PHP-FPM | `php8.3-fpm`（按版本） | `dnf module enable php:8.3` + `php-fpm` |
| FPM socket | `/run/php/php8.3-fpm.sock` | `/run/php-fpm/www.sock` |
| MySQL | `mysql-server` | `mysql-community-server`（需 Oracle repo） |

EnvForge 自动检测 PHP 版本和 socket 路径。

## 与其它 catalog 项的配合

- **`mariadb`** — 替代 MySQL（建议）
- **`certbot-ssl`** — HTTPS（必须）
- **`redis-server`** — Session / cache（PHP 应用提速）
- **`nginx-web-service`** — 单独 Playbook
- **`mysql-server`** — 单独 Playbook（详细配置）
- **`php-toolchain`** — 详细 PHP 配置见此

## 排错

### PHP 文件浏览器直接下载（不解析）

Nginx 没匹配到 `.php` location，或 PHP-FPM socket 路径错：

```bash
# 1. socket 在哪
sudo find /run -name '*.sock' 2>/dev/null | grep php

# 2. nginx 配错改对
sudo nano /etc/nginx/conf.d/myapp.conf
# fastcgi_pass unix:/run/php/php8.3-fpm.sock;     # 正确路径

sudo nginx -t && sudo systemctl reload nginx
```

### 502 Bad Gateway

```bash
# 1. PHP-FPM 在跑？
sudo systemctl status php8.3-fpm

# 2. socket 文件在？
ls -la /run/php/

# 3. socket 权限
sudo chgrp www-data /run/php/php8.3-fpm.sock
sudo chmod 660 /run/php/php8.3-fpm.sock

# 4. SELinux（RHEL）
sudo setsebool -P httpd_can_network_connect 1

# 5. 看 PHP 错误
sudo tail -50 /var/log/php8.3-fpm.log
sudo tail -50 /var/log/php8.3-fpm-errors.log
```

### 上传大文件失败 `413 Request Entity Too Large`

三处都要改：

```nginx
# Nginx
client_max_body_size 100m;
```

```ini
# php.ini
upload_max_filesize = 100M
post_max_size       = 100M
```

```ini
# nginx fastcgi 段
fastcgi_buffer_size 32k;
fastcgi_buffers 8 32k;
```

### MySQL 连不上

```bash
# 看 MySQL 在跑
systemctl is-active mysql

# 测连接
mysql -u myapp -p myapp -e "SELECT 1;"

# 应用 .env DB_HOST 用 127.0.0.1 而非 localhost（避免走 socket 出问题）
```

### Composer install 失败

```bash
# 内存不够
php -d memory_limit=-1 /usr/local/bin/composer install --no-dev

# 国内服务器
composer config -g repos.packagist composer https://mirrors.aliyun.com/composer/
```

### OPcache 改了文件不生效

```ini
# 生产推荐
opcache.validate_timestamps = 0     # 不检查文件修改

# 改完代码必须重启 PHP-FPM
sudo systemctl reload php8.3-fpm
```

或开发环境：

```ini
opcache.validate_timestamps = 1
opcache.revalidate_freq = 0          # 每请求都检查
```

## 验证

```bash
# 1. Nginx 在跑
systemctl is-active nginx

# 2. PHP-FPM 在跑
systemctl is-active php8.3-fpm
sudo ss -lnp | grep php

# 3. MySQL 在跑
systemctl is-active mysql
mysql -uroot -p"$ROOT_PASSWORD" -e "SELECT VERSION();"

# 4. nginx 配置语法
sudo nginx -t

# 5. PHP 解析（测完删）
echo "<?php phpinfo(); ?>" | sudo tee /var/www/html/info.php
curl http://localhost/info.php | grep "PHP Version"
sudo rm /var/www/html/info.php

# 6. 看版本
nginx -v
php -v
mysql --version
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**Nginx site 配置每次按表单值重写**——大量定制建议放独立 conf.d 文件。MySQL root 密码每次按表单值更新。

## ⚠️ 敏感性

**review** — 三层服务（nginx + PHP-FPM + MySQL）都是公网攻击面。

强制：

1. 删 phpinfo / info.php / phpmyadmin（暴露版本与漏洞）
2. PHP `display_errors = Off`（生产）
3. nginx 隐藏 `.env` `.git` 等
4. MySQL bind 127.0.0.1
5. 业务用专用账号最小权限
6. HTTPS 必须

## 隐私说明

- nginx access log 含每个请求 IP / URL / UA
- PHP error log 可能含敏感堆栈（含路径 / 变量值）
- MySQL slow log 含 SQL（可能含密码 SET 等）
- `.env` 含数据库密码 / API key —— 备份加密
