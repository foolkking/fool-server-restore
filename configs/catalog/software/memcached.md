# Memcached 内存缓存

Memcached 是高性能 KV 内存缓存（**无持久化**）。功能比 Redis 简单很多——只支持 SET / GET / DELETE / INCR / DECR 等基础操作，但单一职责让它在大并发纯缓存场景比 Redis 还要快一点（多线程）。

> ⚠️ **强烈建议优先选 Redis**——除非你已有大量 Memcached 投资或极致并发的纯缓存需求。Redis 有认证、持久化、丰富数据结构，覆盖 90% Memcached 场景。

## 你将得到什么

- 📦 **memcached** + libmemcached 客户端工具
- ✅ 默认监听 `127.0.0.1:11211`（仅本机）
- ✅ UDP **关闭**（防 DDoS amplification 攻击）
- ✅ 内存上限按表单生效
- ✅ 服务自动启动 + 开机自启

## ⚠️ 重要安全提示

**Memcached 没有内置认证机制**（除非编译 SASL 版）。任何能连到 11211 端口的进程都能读写所有缓存。

而且 Memcached UDP 协议历史上是 [DDoS amplification 攻击](https://en.wikipedia.org/wiki/Memcached_DDoS_attack) 重灾区——流量放大 50000+ 倍。**绝不**把 UDP 11211 暴露公网。本 Playbook 默认 `-U 0` 关 UDP。

如非要远程访问：

1. 防火墙仅允许特定 IP 访问 11211/TCP
2. UDP 永远关
3. 考虑 SASL 编译版（增加复杂度）
4. **更好的方案：换 Redis**

## 表单字段说明

### `memory_mb` — 缓存内存上限（MB）

| 场景 | 推荐 |
|---|---|
| 小型应用 | 64-256 |
| 中等流量 | 512-2048 |
| 大流量 | 4096+ |

Memcached 用 LRU 自动淘汰，到上限自动让出空间，不会 OOM。

### `bind_address`

| 值 | 适用 |
|---|---|
| `127.0.0.1`（**强烈推荐**） | 应用同机 |
| `0.0.0.0` | 远程，**必须**配防火墙 + SASL |

### `port`

默认 11211。

### `max_connections`

默认 1024。每连接 ~50 KB，10000 个连接占 ~500 MB。

| 场景 | 推荐 |
|---|---|
| 小型应用 | 1024 |
| Web 服务 | 4096 |
| 高并发 | 10000+ |

### `threads`

默认 4。Memcached 多线程，CPU 多核优势明显。

## 配置文件 / 目录速查

```
# Ubuntu/Debian
/etc/memcached.conf                     # ← 主配置（每行一个参数，类似 CLI flag）
/etc/default/memcached                   # 启动脚本读的环境变量

# RHEL/Anolis（完全不同！）
/etc/sysconfig/memcached                 # ← 主配置（OPTIONS="..." 风格）
# 没有 memcached.conf

# 通用
/var/log/memcached.log                   # 日志
/var/run/memcached/memcached.pid          # PID

# systemd unit
/lib/systemd/system/memcached.service     # Ubuntu
/usr/lib/systemd/system/memcached.service  # RHEL
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `memcached` | `memcached` |
| 配置文件 | `/etc/memcached.conf`（每行一个参数） | `/etc/sysconfig/memcached`（环境变量） |
| 配置语法 | `-l 127.0.0.1`（一行一参数） | `OPTIONS="-l 127.0.0.1 -U 0"`（环境变量串） |
| 服务名 | `memcached` | `memcached` |

EnvForge **同时写两个文件**——根据系统 service 单元读哪个，对应那个生效。

## 常见配置模板

### 模板 A — Ubuntu `/etc/memcached.conf`（推荐生产基线）

```bash
# 内存上限（MB）
-m 512

# 监听地址（仅本机）
-l 127.0.0.1

# 端口
-p 11211

# 关闭 UDP（防 DDoS amplification）
-U 0

# 最大并发连接
-c 1024

# 工作线程数（= CPU 核数）
-t 4

# 启动用户
-u memcache

# 后台运行
-d

# PID 文件
-P /var/run/memcached/memcached.pid

# 日志
# logfile /var/log/memcached.log
-vv                                     # verbose（生产关）

# 限制单个 item 大小（默认 1MB）
# -I 4m                                  # 4MB（仅缓存大对象时调高）

# 启用大页（性能略好但需 root）
# -L

# 禁用 CAS 操作（少用，禁后省内存）
# -C

# 慢延迟阈值（微秒）
# 慢 IO / GC 监控用
# -O slow_ops_count_per_sec=200
```

### 模板 B — RHEL `/etc/sysconfig/memcached`

```bash
PORT="11211"
USER="memcached"
MAXCONN="1024"
CACHESIZE="512"
OPTIONS="-l 127.0.0.1 -U 0 -t 4"
```

> RHEL 系 systemd unit 是预设的——读 `$PORT $USER $MAXCONN $CACHESIZE $OPTIONS`，不能直接写完整命令行。

### 模板 C — 客户端使用速查

#### CLI 测试

```bash
# stats
echo 'stats' | nc 127.0.0.1 11211 | head -30
# STAT uptime 12345
# STAT cmd_set 100
# STAT bytes 102400
# ...

# 写
printf 'set mykey 0 60 5\r\nhello\r\n' | nc -w1 127.0.0.1 11211
# STORED

# 读
printf 'get mykey\r\n' | nc -w1 127.0.0.1 11211
# VALUE mykey 0 5
# hello
# END

# 删
printf 'delete mykey\r\n' | nc -w1 127.0.0.1 11211
# DELETED

# 看所有 key（仅调试用，生产慎用）
echo 'stats items' | nc 127.0.0.1 11211
echo 'stats cachedump 1 100' | nc 127.0.0.1 11211      # slab 1 中前 100 个 key
```

#### Python（pymemcache）

```python
from pymemcache.client.base import Client

mc = Client(('127.0.0.1', 11211),
            connect_timeout=1, timeout=1,
            no_delay=True)

mc.set('user:42', '{"name": "Alice"}', expire=300)
data = mc.get('user:42')
mc.delete('user:42')

# 多 key
mc.set_multi({'a': '1', 'b': '2', 'c': '3'}, expire=60)
mc.get_multi(['a', 'b', 'c'])
```

#### Node.js（memjs）

```javascript
const memjs = require('memjs');
const mc = memjs.Client.create('127.0.0.1:11211', {
    keepAlive: true,
    timeout: 1
});

await mc.set('user:42', JSON.stringify({name: 'Alice'}), { expires: 300 });
const { value } = await mc.get('user:42');
await mc.delete('user:42');
```

#### PHP（ext-memcached）

```php
$mc = new Memcached();
$mc->addServer('127.0.0.1', 11211);
$mc->setOption(Memcached::OPT_BINARY_PROTOCOL, true);
$mc->setOption(Memcached::OPT_TCP_NODELAY, true);

$mc->set('user:42', json_encode(['name' => 'Alice']), 300);
$data = $mc->get('user:42');
```

### 模板 D — 性能调优 + 监控

```bash
# 实时统计
echo 'stats' | nc 127.0.0.1 11211 | grep -E '(cmd_get|cmd_set|hit_rate|bytes|curr_items|evictions)'

# 命中率（关键指标）
# cmd_get / get_hits = 命中率
echo 'stats' | nc 127.0.0.1 11211 | awk '/get_hits|cmd_get/{print}'

# slab 分布
echo 'stats slabs' | nc 127.0.0.1 11211 | head -30

# items 分布
echo 'stats items' | nc 127.0.0.1 11211 | head -30
```

### 模板 E — Memcached vs Redis 速查

| 维度 | Memcached | Redis |
|---|---|---|
| 协议 | 简单文本 / binary | RESP（文本） |
| 数据结构 | KV string | KV / list / hash / set / zset / stream / hyperloglog / geo |
| 多线程 | ✅（4-16 worker） | 仅 IO 多线程（6.0+） |
| 持久化 | ❌ | RDB / AOF |
| 集群 | 客户端分片 | Redis Cluster / Sentinel |
| 认证 | ❌（除非 SASL 编译） | ✅ requirepass + ACL |
| 最大值大小 | 1 MB（默认） | 512 MB |
| 内存效率 | 略高（只支持 string） | 略低（多种数据结构开销） |
| 读写性能 | 1.5M ops/sec | 1M ops/sec |
| 用途 | **纯缓存** | 缓存 + 队列 + 锁 + 排行榜 + ... |

**默认推荐 Redis**——多 80% 场景能覆盖。

## 关键参数调优速查

### 并发

| 参数 | 默认 | 推荐 |
|---|---|---|
| `-c`（max connections） | 1024 | 4096-10000 |
| `-t`（threads） | 4 | CPU 核数 |
| `-I`（max item size） | 1m | 不动；要存大对象用 Redis |
| `-n`（min slab size） | 48 | 不动 |
| `-f`（slab grow factor） | 1.25 | 1.1（减少 slab 浪费） |

### 监控关键指标

```bash
# 关键看：
# get_hits / cmd_get  = 命中率（< 80% 说明缓存设计有问题）
# evictions          = 因内存满淘汰的对象数（持续 > 0 说明 -m 太小）
# bytes / limit_maxbytes = 内存使用率
# total_connections   = 累计连接（突然飙升 = 连接泄漏）

# 命中率公式
get_hits=$(echo 'stats' | nc 127.0.0.1 11211 | awk '/get_hits/{print $3}')
cmd_get=$(echo 'stats' | nc 127.0.0.1 11211 | awk '/cmd_get /{print $3}')
echo "Hit rate: $(echo "scale=2; $get_hits * 100 / $cmd_get" | bc)%"
```

### 缓存策略

| 模式 | 用法 |
|---|---|
| Cache-Aside | App 先查 cache，miss 后查 DB → 回填 cache |
| Write-Through | App 写 DB 同时写 cache |
| Write-Behind | App 写 cache，延迟批量写 DB（高风险） |
| Read-Through | Cache 自身负责从 DB 拉（Memcached 不支持，需中间层） |

最常用：**Cache-Aside**。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `memcached` | `memcached` |
| 配置文件 | `/etc/memcached.conf` | `/etc/sysconfig/memcached` |
| 配置语法 | 每行一参数 | OPTIONS 字符串 |
| 默认仓库版本 | Ubuntu 22 = 1.6.14，Ubuntu 24 = 1.6.24 | RHEL 9 / Anolis 9 = 1.6.x |

EnvForge 同时写两份配置文件——systemd unit 读哪份，那份生效。两边版本都支持本 Playbook 的所有参数。

## 与其它 catalog 项的配合

- **`redis-server`** — 替代品（互不干扰，可同机部署但通常二选一）
- **`postgres-profile` / `mysql-server`** — Memcached 作为 DB 二级缓存
- **`nginx-web-service`** — fastcgi_cache 不直接用 Memcached，但应用层用
- **`prometheus-monitoring`** — `memcached_exporter` 暴露 Prometheus 指标

## 排错

### `nc: connection refused`

服务没起来：

```bash
sudo systemctl status memcached
sudo journalctl -u memcached -n 50
```

### `bind: Address already in use`

11211 被占：

```bash
sudo ss -tlnp | grep 11211
# 改端口或杀冲突进程
```

### Ubuntu vs RHEL 配置改了不生效

检查改对了哪份：

```bash
# Ubuntu
cat /etc/memcached.conf
sudo systemctl restart memcached

# RHEL
cat /etc/sysconfig/memcached
sudo systemctl restart memcached
```

EnvForge 同时写两份，但实际只一份生效——这是正常的（systemd unit 只读其中一份）。

### 命中率低 (< 50%)

可能原因：

```bash
# 1. 内存太小，频繁淘汰
echo 'stats' | nc 127.0.0.1 11211 | grep evictions
# 持续 > 0 = -m 加大

# 2. 缓存 key 设计差（高基数）
echo 'stats items' | nc 127.0.0.1 11211    # 看 key 数量

# 3. TTL 太短
# 看 expired_unfetched
```

### 单 item 写入失败 `SERVER_ERROR object too large`

默认单 item 上限 1MB。改：

```bash
# Ubuntu
echo "-I 4m" >> /etc/memcached.conf
# RHEL
sudo sed -i 's/^OPTIONS=".*"/OPTIONS="-l 127.0.0.1 -U 0 -t 4 -I 4m"/' /etc/sysconfig/memcached

sudo systemctl restart memcached
```

但建议：超 1MB 的对象不该用 Memcached / Redis 缓存——拆 chunk 或换对象存储。

### 重启后所有 key 没了

**预期行为**——Memcached 不持久化。需持久化用 Redis。

### Memcached 进程吃 CPU 100%

```bash
# 看是不是有 long-running 命令
echo 'stats' | nc 127.0.0.1 11211 | grep -i busy

# 重启重置
sudo systemctl restart memcached

# 长期 100% = 流量过载，加机器 / 加内存
```

### `Authentication failed` (SASL 编译版)

```bash
# 检查 SASL 配
cat /etc/sasl2/memcached.conf

# 加用户
saslpasswd2 -a memcached -c memcached_user
```

非 SASL 编译的 Memcached **没有**认证——遇到 auth failed 通常是客户端配错。

## 验证

```bash
# 1. 服务在跑
systemctl is-active memcached

# 2. 端口
sudo ss -tlnp | grep 11211             # 应有 TCP
sudo ss -ulnp | grep 11211             # 不应有 UDP（已 -U 0）

# 3. 连接测试
echo 'version' | nc -w1 127.0.0.1 11211       # VERSION 1.6.x

# 4. 写读测试
printf 'set test 0 30 11\r\nHello World\r\n' | nc -w1 127.0.0.1 11211
printf 'get test\r\n' | nc -w1 127.0.0.1 11211

# 5. stats
echo 'stats' | nc 127.0.0.1 11211 | head -20

# 6. 内存使用
echo 'stats' | nc 127.0.0.1 11211 | grep -E '(limit_maxbytes|bytes )'
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**每次按表单值重写两份配置文件**（Ubuntu 的 `memcached.conf` + RHEL 的 `/etc/sysconfig/memcached`）——你手动改的会被覆盖。

## ⚠️ 敏感性

**review** — 内存缓存，本身不持久化数据。

风险点：

- **无认证**：`bind 0.0.0.0` 暴露 = 任何人可读全部缓存
- **UDP DDoS**：UDP 端口暴露 = 被利用做 amplification 攻击源
- **缓存内容敏感**：key/value 可能含 session / API token

EnvForge 默认配置已规避：bind 127.0.0.1 + UDP 关闭。

## 隐私说明

- Memcached **不持久化**——重启数据全丢，磁盘上无任何数据文件
- 不发遥测
- **任何能连 11211 的进程都能读所有缓存内容**——慎放 PII / 密码 / token；要放也用 hash 脱敏
- 进程列表（`ps`）能看到 `-l 127.0.0.1` 等启动参数（不含数据）
- 日志（`/var/log/memcached.log`）含 verbose 输出时可能含 key 名（不含 value）
