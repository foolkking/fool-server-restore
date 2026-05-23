# LAMP 全栈环境

## 概述

LAMP 是 Linux + Apache + MySQL + PHP 的经典 Web 服务器组合，是全球最广泛使用的 Web 应用部署方案之一。适合 WordPress、Laravel、Drupal 等 PHP 应用。

## 包含组件

| 组件 | 说明 |
|------|------|
| Apache2 / httpd | Web 服务器（按发行版自动选） |
| MySQL Server | 关系型数据库 |
| PHP | 服务端脚本语言 |
| libapache2-mod-php | Apache PHP 模块 |
| php-mysql / php-curl / php-mbstring / php-xml / php-gd / php-zip | PHP 常用扩展 |

## 表单字段说明

### MySQL root 密码

留空自动生成 24 位强密码（运行结束显示一次）。**保存好**——后续创建业务数据库要用。

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y apache2 mysql-server php libapache2-mod-php php-mysql
sudo systemctl enable apache2
sudo systemctl enable mysql
sudo systemctl start apache2
sudo systemctl start mysql
```

## 安装后配置

### 1. MySQL 安全初始化

```bash
sudo mysql_secure_installation
```

### 2. 创建测试页面

```bash
echo "<?php phpinfo(); ?>" | sudo tee /var/www/html/info.php
```

访问 `http://your-server-ip/info.php` 验证 PHP 正常工作。

### 3. 安装常用 PHP 扩展

```bash
sudo apt-get install -y php-curl php-gd php-mbstring php-xml php-zip php-intl
sudo systemctl restart apache2
```

### 4. 配置虚拟主机

```bash
sudo nano /etc/apache2/sites-available/mysite.conf
```

```apache
<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/mysite
    <Directory /var/www/mysite>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

```bash
sudo a2ensite mysite.conf
sudo a2enmod rewrite
sudo systemctl reload apache2
```

## 验证安装

```bash
apache2 -v
mysql --version
php -v
curl http://localhost/
```

## 安全建议

- 删除 `info.php` 测试文件
- 运行 `mysql_secure_installation`
- 配置防火墙只开放 80/443 端口
- 定期更新所有组件

## 适用场景

- WordPress / Joomla / Drupal 站点
- Laravel / Symfony PHP 框架应用
- 传统 PHP Web 应用
- 内容管理系统（CMS）

## ⚠️ 跨发行版

EnvForge 自动处理包名/服务名差异：
- Apache：`apache2`（Ubuntu）↔ `httpd`（RHEL/Anolis），自动翻译
- MySQL：`mysql-server`（Ubuntu）↔ `mysql-community-server`（RHEL，需要 mysql 官方仓库），如果失败请考虑用 `mariadb` Playbook 替代
- PHP-Apache 模块：`libapache2-mod-php`（Ubuntu）↔ RHEL 自带 mod_php

## 多次运行

`installMode: skip-existing`。已装就跳过，但 MySQL root 密码每次会被表单值覆盖。

## Apache 配置详解

LAMP 用 Apache 而不是 nginx——配置体系不同。下面是常用的几个文件 / 目录：

```
# Ubuntu/Debian
/etc/apache2/
├── apache2.conf                    # 主配置（基本不动）
├── envvars                         # 环境变量（APACHE_RUN_USER / GROUP）
├── ports.conf                      # 监听端口列表
├── conf-available/  + conf-enabled/    # 全局配置片段（security.conf 等）
├── mods-available/  + mods-enabled/    # 模块（启停用 a2enmod / a2dismod）
└── sites-available/  + sites-enabled/  # 虚拟主机（启停用 a2ensite / a2dissite）

/var/log/apache2/                   # access.log + error.log

# RHEL/Anolis  (服务名 httpd)
/etc/httpd/
├── conf/httpd.conf                 # 主配置
├── conf.d/                         # 子配置（含 vhost）
└── conf.modules.d/                 # 模块加载

/var/log/httpd/
```

| 任务 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| 启 module | `sudo a2enmod rewrite` | 直接 `LoadModule` 写到 conf.modules.d/ |
| 停 module | `sudo a2dismod ssl` | 注释掉 LoadModule 行 |
| 启 site | `sudo a2ensite myapp` | 把 conf.d/myapp.conf 改名 .conf 即可 |
| 测试配置 | `sudo apache2ctl -t` | `sudo apachectl -t` 或 `sudo httpd -t` |
| 平滑重载 | `sudo systemctl reload apache2` | `sudo systemctl reload httpd` |

### 常用 mods（务必启用）

```bash
# Ubuntu 必装的几个 mod
sudo a2enmod rewrite           # .htaccess RewriteRule（Laravel/WordPress 必备）
sudo a2enmod headers           # 加 X-Frame-Options / HSTS 之类
sudo a2enmod expires           # 静态文件缓存控制
sudo a2enmod deflate           # gzip 压缩
sudo a2enmod ssl               # HTTPS（启用前要装证书）
sudo a2enmod proxy proxy_fcgi  # 反代 / FastCGI（PHP-FPM 模式必需）
sudo a2enmod http2             # HTTP/2

sudo systemctl reload apache2

# RHEL 上这些模块都默认编译进去了，但要加载：
# /etc/httpd/conf.modules.d/00-base.conf 里取消注释 LoadModule
```

### VirtualHost 模板（基础静态站点）

`/etc/apache2/sites-available/myapp.conf` 或 `/etc/httpd/conf.d/myapp.conf`：

```apache
<VirtualHost *:80>
    ServerName myapp.example.com
    ServerAdmin admin@example.com
    DocumentRoot /var/www/myapp

    <Directory /var/www/myapp>
        Options -Indexes +FollowSymLinks
        AllowOverride All           # 允许 .htaccess 改 RewriteRule（Laravel/WP 必需）
        Require all granted
    </Directory>

    # 隐藏 .git / .env 等敏感文件
    <FilesMatch "^\.">
        Require all denied
    </FilesMatch>

    # 静态资源缓存
    <FilesMatch "\.(css|js|png|jpg|jpeg|gif|svg|woff2?)$">
        Header set Cache-Control "max-age=2592000, public"
    </FilesMatch>

    ErrorLog  ${APACHE_LOG_DIR}/myapp-error.log
    CustomLog ${APACHE_LOG_DIR}/myapp-access.log combined
</VirtualHost>
```

```bash
sudo a2ensite myapp
sudo apache2ctl configtest && sudo systemctl reload apache2
```

### VirtualHost — PHP 应用（mod_php 模式）

LAMP 默认装的 `libapache2-mod-php` 让 Apache 进程内嵌 PHP 解释器（最简单，但每个 worker 都吃 PHP 内存）：

```apache
<VirtualHost *:80>
    ServerName myapp.example.com
    DocumentRoot /var/www/myapp/public

    <Directory /var/www/myapp/public>
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html
    </Directory>

    # PHP 解析交给 mod_php
    <FilesMatch \.php$>
        SetHandler application/x-httpd-php
    </FilesMatch>

    ErrorLog  ${APACHE_LOG_DIR}/myapp-error.log
    CustomLog ${APACHE_LOG_DIR}/myapp-access.log combined
</VirtualHost>
```

### VirtualHost — PHP-FPM 模式（生产推荐，性能更好）

mod_php 占内存大、不能用 PHP 8 JIT。生产推荐 PHP-FPM + mod_proxy_fcgi：

```bash
sudo a2enmod proxy proxy_fcgi setenvif
sudo a2enconf php8.3-fpm        # 启用 PHP-FPM 配置（Ubuntu 自带）
sudo a2dismod php8.3            # 停掉 mod_php
sudo systemctl reload apache2
```

VirtualHost 改：
```apache
<VirtualHost *:80>
    ServerName myapp.example.com
    DocumentRoot /var/www/myapp/public

    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php8.3-fpm.sock|fcgi://localhost"
    </FilesMatch>

    <Directory /var/www/myapp/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

### VirtualHost — HTTPS + 自动跳转

```apache
<VirtualHost *:80>
    ServerName myapp.example.com
    Redirect permanent / https://myapp.example.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName myapp.example.com
    DocumentRoot /var/www/myapp/public

    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/myapp.example.com/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/myapp.example.com/privkey.pem

    # 现代 TLS（仅 1.2/1.3）
    SSLProtocol             all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite          ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
    SSLHonorCipherOrder     off
    SSLSessionTickets       off

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

    <Directory /var/www/myapp/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

### `.htaccess` — Laravel / WordPress 必备

`AllowOverride All` 必须开（VirtualHost 里），否则 `.htaccess` 里的 RewriteRule 不生效。

Laravel `.htaccess`（在 public/ 目录）：
```apache
<IfModule mod_rewrite.c>
    <IfModule mod_negotiation.c>
        Options -MultiViews -Indexes
    </IfModule>

    RewriteEngine On

    # Handle Authorization Header
    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

    # Redirect Trailing Slashes If Not A Folder
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} (.+)/$
    RewriteRule ^ %1 [L,R=301]

    # Send Requests To Front Controller
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^ index.php [L]
</IfModule>
```

### 安全加固 `/etc/apache2/conf-available/security.conf`

```apache
ServerTokens Prod                # 不在响应里暴露版本号（Apache/2.4.x → Apache）
ServerSignature Off              # 错误页不显示版本

TraceEnable Off                  # 禁用 TRACE method
FileETag None                    # 不发 ETag（防 inode 泄露）

# 隐藏 .git / .env 等
<DirectoryMatch "/\.">
    Require all denied
</DirectoryMatch>

# 默认禁用所有目录访问，按 vhost 显式开放
<Directory />
    Options FollowSymLinks
    AllowOverride None
    Require all denied
</Directory>
```

启用：`sudo a2enconf security && sudo systemctl reload apache2`

### Server Status 监控

启用 `mod_status`：
```apache
<Location /server-status>
    SetHandler server-status
    Require local                # 仅本机访问
    Require ip 10.0.0.0/8        # 加内网
</Location>
```

```bash
sudo a2enmod status
sudo systemctl reload apache2
curl http://127.0.0.1/server-status
# 显示：当前请求数、worker 池、CPU、子进程
```

### MPM（多进程模型）选择

Apache 有三种 MPM——决定 worker 池行为：

| MPM | 模型 | 适合场景 |
|---|---|---|
| **prefork** | 每请求一个进程 | mod_php 必须用这个（PHP 不线程安全） |
| **worker** | 多进程 + 每进程多线程 | 不用 mod_php，性能好 |
| **event** | worker 改进版（异步处理 keepalive 连接） | 推荐，PHP-FPM 必用 |

切换：
```bash
sudo a2dismod mpm_prefork
sudo a2enmod mpm_event
sudo systemctl restart apache2
```

调优 `/etc/apache2/mods-available/mpm_event.conf`：
```apache
<IfModule mpm_event_module>
    StartServers             4
    MinSpareThreads         25
    MaxSpareThreads         75
    ThreadLimit             64
    ThreadsPerChild         25
    MaxRequestWorkers      400      # 总并发请求上限
    MaxConnectionsPerChild 10000    # 每 worker 处理 N 个请求后重启（防内存泄漏）
</IfModule>
```

## 关键参数调优速查

### MPM 选择（生产关键）

| MPM | 模型 | 适合 |
|---|---|---|
| **prefork** | 每请求一个进程 | mod_php 必用（PHP 不线程安全） |
| **worker** | 多进程 + 线程 | 不用 mod_php，性能好 |
| **event**（推荐） | worker + async keepalive | PHP-FPM 模式；现代场景 |

切换：

```bash
sudo a2dismod mpm_prefork
sudo a2enmod mpm_event
sudo systemctl restart apache2
```

### `mpm_event` 调优 `/etc/apache2/mods-available/mpm_event.conf`

```apache
<IfModule mpm_event_module>
    StartServers             4
    MinSpareThreads         25
    MaxSpareThreads         75
    ThreadLimit             64
    ThreadsPerChild         25
    MaxRequestWorkers      400      # 总并发请求上限
    MaxConnectionsPerChild 10000    # 每 worker 处理 N 个请求后重启（防内存泄漏）
</IfModule>
```

### MySQL 调优

| 参数 | 推荐 |
|---|---|
| `innodb_buffer_pool_size` | 物理内存 50-70%（专用 DB） |
| `max_connections` | 200-500（按业务） |
| `slow_query_log` | ON |
| `long_query_time` | 2s |

详见 `mysql-server.md` 的"关键参数调优速查"。

### PHP（mod_php / PHP-FPM）

```ini
upload_max_filesize = 64M
post_max_size = 64M
memory_limit = 256M
max_execution_time = 60
opcache.enable = 1
opcache.memory_consumption = 256
opcache.max_accelerated_files = 20000
```

### 资源占用

| 部署规模 | RAM | CPU |
|---|---|---|
| 个人 / 小流量 | 1 GB | 1 vCPU |
| 中型（100 req/s） | 2 GB | 2 vCPU |
| 大流量（1k req/s） | 8 GB+ | 4 vCPU+ |

LAMP 资源占用比 LEMP 高 30-50%（mod_php 每 worker 都吃 PHP 内存）。

## 排错

### `phpinfo` 不解析（直接下载 .php）

```bash
# mod_php 没启用
sudo a2enmod php8.3 2>/dev/null
sudo systemctl restart apache2

# 或切到 PHP-FPM 模式（见上方"VirtualHost — PHP-FPM 模式"）
```

### Apache 起不来 + `Address already in use`

80 端口被 nginx / haproxy 占：

```bash
sudo ss -tlnp | grep :80
sudo systemctl stop nginx
```

LAMP 与 LEMP 互斥（都占 80）。

### MySQL 连不上

```bash
sudo systemctl status mysql
mysql -uroot -p
# 错误见 mysql-server.md 排错
```

### `.htaccess` 不生效

```apache
# VirtualHost 必须开 AllowOverride
<Directory /var/www/myapp/public>
    AllowOverride All
</Directory>
```

```bash
sudo a2enmod rewrite
sudo systemctl restart apache2
```

### Apache reload vs restart

```bash
sudo apache2ctl configtest                 # 校验
sudo systemctl reload apache2              # 平滑（不断现有连接）
sudo systemctl restart apache2              # 重启（断连接）
```

### 大上传失败 `413 Request Entity Too Large`

```apache
# httpd.conf / vhost
LimitRequestBody 104857600                  # 100 MB
```

```ini
; php.ini
upload_max_filesize = 100M
post_max_size = 100M
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active apache2 || systemctl is-active httpd
systemctl is-active mysql

# 2. 端口
sudo ss -tlnp | grep :80

# 3. 配置语法
sudo apache2ctl configtest

# 4. 看 mod 启用
apache2ctl -M | grep -E '(php|rewrite|ssl)'

# 5. 看 PHP 模块
php -m | head -20

# 6. MySQL 连接
mysql -uroot -p"$ROOT_PASSWORD" -e "SELECT VERSION();"

# 7. PHP 解析（测完删）
echo "<?php phpinfo(); ?>" | sudo tee /var/www/html/info.php
curl http://localhost/info.php | grep "PHP Version"
sudo rm /var/www/html/info.php
```

## ⚠️ 敏感性

**review** — Apache + MySQL + PHP，多层公网攻击面。

强制：

1. **删 phpinfo / phpmyadmin / 任何 info.php**
2. `ServerTokens Prod` + `ServerSignature Off`（不暴露版本）
3. `display_errors = Off`（生产）
4. MySQL 跑 `mysql_secure_installation`
5. 业务用专用账号
6. HTTPS（certbot）

## 多次运行

`installMode: skip-existing`。包安装幂等。**MySQL root 密码每次按表单值更新**。

## 隐私说明

- Apache access log（`/var/log/apache2/access.log`）含 IP / URL / UA
- PHP error log 可能含路径 / 变量值
- MySQL log 见 `mysql-server.md`
- LAMP 不发遥测
