# MySQL 数据库

MySQL 8.0 服务端 + 默认安全加固（删 test 库 / 删匿名用户 / root 限本机）——等同自动跑 `mysql_secure_installation`。`mysql-server`（Ubuntu/Debian）和 `mysql-community-server`（RHEL，需加官方 repo）有差异，EnvForge 自动选对。

## 你将得到什么

- 📦 **mysql-server**（Ubuntu/Debian）/ **mysql-community-server**（RHEL/Anolis，从 Oracle 官方 repo）
- ✅ root 密码已设（默认 24 位随机）
- ✅ 自动清理：test 库 / 匿名用户 / root 远程登录
- ✅ `bind-address` 默认 `127.0.0.1`
- ✅ `validate_password` 插件已加载（密码强度校验）
- ✅ 服务自动启动 + 开机自启

## 表单字段说明

### `root_password`

留空 = EnvForge 自动生成 24 位强密码。MySQL 8 默认 `validate_password.policy=MEDIUM`，要求：

- 长度 ≥ 8
- 至少 1 大写 + 1 小写 + 1 数字 + 1 特殊字符

自动生成的密码已满足。自定义务必满足。

### `bind_address`

| 值 | 适用 |
|---|---|
| `127.0.0.1`（默认） | 应用同机 |
| `0.0.0.0` | 远程访问，**必须**配防火墙 + 强密码 |

### `port`

默认 3306。改非标可挡 80% 自动扫描。

### 安全清理三开关（默认全开）

| 开关 | 作用 |
|---|---|
| `delete_test_db` | 删 `test` 库（默认任何人可写） |
| `delete_anonymous_users` | 删 `''@'%'` 匿名账号 |
| `disable_root_remote` | 删 `root@%`，仅留 `root@localhost` |

**生产强烈保持默认**（全开）。

## 配置文件 / 目录速查

```
# Ubuntu/Debian
/etc/mysql/
├── my.cnf                              # 主入口（include 下面的）
├── mysql.cnf                            # client 默认
├── mysql.conf.d/
│   └── mysqld.cnf                       # ← 主 mysqld 配置（EnvForge 写这里）
└── conf.d/                              # 用户自定义（不被 dpkg 覆盖）
    └── *.cnf

# RHEL/Anolis
/etc/my.cnf                              # 主入口
/etc/my.cnf.d/                           # include 目录
├── mysql-server.cnf                     # ← 主配置
├── client.cnf
└── *.cnf

# 数据 / 日志（两边一致）
/var/lib/mysql/                          # 数据目录
├── ibdata1                              # 系统表空间
├── mysql/                               # mysql 系统库
├── <db>/                                # 各业务库
└── *.ibd                                # 表数据文件

/var/log/mysql/                          # Ubuntu
├── error.log
└── slow.log
/var/log/mysqld.log                      # RHEL（单文件）

# 临时
/var/run/mysqld/mysqld.sock              # Ubuntu Unix socket
/var/lib/mysql/mysql.sock                 # RHEL Unix socket
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `mysql-server` | `mysql-community-server`（需 Oracle MySQL repo） |
| 服务名 | `mysql` | `mysqld` |
| 配置文件 | `/etc/mysql/mysql.conf.d/mysqld.cnf` | `/etc/my.cnf.d/mysql-server.cnf` |
| 数据目录 | `/var/lib/mysql` | `/var/lib/mysql` |
| Socket | `/var/run/mysqld/mysqld.sock` | `/var/lib/mysql/mysql.sock` |
| 日志 | `/var/log/mysql/error.log` | `/var/log/mysqld.log` |
| 仓库源 | 默认仓库 | 需 `dev.mysql.com/get/mysql80-community-release-el9-X.noarch.rpm` |
| Anolis 9 | – | 默认仓库的是 MySQL 8.0（与 RHEL 9 一致） |

## 常见配置模板

### 模板 A — 创建业务数据库 + 用户

```bash
mysql -uroot -p$ROOT_PASSWORD <<'SQL'
-- 创建数据库
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 应用账号（仅本机连）
CREATE USER 'myapp'@'localhost' IDENTIFIED BY 'app-pass-strong';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX ON myapp.* TO 'myapp'@'localhost';

-- 应用账号（同 VPC / 内网范围连）
CREATE USER 'myapp'@'10.0.%.%' IDENTIFIED BY 'app-pass-strong';
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'myapp'@'10.0.%.%';

-- 备份账号（最小权限）
CREATE USER 'backup'@'localhost' IDENTIFIED BY 'backup-pass';
GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, RELOAD, REPLICATION CLIENT ON *.* TO 'backup'@'localhost';

-- 只读账号（运维查询用）
CREATE USER 'readonly'@'%' IDENTIFIED BY 'readonly-pass';
GRANT SELECT ON myapp.* TO 'readonly'@'%';

FLUSH PRIVILEGES;

-- 看权限
SHOW GRANTS FOR 'myapp'@'localhost';
SQL
```

### 模板 B — 推荐 `/etc/mysql/mysql.conf.d/mysqld.cnf`（生产基线）

```ini
[mysqld]
# ====== 基础 ======
user                    = mysql
pid-file                = /var/run/mysqld/mysqld.pid
socket                  = /var/run/mysqld/mysqld.sock
port                    = 3306
datadir                 = /var/lib/mysql
bind-address            = 127.0.0.1
mysqlx-bind-address     = 127.0.0.1                       # X protocol（33060）

# ====== 字符集 ======
character-set-server    = utf8mb4
collation-server        = utf8mb4_0900_ai_ci
default-storage-engine  = InnoDB
default-time-zone       = '+08:00'                         # 改成你的时区

# ====== 连接 ======
max_connections         = 300
max_connect_errors      = 100000                            # 拒掉一些扫描，避免锁
connect_timeout         = 10
wait_timeout            = 28800                              # 8h
interactive_timeout     = 28800
max_allowed_packet      = 64M
thread_cache_size       = 64

# ====== InnoDB（最关键）======
innodb_buffer_pool_size = 1G                                # 物理内存的 50-70%（专用 DB）
innodb_buffer_pool_instances = 4                            # buffer_pool 分片
innodb_log_file_size    = 256M
innodb_log_buffer_size  = 16M
innodb_flush_log_at_trx_commit = 1                           # 1=最安全 / 2=每秒 fsync / 0=不安全但快
innodb_flush_method     = O_DIRECT                            # 跳过 OS 缓存
innodb_file_per_table   = 1                                   # 每表独立 .ibd
innodb_io_capacity      = 200                                  # SSD 设 1000-2000
innodb_io_capacity_max  = 400
innodb_read_io_threads  = 8
innodb_write_io_threads = 8
innodb_thread_concurrency = 0                                  # 0 = 不限
innodb_print_all_deadlocks = 1                                  # 死锁打日志

# ====== 慢查询 ======
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 2.0                                  # 秒
log_queries_not_using_indexes = 1
min_examined_row_limit  = 1000

# ====== 通用日志（仅调试时开）======
# general_log = 1
# general_log_file = /var/log/mysql/general.log

# ====== Binlog（用于 PITR 恢复 + 主从复制）======
log_bin                  = /var/log/mysql/mysql-bin
binlog_format            = ROW                                  # ROW（推荐） / STATEMENT / MIXED
binlog_row_image         = MINIMAL
binlog_expire_logs_seconds = 604800                              # 7 天
sync_binlog              = 1                                     # 每次提交 fsync binlog
server-id                = 1                                     # 主从必须唯一

# ====== 安全 ======
local-infile             = 0                                     # 关闭 LOCAL DATA INFILE
sql_mode                 = STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION

# ====== 性能 schema ======
performance_schema       = ON
performance-schema-instrument='memory/%=ON'

# 密码插件
default_authentication_plugin = caching_sha2_password           # 8.0 默认；老客户端用 mysql_native_password

[client]
default-character-set    = utf8mb4
socket                   = /var/run/mysqld/mysqld.sock

[mysql]
default-character-set    = utf8mb4
prompt                   = '\u@\h [\d]> '
```

应用：`sudo systemctl restart mysql`。

### 模板 C — 备份恢复

```bash
# ====== 逻辑备份（mysqldump）======
# 单库
mysqldump -ubackup -p$BACKUP_PASS \
  --single-transaction --quick \
  --routines --triggers --events \
  --master-data=2 \
  myapp | gzip > myapp_$(date +%F).sql.gz

# 全部库
mysqldump -ubackup -p$BACKUP_PASS \
  --all-databases \
  --single-transaction --quick \
  --routines --triggers --events \
  | gzip > all_$(date +%F).sql.gz

# 还原
zcat myapp_2026-05-23.sql.gz | mysql -uroot -p

# ====== 物理备份（xtrabackup，更快）======
sudo apt-get install percona-xtrabackup-80
xtrabackup --backup --target-dir=/backup/full --user=root --password=$ROOT_PASS

# ====== Binlog PITR 恢复 ======
# 1. 恢复昨天全量备份
zcat all_2026-05-22.sql.gz | mysql -uroot -p

# 2. 应用 binlog 到昨天到今天故障点
mysqlbinlog --start-datetime="2026-05-22 23:59:59" \
  --stop-datetime="2026-05-23 14:30:00" \
  /var/log/mysql/mysql-bin.000123 \
  | mysql -uroot -p
```

### 模板 D — 主从复制（异步）

#### Master `/etc/mysql/mysql.conf.d/mysqld.cnf`：

```ini
server-id          = 1
log_bin            = /var/log/mysql/mysql-bin
binlog_do_db       = myapp                          # 仅复制此库（可省略 = 全部）
gtid_mode          = ON
enforce_gtid_consistency = ON
```

```sql
-- Master 上创建复制账号
CREATE USER 'repl'@'10.0.%.%' IDENTIFIED BY 'repl-pass-strong';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'10.0.%.%';
FLUSH PRIVILEGES;
```

#### Replica：

```ini
server-id          = 2
relay_log          = /var/log/mysql/mysql-relay-bin
read_only          = ON
gtid_mode          = ON
enforce_gtid_consistency = ON
```

```sql
-- Replica 上配 master
CHANGE REPLICATION SOURCE TO
    SOURCE_HOST='master.internal',
    SOURCE_PORT=3306,
    SOURCE_USER='repl',
    SOURCE_PASSWORD='repl-pass-strong',
    SOURCE_AUTO_POSITION=1;

START REPLICA;

SHOW REPLICA STATUS\G
-- 看 Replica_IO_Running: Yes / Replica_SQL_Running: Yes
```

### 模板 E — 远程访问（高危）

只有同时满足才考虑：

```bash
# 1. 改 bind
sudo sed -i 's/bind-address.*= 127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf

# 2. 防火墙限源 IP
sudo ufw allow from 10.0.0.0/8 to any port 3306

# 3. 创建专用业务账号（不要让 root 远程）
mysql -uroot -p <<EOF
CREATE USER 'app'@'10.0.%.%' IDENTIFIED BY 'app-pass-strong';
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'app'@'10.0.%.%';
FLUSH PRIVILEGES;
EOF

# 4. 启用 SSL（推荐）
mysql -uroot -p -e "ALTER USER 'app'@'10.0.%.%' REQUIRE SSL;"

# 重启
sudo systemctl restart mysql
```

## 关键参数调优速查

### `innodb_buffer_pool_size`

| 物理内存 | 推荐 |
|---|---|
| 1 GB | 200M |
| 2 GB | 512M |
| 4 GB | 2G |
| 8 GB | 4G |
| 16 GB | 10G |
| 32 GB+ | 70% RAM |

### `innodb_io_capacity`

| 磁盘 | 推荐 |
|---|---|
| HDD | 100-200 |
| SATA SSD | 1000-2000 |
| NVMe SSD | 5000-20000 |

### `max_connections`

应用连接池总和 × 1.5。监控当前峰值：

```sql
SHOW STATUS LIKE 'max_used_connections';
SHOW STATUS LIKE 'Threads_connected';
```

### `innodb_flush_log_at_trx_commit`

| 值 | 数据安全 | 性能 |
|---|---|---|
| 1（默认） | 每次提交 fsync redo log | 慢 |
| 2 | 每秒 fsync | 快（10×） |
| 0 | 不主动 fsync | 最快但崩溃可能丢 1s |

支付 / 金融用 1；通用业务用 2 是常见折衷。

## 跨发行版兼容

EnvForge 自动检测发行版并加对应仓库：

| 发行版 | 仓库 | 包 |
|---|---|---|
| Ubuntu 22 / 24 | 默认 | `mysql-server` |
| Debian 12 | 默认 | `mysql-server`（实际是 MariaDB 接管，需手动加 Oracle MySQL repo） |
| RHEL 9 / Rocky / Alma 9 | Oracle MySQL Community repo | `mysql-community-server` |
| Anolis 9 | 走 RHEL 9 仓库 | 同上 |

**Debian 12 注**：默认仓库的 `mysql-server` 实际链接到 `default-mysql-server`（MariaDB 10.11）。要纯 MySQL 8 需手动加 `repo.mysql.com/apt/debian/`。本 Playbook 已处理。

**Anolis 9 注**：与 RHEL 9 二进制兼容，Oracle 的 RHEL 9 repo 可直接用。

要 MariaDB 替代 MySQL，见 `mariadb` Playbook（同 catalog）。

## 与其它 catalog 项的配合

- **`mariadb`** — 互斥，二选一（不要在同机装两个 RDBMS）
- **`postgres-profile`** — 不冲突，不同业务可同机部署
- **`nginx-web-service`** + **`php-toolchain`** — LEMP 栈
- **`redis-server`** — 应用缓存层（MySQL → Redis cache aside）
- **`prometheus-monitoring`** — 用 mysqld_exporter 暴露指标
- **`certbot-ssl`** — 给 MySQL 启用 TLS（用 LE 证书）

## 排错

### `Access denied for user 'root'@'localhost'`（Ubuntu）

Ubuntu 上初装 MySQL 8 时 root 用 `auth_socket` 而非密码：

```bash
sudo mysql                                # 用 socket 进
> ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'YourPassword';
> FLUSH PRIVILEGES;
> exit
mysql -uroot -p                           # 现在能用密码
```

EnvForge Playbook 已自动做这步。

### `ERROR 1819 Your password does not satisfy the current policy`

密码强度不够。MySQL 8 默认 `validate_password.policy=MEDIUM`：

```sql
-- 看当前策略
SHOW VARIABLES LIKE 'validate_password%';

-- 临时降低
SET GLOBAL validate_password.policy = LOW;
SET GLOBAL validate_password.length = 6;

-- 改完再改密码
ALTER USER 'foo'@'localhost' IDENTIFIED BY 'simple';

-- 改回（生产必须）
SET GLOBAL validate_password.policy = MEDIUM;
```

### RHEL 上初始 root 密码在哪

MySQL 在 RHEL 系第一次启动时生成临时密码到日志：

```bash
sudo grep "temporary password" /var/log/mysqld.log
# A temporary password is generated for root@localhost: xxx....

mysql -uroot -p"<临时密码>"
> ALTER USER 'root'@'localhost' IDENTIFIED BY 'NewStrongPass!';
```

EnvForge Playbook 自动处理临时密码 → 表单密码。

### `Too many connections`

```sql
SHOW STATUS LIKE 'Threads_connected';
SHOW PROCESSLIST;

SET GLOBAL max_connections = 500;
```

持久化到 `mysqld.cnf` 重启生效。

### `Out of memory; restart server`

`innodb_buffer_pool_size` 设过大或 `max_connections × per_thread_buffers` 超物理内存。

```sql
-- 估算每连接占用
SHOW VARIABLES LIKE '%buffer%';
SHOW VARIABLES LIKE 'thread_stack';
SHOW VARIABLES LIKE 'sort_buffer_size';
```

调小 `innodb_buffer_pool_size` 或 `max_connections`。

### Slave 报 `Slave_SQL_Running: No`

```sql
SHOW REPLICA STATUS\G

-- 常见：duplicate key
-- 先看 Last_Error
-- 跳过当前错误（仅在确认数据一致时）
SET GLOBAL sql_slave_skip_counter = 1;
START REPLICA;
```

### `Disk full`

```bash
df -h /var/lib/mysql

# 清 binlog
mysql -uroot -p -e "PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY;"

# 清旧表的碎片
mysql -uroot -p -e "OPTIMIZE TABLE myapp.huge_table;"
```

### 性能突然变差

```sql
-- 1. 看慢查询
mysql -uroot -p -e "SHOW PROCESSLIST" | grep -v Sleep

-- 2. 看锁
SHOW ENGINE INNODB STATUS\G

-- 3. 看 IO
sudo iotop -o

-- 4. 检查 EXPLAIN
EXPLAIN SELECT ...;
```

### `Aborted_connects` 多

通常是认证失败（密码错 / SSL 不匹配）扫描：

```sql
SHOW STATUS LIKE 'Aborted%';
```

配 `fail2ban` jail 限制。

## 验证

```bash
# 1. 服务在跑
systemctl is-active mysql || systemctl is-active mysqld

# 2. 端口
sudo ss -tlnp | grep 3306

# 3. 版本
mysql -uroot -p"$ROOT_PASSWORD" -e "SELECT VERSION();"

# 4. 字符集
mysql -uroot -p"$ROOT_PASSWORD" -e "SHOW VARIABLES LIKE 'character_set%';"

# 5. 看权限
mysql -uroot -p"$ROOT_PASSWORD" -e "SELECT user,host,authentication_string IS NULL AS no_pass FROM mysql.user;"

# 6. test 库已删
mysql -uroot -p"$ROOT_PASSWORD" -e "SHOW DATABASES" | grep -v test       # 应不含 test

# 7. 看 buffer pool
mysql -uroot -p"$ROOT_PASSWORD" -e "SHOW VARIABLES LIKE 'innodb_buffer_pool%';"
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**每次会重新 ALTER USER root**（密码同步表单值）+ 重写 `bind-address` / `port` + 跑安全清理。如果你手动改过 root 密码，重跑会**用表单值覆盖**。

要保留手改：调整 Playbook 移除 ALTER USER 任务，或表单填和现有相同的密码。

## ⚠️ 敏感性

**privileged** — 数据持久化层。配错可能：

- **数据丢失**（删 datadir / 错误 DROP）
- **未授权访问**（弱密码 / bind 0.0.0.0 无防火墙）
- **性能崩溃**（错误的 buffer_pool_size）

强制清单：

1. root 密码 ≥ 16 位强密码
2. 不直接 root 远程登录（保留 root@localhost）
3. 业务用专用账号 + 最小权限
4. binlog 启用（PITR 关键）
5. 定期备份（dump 或 xtrabackup）
6. 公网必须 TLS

## 隐私说明

- root 密码会出现在 Playbook 任务日志（一次）。EnvForge 用 `no_log: true` 标记
- 安装完成后建议旋转密码：
    ```sql
    ALTER USER 'root'@'localhost' IDENTIFIED BY '新密码';
    ```
- 数据目录 `/var/lib/mysql` 含**所有业务数据**，权限自动 750 mysql:mysql
- binlog 含所有写入操作（含密码 SET 等）——保留期注意
- 慢查询日志 / general log 含完整 SQL（含 password 函数参数等敏感）——**生产关掉 general log**
- mysqldump 文件含所有数据；备份必须加密 + 严格访问控制
