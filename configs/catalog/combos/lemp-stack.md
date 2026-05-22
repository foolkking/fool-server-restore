# LEMP 全栈环境

LEMP 是 LAMP 的现代版本——**E**(nginx) 替代 **A**pache，性能更好、配置更清晰。
nginx + PHP-FPM 是当前 PHP 应用部署的事实标准（WordPress / Laravel / 大部分 PHP 框架的官方推荐）。

## 包含组件

| 组件 | 说明 |
|---|---|
| **nginx** | 高性能 web server + 反向代理 |
| **MySQL Server** | 关系型数据库 |
| **PHP-FPM** | FastCGI 进程管理器，运行 PHP 应用 |
| **php-mysql / php-curl / php-mbstring / php-xml / php-gd / php-zip** | PHP 常用扩展 |

## 表单字段说明

### MySQL root 密码

留空自动生成 24 位强密码（运行结束显示一次）。

## 你将得到什么

- ✅ nginx 监听 80 端口，根目录 `/var/www/html`
- ✅ `.php` 请求自动转发给 PHP-FPM 处理
- ✅ MySQL 服务跑起来，root 密码已设
- ✅ 一份示例 nginx 站点 `/etc/nginx/conf.d/envforge-lemp.conf`（可直接覆盖以满足你的需求）

## 安装后

### 验证

```bash
echo "<?php phpinfo(); ?>" | sudo tee /var/www/html/info.php
curl http://localhost/info.php | head
# 应该看到 PHP info HTML 输出
```

确认无误后**立刻删除 info.php**：
```bash
sudo rm /var/www/html/info.php
```
（暴露 phpinfo 是常见的安全问题，给攻击者提供大量信息）

### 配置反向代理（业务应用）

```nginx
# /etc/nginx/conf.d/myapp.conf
server {
    listen 80;
    server_name myapp.example.com;
    root /var/www/myapp/public;     # Laravel 等框架的 public 目录
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;   # Laravel 风格 URL
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 创建数据库 + 用户给 PHP 应用

```bash
mysql -uroot -p
```

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'myapp'@'localhost' IDENTIFIED BY 'app-password';
GRANT ALL PRIVILEGES ON myapp.* TO 'myapp'@'localhost';
FLUSH PRIVILEGES;
```

业务应用配置（如 Laravel `.env`）：
```ini
DB_HOST=127.0.0.1
DB_DATABASE=myapp
DB_USERNAME=myapp
DB_PASSWORD=app-password
```

### 配置 HTTPS（生产必备）

EnvForge catalog 里有 `Certbot SSL` Playbook：装好之后跑 `sudo certbot --nginx`，自动改 nginx 配置开 HTTPS + 80→443 跳转。

## ⚠️ 跨发行版

PHP-FPM socket 路径在不同发行版/版本不一致：
- Ubuntu 22.04（PHP 8.1）：`/run/php/php8.1-fpm.sock`
- Ubuntu 24.04（PHP 8.3）：`/run/php/php8.3-fpm.sock`
- RHEL/Anolis：`/run/php-fpm/www.sock`

EnvForge 写了 `/run/php/php-fpm.sock` 这个通用路径——如果实际文件不存在，PHP 请求会 502。
解决：`sudo find / -name '*.sock' 2>/dev/null | grep php` 找到实际路径，改 nginx conf。

## 验证

```bash
nginx -t
systemctl status nginx php-fpm
curl http://localhost/
```

## 排错

- **PHP 文件浏览器直接下载下来（不解析）** — nginx 没匹配到 `.php` location，或 PHP-FPM socket 路径错。
- **502 Bad Gateway** — PHP-FPM 没起来或 socket 路径不对。
- **跨发行版**：包名 `nginx` / `mysql-server` / `php-fpm` 都通过 PACKAGE_ALIASES 翻译。

## 多次运行

`installMode: skip-existing`。已装就跳过包安装，但 nginx site 配置文件每次重写。

## 隐私说明

MySQL root 密码会在任务日志出现一次。
