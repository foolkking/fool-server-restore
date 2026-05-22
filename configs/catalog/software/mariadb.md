# MariaDB 数据库

MariaDB 是 MySQL 的开源分支，命令行工具、协议、SQL 方言几乎完全兼容 MySQL，
可以无缝替换。**RHEL/CentOS/Anolis 系统建议优先选 MariaDB**——它是默认仓库提供的，
不需要加 mysql-community repo。

## 你将得到什么

- 📦 **mariadb-server** + 客户端工具
- ✅ root 密码已设（默认 24 位随机，可表单填）
- ✅ test 库 + 匿名用户被清理
- ✅ root 默认只能 localhost 登录
- ✅ bind-address 默认 127.0.0.1
- ✅ 服务自动启动并设开机自启

## MariaDB vs MySQL 选哪个

| 场景 | 推荐 |
|---|---|
| 通用 OLTP 应用 | MariaDB（功能等价，性能更好，开源更彻底） |
| Oracle 生态强依赖 | MySQL（部分特性 MariaDB 不支持，比如 X Protocol） |
| RHEL/CentOS/Anolis | MariaDB（默认仓库就有，省心） |
| Ubuntu/Debian | 都行，MariaDB 略有性能优势 |
| 已用 MySQL 的应用 | MariaDB（无需改代码） |

## 表单字段说明

字段说明与 MySQL 完全相同，参见 `mysql-server` 的 guide。简单概要：

- `root_password` — 根密码，自动生成 24 位
- `bind_address` — 默认 127.0.0.1，改 0.0.0.0 必须配防火墙
- `port` — 默认 3306
- 三个安全清理开关默认全开（删 test 库 / 删匿名用户 / 限 root 本机登录）

## 安装后

```bash
mysql -uroot -p   # 注意：MariaDB 也用 mysql 命令
```

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'myapp'@'localhost' IDENTIFIED BY 'app-password';
GRANT ALL PRIVILEGES ON myapp.* TO 'myapp'@'localhost';
FLUSH PRIVILEGES;
```

### 配置文件位置

- Ubuntu/Debian: `/etc/mysql/mariadb.conf.d/50-server.cnf`
- RHEL/Anolis: `/etc/my.cnf.d/mariadb-server.cnf`

### 性能调优（按需）

```conf
[mariadb]
innodb_buffer_pool_size = 512M       # 系统内存 50-70%
max_connections = 200
slow_query_log = ON
slow_query_log_file = /var/log/mariadb/slow.log
long_query_time = 2
```

```bash
sudo systemctl restart mariadb
```

## ⚠️ 敏感性

**privileged** — 数据持久化层，配错可能丢数据。默认配置已做基本加固。

## 验证安装

```bash
systemctl status mariadb --no-pager
mysql -uroot -p"$ROOT_PASSWORD" -e 'SELECT VERSION();'
sudo ss -tlnp | grep 3306
```

## 排错

- **`Access denied for user 'root'@'localhost'`** — Ubuntu 上 MariaDB root 默认 unix_socket 认证。EnvForge 已经尝试转成密码认证，如果失败手动：
  ```bash
  sudo mysql
  > ALTER USER 'root'@'localhost' IDENTIFIED BY '你的密码';
  ```
- **mysql.user vs mysql.global_priv** — MariaDB 10.4+ 把权限存到 `global_priv` 而不是 `user`。Playbook 兼容两种格式。
- **跨发行版**：`mariadb-server` 在两边都是同一个包名，service 名也都是 `mariadb`，无需翻译。

## 多次运行

`installMode: skip-existing`。已经装好不会重装，但 root 密码 + bind-address +
port + 安全清理任务每次都会重新执行（用表单的最新值覆盖）。

## 隐私说明

- root 密码在任务日志可见。安装完成后建议立刻 `ALTER USER` 改一次。
- 配置文件不上传也不同步。
