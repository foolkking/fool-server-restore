# MariaDB 数据库

MariaDB 是 MySQL 的开源分支，**命令行工具、协议、SQL 方言完全兼容 MySQL** ——可无缝替换。**RHEL/CentOS/Anolis 系建议优先选 MariaDB**：默认仓库就有，不用加 Oracle MySQL repo。Ubuntu/Debian 上 MariaDB 也是默认仓库提供，比 mysql-server 包更新得快。

## 你将得到什么

- 📦 **mariadb-server** + **mariadb-client**
- ✅ root 密码已设（默认 24 位随机）
- ✅ 自动清理：test 库 / 匿名用户 / root 远程登录（等同 `mysql_secure_installation`）
- ✅ `bind-address` 默认 `127.0.0.1`
- ✅ 服务自动启动 + 开机自启

## MariaDB vs MySQL — 选哪个？

| 场景 | 推荐 | 理由 |
|---|---|---|
| 通用 OLTP | **MariaDB** | 性能略好，开源更彻底，仓库就有 |
| 已用 MySQL 应用 | MariaDB | 协议兼容，无需改代码 |
| Oracle 生态依赖（X Protocol / MySQL Shell 高级功能） | MySQL | MariaDB 不支持 |
| RHEL/Rocky/Alma/Anolis 9 | **MariaDB** | 默认 AppStream 提供 10.5 |
| Ubuntu/Debian | 都行 | MariaDB 默认仓库更新快 |
| WordPress / Drupal / Joomla | MariaDB | 官方测试 + 推荐 |

兼容性差异（极少触及）：

- `JSON` 类型实现略不同（MySQL 是 binary，MariaDB 是 LONGTEXT alias）
- `INTERSECT` / `EXCEPT` 仅 MariaDB 10.3+
- `WITH ROLLUP` 语法略异

99% 的应用代码两者通用。

## 表单字段说明

字段说明与 `mysql-server` 完全相同（见同目录下的 mysql md）：

- `root_password` — 默认自动生成 24 位
- `bind_address` — 默认 `127.0.0.1`
- `port` — 默认 3306
- 三个安全清理开关（默认全开）

## 配置文件 / 目录速查

```
# Ubuntu/Debian
/etc/mysql/                                          # 注意：MariaDB 复用 MySQL 路径
├── mariadb.cnf                                       # 主入口
├── mariadb.conf.d/                                   # MariaDB 专用 include
│   ├── 50-server.cnf                                 # ← 主 mariadb 配置
│   ├── 50-mysqld_safe.cnf
│   └── 50-client.cnf
└── conf.d/                                           # 用户自定义

# RHEL/Anolis
/etc/my.cnf                                          # 主入口
/etc/my.cnf.d/
├── mariadb-server.cnf                                # ← 主配置
├── client.cnf
└── *.cnf

# 数据 / 日志（两边一致）
/var/lib/mysql/                                      # 数据目录（注意：仍叫 mysql）
/var/log/mysql/error.log                              # Ubuntu
/var/log/mariadb/mariadb.log                          # RHEL/Anolis

/run/mysqld/mysqld.sock                               # Ubuntu Unix socket
/var/lib/mysql/mysql.sock                              # RHEL Unix socket
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `mariadb-server` | `mariadb-server` |
| 服务名 | `mariadb`（也兼容 `mysql`） | `mariadb` |
| 配置主文件 | `/etc/mysql/mariadb.conf.d/50-server.cnf` | `/etc/my.cnf.d/mariadb-server.cnf` |
| 默认仓库版本 | Ubuntu 22 = 10.6，Ubuntu 24 = 10.11，Debian 12 = 10.11 | RHEL 9 / Anolis 9 = 10.5（用 module 切到 10.11） |
| 切到 10.11 | 默认 | `dnf module reset mariadb && dnf module enable mariadb:10.11 -y && dnf install mariadb-server -y` |
| 最新 LTS | 11.4（手动加 mariadb.org repo） | 同 |

## 常见配置模板

> 注：以下模板与 MySQL 对应模板基本相同——SQL 语法、备份命令、调优参数都通用。仅在 MariaDB 特有的地方标注。

### 模板 A — 创建业务数据库 + 用户（与 MySQL 一致）

```bash
mysql -uroot -p$ROOT_PASSWORD <<'SQL'
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'myapp'@'localhost' IDENTIFIED BY 'app-pass-strong';
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'myapp'@'localhost';

CREATE USER 'backup'@'localhost' IDENTIFIED BY 'backup-pass';
GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, RELOAD ON *.* TO 'backup'@'localhost';

FLUSH PRIVILEGES;
SQL
```

> **MariaDB 10.4+ 注**：权限改存到 `mysql.global_priv` 而非 `mysql.user`。`SHOW GRANTS` 兼容；老脚本里直接 SELECT mysql.user 的需改用 `SHOW CREATE USER`。

### 模板 B — 推荐 `50-server.cnf`（生产基线）

```ini
[mariadb]
# ====== 基础 ======
user                    = mysql
pid-file                = /var/run/mysqld/mysqld.pid
socket                  = /var/run/mysqld/mysqld.sock
port                    = 3306
basedir                 = /usr
datadir                 = /var/lib/mysql
bind-address            = 127.0.0.1

# ====== 字符集 ======
character-set-server    = utf8mb4
collation-server        = utf8mb4_unicode_ci
default-storage-engine  = InnoDB

# ====== 连接 ======
max_connections         = 300
max_connect_errors      = 100000
connect_timeout         = 10
wait_timeout            = 28800
max_allowed_packet      = 64M
thread_cache_size       = 64

# ====== InnoDB ======
innodb_buffer_pool_size = 1G
innodb_log_file_size    = 256M
innodb_flush_log_at_trx_commit = 1
innodb_flush_method     = O_DIRECT
innodb_file_per_table   = 1
innodb_io_capacity      = 1000                          # SSD
innodb_io_capacity_max  = 2000

# ====== 慢查询 ======
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 2.0
log_slow_verbosity      = query_plan,explain             # MariaDB 特有

# ====== Binlog ======
log_bin                  = /var/log/mysql/mariadb-bin
binlog_format            = ROW
expire_logs_days         = 7
sync_binlog              = 1
server-id                = 1

# ====== 安全 ======
local-infile             = 0
sql_mode                 = STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION

# ====== MariaDB 特性 ======
innodb_default_row_format = dynamic
innodb_strict_mode        = ON
performance_schema        = ON

# 线程池（MariaDB 内置，MySQL 社区版无）
thread_handling           = pool-of-threads
thread_pool_size          = 8
thread_pool_max_threads   = 1000

[client-server]
port = 3306
socket = /var/run/mysqld/mysqld.sock

[client]
default-character-set = utf8mb4
```

### 模板 C — Galera 集群（多主同步复制，MariaDB 强项）

MariaDB 自带 Galera，比 MySQL 的 Group Replication 更易用：

```ini
# /etc/mysql/mariadb.conf.d/60-galera.cnf
[galera]
wsrep_on                 = ON
wsrep_provider           = /usr/lib/galera/libgalera_smm.so
wsrep_cluster_address    = "gcomm://node1,node2,node3"
wsrep_cluster_name       = "envforge_cluster"
wsrep_node_address       = "10.0.0.10"                  # 本机 IP
wsrep_node_name          = "node1"                       # 唯一标识
wsrep_sst_method         = rsync
binlog_format            = ROW
default_storage_engine   = InnoDB
innodb_autoinc_lock_mode = 2
bind-address             = 0.0.0.0
```

启动集群（仅在第一台节点）：

```bash
sudo galera_new_cluster
# 其他节点
sudo systemctl start mariadb
```

### 模板 D — 备份（与 MySQL 几乎一致，命令名略不同）

```bash
# mariadb-dump（旧名 mysqldump 仍可用）
mariadb-dump -uroot -p$ROOT_PASS \
  --single-transaction --quick \
  --all-databases \
  --master-data=2 \
  | gzip > all_$(date +%F).sql.gz

# mariadb-backup（替代 xtrabackup）
sudo apt-get install mariadb-backup
mariadb-backup --backup --target-dir=/backup/full \
  --user=root --password=$ROOT_PASS

# 还原
zcat all.sql.gz | mariadb -uroot -p
```

### 模板 E — 切换 MariaDB 版本（RHEL 系）

```bash
# 看可用模块
sudo dnf module list mariadb

# 切到 10.11
sudo dnf module reset mariadb -y
sudo dnf module enable mariadb:10.11 -y
sudo dnf install mariadb-server -y
sudo systemctl enable --now mariadb

# 验证
mysql -V
# mysql  Ver 15.1 Distrib 10.11.x-MariaDB ...
```

## 关键参数调优速查

参数与 MySQL 几乎完全一致——`innodb_buffer_pool_size` / `innodb_io_capacity` / `max_connections` 等等。见 `mysql-server.md` 的"关键参数调优速查"章节。

MariaDB 特有：

| 参数 | 适用 |
|---|---|
| `thread_handling = pool-of-threads` | 高并发场景（MariaDB 内置 thread pool） |
| `aria_buffer_pool_size` | Aria 引擎（替代 MyISAM）专用 |
| `optimizer_use_condition_selectivity = 4` | 启用更智能的 cost 估算 |

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `mariadb-server` | `mariadb-server` |
| 服务名 | `mariadb` | `mariadb` |
| 默认仓库版本 | 10.6 / 10.11 | 10.5（dnf module 切 10.11） |
| 升级到 11.x | 加 mariadb.org repo | 加 mariadb.org repo |

EnvForge Playbook 自动适配——`mariadb-server` 包名两边一致，service 名一致，PACKAGE_ALIASES 无需翻译。

## 与其它 catalog 项的配合

- **`mysql-server`** — **互斥**，二选一（不能同机装）
- **`postgres-profile`** — 不冲突
- **`nginx-web-service`** + **`php-toolchain`** — LAMP / LEMP 栈
- **`redis-server`** — 应用缓存层
- **`prometheus-monitoring`** — `mysqld_exporter` 兼容 MariaDB
- **`certbot-ssl`** — 给 MariaDB 启用 TLS

## 排错

> 90% 错误与 MySQL 一致。下面仅列 MariaDB 特有差异。

### `Access denied for user 'root'@'localhost'`（Ubuntu/Debian）

MariaDB 默认 root 用 `unix_socket` 认证（不是密码）：

```bash
sudo mysql                                           # socket 进
> ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('YourPass');
> FLUSH PRIVILEGES;
> exit
mysql -uroot -p
```

EnvForge Playbook 已自动处理。

### `error: Unknown SSL parameter` 升级 10.11 后

10.11 的 SSL 配置语法略变。把：

```ini
ssl-cert = ...
ssl-key = ...
```

改为：

```ini
[mariadb]
require_secure_transport = ON
ssl_cert = ...
ssl_key = ...
```

### Galera 集群无法启动 `WSREP: Failed to open backend connection`

主节点要用 `galera_new_cluster` 起，不是直接 `systemctl start`。后续节点才用 `systemctl start mariadb`。

### `mysql.global_priv` 与老工具不兼容

10.4+ 把 `mysql.user` 表改造，老工具直接 SELECT user 表会出错。改用：

```sql
SHOW CREATE USER 'foo'@'host';
SHOW GRANTS FOR 'foo'@'host';
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active mariadb

# 2. 端口
sudo ss -tlnp | grep 3306

# 3. 版本（应输出 MariaDB）
mysql -uroot -p"$ROOT_PASSWORD" -e "SELECT VERSION();"
# 10.x.y-MariaDB...

# 4. 字符集
mysql -uroot -p"$ROOT_PASSWORD" -e "SHOW VARIABLES LIKE 'character_set%';"

# 5. 看用户
mysql -uroot -p"$ROOT_PASSWORD" -e "SELECT user,host,plugin FROM mysql.user;"

# 6. test 库已删
mysql -uroot -p"$ROOT_PASSWORD" -e "SHOW DATABASES" | grep -v test
```

## 多次运行

`installMode: skip-existing`。包安装幂等。每次按表单值覆盖：root 密码 / bind-address / port / 安全清理。手动改的其他配置保留。

## ⚠️ 敏感性

**privileged** — 与 MySQL 等同。见 `mysql-server.md` 的敏感性章节。

## 隐私说明

- root 密码进任务日志（一次）
- 数据目录 `/var/lib/mysql` 含**所有业务数据**
- binlog / slow log / general log 处理同 MySQL
- MariaDB 不发遥测
