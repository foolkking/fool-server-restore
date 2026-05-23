# Redis 内存数据库

Redis 7.x 内存键值数据库，常用作缓存 / 队列 / 实时排行榜 / 分布式锁。EnvForge 处理跨发行版的包名 / 路径差异，按表单设好密码、监听地址、内存上限、持久化策略。**生产推荐 Redis 而非 Memcached**——功能更丰富，认证完善，持久化可选。

## 你将得到什么

- 📦 **redis-server**（Ubuntu/Debian）/ **redis**（RHEL/Anolis；PACKAGE_ALIASES 自动翻译）
- ✅ 默认 `bind 127.0.0.1`（仅本机）
- ✅ `requirepass` 已设（默认 24 位随机密码）
- ✅ `maxmemory` + `maxmemory-policy` 已设，避免吃满系统内存
- ✅ 服务自动启动 + 开机自启
- ✅ 内核参数 `vm.overcommit_memory=1` 已设（避免 BGSAVE 失败）

## 表单字段说明

### `redis_password`

留空 = EnvForge 自动生成 24 位强密码（运行结束日志显示一次）。

> ⚠️ **强烈建议启用密码**——历史上裸暴露 Redis 被勒索攻击次数最多（典型攻击：`FLUSHALL` 后写 `key0=Send 1 BTC to ...`）。

仅当确认：(1) `bind=127.0.0.1` (2) 机器无不可信进程，才可考虑空密码。

### `bind_address`

| 值 | 适用 |
|---|---|
| `127.0.0.1`（默认） | 应用同机部署 |
| `0.0.0.0` | 远程访问，**必须**配密码 + 防火墙 |

### `port`

默认 6379。Redis 是扫描重灾区，生产建议改非标（如 16379 / 26379），能挡 80% 自动扫描。

### `maxmemory`（MB）

**强制建议**设上限。Redis 默认不限内存，吃满后系统 OOM kill。

| 场景 | 推荐 |
|---|---|
| 缓存（数据可丢） | 系统可用内存 × 60% |
| 主存储（不可丢） | 系统可用内存 × 40%（留余地给 fork 时的 copy-on-write） |

### `maxmemory_policy`

| 策略 | 适用 |
|---|---|
| `allkeys-lru`（默认） | 缓存场景 |
| `allkeys-lfu` | 热点 key 固定的缓存 |
| `volatile-lru` | 仅淘汰带 TTL 的 |
| `noeviction` | **主存储必选**——满了写入报错而非淘汰 |

### `appendonly`

| 值 | 行为 | 数据安全 |
|---|---|---|
| `no`（默认） | 仅 RDB 快照 | 可能丢最后几分钟 |
| `yes` | AOF 每秒 fsync | 几乎无丢失（最差 1 秒） |

纯缓存关 RDB + 关 AOF；持久化场景开 AOF。

## 配置文件 / 目录速查

```
# 配置 + 服务
/etc/redis/redis.conf                    # ← 主配置（Ubuntu 路径）
/etc/redis.conf                          # 主配置（RHEL 路径，可能软链 /etc/redis/redis.conf）
/etc/redis/sentinel.conf                 # Sentinel 高可用（可选）
/etc/systemd/system/redis.service.d/     # systemd override

# 数据
/var/lib/redis/                          # ← 数据目录
├── dump.rdb                              # RDB 快照
├── appendonly.aof                        # AOF（启用时）
└── appendonlydir/                        # Redis 7+ multi-AOF

# 日志
/var/log/redis/redis-server.log          # Ubuntu
/var/log/redis/redis.log                  # RHEL

# Socket（启用时）
/run/redis/redis-server.sock              # Ubuntu
/var/run/redis/redis.sock                  # RHEL
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `redis-server` | `redis` |
| 服务名 | `redis-server.service`（也可用 `redis`） | `redis` |
| 配置位置 | `/etc/redis/redis.conf` | `/etc/redis/redis.conf` 或 `/etc/redis.conf` |
| 数据目录 | `/var/lib/redis` | `/var/lib/redis` |
| 运行用户 | `redis` | `redis` |

## 常见配置模板

### 模板 A — 推荐 `/etc/redis/redis.conf`（生产基线）

```conf
# ====== 网络 ======
bind 127.0.0.1 ::1                      # IPv4 + IPv6 本机
port 6379
tcp-backlog 511
timeout 300                              # 闲置 5 分钟断
tcp-keepalive 60                         # 防僵尸连接

# Unix socket（同机应用更快，避免 TCP 开销）
unixsocket /run/redis/redis.sock
unixsocketperm 770

# ====== 安全 ======
requirepass <strong-password>
# 重命名危险命令（防误操作 / 攻击者）
rename-command FLUSHALL ""               # 完全禁用
rename-command FLUSHDB ""
rename-command CONFIG "CONFIG_a8z9"      # 重命名为 secret
rename-command DEBUG ""

# 用 ACL 替代单 password（Redis 6+）
# user default off
# user app on >app-pass ~app:* +@all -@dangerous

# ====== 通用 ======
daemonize no                             # systemd 管时设 no
supervised systemd                       # 让 systemd 知道 ready
pidfile /var/run/redis/redis-server.pid
loglevel notice                          # debug / verbose / notice / warning
logfile /var/log/redis/redis-server.log
databases 16                             # SELECT 0-15

# ====== 内存 ======
maxmemory 1gb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# ====== 持久化 RDB ======
save 900 1                               # 900s 内 1 次写就快照
save 300 10                              # 300s 内 10 次
save 60 10000                            # 60s 内 1 万次
stop-writes-on-bgsave-error yes          # 快照失败时停止写入
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis

# ====== 持久化 AOF ======
appendonly yes
appendfilename "appendonly.aof"
appenddirname "appendonlydir"             # Redis 7+
appendfsync everysec                      # always / everysec / no
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# ====== 慢查询 ======
slowlog-log-slower-than 10000             # 微秒，10ms
slowlog-max-len 128

# ====== 客户端连接 ======
maxclients 10000

# ====== 性能 ======
io-threads 4                              # 多核机器开 4-8
io-threads-do-reads yes
hz 10                                     # 后台任务频率（默认 10 OK）

# ====== 主从复制（可选）======
# replicaof <master-ip> <master-port>
# masterauth <master-pass>
# replica-serve-stale-data yes
# replica-read-only yes
```

应用：`sudo systemctl restart redis-server`。

### 模板 B — 主从 + Sentinel 高可用（HA）

#### Master 配置（同模板 A）+ 加：

```conf
# 给从节点用的密码（如果 master 也设了 requirepass）
masterauth <master-pass>
```

#### Replica 配置：

```conf
replicaof <master-ip> 6379
masterauth <master-pass>
replica-read-only yes
replica-priority 100                       # 越小越倾向被选 master
```

#### Sentinel 配置 `/etc/redis/sentinel.conf`（3 节点起）：

```conf
port 26379
daemonize no
sentinel monitor mymaster <master-ip> 6379 2    # 2 = quorum（多数投票）
sentinel auth-pass mymaster <master-pass>
sentinel down-after-milliseconds mymaster 5000
sentinel parallel-syncs mymaster 1
sentinel failover-timeout mymaster 30000
```

```bash
# 在每台机器（master + 2 replica）跑
redis-server /etc/redis/sentinel.conf --sentinel
```

应用连接 Sentinel 解析 master：

```python
from redis.sentinel import Sentinel
sentinel = Sentinel([('s1', 26379), ('s2', 26379), ('s3', 26379)])
master = sentinel.master_for('mymaster', password='...')
master.set('key', 'value')
```

### 模板 C — 性能优化命令模式

```bash
# ====== 用 pipeline 批量操作（往返 1 次 vs N 次）======
# 错：100 次往返
for i in {1..100}; do redis-cli SET key:$i value:$i; done

# 对：1 次往返
{ for i in {1..100}; do echo "SET key:$i value:$i"; done; } | redis-cli --pipe

# ====== 用 SCAN 替代 KEYS ======
# 错：阻塞 Redis（KEYS 在大库上几秒卡死）
redis-cli KEYS 'user:*'

# 对：游标分批
redis-cli --scan --pattern 'user:*' | head

# ====== 用 EXPIRE 防内存爆 ======
SET cache:abc value EX 3600              # 同时设值和 TTL
SET cache:abc value PX 1000              # 1 秒（毫秒精度）

# ====== 用 INCR 而非 GET → +1 → SET ======
INCR counter:visits                       # 原子，单次 RTT
```

### 模板 D — 监控指标速查

```bash
# 内存
redis-cli -a $PASS INFO memory | grep used_memory_human

# 客户端
redis-cli -a $PASS CLIENT LIST | wc -l
redis-cli -a $PASS INFO clients

# 慢查询
redis-cli -a $PASS SLOWLOG GET 10
redis-cli -a $PASS SLOWLOG RESET

# 命令统计
redis-cli -a $PASS INFO commandstats | head -20

# 实时监控（生产慎用，会拖慢）
redis-cli -a $PASS MONITOR

# 大 key 扫描
redis-cli -a $PASS --bigkeys

# 内存采样分析（推荐）
redis-cli -a $PASS --memkeys
```

### 模板 E — 安全加固清单

```bash
# 1. 强密码（至少 32 位）
CONFIG SET requirepass "$(openssl rand -base64 32)"
CONFIG REWRITE

# 2. 重命名 / 禁用危险命令
rename-command FLUSHALL "FLUSHALL_$(openssl rand -hex 8)"
rename-command FLUSHDB ""
rename-command DEBUG ""
rename-command SHUTDOWN "SHUTDOWN_$(openssl rand -hex 8)"
rename-command CONFIG "CONFIG_$(openssl rand -hex 8)"

# 3. ACL（Redis 6+）
ACL SETUSER app on >app-pass ~app:* &* +@read +@write +@list +@hash +@string -@dangerous
ACL SETUSER cache on >cache-pass ~cache:* +get +set +del +expire

# 4. TLS（Redis 6+）
# port 0
# tls-port 6379
# tls-cert-file /etc/redis/redis.crt
# tls-key-file /etc/redis/redis.key
# tls-ca-cert-file /etc/redis/ca.crt
# tls-auth-clients yes

# 5. 防火墙
sudo ufw allow from 10.0.0.0/8 to any port 6379
```

## 关键参数调优速查

### 内存

| 参数 | 推荐 | 说明 |
|---|---|---|
| `maxmemory` | 系统内存 × 50-60% | 留余地给 fork 时 COW |
| `maxmemory-policy` | `allkeys-lru` 或 `noeviction` | 见上 |
| `vm.overcommit_memory` | `1`（kernel） | 防 BGSAVE 失败 |
| `transparent_hugepages` | `never`（kernel） | 防 latency 抖动 |

### 持久化

| 模式 | 数据安全 | 性能影响 |
|---|---|---|
| 全关 | 重启丢全部 | 最快 |
| 仅 RDB（默认） | 丢最后几分钟 | 快（fork 瞬间影响） |
| 仅 AOF appendfsync=everysec | 丢 < 1 秒 | 中（每秒 fsync） |
| AOF appendfsync=always | 几乎不丢 | 慢（每写 fsync） |
| RDB + AOF（推荐） | 同 AOF | 同 AOF |

### 网络

| 参数 | 默认 | 调优 |
|---|---|---|
| `tcp-backlog` | 511 | 高并发：调到内核 `somaxconn` 一致（`sysctl -w net.core.somaxconn=65535`） |
| `tcp-keepalive` | 300 | 60（更早检测死连接） |
| `timeout` | 0 | 300（5 分钟空闲断） |
| `maxclients` | 10000 | 按 ulimit -n 调整 |

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `redis-server` | `redis`（PACKAGE_ALIASES 翻译） |
| 服务名 | `redis-server` | `redis` |
| 配置文件 | `/etc/redis/redis.conf` | 相同 |
| 默认仓库版本 | Ubuntu 22 = 6.0，Ubuntu 24 = 7.0+ | RHEL 9 = 7.0+ |
| 装更新版 | `redis` PPA / Docker | RHEL 9 默认就是 7.0+ |

## 与其它 catalog 项的配合

- **`postgres-profile` / `mysql-server`** — Redis 常作为它们的二级缓存
- **`nginx-web-service`** — nginx fastcgi_cache 用 Redis 后端（需 `lua-resty-redis` 或外部模块）
- **`docker-host-profile`** — `redis:7-alpine` 容器化部署
- **`prometheus-monitoring`** — Redis Exporter（`redis_exporter`）暴露 Prometheus 指标
- **`fail2ban-protection`** — 给 Redis 端口加 jail（防扫描）

## 排错

### `(error) NOAUTH Authentication required`

```bash
# CLI 加 -a
redis-cli -a "$PASSWORD" --no-auth-warning ping

# 或先 AUTH
redis-cli
> AUTH your-password
> ping
```

### 服务起不来

```bash
sudo journalctl -u redis-server -n 50

# 常见原因
# 1. bind 语法错（多个地址用空格分隔，不是逗号）
#    bind 127.0.0.1 ::1     ← 对
#    bind 127.0.0.1,::1     ← 错
# 2. maxmemory 单位错
#    maxmemory 256mb        ← 对
#    maxmemory 256 mb       ← 错（有空格）
# 3. 数据目录权限
sudo chown -R redis:redis /var/lib/redis

# 4. SELinux
sudo ausearch -m avc -ts recent | grep redis
sudo setsebool -P daemons_enable_cluster_mode 1   # 罕见
```

### Warning: TCP backlog ... but `/proc/sys/net/core/somaxconn` is set to ...

```bash
sudo sysctl -w net.core.somaxconn=65535
echo "net.core.somaxconn=65535" | sudo tee /etc/sysctl.d/99-redis.conf
```

### Warning: vm.overcommit_memory is set to 0

```bash
sudo sysctl -w vm.overcommit_memory=1
echo "vm.overcommit_memory=1" | sudo tee -a /etc/sysctl.d/99-redis.conf
```

### Warning: Transparent Huge Pages enabled

```bash
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled

# 持久化（systemd unit override）
sudo mkdir -p /etc/systemd/system/disable-thp.service.d/
cat <<EOF | sudo tee /etc/systemd/system/disable-thp.service
[Unit]
Description=Disable Transparent Huge Pages
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled'
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now disable-thp
```

### BGSAVE 失败 `Cannot allocate memory`

物理内存不足以 fork（Redis fork 时短暂复制全部内存）。三种应对：

```bash
# 1. 调小 maxmemory
CONFIG SET maxmemory 512mb

# 2. 加 swap（虽然 swap 不理想但救急）
# 见 swap-config

# 3. 加内存
```

### `OOM command not allowed when used memory > 'maxmemory'`

`maxmemory-policy = noeviction` 下，内存满后写入报错。两条路：

- 切策略：`CONFIG SET maxmemory-policy allkeys-lru`
- 调大上限：`CONFIG SET maxmemory 2gb`

### 主从延迟大

```bash
redis-cli -a $PASS INFO replication | grep lag
# slave_lag_in_seconds: 30   ← 太高

# 可能原因
# 1. 主写入太快（RDB/AOF 重写期间）
# 2. 网络慢
# 3. 从节点处理慢（CPU 不够 / IO 阻塞）

# 调优
CONFIG SET repl-backlog-size 64mb
CONFIG SET repl-disable-tcp-nodelay no
```

### `CONFIG REWRITE` 报错 `The server is running without a config file`

启动时没指定 `--config`：

```bash
# 启动方式应是
redis-server /etc/redis/redis.conf
# 而非
redis-server     # 这种 CONFIG REWRITE 不工作
```

systemd unit 默认正确，本 Playbook 不会出此问题。

## 验证

```bash
# 1. 服务在跑
systemctl is-active redis-server || systemctl is-active redis

# 2. 端口
sudo ss -tlnp | grep 6379

# 3. ping
redis-cli -a "$PASS" --no-auth-warning ping        # PONG

# 4. 写读
redis-cli -a "$PASS" --no-auth-warning SET test:envforge ok EX 10
redis-cli -a "$PASS" --no-auth-warning GET test:envforge       # ok

# 5. 看版本
redis-cli -a "$PASS" --no-auth-warning INFO server | grep redis_version

# 6. 看内存
redis-cli -a "$PASS" --no-auth-warning INFO memory | grep used_memory_human

# 7. 看持久化状态
redis-cli -a "$PASS" --no-auth-warning INFO persistence | head -20
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**每次会重写 6 个配置项**：bind / port / requirepass / maxmemory / maxmemory-policy / appendonly。其它配置（如手动加的 ACL / rename-command）保留。

要保留所有手改：移除本 Playbook 的 lineinfile 任务，或把自定义放 `/etc/redis/redis.conf.d/*.conf`（用 `include` 引用）。

## ⚠️ 敏感性

**review** — 默认配置（127.0.0.1 + requirepass）已加固。`bind 0.0.0.0` 是**高危操作**，必须配防火墙 + 强密码。

**风险升级**：

- 不设密码 + 0.0.0.0 = privileged（攻击者数分钟内拿下机器）
- 不设密码 + 127.0.0.1 = review（仅本机进程可读全部缓存）
- 设密码 + 127.0.0.1 = safe-review（默认配置）
- 设密码 + 0.0.0.0 + 防火墙 = review（可接受）

## 隐私说明

- 表单填写的密码会出现在 Playbook 任务日志（仅一次）。EnvForge 已用 `no_log: true` 标记，但任务结果摘要里仍可能含
- 安装完成后建议立即旋转密码：
    ```bash
    redis-cli -a "..." CONFIG SET requirepass "新密码"
    redis-cli -a "新密码" CONFIG REWRITE
    ```
- Redis 不发遥测
- AOF / RDB 文件含**所有键值数据**，文件权限 0640 redis:redis；备份这些文件等同备份业务数据
- `MONITOR` 命令会输出所有客户端命令（含密码）——生产慎用
- 默认 `protected-mode yes`：未设密码 + bind 不是 127 时**拒绝远程**连接（双保险）
