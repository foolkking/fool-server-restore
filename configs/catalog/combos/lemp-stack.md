# LEMP 全栈环境

## 概述

LEMP 是 Linux + Nginx + MySQL + PHP-FPM 的高性能 Web 服务器组合。相比 LAMP，Nginx 在高并发场景下性能更优，PHP-FPM 进程管理更灵活。

## 包含组件

| 组件 | 说明 |
|------|------|
| Nginx | 高性能 Web 服务器 / 反向代理 |
| MySQL Server | 关系型数据库 |
| PHP-FPM | PHP FastCGI 进程管理器 |
| php-mysql | PHP MySQL 扩展 |

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y nginx mysql-server php-fpm php-mysql
sudo systemctl enable nginx
sudo systemctl enable mysql
sudo systemctl enable php8.1-fpm
sudo systemctl start nginx
sudo systemctl start mysql
sudo systemctl start php8.1-fpm
```

> 注意：PHP-FPM 服务名可能因版本不同而变化（如 php8.1-fpm、php8.2-fpm）。

## 安装后配置

### 1. Nginx 配置 PHP-FPM

创建 `/etc/nginx/sites-available/default`：

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/html;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

### 2. 测试配置并重载

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. MySQL 安全初始化

```bash
sudo mysql_secure_installation
```

### 4. 安装常用 PHP 扩展

```bash
sudo apt-get install -y php-curl php-gd php-mbstring php-xml php-zip php-intl php-redis
sudo systemctl restart php8.1-fpm
```

### 5. 创建测试页面

```bash
echo "<?php phpinfo(); ?>" | sudo tee /var/www/html/info.php
```

## 验证安装

```bash
nginx -v
mysql --version
php -v
php-fpm8.1 -v
curl http://localhost/
```

## 性能优化

- 调整 PHP-FPM 进程数（`/etc/php/8.1/fpm/pool.d/www.conf`）
- 启用 Nginx gzip 压缩
- 配置 Nginx 静态文件缓存
- 使用 OPcache 加速 PHP

## 适用场景

- 高并发 PHP Web 应用
- WordPress / Laravel 生产部署
- API 服务
- 需要反向代理的微服务架构
