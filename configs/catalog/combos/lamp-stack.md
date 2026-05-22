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
