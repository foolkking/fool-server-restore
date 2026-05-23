# RabbitMQ 消息队列

RabbitMQ 是企业级消息队列，AMQP 0-9-1 协议（也支持 STOMP / MQTT / AMQP 1.0 经插件）。比 Redis pub/sub 复杂但功能丰富——exchange 路由、队列持久化、死信、消费者优先级、TTL、确认机制。

**适合**：异步任务队列（Celery / Bull / Sidekiq）、订单流转、跨服务事件总线、保证至少一次投递的消息系统。

## 你将得到什么

- 📦 **rabbitmq-server**（含 Erlang 运行时）
- ✅ AMQP 端口 5672
- ✅ Management Plugin 启用，Web UI 在 15672
- ✅ admin 用户已建并赋管理员权限
- ✅ 默认 `guest` 账号已删除（防默认凭据攻击）
- ✅ 服务自动启动 + 开机自启

## 表单字段说明

### `admin_user` / `admin_password`

> ⚠️ **永远不要用默认 `guest/guest`**——RabbitMQ 出厂账号，公网暴露 = 立刻被攻陷。EnvForge 自动删除 guest，创建你填的账号。

留空 = 自动生成 24 位强密码。

### `amqp_port`

应用通过 AMQP 端口（5672）连。

### `management_port`

运维通过 Web 管理 UI（15672）。**强烈建议防火墙限源 IP** 或反代 + auth。

### `enable_management`

启用 management plugin（默认开）。

## 配置文件 / 目录速查

```
/etc/rabbitmq/
├── rabbitmq.conf                       # ← 主配置（INI 格式，3.7+）
├── advanced.config                      # 高级配置（Erlang term 格式）
├── rabbitmq-env.conf                     # 环境变量
├── enabled_plugins                       # 已启用 plugin 列表
├── definitions.json                       # 用户 / 队列 / 交换机定义（启动时导入）
└── rabbitmq.config                        # 老版本（3.6 及之前）

/var/lib/rabbitmq/
├── mnesia/                                # ← 数据目录（消息 + 队列 + 用户）
├── .erlang.cookie                          # Erlang 集群通信秘钥（**集群必须一致**）
└── nodes/                                  # 节点状态

/var/log/rabbitmq/
├── rabbit@<host>.log
├── rabbit@<host>_upgrade.log
└── rabbit@<host>-sasl.log

# systemd
/lib/systemd/system/rabbitmq-server.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `rabbitmq-server` | `rabbitmq-server`（EPEL） |
| 服务名 | `rabbitmq-server` | `rabbitmq-server` |
| 默认仓库版本 | Ubuntu 22 = 3.9，Ubuntu 24 = 3.12 | EPEL 3.12 |
| 装最新（3.13+） | RabbitMQ 官方 Cloudsmith repo | 同 |
| Erlang 版本 | 24/25/26（与 RabbitMQ 版本对应） | 同 |

EnvForge preflight 启 EPEL，RHEL 系装 RabbitMQ 无障碍。

## 常见配置模板

### 模板 A — 推荐 `/etc/rabbitmq/rabbitmq.conf`（生产基线）

```ini
# ====== 监听 ======
listeners.tcp.default = 5672
# listeners.ssl.default = 5671                # TLS 端口

# Management plugin
management.tcp.port = 15672
management.tcp.ip = 127.0.0.1                  # 仅本机；要远程访问改 0.0.0.0 + 反代

# ====== 资源限制 ======
vm_memory_high_watermark.relative = 0.5         # 用满 50% 物理内存时阻塞 publisher
vm_memory_high_watermark_paging_ratio = 0.5     # 50% threshold 时开始 paging
disk_free_limit.absolute = 2GB                   # 磁盘剩余 < 2GB 时阻塞
disk_free_limit.relative = 1.0                    # 或可用磁盘 < 内存大小时阻塞

# ====== 性能 ======
heartbeat = 60
frame_max = 131072
channel_max = 2047

# ====== 默认用户（启动时若无账号会建，建议关掉自动 guest）======
default_user = admin
default_pass = STRONG-PASS                        # 仅初始化用，建议用 definitions.json
default_user_tags.administrator = true
default_vhost = /

# ====== 集群（可选）======
# cluster_formation.peer_discovery_backend = classic_config
# cluster_formation.classic_config.nodes.1 = rabbit@node1
# cluster_formation.classic_config.nodes.2 = rabbit@node2

# ====== 日志 ======
log.file.level = info
log.file = rabbit@host.log
log.console = false

# ====== Management UI ======
management.load_definitions = /etc/rabbitmq/definitions.json   # 启动导入
```

应用：`sudo systemctl restart rabbitmq-server`。

### 模板 B — 启用 Management Plugin（手动方式，本 Playbook 已自动）

```bash
sudo rabbitmq-plugins enable rabbitmq_management
sudo systemctl restart rabbitmq-server
# 浏览器 http://server:15672/
```

### 模板 C — 创建受限业务账号（不要让应用用 admin）

```bash
# 添加用户
sudo rabbitmqctl add_user app1 'app-strong-password'

# 设 vhost 权限（^app1\..*：仅能访问以 app1. 开头的队列 / exchange）
sudo rabbitmqctl set_permissions -p / app1 '^app1\..*' '^app1\..*' '^app1\..*'

# 标记为非管理员（默认就是）
sudo rabbitmqctl set_user_tags app1 monitoring     # 或不设 tag

# 列权限
sudo rabbitmqctl list_user_permissions app1
sudo rabbitmqctl list_users
```

或在 Management UI 里：Admin → Users → Add user / Set Permissions。

### 模板 D — Python 客户端（pika）

```python
import pika

credentials = pika.PlainCredentials('app1', 'app-strong-password')
parameters = pika.ConnectionParameters(
    host='localhost',
    port=5672,
    virtual_host='/',
    credentials=credentials,
    heartbeat=60,
    blocked_connection_timeout=300
)

# 生产者
conn = pika.BlockingConnection(parameters)
channel = conn.channel()

# 声明持久化队列
channel.queue_declare(queue='app1.tasks', durable=True)

# 发持久化消息
channel.basic_publish(
    exchange='',
    routing_key='app1.tasks',
    body='task-payload',
    properties=pika.BasicProperties(
        delivery_mode=2,                # 持久化
        content_type='application/json'
    )
)
conn.close()

# 消费者
def callback(ch, method, properties, body):
    print(f"Received: {body}")
    # 业务处理...
    ch.basic_ack(delivery_tag=method.delivery_tag)

conn = pika.BlockingConnection(parameters)
channel = conn.channel()
channel.queue_declare(queue='app1.tasks', durable=True)
channel.basic_qos(prefetch_count=1)                # 公平分发
channel.basic_consume(queue='app1.tasks', on_message_callback=callback)
channel.start_consuming()
```

### 模板 E — Node.js（amqplib）

```javascript
const amqp = require('amqplib');

(async () => {
    const conn = await amqp.connect('amqp://app1:password@localhost:5672/');
    const channel = await conn.createChannel();

    // 持久化队列
    await channel.assertQueue('app1.tasks', { durable: true });

    // 发消息
    channel.sendToQueue('app1.tasks', Buffer.from('hello'), { persistent: true });

    // 消费
    await channel.consume('app1.tasks', (msg) => {
        console.log('received', msg.content.toString());
        channel.ack(msg);
    });
})();
```

### 模板 F — 集群部署（3 节点 HA）

```bash
# 所有节点的 Erlang cookie 必须完全一致
sudo cat /var/lib/rabbitmq/.erlang.cookie

# 在 node2 / node3 上同步 cookie
sudo systemctl stop rabbitmq-server
echo 'COOKIE_VALUE_FROM_NODE1' | sudo tee /var/lib/rabbitmq/.erlang.cookie
sudo chmod 600 /var/lib/rabbitmq/.erlang.cookie
sudo chown rabbitmq:rabbitmq /var/lib/rabbitmq/.erlang.cookie
sudo systemctl start rabbitmq-server

# 在 node2 / node3 加入 node1 集群
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl join_cluster rabbit@node1
sudo rabbitmqctl start_app

# 看集群状态（在任一节点）
sudo rabbitmqctl cluster_status

# 设镜像策略（队列在所有节点复制）
sudo rabbitmqctl set_policy ha-all "^" '{"ha-mode":"all", "ha-sync-mode":"automatic"}'
```

### 模板 G — 启用 MQTT / STOMP 协议

```bash
# RabbitMQ 同时支持多协议
sudo rabbitmq-plugins enable rabbitmq_mqtt           # 端口 1883
sudo rabbitmq-plugins enable rabbitmq_web_mqtt       # WebSocket 15675
sudo rabbitmq-plugins enable rabbitmq_stomp           # 端口 61613
sudo rabbitmq-plugins enable rabbitmq_shovel rabbitmq_shovel_management   # 跨集群转发

sudo systemctl restart rabbitmq-server
```

### 模板 H — 防火墙

```bash
# 仅在远程客户端连接时开
sudo ufw allow 5672/tcp                           # AMQP
# Management UI 强烈建议反代后访问
# sudo ufw allow 15672/tcp                          # 直接暴露不推荐

# 或限源 IP
sudo ufw allow from 10.0.0.0/8 to any port 5672 proto tcp
```

## 关键参数调优速查

### 内存 / 磁盘 watermark

| 参数 | 默认 | 推荐 |
|---|---|---|
| `vm_memory_high_watermark.relative` | 0.4 | 0.5（专用 RabbitMQ 机器） |
| `vm_memory_high_watermark_paging_ratio` | 0.5 | 0.5 |
| `disk_free_limit.absolute` | 50MB | 2GB（生产） |
| `heartbeat` | 60 | 60-30（NAT 后 30 更稳） |

### 队列性能

```python
# Quorum queue（HA 推荐，3.8+）
channel.queue_declare(queue='app1.tasks', durable=True, arguments={
    'x-queue-type': 'quorum'
})

# Stream queue（高吞吐场景，3.9+）
channel.queue_declare(queue='events.log', durable=True, arguments={
    'x-queue-type': 'stream'
})

# Lazy queue（大队列减内存占用）
channel.queue_declare(queue='backups', durable=True, arguments={
    'x-queue-mode': 'lazy'
})

# 队列 TTL（消息 1 小时未消费则丢弃）
channel.queue_declare(queue='cache.events', durable=True, arguments={
    'x-message-ttl': 3600000,
    'x-max-length': 100000               # 队列最大消息数
})
```

### 资源占用

| 部署 | RAM | CPU | 磁盘（含日志） |
|---|---|---|---|
| 小型（< 1k msg/s） | 200 MB | 0.2 vCPU | 5 GB |
| 中型（10k msg/s） | 1 GB | 1 vCPU | 50 GB |
| 大型（100k+ msg/s） | 4 GB+ | 4 vCPU+ | 500 GB |

## 跨发行版兼容

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ 默认仓库 |
| Debian 12 | ✅ 默认 |
| RHEL 9 / Anolis 9 | ✅ EPEL |
| Alpine | 用 `rabbitmq:management-alpine` Docker |

## 与其它 catalog 项的配合

- **`redis-server`** — Redis Streams 是 RabbitMQ 替代品，简单场景更合适
- **`mosquitto-mqtt`** — 纯 MQTT 场景用 Mosquitto 更轻量；要 AMQP 同时 MQTT 用 RabbitMQ
- **`prometheus-monitoring`** — RabbitMQ 内置 Prometheus exporter（启用 `rabbitmq_prometheus` plugin，端口 15692）
- **`grafana-dashboard`** — Grafana ID 10991（RabbitMQ Overview）
- **`fail2ban-protection`** — 给 5672 / 15672 加 jail

## 排错

### 服务起不来 + `nodedown` / `boot_failed`

RabbitMQ 对 hostname 极敏感：

```bash
# /etc/hosts 必须有 127.0.0.1 <hostname>
hostname
grep $(hostname) /etc/hosts
echo "127.0.0.1 $(hostname)" | sudo tee -a /etc/hosts

# 看 boot 错误
sudo cat /var/log/rabbitmq/rabbit@*.log | tail -50

# Erlang cookie 权限
sudo ls -la /var/lib/rabbitmq/.erlang.cookie
# 应是 -r-------- rabbitmq:rabbitmq

sudo systemctl restart rabbitmq-server
```

### `Erlang cookie mismatch`（集群）

节点间 cookie 不一致：

```bash
# 同步（在所有节点）
sudo systemctl stop rabbitmq-server
sudo cp /var/lib/rabbitmq/.erlang.cookie /tmp/cookie.txt
# 把 /tmp/cookie.txt 复制到所有节点的 /var/lib/rabbitmq/.erlang.cookie
sudo chmod 600 /var/lib/rabbitmq/.erlang.cookie
sudo chown rabbitmq:rabbitmq /var/lib/rabbitmq/.erlang.cookie
sudo systemctl start rabbitmq-server
```

### Management UI 15672 连不上

```bash
# 1. plugin 启用了？
sudo rabbitmq-plugins list | grep rabbitmq_management
# 标记 [E*]

# 2. 端口在听？
sudo ss -tlnp | grep 15672

# 3. management.tcp.ip 是 127.0.0.1（仅本机）？
grep management.tcp /etc/rabbitmq/rabbitmq.conf
```

### 内存 watermark 触发，publisher 阻塞

```bash
# 看当前
sudo rabbitmqctl status | grep -A5 memory

# 临时调高（重启后失效）
sudo rabbitmqctl set_vm_memory_high_watermark 0.6

# 永久（rabbitmq.conf）
vm_memory_high_watermark.relative = 0.6
```

### 消费者突然全部断开

通常 heartbeat 超时（NAT / 网络抖动）：

```python
# 客户端调小
parameters = pika.ConnectionParameters(host='localhost', heartbeat=30)
```

或服务端调短：

```ini
heartbeat = 30
```

### Queue / Exchange 删不掉

可能有消费者还连着：

```bash
sudo rabbitmqctl list_consumers
# 强制删
sudo rabbitmqctl delete_queue queue_name --if-empty
sudo rabbitmqctl delete_queue queue_name
```

### `Login failed` 用 admin 登 Management UI

```bash
# 重设密码
sudo rabbitmqctl change_password admin 'new-password'

# 看用户
sudo rabbitmqctl list_users
sudo rabbitmqctl list_user_permissions admin
```

### 磁盘满 = RabbitMQ 进入 paging

```bash
df -h /var/lib/rabbitmq
# 看哪些大
du -sh /var/lib/rabbitmq/mnesia/*

# 删老队列
sudo rabbitmqctl list_queues name messages
sudo rabbitmqctl delete_queue old.queue.name --if-empty
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active rabbitmq-server

# 2. 端口
sudo ss -tlnp | grep -E ':(5672|15672) '

# 3. 节点状态
sudo rabbitmqctl status
sudo rabbitmqctl cluster_status

# 4. 用户
sudo rabbitmqctl list_users

# 5. Management API
curl -u admin:password http://127.0.0.1:15672/api/overview | jq
curl -u admin:password http://127.0.0.1:15672/api/queues | jq

# 6. 测试 publish + consume
sudo rabbitmqctl add_user testuser test
sudo rabbitmqctl set_permissions -p / testuser ".*" ".*" ".*"

# AMQP 测试
mosquitto_pub -h 127.0.0.1 -p 1883 -t test -m hello   # 如启用 MQTT plugin
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**admin 密码每次按表单值更新**——便于忘了密码重跑 Playbook 重设。**已存在的队列 / exchange / 业务 user 不会被删**（数据安全）。

## ⚠️ 敏感性

**review** — RabbitMQ 是消息总线，**所有业务事件流经它**。挂了 / 被攻陷 = 全业务停摆。

强制：

1. 不让 management UI 0.0.0.0 暴露
2. 应用用受限 user，不直接给 admin
3. 生产 TLS（5671 amqps://）
4. 集群 cookie 严格保密（等同 root）

## 隐私说明

- admin 密码会在 Playbook 任务日志出现（一次）
- RabbitMQ 数据在 `/var/lib/rabbitmq/mnesia/`（含**队列消息体**）——按合规需求加密备份
- Management UI 的 access log 含访问 IP / API 调用
- AMQP 协议默认明文（5672）；公网必须 5671 + TLS
- Erlang cookie 是节点间通信秘钥，权限 0400
