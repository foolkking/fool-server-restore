# Memcached 内存缓存

Memcached 是高性能 KV 内存缓存（无持久化）。功能比 Redis 简单很多——只支持
SET/GET/DELETE/INCR/DECR 等基础操作，但单一职责的设计让它在大并发缓存场景比
Redis 还要快一点（无单线程瓶颈）。

## 你将得到什么

- 📦 **memcached** + libmemcached client
- ✅ 默认监听 `127.0.0.1:11211`（**仅本机，强烈推荐保持**）
- ✅ 内存上限按表单生效
- ✅ 服务自动启动并设开机自启

## ⚠️ 重要安全提示

**Memcached 没有内置认证机制**。任何能连到 11211 端口的进程都能读写所有缓存内容。
而且 Memcached 11211/UDP 历史上是 DDoS amplification 攻击的重灾区（流量放大 50000+ 倍）。

**结论：除非你知道你在做什么，否则绝不要把 Memcached 暴露到公网。**

如果非要远程访问，正确做法：
1. 防火墙只允许特定 IP 访问 11211/TCP
2. 关闭 UDP 监听（Playbook 默认通过 `-U 0` 已关）
3. 考虑用 SASL 认证编译版（增加复杂度）
4. **更好的选择：换 Redis**——Redis 有 requirepass 又支持持久化，几乎全面替代

## 表单字段说明

### 缓存内存 `memory_mb`

Memcached 能用的最大内存（MB）。默认 64MB。生产场景：
- 小型应用：64-256 MB
- 中等流量：512 MB - 2 GB
- 大流量：4 GB+

Memcached 用 LRU 自动淘汰，到上限会自动让出空间，不会 OOM。

### 监听地址 `bind_address`

**保持 127.0.0.1**。改成 0.0.0.0 是高危。

### 监听端口 `port`

默认 11211。

### 最大并发连接 `max_connections`

每个连接消耗少量资源（几十 KB）。默认 1024，生产环境调到 4096-10000 常见。

## 安装后

### 验证连接

```bash
echo 'stats' | nc 127.0.0.1 11211
# 看到一堆 STAT 项就是正常
```

### 写入读取（CLI 测试）

```bash
echo -e 'set mykey 0 60 5\r\nhello\r\n' | nc -w1 127.0.0.1 11211
# → STORED

echo 'get mykey' | nc -w1 127.0.0.1 11211
# → VALUE mykey 0 5
# → hello
```

### 在应用代码里使用

```python
# Python (pymemcache)
from pymemcache.client.base import Client
mc = Client(("127.0.0.1", 11211))
mc.set("mykey", "value", expire=60)
print(mc.get("mykey"))
```

```javascript
// Node.js (memjs)
const memjs = require("memjs");
const mc = memjs.Client.create("127.0.0.1:11211");
await mc.set("mykey", "value", { expires: 60 });
const { value } = await mc.get("mykey");
```

```php
// PHP
$mc = new Memcached();
$mc->addServer('127.0.0.1', 11211);
$mc->set('mykey', 'value', 60);
echo $mc->get('mykey');
```

### 与 Redis 的选择

| 特性 | Memcached | Redis |
|---|---|---|
| 协议 | 简单文本 | RESP（也很简单） |
| 数据结构 | 仅 KV | KV / List / Hash / Set / ZSet / Stream |
| 多线程 | ✅ | 6.0+ 部分多线程 |
| 持久化 | ❌ | RDB / AOF |
| 集群 | 客户端分片 | Redis Cluster |
| 认证 | ❌（除非编译 SASL 版） | ✅ requirepass |
| 内存效率 | 略高 | 略低 |

**默认推荐 Redis**——多 80% 的使用场景能覆盖。Memcached 仅适合：
- 已有大量 Memcached 投资的存量系统
- 极致并发的纯缓存场景（不需要任何高级数据结构）

## 验证安装

```bash
systemctl status memcached --no-pager
echo 'stats' | nc 127.0.0.1 11211 | head -10
sudo ss -tlnp | grep 11211
```

## 排错

- **`nc: connection refused`** — 服务没起来；看 journalctl。
- **`-l` 参数解析失败** — 旧版 Memcached 的 `bind_address` 不支持 0.0.0.0，要写 `0.0.0.0`（不带空格）。
- **跨发行版**：包名 `memcached` 在 Ubuntu 和 RHEL 上一致，但配置文件路径完全不同：Ubuntu 是 `/etc/memcached.conf`（每行一个参数），RHEL 是 `/etc/sysconfig/memcached`（OPTIONS= 风格）。EnvForge 同时写两个文件，相应的 systemd 单元会读对应的那个。

## 多次运行

`installMode: skip-existing`。配置文件每次都会重新生成（覆盖手动调整）。

## 隐私说明

Memcached 没有持久化，缓存的内容重启就丢，磁盘上没有任何数据文件。但**任何能连到端口的进程都能读所有缓存内容**——所以不要把 PII 直接放进去（要放也用 hash 之类做过脱敏）。
