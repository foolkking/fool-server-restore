# ClickHouse 列式 OLAP 数据库

ClickHouse 是 **列式 OLAP 数据库**——亿级数据 SQL 查询亚秒响应。**比 Elasticsearch 省 10× 内存 / 5× 磁盘**，但仅适合分析场景（OLAP），不适合高并发事务（OLTP）。

**适合**：日志分析 / 用户行为 / metric 长期存储 / Grafana 数据源 / 报表系统。
**不适合**：高并发 UPDATE / DELETE（CH 是 append-only 设计）。

## 你将得到什么

- 📦 **clickhouse-server** + **clickhouse-client**（来自 packages.clickhouse.com 官方仓库）
- ✅ HTTP API 端口 `8123`、TCP（native 协议）`9000`，仅 `127.0.0.1` 监听
- ✅ default user 密码已设（SHA256 hash 存 `users.d/`）
- ✅ 内存上限按表单值
- ✅ systemd 服务 + 开机自启
- ✅ 专用 `clickhouse` 系统用户

## 表单字段说明

### `clickhouse_password`

default user 密码。留空 = 自动 24 位。

### `clickhouse_tcp_port` / `clickhouse_http_port`

| 端口 | 协议 | 用途 |
|---|---|---|
| 9000 | TCP (native) | clickhouse-client 命令行 |
| 8123 | HTTP | REST API（Python / Go / Java SDK） |

**注**：9000 与 Prometheus 默认相同——若同机部署需改其中一个端口。

### `clickhouse_max_memory_gb`

单查询最大内存。物理内存的 50-70%。

### `clickhouse_data_dir`

数据目录。**生产推荐 NVMe SSD**——CH 大量随机 IO。

## 配置文件 / 目录速查

```
/etc/clickhouse-server/
├── config.xml                              # 主配置（不要直接改）
├── users.xml                                # 用户配置（不要直接改）
├── config.d/                                 # ← 配置覆盖（**EnvForge 写这里**）
│   └── envforge.xml                          # 端口 / 内存 / 监听
├── users.d/                                   # ← 用户覆盖
│   └── default-password.xml                   # default 用户密码 hash
└── ssl/                                        # TLS 证书（启用时）

/var/lib/clickhouse/                          # ← 数据目录
├── data/                                      # 表数据（按 db / table 分目录）
├── metadata/                                   # schema
├── store/                                       # 内部存储
├── tmp/                                          # 临时
├── format_schemas/                                # 自定义格式
└── access/                                        # SQL access management

/var/log/clickhouse-server/
├── clickhouse-server.log                          # 主日志
└── clickhouse-server.err.log

# CLI
/usr/bin/clickhouse-client                          # 主 client
/usr/bin/clickhouse-server                           # server 二进制
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `packages.clickhouse.com/deb` | `packages.clickhouse.com/rpm` |
| 包 | `clickhouse-server` `clickhouse-client` | 同 |
| 服务 | `clickhouse-server` | `clickhouse-server` |
| 用户 | `clickhouse` | `clickhouse` |
| Anolis 9 | – | ✅ glibc 兼容 |

## 常见配置模板

### 模板 A — 命令行客户端

```bash
clickhouse-client --host 127.0.0.1 --password
# 输入密码 → 进入 SQL shell

# 一次性查询
clickhouse-client --host 127.0.0.1 --password 'pass' \
    --query "SELECT count() FROM system.tables"

# 从 stdin 读 SQL
echo "SELECT 1" | clickhouse-client --password 'pass'
```

### 模板 B — 创建数据库 + 业务表

```sql
CREATE DATABASE myapp;

CREATE TABLE myapp.events (
    timestamp DateTime,
    user_id UInt64,
    event_type LowCardinality(String),         -- 自动字典化（节省空间）
    properties String,
    country FixedString(2)
)
ENGINE = MergeTree()                            -- 主引擎
PARTITION BY toYYYYMM(timestamp)                 -- 按月分区
ORDER BY (timestamp, user_id)                     -- 主键
TTL timestamp + INTERVAL 90 DAY DELETE;           -- 自动 90 天过期

-- 看表结构
SHOW CREATE TABLE myapp.events;

-- 插入
INSERT INTO myapp.events VALUES
    (now(), 1001, 'click', '{"button":"signup"}', 'CN'),
    (now(), 1002, 'view',  '{"page":"home"}',     'US');

-- 查询（亚秒级，即使表 10 亿行）
SELECT
    event_type,
    count() AS events,
    uniq(user_id) AS users
FROM myapp.events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_type
ORDER BY events DESC;
```

### 模板 C — 创建只读业务用户

```sql
CREATE USER analytics IDENTIFIED WITH sha256_password BY 'analytics-pass';
GRANT SELECT ON myapp.* TO analytics;

-- 看权限
SHOW GRANTS FOR analytics;
```

### 模板 D — Python 客户端（clickhouse-driver）

```python
from clickhouse_driver import Client

client = Client(
    host='127.0.0.1',
    port=9000,
    user='default',
    password='your-password',
    database='myapp',
    secure=False
)

# Execute
client.execute("CREATE TABLE IF NOT EXISTS test (id UInt64) ENGINE=Memory")
client.execute("INSERT INTO test VALUES", [(1,), (2,), (3,)])

# Query
result = client.execute("SELECT id FROM test")
print(result)  # [(1,), (2,), (3,)]

# 流式（大数据集）
for row in client.execute_iter("SELECT * FROM events WHERE date='2026-05-23'", settings={'max_block_size': 10000}):
    process(row)
```

### 模板 E — HTTP API（curl / 任何 HTTP 客户端）

```bash
# 简单查询
curl 'http://default:pass@127.0.0.1:8123/' --data-binary 'SELECT 1'

# JSON 格式
curl 'http://default:pass@127.0.0.1:8123/?default_format=JSONEachRow' \
    --data-binary 'SELECT * FROM myapp.events LIMIT 10'

# 上传 CSV
cat data.csv | curl 'http://default:pass@127.0.0.1:8123/?query=INSERT INTO myapp.events FORMAT CSV' --data-binary @-
```

### 模板 F — Grafana 数据源

Grafana → Connections → Data sources → ClickHouse（需装 Grafana plugin `vertamedia-clickhouse-datasource` 或官方 `grafana-clickhouse-datasource`）。

```
Server URL: http://127.0.0.1:8123
Username:   default
Password:   <pass>
```

模型 → Visual Query Builder 直接拖字段画图。

### 模板 G — 数据导入（最常用）

```bash
# 1. CSV 直接导入
clickhouse-client --password 'pass' \
    --query "INSERT INTO myapp.events FORMAT CSV" \
    < data.csv

# 2. 从 PG 导入（dbt-clickhouse / Airbyte）

# 3. Kafka 引擎（实时流）
CREATE TABLE myapp.events_kafka (
    ...
) ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'events',
    kafka_group_name = 'clickhouse',
    kafka_format = 'JSONEachRow';

CREATE MATERIALIZED VIEW myapp.events_consumer
TO myapp.events
AS SELECT * FROM myapp.events_kafka;
```

### 模板 H — 备份（clickhouse-backup 工具）

```bash
# 装
curl -L https://github.com/Altinity/clickhouse-backup/releases/latest/download/clickhouse-backup_linux_amd64.tar.gz | sudo tar -xz -C /usr/local/bin

# 配置
sudo nano /etc/clickhouse-backup/config.yml
# clickhouse:
#   username: default
#   password: <pass>

# 完整备份
sudo clickhouse-backup create

# 上传到 S3
sudo clickhouse-backup upload <backup-name>

# 还原
sudo clickhouse-backup restore <backup-name>
```

或简单 dump：

```bash
clickhouse-client --password 'pass' --query "SELECT * FROM myapp.events FORMAT Parquet" > events.parquet
```

## 关键参数调优速查

### 资源占用

| 数据量 | RAM | 磁盘 |
|---|---|---|
| 小（< 100M 行） | 2 GB | 10 GB |
| 中（< 10G 行） | 8 GB | 100 GB |
| 大（< 100G 行） | 64 GB+ | TB 级 |
| 超大（> 1T 行） | 256 GB+ + 多节点 | 多节点 |

### 性能

| 项 | 推荐 |
|---|---|
| 主键 ORDER BY | 最常用过滤字段（如 timestamp + user_id） |
| 分区 PARTITION BY | 按月（toYYYYMM）或按天（按业务） |
| LowCardinality | 字符串字段值 < 10k 用此（自动字典） |
| 索引 | data skipping index（Bloom filter / minmax） |
| 压缩 | LZ4（默认）/ ZSTD（更小但慢） |

### 查询限速

```sql
SET max_memory_usage = 4000000000;          -- 4 GB
SET max_execution_time = 60;                  -- 60s
SET max_rows_to_read = 1000000000;             -- 10 亿行
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `packages.clickhouse.com/deb` | `packages.clickhouse.com/rpm` |
| Anolis 9 | – | ✅（glibc 兼容） |
| ARM64 | ✅ | ✅ |

## 与其它 catalog 项的配合

- **`grafana-dashboard`** — ClickHouse 数据源（模板 F）
- **`prometheus-monitoring`** — Prometheus 端口 9090 与 CH TCP 9000 接近，注意冲突
- **`postgres-profile`** — 互补（PG 做 OLTP，CH 做 OLAP）
- **`elasticsearch`** — 部分重叠（CH 优势：SQL + 数值聚合 / ES 优势：全文检索）

## 排错

### 服务起不来 / OOM

```bash
sudo journalctl -u clickhouse-server -n 50
sudo cat /var/log/clickhouse-server/clickhouse-server.err.log

# 内存不够
free -h
# 调小 max_server_memory_usage_to_ram_ratio
```

### 密码登录失败

```bash
# 看 default 用户密码 hash
sudo cat /etc/clickhouse-server/users.d/default-password.xml

# 重设
SHA256=$(echo -n 'newpass' | sha256sum | awk '{print $1}')
sudo sed -i "s|<password_sha256_hex>.*</password_sha256_hex>|<password_sha256_hex>$SHA256</password_sha256_hex>|" \
    /etc/clickhouse-server/users.d/default-password.xml
sudo systemctl restart clickhouse-server
```

### 查询慢

```sql
-- 看执行计划
EXPLAIN PLAN SELECT ... FROM ...

-- 看真实执行
EXPLAIN PIPELINE SELECT ... FROM ...

-- 慢查询日志
SELECT *
FROM system.query_log
WHERE event_time > now() - INTERVAL 1 HOUR
  AND query_duration_ms > 1000
ORDER BY query_duration_ms DESC LIMIT 10;
```

### 磁盘满

```bash
du -sh /var/lib/clickhouse/data/*

# 删老分区
ALTER TABLE myapp.events DROP PARTITION '202401';

# 启用 TTL 自动清
ALTER TABLE myapp.events MODIFY TTL timestamp + INTERVAL 90 DAY DELETE;
```

### 表损坏

```bash
# 启动时跳过坏分区
echo "force_restore_data: 1" | sudo tee -a /var/lib/clickhouse/flags/force_restore_data
sudo systemctl restart clickhouse-server
```

### 升级失败

```bash
# 备份 + 锁定老版本
sudo apt-mark hold clickhouse-server clickhouse-client    # Ubuntu
sudo dnf versionlock add clickhouse-server                 # RHEL（需 versionlock 插件）
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active clickhouse-server

# 2. ping
curl -fsS 'http://127.0.0.1:8123/ping'                    # Ok.

# 3. 版本
clickhouse-client --password 'pass' -q "SELECT version()"

# 4. 系统表
clickhouse-client --password 'pass' -q "SELECT * FROM system.tables LIMIT 5 FORMAT Vertical"

# 5. 看占用
sudo du -sh /var/lib/clickhouse
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**default 密码每次按表单值更新**。**数据保留**。

## ⚠️ 敏感性

**review** — ClickHouse 含**业务分析数据**——日志 / 行为 / 指标。

强制：

1. 默认仅 127.0.0.1 监听，远程访问通过 nginx + auth + IP 白名单
2. default 用户**仅运维用**，业务用受限账号（模板 C）
3. 公网 TCP 9000 必须 TLS

## 隐私说明

- 数据本地存储 `/var/lib/clickhouse/`
- 不发遥测（默认）
- 查询日志（`system.query_log`）含**完整 SQL**——可能含 PII（按合规清理）
- 用户密码用 SHA256 hash 存（`users.d/`），权限 0640
