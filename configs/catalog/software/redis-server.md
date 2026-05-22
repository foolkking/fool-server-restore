# Redis 内存数据库

Redis 7.x 服务端，常用做缓存 / 队列 / 实时排行榜。EnvForge 处理跨发行版的包名/路径
差异，按表单设好密码、绑定地址、内存上限。

## 你将得到什么

- 📦 **redis-server**（Ubuntu/Debian 包名）/ **redis**（RHEL/Anolis 包名，自动翻译）
- ✅ 默认 bind 127.0.0.1（**仅本机访问**，不暴露到公网）
- ✅ requirepass 已设（默认 24 位随机密码，可表单填）
- ✅ maxmemory + maxmemory-policy 已设，避免吃满系统内存
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### Redis 访问密码 `redis_password`

留空则 EnvForge 生成 24 位强密码（运行结束显示一次）。**强烈建议启用**——历史上
裸暴露的 Redis 是被勒索攻击次数最多的服务之一（攻击模式：`FLUSHALL` 然后写一条
"付钱赎回" 的 key）。

清空字符串可以跳过密码，但只有当你确定：
1. `bind_address = 127.0.0.1`
2. 这台机器没有任何不可信进程

### 监听地址 `bind_address`

- **127.0.0.1**（默认）：只本机能连，最安全。配合应用同机部署的场景。
- **0.0.0.0**（所有网卡）：远程能连，**必须先设密码 + 防火墙限制 6379 来源 IP**。

### 监听端口 `port`

默认 6379。Redis 是被自动扫描器盯得最紧的端口之一，改成 16379/26379/63791 等
非标端口能挡掉一部分。

### 最大内存 `maxmemory`

**强烈建议设上限**。Redis 默认不限内存，配合 OOM 杀手可能把整台机器搞挂。常用：
- 缓存场景：占可用内存的 50-70%
- 主存储场景：只能用部分内存的，剩下留给应用和系统

### 内存满淘汰策略 `maxmemory_policy`

- **allkeys-lru**（默认）：淘汰最久未访问的 key，缓存场景的经典选择
- **allkeys-lfu**：淘汰访问次数最少的，适合热点 key 长期固定的场景
- **noeviction**：满了之后写入返回错误。如果 Redis 是主存储（不是缓存），**必须**用这个，否则数据会被悄悄淘汰
- **volatile-***：只淘汰设置了 TTL 的 key

### 启用 AOF 持久化 `appendonly`

- 关（默认）：只有 RDB 快照（每隔 N 分钟落一次盘，可能丢最后几分钟数据）
- 开：每次写操作都追加到 AOF 日志，掉电几乎无数据丢失，但磁盘 IO 高一些

纯缓存场景两个都关都行；做轻量持久化推荐开 AOF。

## 安装后

### 验证连接（密码版）

```bash
redis-cli -a "你的密码" --no-auth-warning ping
# → PONG
```

### 常用命令

```bash
redis-cli -a "..." INFO memory       # 看内存使用
redis-cli -a "..." CONFIG GET maxmemory*
redis-cli -a "..." CLIENT LIST       # 看谁连着
redis-cli -a "..." DBSIZE            # 看 key 数量
```

### 性能调优（按需）

```conf
# /etc/redis/redis.conf
tcp-keepalive 60                # 防止僵尸连接
timeout 300                     # 闲置 5 分钟自动断
io-threads 4                    # IO 多线程（CPU 多核时有用）
io-threads-do-reads yes
```

改完后 `sudo systemctl restart redis`（或 `redis-server`）。

### 远程访问（高危操作）

只有同时满足下面三条才考虑：
1. `bind_address` 改 `0.0.0.0`
2. `redis_password` 已设强密码
3. 防火墙只允许特定 IP 访问 6379:

```bash
sudo ufw allow from 1.2.3.4 to any port 6379
# 或 firewalld
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="1.2.3.4" port port=6379 protocol=tcp accept' --permanent
```

## ⚠️ 敏感性

**review** — 默认配置（127.0.0.1 + requirepass）已经很安全。改 bind 0.0.0.0
是高危操作，需要外加防火墙。

## 验证安装

```bash
systemctl status redis --no-pager   # 或 redis-server
redis-cli -p 6379 -a "$PASSWORD" ping
sudo ss -tlnp | grep 6379
```

## 排错

- **`(error) NOAUTH Authentication required`** — 你设置了密码但没用 `-a` 传：`redis-cli -a "..."`。
- **服务启动失败** — 看 `journalctl -u redis -n 30`。常见原因：
  - bind 行写错了语法
  - maxmemory 写成了非法值（注意不要用空格："256 mb" ❌，"256mb" ✅）
  - SELinux 拒绝了 Redis 写日志（RHEL 上：`sudo setsebool -P daemons_enable_cluster_mode 1`）
- **跨发行版**：`redis-server` 包在 RHEL 上叫 `redis`，服务名也叫 `redis`，EnvForge 会自动翻译。

## 多次运行

`installMode: skip-existing`。已经安装的 Redis 不会重装；但每次运行会重新写 6 个配置项
（bind / port / requirepass / maxmemory / maxmemory-policy / appendonly），覆盖你
手动调过的同名行。如果想保留手改，编辑 Playbook 删掉对应的 lineinfile 任务。

## 隐私说明

- 表单填写的密码会出现在任务运行日志里，安装完成后建议立刻在 Redis 里改一次：
  ```bash
  redis-cli -a "..." CONFIG SET requirepass "新密码"
  redis-cli -a "新密码" CONFIG REWRITE
  ```
- `/etc/redis/redis.conf` 不会被 EnvForge 上传。
