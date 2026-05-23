# Mosquitto MQTT Broker

Mosquitto 是 Eclipse 旗下的 MQTT broker——MQTT 是 IoT 最常用的消息协议：轻量（消息几十字节）、发布订阅模型、跑在受限带宽 + 低算力设备上。

**适合**：智能家居中枢（Home Assistant 后端）、IoT 设备数据采集、嵌入式设备到云的桥梁、ESP32 / 树莓派之间通信。

## 你将得到什么

- 📦 **mosquitto** + **mosquitto-clients**（含 `mosquitto_pub` / `mosquitto_sub` 测试工具）
- ✅ 配置 `/etc/mosquitto/mosquitto.conf`（按表单端口 / 监听 / 匿名）
- ✅ 密码文件 `/etc/mosquitto/passwd`（用 `mosquitto_passwd` 加密存储）
- ✅ 持久化目录 `/var/lib/mosquitto`（保留 retained 消息 / 订阅状态）
- ✅ 服务自动启动 + 开机自启

## 表单字段说明

### `port`

| 端口 | 协议 | 适用 |
|---|---|---|
| `1883`（默认） | MQTT 明文 | 内网 / 本机 |
| `8883` | MQTTS（TLS） | **公网必备** |
| `9001` | WebSocket | 浏览器 / JS 客户端 |
| `8884` | WebSocket over TLS | 浏览器公网 |

> 公网部署务必上 8883/TLS。本 Playbook 不含 TLS 配置（要先有证书），手动加在 `/etc/mosquitto/conf.d/tls.conf`（模板 D）。

### `bind_address`

| 值 | 适用 |
|---|---|
| `127.0.0.1`（默认） | 本机 IoT 中枢（Home Assistant 同机） |
| `0.0.0.0` | 远程 IoT 设备能连，**必须**密码 + 防火墙 |

### `allow_anonymous`

> ⚠️ **默认 false**。匿名 MQTT broker 是公开 IoT 市场最严重的安全洞之一——很多生产 broker 暴露 1883 无密码，任何人都能 sub 全部 topic 看数据，或 pub 假数据扰乱设备。

仅开发测试 + 仅本机访问时开 anonymous。

### `mqtt_user` / `mqtt_password`

仅当 `allow_anonymous=false` 时生效。`mosquitto_passwd` 命令把密码 hash 后写到 `/etc/mosquitto/passwd`。

## 配置文件 / 目录速查

```
/etc/mosquitto/
├── mosquitto.conf                       # ← 主配置
├── conf.d/                                # 自定义片段（推荐用法）
│   ├── default.conf
│   ├── tls.conf
│   ├── websocket.conf
│   └── acl.conf
├── passwd                                  # ← 密码文件（hash 后）
├── acl                                     # ACL 规则文件
└── certs/                                   # TLS 证书

/var/lib/mosquitto/
├── mosquitto.db                            # ← 持久化数据库（retained / subscriptions）
└── ...

/var/log/mosquitto/
└── mosquitto.log

# systemd
/lib/systemd/system/mosquitto.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `mosquitto` | `mosquitto`（EPEL） |
| 客户端 | `mosquitto-clients` | `mosquitto`（命令同包） |
| 服务名 | `mosquitto` | `mosquitto` |
| 默认仓库版本 | Ubuntu 22 = 2.0，Ubuntu 24 = 2.0 | EPEL 2.0 |
| 默认运行用户 | `mosquitto` | 同 |

EnvForge preflight 启 EPEL。

## 常见配置模板

### 模板 A — 推荐 `/etc/mosquitto/mosquitto.conf`（生产基线）

```conf
# ====== 持久化 ======
persistence true
persistence_location /var/lib/mosquitto/

# ====== 日志 ======
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S

# ====== 连接限制 ======
max_connections -1                                  # 无限
max_inflight_messages 100                            # 单连接未确认消息
max_queued_messages 1000                              # 离线客户端的最大队列
queue_qos0_messages false                              # QoS 0 消息不持久化（默认）

# ====== 包大小 ======
message_size_limit 0                                   # 0 = 无限（按需限制）

# 自动加载子配置
include_dir /etc/mosquitto/conf.d
```

### 模板 B — 默认 listener `/etc/mosquitto/conf.d/default.conf`

```conf
listener 1883 127.0.0.1
allow_anonymous false
password_file /etc/mosquitto/passwd

# ACL（按需）
acl_file /etc/mosquitto/acl
```

应用：`sudo systemctl restart mosquitto`。

### 模板 C — 添加用户

```bash
# 创建 / 添加用户（提示输入两次密码）
sudo mosquitto_passwd /etc/mosquitto/passwd alice
sudo mosquitto_passwd /etc/mosquitto/passwd bob

# 删除用户
sudo mosquitto_passwd -D /etc/mosquitto/passwd alice

# 重载（不需重启）
sudo systemctl reload mosquitto
```

### 模板 D — 启用 TLS（生产必备）

`/etc/mosquitto/conf.d/tls.conf`:

```conf
# TLS 监听 8883
listener 8883
protocol mqtt

cafile /etc/letsencrypt/live/mqtt.example.com/chain.pem
certfile /etc/letsencrypt/live/mqtt.example.com/cert.pem
keyfile /etc/letsencrypt/live/mqtt.example.com/privkey.pem

# 客户端证书（mTLS）— 高级
require_certificate false                          # true 强制客户端也提交证书

# TLS 版本
tls_version tlsv1.2
allow_anonymous false
password_file /etc/mosquitto/passwd

# 让 mosquitto 用户能读 LE 证书
# sudo chgrp mosquitto /etc/letsencrypt/live/...
```

权限处理：

```bash
sudo chmod 750 /etc/letsencrypt/live /etc/letsencrypt/archive
sudo chgrp -R mosquitto /etc/letsencrypt/live /etc/letsencrypt/archive
sudo systemctl restart mosquitto
```

certbot 续签 hook 自动重启：

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/mosquitto.sh > /dev/null <<'EOF'
#!/bin/bash
systemctl restart mosquitto
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/mosquitto.sh
```

### 模板 E — WebSocket（浏览器 / JS 客户端）

`/etc/mosquitto/conf.d/websocket.conf`:

```conf
listener 9001
protocol websockets
allow_anonymous false
password_file /etc/mosquitto/passwd

# WebSocket over TLS（推荐）
listener 8884
protocol websockets
cafile /etc/letsencrypt/live/mqtt.example.com/chain.pem
certfile /etc/letsencrypt/live/mqtt.example.com/cert.pem
keyfile /etc/letsencrypt/live/mqtt.example.com/privkey.pem
allow_anonymous false
password_file /etc/mosquitto/passwd
```

JS 客户端（Eclipse Paho）：

```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('wss://mqtt.example.com:8884', {
    username: 'alice',
    password: 'alice-password',
    rejectUnauthorized: true
});
client.on('connect', () => {
    client.subscribe('home/#');
});
client.on('message', (topic, message) => {
    console.log(topic, message.toString());
});
```

### 模板 F — ACL（细粒度权限）

`/etc/mosquitto/conf.d/acl-enable.conf`:

```conf
acl_file /etc/mosquitto/acl
```

`/etc/mosquitto/acl`:

```
# 默认无权限（所有 user 必须显式授权）

# alice 可读写整个 home/
user alice
topic readwrite home/#
topic readwrite alice/#

# bob 只读 home，可写 home/notification
user bob
topic read home/#
topic write home/notification/#

# device_xxx 只能 publish 到自己的 topic（IoT 设备模式）
user device_temp_01
topic write sensors/temp_01/#
topic read commands/temp_01/#

# 模式匹配：每个 user 自动获得 user/<username>/# 的读写权限
pattern readwrite user/%u/#

# anon 匿名用户（如 allow_anonymous true）
# topic read public/#
```

应用：`sudo systemctl restart mosquitto`。

### 模板 G — 客户端测试（mosquitto_sub / mosquitto_pub）

```bash
# 终端 A — 订阅
mosquitto_sub -h 127.0.0.1 -p 1883 \
    -u alice -P 'alice-password' \
    -t 'home/#' -v

# 终端 B — 发布
mosquitto_pub -h 127.0.0.1 -p 1883 \
    -u alice -P 'alice-password' \
    -t home/livingroom/temperature \
    -m '{"value": 25.3, "unit": "C"}'

# QoS / Retain / Will message
mosquitto_pub -h ... -t topic -m message \
    -q 2 \                   # QoS 0 / 1 / 2
    -r \                      # Retained（新订阅者立即收到）
    --will-topic 'status' --will-payload 'offline' --will-qos 1 --will-retain

# TLS 连接
mosquitto_sub -h mqtt.example.com -p 8883 \
    --cafile /etc/letsencrypt/live/mqtt.example.com/chain.pem \
    -u alice -P 'pass' \
    -t 'sensors/#' -v
```

### 模板 H — Home Assistant 集成

Home Assistant → 设置 → 设备与服务 → 添加集成 → MQTT：

```
Broker:   localhost
Port:     1883
Username: ha_user                        # 创建专用 user
Password: ha-strong-pass
```

ACL 给 ha_user：

```
user ha_user
topic readwrite homeassistant/#
topic readwrite home/#
```

### 模板 I — 防火墙

```bash
# Ubuntu (UFW)
sudo ufw allow 1883/tcp                   # MQTT（仅内网）
sudo ufw allow 8883/tcp                   # MQTTS（公网）
sudo ufw allow 9001/tcp                   # WebSocket
sudo ufw allow 8884/tcp                   # WebSocket TLS

# RHEL/Anolis (firewalld)
sudo firewall-cmd --add-port=1883/tcp --permanent
sudo firewall-cmd --add-port=8883/tcp --permanent
sudo firewall-cmd --reload
```

## 关键参数调优速查

### QoS 等级

| QoS | 行为 | 适用 |
|---|---|---|
| `0` | At most once（即发即忘） | 高频 sensor data，丢一两个无所谓 |
| `1` | At least once（至少一次，可能重复） | 大部分场景默认 |
| `2` | Exactly once（恰好一次，3 次握手） | 关键控制命令（开关 / 警报） |

QoS 1 是 99% 场景的最佳选择。QoS 2 慢得多，仅必要时用。

### 持久化

```conf
persistence true                          # retained 消息 + 订阅状态
persistence_location /var/lib/mosquitto/
autosave_interval 1800                    # 每 30 分钟存盘
autosave_on_changes false                  # 改动太频繁时关掉

queue_qos0_messages false                  # 离线客户端的 QoS 0 消息不存
max_queued_messages 1000                   # 离线客户端最大队列
```

### 资源占用

| 部署 | RAM | CPU |
|---|---|---|
| 100 sensors / 1 msg/s | 30 MB | < 1% |
| 1000 sensors / 100 msg/s | 100 MB | 1-2% |
| 10000 sensors / 10k msg/s | 1 GB | 10-30% |

Mosquitto 单实例可撑数十万并发连接（`max_connections -1`），瓶颈通常是带宽 / IO。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `mosquitto` 包 | 默认仓库 | EPEL ✅ |
| `mosquitto-clients` 包 | 默认 | EPEL（同 `mosquitto`） |
| 默认仓库版本 | Ubuntu 22+ = 2.0 | EPEL = 2.0 |

EnvForge preflight 启 EPEL，跨发行版无障碍。

## 与其它 catalog 项的配合

- **`rabbitmq`** — 启用 `rabbitmq_mqtt` plugin 让 RabbitMQ 同时支持 MQTT；但 Mosquitto 更轻
- **`prometheus-monitoring`** — 用 `mosquitto_exporter` 暴露 Prometheus 指标
- **`certbot-ssl`** — 给 8883 / 8884 启用 TLS（模板 D）
- **`fail2ban-protection`** — 给 1883 加 jail（防暴力扫描）

## 排错

### `Connection refused`

```bash
# 服务没起来或 bind_address 不对
sudo systemctl status mosquitto
sudo journalctl -u mosquitto -n 50
sudo grep listener /etc/mosquitto/mosquitto.conf /etc/mosquitto/conf.d/*.conf
```

### `Connection Refused: not authorised`

```bash
# 1. password_file 配置了？
grep password_file /etc/mosquitto/conf.d/*.conf

# 2. 用户存在？
sudo grep alice /etc/mosquitto/passwd        # 应该有一行 alice:$7$...

# 3. allow_anonymous false 且没传凭据
mosquitto_pub -h ... -u alice -P pass ...

# 4. ACL 拒绝
sudo cat /etc/mosquitto/acl
```

### `Connection lost`（TLS）

```bash
# 1. CA cert 不对（客户端 cafile 与服务端 certfile 不匹配）
mosquitto_sub --cafile /etc/letsencrypt/live/mqtt.example.com/chain.pem ...

# 2. 客户端时间偏差（证书未生效）
sudo timedatectl status

# 3. require_certificate true 但客户端没传证书
# 客户端加 --cert client.crt --key client.key
```

### Retained 消息丢失

```bash
# persistence 没开
grep persistence /etc/mosquitto/mosquitto.conf

# 或 mosquitto.db 损坏
sudo systemctl stop mosquitto
sudo mv /var/lib/mosquitto/mosquitto.db /var/lib/mosquitto/mosquitto.db.bak
sudo systemctl start mosquitto
# 注意：会丢失所有 retained / 订阅
```

### 大量 `Client connected` / `disconnected` 日志

设备网络不稳定 → 频繁断连。调小 keepalive：

```bash
# 客户端
mosquitto_sub --keepalive 30 ...

# 服务端日志降级
log_type error
log_type warning
# 关 notice / information
```

### Memory 持续上涨（OOM 风险）

```bash
# 离线客户端的队列没清
max_queued_messages 100             # 调小

# 或关 QoS 0 持久化
queue_qos0_messages false
```

### `Error in mosquitto_sub: A TLS error occurred`

```bash
# 通常是 CA cert 路径错或证书过期
openssl x509 -in /etc/letsencrypt/live/mqtt.example.com/cert.pem -noout -dates
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active mosquitto

# 2. 端口
sudo ss -tlnp | grep 1883

# 3. 简单 pub / sub
mosquitto_sub -h 127.0.0.1 -u alice -P 'pass' -t test -C 1 &
sleep 1
mosquitto_pub -h 127.0.0.1 -u alice -P 'pass' -t test -m hello
# subscriber 应输出 hello

# 4. 看日志
sudo tail -20 /var/log/mosquitto/mosquitto.log

# 5. 列订阅 / retained（mosquitto.db）
ls -la /var/lib/mosquitto/
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`mosquitto.conf` + `passwd` 每次按表单值重写**——你**手动加的 user 会被覆盖**。建议：

- 把自定义 user 放 `passwd-extras` + 主配置 `password_file_dir` 引用（Mosquitto 不直接支持，需脚本合并）
- 或所有 user 改用 ACL plugin 走数据库

## ⚠️ 敏感性

**review** — MQTT broker 无认证 = IoT 设备被劫持高风险。

强制：

1. **永不开 anonymous**（除非纯本机开发）
2. 公网必须 8883/TLS
3. ACL 限制每个客户端仅访问需要的 topic（最小权限）
4. 设备凭据**每个 device 一个独立账号**——丢一个不影响其它

## 隐私说明

- MQTT 1883 明文协议——sensor 数据 / 控制命令在网络上裸传
- 公网必须 8883 + TLS
- 密码文件 `/etc/mosquitto/passwd` 是 hash 后的（PBKDF2-SHA512）
- 但 Playbook 任务日志含明文密码（一次）
- `/var/lib/mosquitto/mosquitto.db` 含 retained 消息内容 + 订阅状态——按合规需求加密备份
- Mosquitto 不发遥测
