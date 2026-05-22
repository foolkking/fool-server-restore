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
