# Mosquitto MQTT Broker

Mosquitto 是 Eclipse 旗下的 MQTT broker——MQTT 是 IoT/物联网最常用的消息协议，
轻量（消息几十字节）、发布订阅模型、跑在受限带宽设备上很合适。

适合：智能家居中枢（Home Assistant 后端）、IoT 设备数据采集、嵌入式设备到云的桥梁。

## 你将得到什么

- 📦 **mosquitto** + **mosquitto-clients**（含 `mosquitto_pub` / `mosquitto_sub` 测试工具）
- ✅ 配置 `/etc/mosquitto/mosquitto.conf`（按表单端口/绑定/匿名设置）
- ✅ 密码文件 `/etc/mosquitto/passwd`（用 `mosquitto_passwd` 加密存储）
- ✅ 持久化目录 `/var/lib/mosquitto`（保留消息、订阅状态）
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### 端口

默认 1883（明文 MQTT）。8883 是 MQTTS（TLS 加密），公网部署务必上 TLS——本 Playbook 不含
TLS 配置（要先有证书），手动加在 `/etc/mosquitto/conf.d/tls.conf`。

### 监听地址

127.0.0.1 适合本机的 IoT 中枢（Home Assistant 同机部署时）。
0.0.0.0 让远程 IoT 设备能连，**必须启用密码认证 + 防火墙限源 IP**。

### 允许匿名

**默认 false**。匿名 MQTT broker 是公开 IoT 市场最严重的安全洞之一——很多生产环境
broker 暴露在 1883 端口无密码，任何人都能 sub 全部 topic 看数据，或 pub 假数据扰乱设备。

仅在你的开发测试环境且只本机访问时开启匿名。

### 用户名 / 密码

仅在不允许匿名时显示。`mosquitto_passwd` 命令把密码加 hash 后写到 `/etc/mosquitto/passwd`。

## 安装后

### 测试 publish/subscribe

终端 A 订阅：
```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -u envforge -P 你的密码 -t 'test/#' -v
```

终端 B 发布：
```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -u envforge -P 你的密码 -t test/sensor -m '{"temp":25.3}'
```

终端 A 应该立刻看到消息。

### 加更多用户

```bash
sudo mosquitto_passwd /etc/mosquitto/passwd alice    # 提示输入两次密码
sudo systemctl reload mosquitto
```

### 启用 ACL（细粒度权限）

`/etc/mosquitto/conf.d/acl.conf`：
```conf
acl_file /etc/mosquitto/acl
```

`/etc/mosquitto/acl`:
```
user alice
topic readwrite home/livingroom/#

user bob
topic read home/#
topic write home/notification/#
```

```bash
sudo systemctl restart mosquitto
```

### 启用 WebSocket（让浏览器/JS 客户端连）

`/etc/mosquitto/conf.d/websocket.conf`：
```conf
listener 9001
protocol websockets
allow_anonymous false
```

### 启用 TLS（生产必备）

```conf
listener 8883
cafile /etc/letsencrypt/live/mqtt.example.com/chain.pem
certfile /etc/letsencrypt/live/mqtt.example.com/cert.pem
keyfile /etc/letsencrypt/live/mqtt.example.com/privkey.pem
require_certificate false
allow_anonymous false
```

### Home Assistant 集成

Home Assistant → 设置 → 设备与服务 → 添加集成 → MQTT → 填 broker 地址 / 用户密码。

## ⚠️ 敏感性

**review** — MQTT broker 没认证 = IoT 设备被劫持的高风险。务必：
1. 不开匿名
2. 公网暴露前上 TLS
3. 用 ACL 限制每个客户端只能访问需要的 topic

## 验证

```bash
systemctl status mosquitto --no-pager
mosquitto_pub -h 127.0.0.1 -u $USER -P $PASS -t test -m hello
sudo ss -tlnp | grep 1883
```

## 排错

- **`Connection refused`** — 服务没起来或 bind_address 不对。
- **`Connection Refused: not authorised`** — 用户名密码错，或 mosquitto.conf 没指 password_file。
- **`Connection lost`** — TLS 配置错（要么 CA 不对，要么客户端没传证书但服务端要求）。
- **跨发行版**：包名 `mosquitto` 在两边一致。RHEL 上需要 EPEL（preflight 已自动启用）。

## 多次运行

`installMode: skip-existing`。包不重装，conf 每次重写，**密码每次会被表单值覆盖**。

## 隐私说明

- MQTT 明文协议，公网传输请上 TLS。
- 密码文件 `/etc/mosquitto/passwd` 是 hash 后的，但任务日志里出现过明文。
