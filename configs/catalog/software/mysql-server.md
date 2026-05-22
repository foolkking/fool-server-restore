# MySQL 数据库

MySQL 8.0 服务端 + 默认安全加固（删 test 库 / 删匿名用户 / 限 root 本机登录），
等同自动跑了 `mysql_secure_installation`。

## 你将得到什么

- 📦 **mysql-server**（Ubuntu/Debian）/ **mysql-community-server**（RHEL）
- ✅ root 密码已设（默认 24 位随机，可表单填）
- ✅ test 库 + 匿名用户被清理
- ✅ root 默认只能 localhost 登录
- ✅ bind-address 默认 127.0.0.1（不暴露到公网）
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### root 用户密码 `root_password`

留空则自动生成 24 位强密码。MySQL 8 默认带 `validate_password` 插件，要求密码满足：
- 至少 8 位
- 含大小写字母、数字、特殊字符

自动生成的密码已经满足这些要求，自定义密码时也务必满足。

### 监听地址 `bind_address`

- **127.0.0.1**（默认）：仅本机连，最安全
- **0.0.0.0**（所有网卡）：远程能连，必须先配防火墙

### 监听端口 `port`

默认 3306。改非标端口（如 13306）能挡掉一些扫描，但所有客户端配置都要同步改。

### 安全清理三个开关

- **删除 test 库**：默认自带的 test 数据库，任何人可写，删了
- **删除匿名用户**：`''@'%'` 这种空用户名的匿名账号，删了
- **禁止 root 远程登录**：删除 `root@%`，保留 `root@localhost`，强制远程改用业务账号

这三个开关对应 `mysql_secure_installation` 的几个步骤，默认全开，**生产环境强烈建议保持默认**。

## 安装后

### 创建业务数据库 + 用户

```bash
mysql -uroot -p
```

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 应用账号（给到应用配置文件）
CREATE USER 'myapp'@'localhost' IDENTIFIED BY 'app-password-here';
GRANT ALL PRIVILEGES ON myapp.* TO 'myapp'@'localhost';

-- 远程管理账号（如果需要远程访问）
CREATE USER 'admin'@'1.2.3.4' IDENTIFIED BY 'admin-password';
GRANT ALL PRIVILEGES ON *.* TO 'admin'@'1.2.3.4' WITH GRANT OPTION;

FLUSH PRIVILEGES;
```

### 性能调优（按需）

`/etc/mysql/mysql.conf.d/mysqld.cnf`（Ubuntu）或 `/etc/my.cnf.d/mysql-server.cnf`（RHEL）：

```conf
innodb_buffer_pool_size = 512M    # 系统内存 50% - 70%（专用 DB 服务器）
max_connections = 200             # 默认 151
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2               # 慢查询阈值（秒）
```

改完 `sudo systemctl restart mysql`。

### 远程访问（高危）

满足三条才考虑：
1. `bind_address` 改 `0.0.0.0`
2. 防火墙限制 3306 来源 IP
3. 业务账号和管理账号都用强密码

```bash
sudo ufw allow from 1.2.3.4 to any port 3306
```

## ⚠️ 敏感性

**privileged** — MySQL 是数据持久化层，配错可能导致**数据丢失**或**未授权访问**。
默认配置已经做了基本加固，但仍然建议：
1. 立即改 root 密码（虽然 EnvForge 已经设了一个）
2. 创建专用业务账号，应用不要用 root 连数据库
3. 启用慢查询日志便于后续诊断

## 验证安装

```bash
systemctl status mysql --no-pager
mysql -uroot -p"$ROOT_PASSWORD" -e 'SELECT VERSION();'
sudo ss -tlnp | grep 3306
```

## 排错

- **`Access denied for user 'root'@'localhost'`** — Ubuntu 上初次安装 root 用的是 auth_socket 不是密码，必须 `sudo mysql` 进去然后 `ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '...';`。EnvForge 的第一个任务已经处理。
- **`ERROR 1819 Your password does not satisfy the current policy requirements`** — 密码强度不够，自动生成的密码已经满足，自己改的话注意大小写 + 数字 + 特殊字符。
- **RHEL 上初始密码** — RHEL 的 mysql-community 包安装时会在 `/var/log/mysqld.log` 写一条 "A temporary password is generated for root@localhost: xxx"。EnvForge 已经尝试 ALTER USER 把它改成你设的密码，但如果失败请：
  ```bash
  sudo grep "temporary password" /var/log/mysqld.log
  mysql -uroot -p"<临时密码>"
  > ALTER USER 'root'@'localhost' IDENTIFIED BY '你的密码';
  ```
- **跨发行版**：`mysql-server` 在 RHEL 上不是默认仓库的包；EnvForge 会尝试装 mysql-community-server。如果失败，用 MariaDB 替代（参见同名 Playbook）。

## 多次运行

`installMode: skip-existing`。MySQL 不会重装；但每次都会重新执行 ALTER USER root 密码 + bind-address + port + 安全清理任务。如果你已经手动调整过 root 密码，重新跑会用表单的值覆盖。

## 隐私说明

- root 密码会出现在任务日志。安装完成后建议立刻改一次：
  ```sql
  ALTER USER 'root'@'localhost' IDENTIFIED BY '新密码';
  ```
- 配置文件不会被 EnvForge 上传或同步。
