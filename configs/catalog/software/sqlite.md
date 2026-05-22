# SQLite3 嵌入式数据库

SQLite 是世界上部署最广的数据库——你手机里的 iOS / Android、所有现代浏览器、
绝大部分桌面应用都内嵌了它。它**不是 server**：没有进程、没有端口、没有用户认证。
数据库就是一个 `.db` 文件，应用通过 `libsqlite3` 直接读写。

## 你将得到什么

- 📦 **sqlite3** — 命令行工具
- 📦 **libsqlite3-dev**（Ubuntu）/ **sqlite-devel**（RHEL）— 开发头文件，用于编译有 SQLite 依赖的程序

没有服务、没有端口、没有配置。

## 适用场景

- ✅ 单机应用本地存储（轻量 CRUD、配置数据、日志）
- ✅ 小型网站（< 1000 写/秒，数千并发读）
- ✅ 嵌入式设备 / 移动 App
- ✅ 开发测试环境（无需起 PostgreSQL/MySQL）
- ✅ 数据分析工作流（`sqlite3` CLI 直接 `.import csv` 后用 SQL 查）

## 不适用场景

- ❌ 高并发写入（一次只允许一个写者）
- ❌ 跨主机共享（不能放 NFS，不支持网络协议）
- ❌ 需要复杂权限控制
- ❌ 需要复制 / 高可用集群

## 命令速览

```bash
# 进入交互式 shell
sqlite3 mydata.db

# 直接跑 SQL
sqlite3 mydata.db "SELECT * FROM users LIMIT 10;"

# 导入 CSV
sqlite3 mydata.db
> .mode csv
> .import users.csv users
> .quit

# 备份（推荐方式）
sqlite3 source.db ".backup backup.db"

# 查表结构
sqlite3 mydata.db ".schema"

# 查所有表
sqlite3 mydata.db ".tables"
```

## 与服务端数据库的对比

| 特性 | SQLite | PostgreSQL/MySQL |
|---|---|---|
| 部署 | 一个文件 | 一个服务 |
| 写并发 | 串行 | 并行 |
| 读并发 | 极佳 | 良好 |
| 网络访问 | 不支持 | 内置 |
| 用户权限 | 无（靠文件权限） | RBAC |
| 写性能 | ~50K/sec（WAL 模式） | 更高 |
| 单库大小 | 281 TB（理论） | 无限 |

**经验法则：先用 SQLite 起项目，写并发达到 1K/sec 或要跨主机访问时再迁移到
PostgreSQL/MySQL**。

## 性能优化（按需）

打开应用代码里的 WAL 模式，能把写并发从 ~50/sec 提到 ~50K/sec：

```python
# Python sqlite3
conn = sqlite3.connect("mydata.db")
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=NORMAL")  # 默认 FULL 太慢
```

## ⚠️ 敏感性

**safe** — 只是个 CLI 工具 + 库，没有服务、没有网络监听。

## 验证安装

```bash
sqlite3 --version
echo 'SELECT sqlite_version();' | sqlite3 :memory:
```

## 排错

- **`bash: sqlite3: command not found`** — 包名问题。Ubuntu 上是 `sqlite3`，RHEL 上有时是 `sqlite`，EnvForge 已经自动翻译。
- **应用代码里报 `no such module: ...`** — 应用程序需要的 SQLite 扩展（如 fts5 / json1）需要编译时启用。Ubuntu 默认开了主流扩展，问题不大。
- **`database is locked`** — 同一个 .db 文件被多个进程同时写。SQLite 串行写，没法解决，要么改读 WAL 模式（增加并发，但仍是写串行），要么换 PostgreSQL/MySQL。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

SQLite 是嵌入式库，本身不上传不同步任何数据。**.db 文件就在应用目录里**，备份/迁移时记得带上它。
