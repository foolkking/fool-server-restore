# PHP 8 工具链

PHP 8 + 常用扩展（mysql / pgsql / curl / mbstring / gd / intl / 等）+ Composer 包管理器。
Ubuntu 上自动加 ondrej/php PPA 装新版。

## 你将得到什么

- 📦 **php** + **php-cli**
- 📦 常用扩展：curl / mbstring / xml / zip / mysql / pgsql / sqlite3 / gd / intl / bcmath
- 📦 **composer**（PHP 包管理器）

## 用法

### 验证

```bash
php --version
composer --version
php -m              # 看已加载扩展
```

### 国内 Composer 加速

```bash
composer config -g repo.packagist composer https://mirrors.aliyun.com/composer/
# 或
composer config -g repo.packagist composer https://mirrors.tencent.com/composer/
```

### 装一个 Laravel 项目

```bash
composer create-project laravel/laravel example-app
cd example-app
php artisan serve --host=0.0.0.0 --port=8000
```

### 装 PHP-FPM（生产用）

CLI 版的 PHP 适合命令行。Web 应用要 PHP-FPM：
```bash
sudo apt-get install php-fpm        # Ubuntu
sudo dnf install php-fpm            # RHEL

sudo systemctl enable --now php8.3-fpm   # Ubuntu，版本号按你装的
sudo systemctl enable --now php-fpm      # RHEL
```

然后 nginx 配置：
```nginx
location ~ \.php$ {
    fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
    fastcgi_index index.php;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}
```

### 升级到 PHP 8.3 / 8.4（最新）

Ubuntu 上加了 ondrej PPA 后：
```bash
sudo apt-get install php8.3      # 装 8.3
sudo update-alternatives --config php   # 切默认
```

## ⚠️ 敏感性

**safe** — 装语言运行时。

## 验证

```bash
php --version
composer --version
php -m | grep -E "PDO|curl|mbstring"
```

## 排错

- **`Could not load php_*.dll`** — 这是 Windows 错误，Linux 不会出现。
- **Ubuntu 上 PHP 版本太老** — ondrej PPA 应该已加，但首次 add-apt-repository 可能因为 GPG 问题失败。手动：
  ```bash
  sudo apt-get install software-properties-common
  sudo LC_ALL=C.UTF-8 add-apt-repository ppa:ondrej/php -y
  sudo apt-get update
  ```
- **跨发行版**：包名差异大（`php-mysql` vs `php-mysqlnd`），EnvForge 用 ignore_missing 容错。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

PHP 不发遥测。Composer 默认不发，但 `composer self-update` 会查版本。

## PHP-FPM 配置详解（生产 Web 必读）

CLI 版的 PHP 适合命令行 / artisan / cron 脚本。**生产 Web 必须用 PHP-FPM**：
nginx / apache 把 `.php` 请求通过 FastCGI 交给 PHP-FPM，PHP-FPM 维护一个 worker 池处理。

### 路径速查（按发行版/版本不同）

| 发行版 | 主目录 | pool 文件 | sock 路径 | 服务名 |
|---|---|---|---|---|
| Ubuntu 22 (PHP 8.1) | `/etc/php/8.1/fpm/` | `pool.d/www.conf` | `/run/php/php8.1-fpm.sock` | `php8.1-fpm` |
| Ubuntu 24 (PHP 8.3) | `/etc/php/8.3/fpm/` | `pool.d/www.conf` | `/run/php/php8.3-fpm.sock` | `php8.3-fpm` |
| RHEL/Anolis 9 | `/etc/php-fpm.d/` | `www.conf` | `/run/php-fpm/www.sock` | `php-fpm` |

不知道你的具体路径时：
```bash
sudo find /etc -name 'php-fpm*.conf' -o -name 'www.conf' 2>/dev/null
sudo find /run -name '*.sock' | grep -i php
sudo systemctl list-units '*php*' --no-pager
```

### `php.ini` 关键参数（CLI + FPM 共用）

PHP 有两份 ini：`/etc/php/<v>/cli/php.ini`（命令行）和 `/etc/php/<v>/fpm/php.ini`（FPM）。
**改 web 应用相关参数改 fpm 那份，改完 reload php-fpm 才生效**。

```ini
; === 资源上限 ===
memory_limit = 256M               ; 单个请求最多用多少内存（默认 128M）
max_execution_time = 60           ; 单请求最长执行秒数
max_input_time = 60
post_max_size = 50M               ; 表单 POST 最大尺寸
upload_max_filesize = 50M         ; 单文件上传最大尺寸
max_file_uploads = 20

; === 错误展示 ===
display_errors = Off              ; 生产必关！否则错误堆栈泄露给用户
log_errors = On
error_log = /var/log/php-fpm/error.log
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT

; === Session 安全 ===
session.cookie_secure = 1         ; 仅 HTTPS 下下发 cookie（生产必开）
session.cookie_httponly = 1       ; JS 读不到 session cookie，防 XSS
session.cookie_samesite = "Lax"
session.use_strict_mode = 1
session.gc_maxlifetime = 1440     ; session 24min 不用就过期

; === Opcache（性能关键）===
opcache.enable = 1
opcache.enable_cli = 0
opcache.memory_consumption = 256  ; MB；大型 Laravel/Symfony 调到 512+
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 1   ; 开发：1（每次检查源文件改没改）
opcache.validate_timestamps = 0   ; 生产：0（强制只信缓存，部署后必须 reload php-fpm）
opcache.revalidate_freq = 60      ; validate_timestamps=1 时检查间隔
opcache.fast_shutdown = 1
opcache.jit = 1255                ; PHP 8 JIT（Tracing 模式，性能最好）
opcache.jit_buffer_size = 256M

; === 时区 ===
date.timezone = Asia/Shanghai     ; 不设的话 PHP 会 warning 满屏

; === 安全 ===
expose_php = Off                  ; 隐藏 X-Powered-By header
allow_url_fopen = On              ; 应用要远程拉资源时；否则 Off 减小攻击面
allow_url_include = Off           ; 永远 Off！include 远程文件 = RCE
disable_functions = exec,passthru,shell_exec,system,proc_open,popen   ; 多人共享主机时禁用危险函数
```

### `pool.d/www.conf` — FPM worker 池调优

```ini
[www]
user  = www-data                  ; Ubuntu；RHEL 上是 apache 或 nginx
group = www-data
listen = /run/php/php8.3-fpm.sock
listen.owner = www-data
listen.group = www-data
listen.mode  = 0660

; === 进程管理（最重要）===
pm = dynamic                      ; static / dynamic / ondemand
pm.max_children       = 50        ; 总 worker 数上限。每 worker 占 ~30-100MB
pm.start_servers      = 8         ; 启动时 fork 几个
pm.min_spare_servers  = 4         ; 最少空闲 worker
pm.max_spare_servers  = 16        ; 最多空闲 worker（多了会被杀）
pm.max_requests       = 500       ; 每个 worker 处理 500 个请求后重启（防内存泄漏堆积）

; === 容量估算 ===
; 公式：pm.max_children = (机器物理内存 - 系统 - DB - cache) / 单 worker 内存
; 例：8GB 机器，留 1GB 系统 + 2GB MySQL + 1GB Redis + 1GB OS cache，剩 3GB 给 PHP
;     单 worker 80MB → max_children = 3072 / 80 ≈ 38

; === 慢日志 ===
request_slowlog_timeout = 5s      ; 超过 5 秒的请求记录到 slowlog
slowlog = /var/log/php-fpm/slow.log

; === Status / Ping endpoint（监控用）===
pm.status_path = /status          ; nginx 配置 location /status { fastcgi_pass ... } 并 IP 白名单
ping.path      = /ping
ping.response  = pong

; === 环境变量（有些应用要的）===
env[HOSTNAME] = $HOSTNAME
env[PATH]     = /usr/local/bin:/usr/bin:/bin
env[TMP]      = /tmp
env[TMPDIR]   = /tmp

; === 单 pool 的 PHP 配置覆盖（不动全局 php.ini）===
php_admin_value[memory_limit]      = 256M
php_admin_value[upload_max_filesize] = 100M
php_admin_value[post_max_size]      = 100M
php_admin_flag[log_errors]         = on
php_admin_value[error_log]         = /var/log/php-fpm/www-error.log
```

应用配置：
```bash
sudo systemctl reload php8.3-fpm     # Ubuntu
sudo systemctl reload php-fpm        # RHEL
```

### 多 pool 隔离（每个站点独立 pool）

不同站点跑不同 pool 能：① 故障隔离（一个站 hang 不影响别的）② 不同账号权限。

```bash
# 复制模板
sudo cp /etc/php/8.3/fpm/pool.d/www.conf /etc/php/8.3/fpm/pool.d/myapp.conf
sudo nano /etc/php/8.3/fpm/pool.d/myapp.conf
```

改：
```ini
[myapp]                                 ; pool name 改成业务名
user = myapp                            ; 独立用户
group = myapp
listen = /run/php/myapp-fpm.sock        ; 独立 socket
listen.owner = www-data
listen.group = www-data

pm = dynamic
pm.max_children = 20                    ; 单站独立资源池
; ...
```

nginx 站点的 `fastcgi_pass` 指向 `/run/php/myapp-fpm.sock` 即可。

### 与 nginx 配合（路径速查）

参见 `nginx-web-service` md 的 "模板 D — PHP-FPM"。关键：
```nginx
location ~ \.php$ {
    fastcgi_pass unix:/run/php/php-fpm.sock;     ; 按发行版调整
    fastcgi_index index.php;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
    fastcgi_param DOCUMENT_ROOT   $realpath_root;
}
```

### 监控 PHP-FPM 状态

启用 `pm.status_path` 后，curl 一下能看到当前 worker 池状态：
```bash
curl http://127.0.0.1/status?full
# 看 active processes / idle processes / accepted conn / slow requests 等
```

接入 Prometheus：用 `php-fpm_exporter` 把 status 转成 Prometheus 指标。

### 排查 502 Bad Gateway 流程

按顺序检查：
```bash
# 1. PHP-FPM 服务在跑没
systemctl status php-fpm
# 2. socket 文件存在没
ls -la /run/php/*.sock
# 3. nginx 用户有权读 socket 没
sudo -u nginx test -r /run/php/php-fpm.sock && echo OK
# 4. nginx error log 看具体报错
sudo tail -f /var/log/nginx/error.log
# 5. PHP-FPM error log
sudo tail -f /var/log/php-fpm/error.log
# 6. PHP-FPM slow log（请求超时）
sudo tail -f /var/log/php-fpm/slow.log
```

最常见原因 TOP 3：
1. socket 路径不对（不同 PHP 版本路径变）
2. socket 文件权限不对（nginx 用户读不了 PHP-FPM 用户拥有的 sock）
3. PHP 应用本身报错挂掉，worker 堆积满 max_children
