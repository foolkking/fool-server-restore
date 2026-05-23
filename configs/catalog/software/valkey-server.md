# Valkey 内存数据库

Valkey 是 **Redis 7.4 的开源 fork**——Redis 7.4 改 SSPL（非完全开源）后，Linux Foundation 接手以 BSD 协议继续维护，AWS / GCP / Oracle / Snap 等支持。**100% 兼容 Redis 协议** —— 现有 Redis 客户端 / 驱动 / 工具直接可用。**长期看会逐步取代 Redis**。

## 你将得到什么

- 📦 **valkey-server**（Ubuntu 24.10+ 默认仓库 / RHEL EPEL / Docker）
- ✅ 默认监听 `127.0.0.1:6380`（避免与 redis 冲突）
- ✅ requirepass 已设
- ✅ maxmemory + 策略已配
- ✅ systemd 服务 + 开机自启

## 表单字段说明

字段含义与 `redis-server` 完全相同——见 `redis-server.md` 详细说明。

| 字段 | 含义 |
|---|---|
| `valkey_password` | requirepass |
| `valkey_port` | 默认 **6380**（避免冲突） |
| `valkey_bind_address` | 监听地址 |
| `valkey_maxmemory_mb` | 内存上限 |
| `valkey_maxmemory_policy` | 淘汰策略 |
| `valkey_appendonly` | AOF 持久化 |

## Valkey vs Redis 选哪个

| 维度 | Redis | Valkey |
|---|---|---|
| 协议兼容 | – | 100% Redis 协议 |
| 许可证 | RSALv2 / SSPL（非 OSI 开源） | BSD-3-Clause（**OSI 开源**） |
| 治理 | Redis Inc.（商业公司） | Linux Foundation（中立） |
| 后台支持 | Redis 公司 | AWS / GCP / Oracle / Ericsson 等 |
| 当前生态 | 巨大（Redis Stack / 客户端 / 工具） | 兼容 Redis 客户端，自身工具刚起步 |
| 长期推荐 | 商业生产用付费版 | **新项目推荐** |

**90% 的 Redis 用户**：用 Valkey 完全无差异。
**用了 Redis Stack（JSON / Search / TimeSeries 模块）**：暂时仍需 Redis（Valkey 模块生态在追赶）。

## 配置文件 / 目录速查

```
/etc/valkey/                                    # Ubuntu/Debian
└── valkey.conf                                  # ← 主配置（与 redis.conf 99% 兼容）

/etc/valkey.conf                                  # RHEL（单文件路径）

/var/lib/valkey/                                  # 数据目录
├── dump.rdb                                      # RDB 快照
└── appendonly.aof                                 # AOF（启用时）

/var/log/valkey/                                  # 日志
└── valkey-server.log

# CLI（与 redis-cli 100% 等价）
/usr/bin/valkey-cli                                # 客户端
/usr/bin/valkey-server                              # server
```

| 项 | Ubuntu 24.10+ | RHEL/Anolis 9 | Older Ubuntu |
|---|---|---|---|
| 仓库 | 默认 | EPEL `valkey` | 不可用 |
| 包名 | `valkey-server` | `valkey` | – |
| 服务 | `valkey-server` | `valkey` | – |
| 替代方案 | – | – | 用 `redis-server`（catalog 项）或 Docker `valkey/valkey:latest` |

## 常见配置模板

### 模板 A — 客户端连接（与 redis-cli 100% 等价）

```bash
# valkey-cli
valkey-cli -p 6380 -a 'password' --no-auth-warning ping        # PONG

# 或用 redis-cli（完全兼容）
redis-cli -p 6380 -a 'password' ping
```

### 模板 B — Python 客户端（用 redis-py）

```python
import redis                                                      # 用 redis-py 库
r = redis.Redis(host='127.0.0.1', port=6380, password='pass', decode_responses=True)
r.set('key', 'value')
print(r.get('key'))                                                # value
```

代码无需任何改动——**Valkey 服务端伪装成 Redis**。

### 模板 C — 推荐 valkey.conf 配置

```conf
# 与 redis.conf 99% 一致
bind 127.0.0.1 ::1
port 6380
requirepass <strong-password>

maxmemory 1gb
maxmemory-policy allkeys-lru

appendonly yes
appendfsync everysec

# 安全
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG "CONFIG_secret"

# 日志
logfile /var/log/valkey/valkey-server.log
loglevel notice
```

详见 `redis-server.md` 模板 A。

### 模板 D — 主从复制（与 Redis 互通）

```conf
# Replica 配置
replicaof 127.0.0.1 6379                          # 可以 replicate 一个 Redis master
masterauth <redis-master-pass>
replica-read-only yes
```

Valkey replica 可挂在 Redis master 上同步数据——**迁移路径**：

1. 部署 Valkey replica 同步 Redis master
2. 切换应用连接到 Valkey
3. 关 Redis

### 模板 E — Sentinel HA

Valkey Sentinel 与 Redis Sentinel 完全兼容：

```conf
# valkey-sentinel.conf
sentinel monitor mymaster 127.0.0.1 6380 2
sentinel auth-pass mymaster <pass>
sentinel down-after-milliseconds mymaster 5000
```

```bash
valkey-server /etc/valkey/sentinel.conf --sentinel
```

### 模板 F — 从 Redis 平滑迁移

```bash
# 1. 在新机器装 Valkey
# （本 Playbook）

# 2. 让 Valkey replica Redis master
valkey-cli -p 6380 -a 'pass' REPLICAOF redis-master.example.com 6379

# 3. 等同步完成
valkey-cli -p 6380 -a 'pass' INFO replication
# 看 master_link_status:up + master_sync_in_progress:0

# 4. 切应用连 Valkey

# 5. 提升 Valkey 为独立
valkey-cli -p 6380 -a 'pass' REPLICAOF NO ONE

# 6. 关 Redis
```

### 模板 G — Docker 部署（旧版发行版用）

```yaml
services:
  valkey:
    image: valkey/valkey:latest
    container_name: valkey
    restart: unless-stopped
    command: >
      valkey-server
      --requirepass YOUR_PASSWORD
      --maxmemory 1gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    ports:
      - "127.0.0.1:6380:6379"
    volumes:
      - valkey-data:/data

volumes:
  valkey-data:
```

## 关键参数调优速查

性能、内存策略、持久化等所有参数与 Redis 完全相同——**直接复用 redis-server.md 调优速查**章节。

### 资源占用

| 数据量 | RAM |
|---|---|
| < 100k keys | 50 MB |
| < 1M keys | 500 MB |
| < 10M keys | 4 GB |

与 Redis 几乎无差异（部分场景 Valkey 多线程 I/O 略快）。

## 跨发行版兼容

| 发行版 | 状态 |
|---|---|
| Ubuntu 24.10+ | ✅ 默认仓库 |
| Ubuntu 22.04 / 24.04 | ⚠️ 用 Docker 或 backport |
| Debian 12 | ⚠️ 用 Docker |
| RHEL 9 / Anolis 9 | EPEL ✅ |

旧发行版优先用 `redis-server`（catalog 项）或 Docker。

## 与其它 catalog 项的配合

- **`redis-server`** — **互斥替代品**（不要同机部署，端口冲突）
- 任何用 Redis 的应用 — 直接连 Valkey 完全兼容（Sidekiq / Celery / Bull / 应用 cache 等）
- **`prometheus-monitoring`** — `redis_exporter` 直接兼容 Valkey

## 排错

### 包不可用

```bash
apt-cache search valkey
dnf search valkey

# 没有 → 用 Docker（模板 G）或装 redis-server 替代
```

### 连接被拒

```bash
sudo systemctl status valkey-server
sudo ss -tlnp | grep 6380
sudo journalctl -u valkey-server -n 30
```

### 与 Redis 同机冲突

```bash
# 检查端口
sudo ss -tlnp | grep -E ':(6379|6380) '

# Valkey 默认 6380（避免冲突）。要换 6379 必须先停 Redis
```

### 客户端 connect refused

```bash
# bind 不含 127.0.0.1
sudo grep ^bind /etc/valkey/valkey.conf

# 防火墙
sudo ufw allow from 10.0.0.0/8 to any port 6380
```

## 验证

```bash
systemctl is-active valkey-server
sudo ss -tlnp | grep 6380
valkey-cli -p 6380 -a "$PASS" --no-auth-warning ping        # PONG
valkey-cli -p 6380 -a "$PASS" --no-auth-warning INFO server | head
```

## 多次运行

`installMode: skip-existing`。包安装幂等。配置每次按表单值更新。**已存在数据保留**。

## ⚠️ 敏感性

**review** — 同 Redis。详见 `redis-server.md`。

## 隐私说明

- Valkey 不发遥测
- 数据本地存储 `/var/lib/valkey/`
- 与 Redis 隐私模型完全一致
