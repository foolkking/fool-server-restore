# PostgreSQL 数据库

PostgreSQL 16 服务端 + 常用 contrib 模块。EnvForge 处理跨发行版的安装路径差异，
设好密码、调好基础参数，一键能用。

## 你将得到什么

- 📦 **postgresql** + **postgresql-contrib**（pg_trgm / hstore / uuid-ossp 等扩展）
- ✅ 服务自动启动并设开机自启
- ✅ `postgres` 超级用户密码已设置（默认随机 24 位，可以表单里自己填）
- ✅ 监听地址、端口、max_connections 按表单的值生效
- ✅ RHEL/Anolis 上自动跑 `postgresql-setup --initdb` 初始化数据目录（Ubuntu deb 包自动初始化）

## 表单字段说明

### postgres 用户密码 `postgres_password`

数据库的根账号 `postgres` 的密码。强烈建议留空让 EnvForge 自动生成 24 位强密码——
运行结束会**只显示一次**，立刻复制保存。

如果忘了密码，本机可以这样重置：
```bash
sudo -u postgres psql
postgres=# ALTER USER postgres WITH PASSWORD '新密码';
```

### 监听地址 `listen_addresses`

- **localhost**（默认，推荐）：只有本机的应用能连数据库
- **\***（所有网卡）：远程能连，但你必须先在防火墙上限制来源 IP，否则等同于把数据库挂公网

### 监听端口 `port`

默认 5432。改非标端口可以挡掉一部分自动扫描，但所有客户端、备份脚本、监控都需要同步改。

### 最大连接数 `max_connections`

默认 100。每个连接占用 5-10MB 内存。**别盲目调高**——如果应用真需要 500+ 并发连接，
正确做法是用 PgBouncer 或 PgPool 做连接池，而不是改这个值。

### 允许远程登录 `enable_remote`

勾选后会在 `pg_hba.conf` 加上 `host all all 0.0.0.0/0 md5`。**这是高风险操作**，
开了之后立刻在防火墙限制 5432 端口的来源 IP，比如：

```bash
sudo ufw allow from 1.2.3.4 to any port 5432  # Ubuntu
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="1.2.3.4" port port=5432 protocol=tcp accept' --permanent  # RHEL
```

## 安装后

### 创建业务数据库和用户

```bash
sudo -u postgres psql

postgres=# CREATE DATABASE mydb;
postgres=# CREATE USER appuser WITH PASSWORD 'yyyy';
postgres=# GRANT ALL PRIVILEGES ON DATABASE mydb TO appuser;
postgres=# \q
```

### 验证连接（在表单密码生效后）

```bash
psql -h 127.0.0.1 -U postgres -d postgres
# 输入你设置的密码
```

### 启用扩展（按需）

```sql
-- 全文搜索 / 模糊匹配
CREATE EXTENSION pg_trgm;
-- UUID 主键
CREATE EXTENSION "uuid-ossp";
-- 键值对存储
CREATE EXTENSION hstore;
```

## ⚠️ 敏感性

**privileged** — PostgreSQL 是数据持久化层，配错可能导致**已有数据丢失**或**未授权访问**。
跨发行版的数据目录路径不同（`/var/lib/postgresql/16/main` vs `/var/lib/pgsql/data`），
EnvForge 会向两个路径都写一遍 lineinfile，让正确的那个生效。

## 验证安装

```bash
systemctl status postgresql --no-pager
sudo -u postgres psql -c 'SELECT version();'
sudo ss -tlnp | grep 5432
```

## 排错

- **`could not connect to server: No such file or directory`** — 服务没启动；通常 RHEL 上忘了 initdb，重跑 Playbook 即可。
- **`peer authentication failed for user "postgres"`** — 你在 `psql -U postgres -h 127.0.0.1` 时遇到这个，是因为 `pg_hba.conf` 的 local 段还是 peer 模式。改成 `local all postgres md5` 后 `systemctl restart postgresql`。
- **`FATAL: too many connections`** — 调高 `max_connections` 或改用 PgBouncer。
- **远程连不上** — 检查 `listen_addresses = '*'` + `pg_hba.conf` 有 host 段 + 防火墙开 5432。
- **跨发行版**：从 Ubuntu 捕获的 Playbook 应用到 RHEL/Anolis 时，包名 `postgresql` 自动翻译为 `postgresql-server`（PACKAGE_ALIASES）。

## 多次运行

`installMode: skip-existing` — 已经装好不会重装，但每次会重新写 listen_addresses / port /
max_connections / postgres 密码（这是你期望的行为：表单是事实之源）。如果你想保留
手动调过的 postgresql.conf 值，请直接编辑 Playbook 删掉对应的 lineinfile 任务。

## 隐私说明

- 表单填的密码会出现在任务日志里。任务历史持久化时已经做了脱敏，但能看到任务的人理论上能看到密码——所以建议安装完成后立刻在数据库里改一次。
- `pg_hba.conf` 和 `postgresql.conf` **不会**被 EnvForge 上传或同步——它们留在目标机器上。
