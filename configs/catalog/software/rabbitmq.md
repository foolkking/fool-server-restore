# RabbitMQ 消息队列

RabbitMQ 是企业级消息队列，AMQP 协议。比 Redis pub/sub 复杂但功能丰富——
exchange 路由、队列持久化、死信、消费者优先级、TTL、确认机制。

适合：异步任务队列（Celery / Bull）、订单流转、跨服务事件总线、需要保证至少一次投递的消息系统。

## 你将得到什么

- 📦 **rabbitmq-server**（含 Erlang 运行时）
- ✅ AMQP 端口 5672
- ✅ Management Plugin 启用，Web UI 在 15672
- ✅ admin 用户已建并赋管理员权限
- ✅ 默认 guest 账号已删除（安全）

## 表单字段说明

### 管理员用户名 / 密码

不要用默认的 `guest`（RabbitMQ 默认账号，密码也是 `guest`，公网暴露 = 立刻被攻陷）。
EnvForge 会删除 guest，创建你填的账号。

### AMQP / Management 端口

应用通过 AMQP 端口（5672）连。运维通过 Web 管理 UI（15672）看。

## 安装后

### 浏览器访问 Management UI

`http://server-ip:15672/`，用 admin 账号登录。能看到：
- Connections / Channels / Exchanges / Queues
- 实时消息速率图
- 集群状态
- Plugins 管理

### Python 客户端示例（pika）

```python
import pika

credentials = pika.PlainCredentials('envforge', '你的密码')
parameters = pika.ConnectionParameters('localhost', 5672, '/', credentials)
conn = pika.BlockingConnection(parameters)
channel = conn.channel()

# 声明队列（durable=True 持久化）
channel.queue_declare(queue='task_queue', durable=True)

# 发消息
channel.basic_publish(
    exchange='',
    routing_key='task_queue',
    body='Hello',
    properties=pika.BasicProperties(delivery_mode=2)  # 持久化消息
)

conn.close()
```

### Node.js 客户端示例（amqplib）

```javascript
const amqp = require('amqplib');

const conn = await amqp.connect('amqp://envforge:密码@localhost:5672');
const channel = await conn.createChannel();
await channel.assertQueue('task_queue', { durable: true });
channel.sendToQueue('task_queue', Buffer.from('Hello'), { persistent: true });
```

### 启用更多 plugin

```bash
sudo rabbitmq-plugins list                       # 看所有可用
sudo rabbitmq-plugins enable rabbitmq_shovel    # 跨集群转发
sudo rabbitmq-plugins enable rabbitmq_federation
sudo rabbitmq-plugins enable rabbitmq_mqtt       # 同时支持 MQTT 协议
```

### 创建业务用户（推荐，不要让应用用 admin）

```bash
sudo rabbitmqctl add_user app1 'app-password'
sudo rabbitmqctl set_permissions -p / app1 '^app1\..*' '^app1\..*' '^app1\..*'
# 这个 user 只能访问以 app1. 开头的队列/exchange
```

### 集群（分布式部署）

RabbitMQ 集群的关键是所有节点共享同一个 Erlang cookie：
```bash
# 在所有节点
sudo cat /var/lib/rabbitmq/.erlang.cookie  # 必须完全一致

# 加入集群
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl join_cluster rabbit@主节点hostname
sudo rabbitmqctl start_app
```

### 防火墙

```bash
# 仅在需要远程客户端连接时开
sudo ufw allow 5672/tcp     # AMQP
sudo ufw allow 15672/tcp    # Management UI（强烈建议限源 IP）
```

## ⚠️ 敏感性

**review** — RabbitMQ 是消息总线，**所有业务事件流经它**。挂了或被攻陷就影响所有业务。
1. 不要让 management UI 0.0.0.0 暴露
2. 应用用受限 user，不要直接给 admin
3. 生产环境上 TLS（5671 端口 + amqps://）

## 验证

```bash
sudo rabbitmqctl status
sudo rabbitmqctl list_users
sudo rabbitmqctl list_queues
curl -u envforge:密码 http://127.0.0.1:15672/api/overview
```

## 排错

- **服务起不来 + `nodedown`** — RabbitMQ 对 hostname 极其敏感。`/etc/hosts` 里要有 `127.0.0.1  $(hostname)` 这一行。
- **`Erlang cookie mismatch`** — 节点间集群时 cookie 不一致。手动同步 `/var/lib/rabbitmq/.erlang.cookie`。
- **15672 端口连不上** — Management plugin 没启用，跑 `sudo rabbitmq-plugins enable rabbitmq_management`。
- **跨发行版**：包名 `rabbitmq-server` 在 Ubuntu/Debian 一致；RHEL 上需要 EPEL（preflight 已自动启用）。

## 多次运行

`installMode: skip-existing`。包不重装。**密码每次会被表单值更新**——便于忘了密码时通过重跑 Playbook 重设。

## 隐私说明

- admin 密码会在任务日志里出现一次。
- RabbitMQ 数据在 `/var/lib/rabbitmq/`，不上传不同步。
