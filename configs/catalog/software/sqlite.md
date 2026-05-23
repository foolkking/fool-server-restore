# SQLite3 嵌入式数据库

SQLite 是世界部署最广的数据库——iOS / Android / 浏览器 / 大部分桌面应用都内嵌它。它**不是 server**：没有进程、没有端口、没有用户认证。数据库就是一个 `.db` 文件，应用通过 `libsqlite3` 直接读写。

> **经验法则**：先用 SQLite 起项目，写并发达到 1k/sec 或要跨主机访问时再迁移到 PostgreSQL/MySQL。WhatsApp / Tailscale 等大型生产系统都用 SQLite。

## 你将得到什么

- 📦 **sqlite3** — 命令行工具
- 📦 **libsqlite3-dev**（Ubuntu/Debian）/ **sqlite-devel**（RHEL/Anolis）— 开发头文件，供编译有 SQLite 依赖的程序用

无服务、无端口、无系统配置。

## 适用场景速查

| 场景 | SQLite | 注 |
|---|---|---|
| 单机应用本地存储 | ✅✅ | 完美 |
| 小型网站（< 1k 写/sec） | ✅ | WAL 模式 |
| 嵌入式设备 / 移动 App | ✅✅ | 默认选择 |
| CLI 工具的配置 / 缓存 | ✅✅ | 比 JSON 快 |
| 数据分析（CSV → SQL） | ✅✅ | `.mode csv` + `.import` |
| 高并发写入（>1k/sec） | ❌ | 写串行（一次一个写者） |
| 跨主机共享 | ❌ | 不能放 NFS（文件锁失效） |
| 复杂权限控制 | ❌ | 仅靠 OS 文件权限 |
| 复制 / HA 集群 | ⚠️ | 用 [Litestream](https://litestream.io/) / [LiteFS](https://fly.io/docs/litefs/) |

## 配置文件 / 目录速查

```
# 系统
/usr/bin/sqlite3                       # CLI
/usr/lib/x86_64-linux-gnu/libsqlite3.so.0    # 共享库（应用动态链接）
/usr/include/sqlite3.h                 # 头文件（编译用）

# 用户级（CLI 偏好）
~/.sqliterc                            # ← CLI 启动时执行的 SQL 命令
~/.sqlite_history                       # CLI 命令历史
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 命令行工具 | `sqlite3` | `sqlite3` |
| 头文件包 | `libsqlite3-dev` | `sqlite-devel`（PACKAGE_ALIASES 自动） |
| 默认仓库版本 | Ubuntu 22 = 3.37，Ubuntu 24 = 3.45 | RHEL 9 / Anolis 9 = 3.34 |
| FTS5 / JSON1 / R*Tree | 全开 | 全开 |

## 常见配置模板

### 模板 A — 推荐 `~/.sqliterc`（CLI 体验提升）

```sql
-- ~/.sqliterc
.headers on
.mode column
.timer on
.changes on
.eqp full

-- 输出宽度
.width 30 30

-- 提示符美化
.prompt "sqlite> " "...> "

-- 默认开 foreign keys（强烈推荐）
PRAGMA foreign_keys = ON;
```

### 模板 B — 应用代码里的 SQLite "生产配置"

**Python**：

```python
import sqlite3
conn = sqlite3.connect("mydata.db")

# WAL 模式（写并发从 ~50/sec 提到 ~50k/sec）
conn.execute("PRAGMA journal_mode = WAL")

# fsync 频率（NORMAL = 提交时 fsync，FULL = 每写都 fsync）
conn.execute("PRAGMA synchronous = NORMAL")

# 缓存大小（KB；负数表示绝对值）
conn.execute("PRAGMA cache_size = -64000")    # 64 MB

# 内存映射（让 OS 管理 IO）
conn.execute("PRAGMA mmap_size = 268435456")  # 256 MB

# 强制外键约束
conn.execute("PRAGMA foreign_keys = ON")

# 临时表用内存（小数据集快）
conn.execute("PRAGMA temp_store = MEMORY")

# 自动索引（查询无索引时建临时索引）
conn.execute("PRAGMA automatic_index = ON")
```

**Node.js (better-sqlite3)**：

```javascript
const Database = require('better-sqlite3');
const db = new Database('mydata.db', { fileMustExist: false });

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('mmap_size = 268435456');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');
```

**Rust (rusqlite)**：

```rust
use rusqlite::{Connection, params};
let conn = Connection::open("mydata.db")?;
conn.pragma_update(None, "journal_mode", "WAL")?;
conn.pragma_update(None, "synchronous", "NORMAL")?;
conn.pragma_update(None, "cache_size", -64000)?;
conn.pragma_update(None, "foreign_keys", "ON")?;
```

**Go (mattn/go-sqlite3)**：

```go
db, _ := sql.Open("sqlite3", "mydata.db?_journal=WAL&_sync=NORMAL&_fk=1&_cache_size=-64000")
```

### 模板 C — 备份方法（在线，不停应用）

```bash
# 1. CLI .backup 命令（推荐，跨平台 + 在线一致）
sqlite3 source.db ".backup backup.db"

# 2. SQL VACUUM INTO（同上效果，标准 SQL）
sqlite3 source.db "VACUUM INTO 'backup.db';"

# 3. 文件复制 + WAL flush（不推荐，并发写入下不一致）
sqlite3 source.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp source.db backup.db
```

不要直接 `cp source.db ...`——并发写入时会得到一个不一致的副本。

### 模板 D — 数据导入 / 导出

```bash
# CSV 导入
sqlite3 mydata.db <<'EOF'
.mode csv
.import users.csv users
.import orders.csv orders
.quit
EOF

# CSV 导出
sqlite3 mydata.db <<'EOF'
.mode csv
.headers on
.output users-export.csv
SELECT * FROM users;
.quit
EOF

# SQL dump（迁移到其它 SQLite）
sqlite3 mydata.db .dump > dump.sql
sqlite3 newdb.db < dump.sql

# 迁移到 PostgreSQL（需 pgloader）
sudo apt-get install pgloader
pgloader sqlite:///path/to/mydata.db postgresql://user:pass@host/newdb
```

### 模板 E — 复制 / HA 方案（Litestream / LiteFS）

虽然 SQLite 自身不支持复制，但 Ben Johnson 写的两个工具填补了这个 gap：

#### Litestream — 实时增量备份到 S3

```bash
# 装
curl -sLO https://github.com/benbjohnson/litestream/releases/latest/download/litestream-v0.3.13-linux-amd64.tar.gz
sudo tar -xzf litestream-v0.3.13-linux-amd64.tar.gz -C /usr/local/bin/

# 配置 /etc/litestream.yml
cat > /etc/litestream.yml <<'EOF'
dbs:
  - path: /var/lib/myapp/data.db
    replicas:
      - url: s3://my-bucket/data.db
        access-key-id: AKIA...
        secret-access-key: ...
        region: us-east-1
        retention: 720h            # 30 天
EOF

# 启动（systemd unit）
sudo systemctl enable --now litestream

# 还原
litestream restore -o /tmp/restored.db s3://my-bucket/data.db
```

#### LiteFS — 多机分布式 SQLite

不在本 Playbook 范围；适合需要"读多机 + 写主节点"的应用，把 SQLite 包成集群型存储。

### 模板 F — SQLite 高级特性

```sql
-- JSON 函数（默认编译）
SELECT json_extract('{"a":1,"b":2}', '$.a');     -- 1
SELECT data->>'$.name' FROM users;                -- 类似 PG

-- 全文搜索（FTS5）
CREATE VIRTUAL TABLE docs USING fts5(title, body, tokenize='porter');
INSERT INTO docs VALUES ('SQLite Guide', 'A small embedded database ...');
SELECT * FROM docs WHERE docs MATCH 'embedded';

-- 窗口函数（3.25+）
SELECT
    name,
    salary,
    AVG(salary) OVER (PARTITION BY dept) AS dept_avg,
    RANK() OVER (ORDER BY salary DESC) AS rank
FROM employees;

-- CTE 递归
WITH RECURSIVE subordinates(id, name, manager_id) AS (
    SELECT id, name, manager_id FROM employees WHERE id = 1
    UNION ALL
    SELECT e.id, e.name, e.manager_id
    FROM employees e
    JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates;

-- 生成列
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    price_dollars REAL GENERATED ALWAYS AS (price_cents / 100.0) VIRTUAL
);
```

## 关键参数调优速查

### Pragma 性能调优

| Pragma | 默认 | 推荐 | 作用 |
|---|---|---|---|
| `journal_mode` | DELETE | **WAL** | WAL 让读写并发 |
| `synchronous` | FULL | NORMAL（WAL 模式） | fsync 频率 |
| `cache_size` | -2000（2 MB） | -64000（64 MB） | 页缓存大小 |
| `mmap_size` | 0 | 268435456（256 MB） | 内存映射 IO |
| `foreign_keys` | OFF | ON | 强制外键 |
| `temp_store` | DEFAULT | MEMORY | 临时表去内存 |
| `busy_timeout` | 0 | 5000（5 秒） | 锁等待超时 |
| `auto_vacuum` | NONE | INCREMENTAL（建库时设） | 渐进回收空间 |
| `wal_autocheckpoint` | 1000 | 1000-10000 | WAL 大小阈值 |

### 性能预期（WAL 模式 + 模板 B 调优）

| 操作 | 性能 |
|---|---|
| 单条 INSERT | ~50k/sec（事务） |
| 单条 INSERT（无事务） | ~50/sec |
| SELECT（命中缓存） | ~1M/sec |
| FTS5 全文搜索 | ~50k 文档/sec |
| 数据库大小 | 281 TB（理论上限） |

### 数据库文件大小优化

```sql
-- 看实际大小
SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size();

-- 回收删除后的空间
VACUUM;                        -- 全量 vacuum，慢但效果好

-- 渐进回收（建库时启用）
PRAGMA auto_vacuum = INCREMENTAL;
PRAGMA incremental_vacuum(100); -- 每次回收 100 页

-- 看碎片化
PRAGMA freelist_count;
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `sqlite3` 包 | 默认 | 默认 |
| 头文件包 | `libsqlite3-dev` | `sqlite-devel` |
| FTS5 | 编译启用 | 编译启用 |
| JSON1 | 编译启用 | 编译启用 |
| R*Tree | 编译启用 | 编译启用 |

`libsqlite3-dev` / `sqlite-devel` 由 PACKAGE_ALIASES 自动翻译。

各版本 SQLite：

| 发行版 | 版本 | 关键特性 |
|---|---|---|
| Ubuntu 22.04 | 3.37 | 严格类型 |
| Ubuntu 24.04 | 3.45 | JSONB |
| Debian 12 | 3.40 | – |
| RHEL 9 / Anolis 9 | 3.34 | 窗口函数（3.25+）/ UPSERT（3.24+）/ JSON / FTS5 |

3.34 已含 99% 现代特性。要更新版从源码编译或用 [official binary](https://www.sqlite.org/download.html)。

## 与其它 catalog 项的配合

- **`postgres-profile` / `mysql-server` / `mariadb`** — SQLite 通常作为开发 / 小项目过渡，业务大了迁过去
- **`python-toolchain`** — Python `sqlite3` 模块内置，无需额外装
- **`rust-toolchain`** — `rusqlite` crate 默认动态链接系统 SQLite；用 `bundled` feature 静态编译进二进制
- **`grafana-dashboard`** — Grafana 默认用 SQLite 后端（小型部署）

## 排错

### `bash: sqlite3: command not found`

包名不一致：

```bash
# Ubuntu/Debian
sudo apt-get install sqlite3

# RHEL/Anolis 9
sudo dnf install sqlite                       # 注意没有 3
```

EnvForge PACKAGE_ALIASES 自动翻译。

### `database is locked`

写并发碰撞。三种应对：

```sql
-- 1. 用 WAL 模式（让读不阻塞写）
PRAGMA journal_mode = WAL;

-- 2. 设 busy_timeout（自动重试）
PRAGMA busy_timeout = 5000;

-- 3. 应用层：单 writer 串行（最可靠）
```

> 死锁罕见——SQLite 是文件锁，没有 deadlock 检测。表现为永远 BUSY。

### `disk I/O error`

大概率是文件系统问题：

```bash
# 检查磁盘
sudo dmesg | grep -i error
df -h .

# 检查文件系统支持锁（NFS 不行）
stat -f .

# SQLite 不能放 NFS / SMB（除非加 ?nolock=1，但失去原子性保证）
```

### 应用代码报 `no such module: ...`

需要某 SQLite 扩展（FTS5 / RBU / JSON1）但编译时未启用。Ubuntu/Debian 默认全开；RHEL 9 默认全开。如自己编译 SQLite，加 `--enable-fts5 --enable-json1`。

### 数据库越来越大

```sql
-- 看碎片
PRAGMA freelist_count;

-- 全量 VACUUM（耗时与库大小成正比）
VACUUM;

-- 看具体表大小
SELECT name, sum(payload + unused) AS size
FROM dbstat GROUP BY name ORDER BY size DESC;
```

定期 `VACUUM` 或建库时启用 `auto_vacuum = INCREMENTAL`。

### 应用退出后 `-wal` 和 `-shm` 文件还在

WAL 模式正常行为——下次打开会自动 checkpoint 合并。要清空：

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

或退出前：

```python
conn.close()      # 自动 checkpoint
```

### 备份文件大小 < 原始数据库

正常——`.backup` / `VACUUM INTO` 会去碎片，备份比原始小是常见的。

### 迁移到 PostgreSQL 失败

```bash
# pgloader 是首选
pgloader sqlite:///mydata.db postgresql://user:pass@host/newdb

# 类型映射差异
# SQLite      → PostgreSQL
# INTEGER     → INTEGER / BIGINT
# REAL        → DOUBLE PRECISION
# TEXT        → TEXT
# BLOB        → BYTEA
# NUMERIC     → NUMERIC
```

## 验证

```bash
# 1. 命令存在
sqlite3 --version                    # 3.34+ 即可

# 2. 头文件存在（编译用）
ls /usr/include/sqlite3.h

# 3. 创建测试数据库
echo 'CREATE TABLE test (id INTEGER, name TEXT);
INSERT INTO test VALUES (1, "hello");
SELECT * FROM test;' | sqlite3 /tmp/sqlite-test.db
rm /tmp/sqlite-test.db

# 4. 看支持的 pragma
echo 'PRAGMA compile_options;' | sqlite3 :memory: | head

# 5. JSON 支持
echo 'SELECT json_extract(?, "$.a")' | sqlite3 :memory: '{"a":42}'    # 42

# 6. FTS5 支持
echo 'CREATE VIRTUAL TABLE t USING fts5(c)' | sqlite3 :memory:
```

## 多次运行

`installMode: skip-existing`。包安装幂等。本 Playbook 不创建任何 .db 文件——SQLite 是库 + CLI 工具。

## ⚠️ 敏感性

**safe** — 只是 CLI 工具 + 共享库，无服务、无网络监听。

## 隐私说明

- SQLite 是嵌入式库，**自身不上传也不同步任何数据**
- `.db` 文件就在应用目录里——备份 / 迁移记得带上
- 文件加密：SQLite 自身无加密（**SEE 是商业版**）；用 [SQLCipher](https://www.zetetic.net/sqlcipher/) 替代（API 兼容，AES-256）
- CLI 命令历史在 `~/.sqlite_history`（含运行过的 SQL，可能含数据）
- 备份文件含**所有数据**——加密 + 严格访问控制
