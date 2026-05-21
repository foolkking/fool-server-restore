# MySQL 数据库

## 概述

MySQL 是全球最流行的开源关系型数据库管理系统，广泛用于 Web 应用、企业系统和数据分析场景。

## 安装内容

- `mysql-server` — MySQL 服务端
- 默认端口：3306
- 数据目录：`/var/lib/mysql`
- 配置文件：`/etc/mysql/mysql.conf.d/mysqld.cnf`

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
```

## 安装后配置

### 1. 安全初始化

```bash
sudo mysql_secure_installation
```

该脚本会引导你：
- 设置 root 密码
- 删除匿名用户
- 禁止 root 远程登录
- 删除测试数据库
- 刷新权限表

### 2. 字符集配置（推荐 UTF-8）

编辑 `/etc/mysql/mysql.conf.d/mysqld.cnf`：

```ini
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

### 3. 创建应用数据库和用户

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON myapp.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
```

### 4. 配置自动备份

```bash
# 每日凌晨 2 点备份
echo "0 2 * * * mysqldump -u root --all-databases | gzip > /var/backups/mysql/all-$(date +\%F).sql.gz" | sudo crontab -
```

## 验证安装

```bash
sudo mysql -e "SELECT VERSION();"
sudo systemctl status mysql
```

## 安全建议

- 使用 `mysql_secure_installation` 完成初始安全配置
- 不要使用 root 账户运行应用
- 为每个应用创建独立的数据库用户
- 定期备份数据
- 使用防火墙限制 3306 端口访问

## 隐私说明

数据库密码和连接凭据为敏感信息，不会被自动上传或同步。
