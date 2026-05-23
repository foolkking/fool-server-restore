# InfluxDB v2 时序数据库

InfluxDB 是**专业时序数据库**——比 Prometheus 更适合**长期存储 + 高基数 + 业务时序数据**。**适合**：IoT 数据接收（与 mosquitto / MQTT 配套）、Grafana 数据源、Telegraf agent 生态、业务 metric 长期归档。

## 你将得到什么

- 📦 **influxdb2** + **influxdb2-cli**（来自 InfluxData 官方仓库）
- ✅ HTTP API + Web UI 监听 `127.0.0.1:8086`
- ✅ 自动 setup（admin user + org + bucket + retention）
- ✅ Telemetry 已禁用（`reporting-disabled: true`）
- ✅ systemd 服务 + 开机自启

## 表单字段说明

### `influx_admin_user` / `influx_admin_password`

管理员凭据。InfluxDB 首次 setup 时建账号。

### `influx_org`

Organization 名（隔离用户和 bucket）。一般填公司名或团队名。

### `influx_bucket`

默认 bucket 名（类似数据库）。生产建议每业务一个 bucket。

### `influx_retention`

数据保留期：`720h`（30 天）/ `30d` / `1y` / `0`（永久）。

### `influx_port`

API + Web UI 端口。

## 配置文件 / 目录速查

```
/etc/influxdb/
└── config.yml                              # ← 主配置（YAML）

/var/lib/influxdb/                          # ← 数据目录
├── influxd.bolt                              # 元数据（bolt DB）
├── engine/                                    # 时序数据（TSM 文件）
│   ├── data/                                  # WAL + TSM
│   └── wal/
└── ...

/var/log/influxdb/influxd.log                  # 日志（也可看 journalctl）

# CLI
/usr/bin/influx                                # 主 client
/usr/bin/influxd                                 # server 二进制

# 用户级
~/.influxdbv2/configs                            # influx CLI 配置（含 token）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `repos.influxdata.com/debian` | `repos.influxdata.com/stable/$basearch/main` |
| 包 | `influxdb2` `influxdb2-cli` | 同 |
| 服务 | `influxdb` | `influxdb` |
| Anolis 9 | – | ✅ |

## 常见配置模板

### 模板 A — Web UI 操作（首次访问）

```
http://server-ip:8086
```

EnvForge Playbook 已自动 setup——直接用 admin 账号登录。看到：

- **Buckets** — 数据存储单元
- **Telegrafs** — 配 Telegraf agent
- **Tasks** — 调度查询（类似 cron）
- **Dashboards** — 内置可视化（也可外接 Grafana）
- **API Tokens** — 给应用用的 token

### 模板 B — InfluxDB CLI 速查

```bash
# 配 CLI（首次）
influx config create --config-name local \
    --host-url http://127.0.0.1:8086 \
    --org envforge \
    --token <admin-token-from-setup> \
    --active

# 看 buckets
influx bucket list

# 写数据（line protocol）
influx write -b default 'temperature,location=room1 value=23.5'
echo 'cpu,host=server1 usage=85.3' | influx write -b default

# 查询（Flux 语言）
influx query 'from(bucket:"default") |> range(start:-1h)'

# 创建 bucket
influx bucket create -n metrics -r 30d

# 创建 token（应用用）
influx auth create \
    --org envforge \
    --read-bucket <bucket-id> \
    --write-bucket <bucket-id> \
    --description "my-app token"
```

### 模板 C — 写数据（HTTP API）

```bash
# Line protocol（最常用）
curl -X POST -H "Authorization: Token YOUR_TOKEN" \
    --data-raw 'temperature,location=room1 value=23.5' \
    "http://127.0.0.1:8086/api/v2/write?org=envforge&bucket=default&precision=s"

# 多条
curl -X POST -H "Authorization: Token YOUR_TOKEN" \
    --data-raw '
temperature,location=room1 value=23.5
temperature,location=room2 value=22.1
humidity,location=room1 value=45.2
' "http://127.0.0.1:8086/api/v2/write?org=envforge&bucket=default"
```

### 模板 D — Telegraf 推 metric（在被监控机器装）

```bash
sudo apt-get install telegraf

# 配置 /etc/telegraf/telegraf.conf
sudo tee /etc/telegraf/telegraf.conf > /dev/null <<EOF
[agent]
  interval = "10s"

[[outputs.influxdb_v2]]
  urls = ["http://influxdb-server:8086"]
  token = "$INFLUX_TOKEN"
  organization = "envforge"
  bucket = "metrics"

[[inputs.cpu]]
[[inputs.mem]]
[[inputs.disk]]
[[inputs.system]]
[[inputs.docker]]
[[inputs.nginx]]
  urls = ["http://127.0.0.1/stub_status"]
EOF

sudo systemctl enable --now telegraf
```

### 模板 E — Python 客户端

```python
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

client = InfluxDBClient(
    url="http://127.0.0.1:8086",
    token="YOUR_TOKEN",
    org="envforge"
)

# 写
write_api = client.write_api(write_options=SYNCHRONOUS)
point = Point("measurement").tag("host", "server1").field("value", 42.0)
write_api.write(bucket="default", record=point)

# 查
query_api = client.query_api()
result = query_api.query('from(bucket:"default") |> range(start:-1h)')
for table in result:
    for record in table.records:
        print(record.values)
```

### 模板 F — Grafana 数据源

Grafana → Connections → Data sources → InfluxDB：

```
Query language: Flux
URL: http://127.0.0.1:8086
Organization: envforge
Token: <token-from-influx-auth-list>
Default Bucket: default
```

### 模板 G — Mosquitto MQTT → InfluxDB

通过 Telegraf 桥接（最常见 IoT 模式）：

```toml
[[inputs.mqtt_consumer]]
  servers = ["tcp://mqtt-broker:1883"]
  topics = ["sensors/#"]
  username = "telegraf"
  password = "..."
  data_format = "json"
  json_string_fields = ["device_id"]

[[outputs.influxdb_v2]]
  urls = ["http://127.0.0.1:8086"]
  token = "..."
  organization = "envforge"
  bucket = "iot"
```

### 模板 H — 备份

```bash
# 在线备份（不停机）
sudo influx backup /backup/influx-$(date +%F) --host http://127.0.0.1:8086 --token <admin-token>

# 还原
sudo influx restore /backup/influx-2026-05-23 --host http://127.0.0.1:8086 --token <admin-token>
```

## 关键参数调优速查

### 资源占用

| 写入速率 | RAM | 磁盘（30 天） |
|---|---|---|
| 100 points/s | 500 MB | 1 GB |
| 10k points/s | 2 GB | 50 GB |
| 100k+ points/s | 8 GB+ | TB 级 |

### 写入性能

```bash
# Batch write（强烈推荐——单次 1 行 vs 5000 行差 100×）
# Telegraf 默认 batch_size = 1000
# 自定义：每秒 flush 一次，最多 5000 行
```

### Retention vs Downsampling

```bash
# 原始数据 30 天 + 5 分钟聚合数据 1 年（task）
influx task create --file - <<EOF
option task = {name: "downsample-1m", every: 5m}

from(bucket: "default")
  |> range(start: -5m)
  |> aggregateWindow(every: 1m, fn: mean)
  |> to(bucket: "default-1m")
EOF
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `repos.influxdata.com/debian` | `repos.influxdata.com/stable` |
| 包 | `influxdb2` | `influxdb2` |
| Anolis 9 | – | ✅（glibc 兼容） |
| ARM64 | ✅ | ⚠️ 仅 Ubuntu/Debian arm64 |

## 与其它 catalog 项的配合

- **`grafana-dashboard`** — 主要消费者（模板 F）
- **`mosquitto-mqtt`** — IoT 数据通过 Telegraf 桥接（模板 G）
- **`prometheus-monitoring`** — 互补（Prom 短期 + Influx 长期）
- **`netdata-monitoring`** — 可推到 InfluxDB 长期归档

## 排错

### 服务起不来

```bash
sudo journalctl -u influxdb -n 50
sudo cat /var/log/influxdb/influxd.log

# 端口被占
sudo ss -tlnp | grep 8086

# 数据目录权限
sudo chown -R influxdb:influxdb /var/lib/influxdb
```

### Setup 失败

```bash
# 看是否已 setup（有则不能重复）
curl http://127.0.0.1:8086/api/v2/setup
# {"allowed":false} = 已 setup

# 重置（**丢失所有数据**）
sudo systemctl stop influxdb
sudo rm -rf /var/lib/influxdb/influxd.bolt /var/lib/influxdb/engine
sudo systemctl start influxdb
# 重跑 Playbook 走 setup
```

### Token 找不到

```bash
sudo -u influxdb influx auth list

# 重建（旧的还有效，加新的）
sudo -u influxdb influx auth create --org envforge --read-buckets --write-buckets
```

### 查询 / 写入失败 401

```bash
# Token 不对或失效
curl -H "Authorization: Token YOUR_TOKEN" http://127.0.0.1:8086/api/v2/buckets

# 重建 token（模板 G）
```

### 磁盘吃满

```bash
du -sh /var/lib/influxdb/engine/

# 缩短 retention
influx bucket update --id <bucket-id> --retention 7d
```

### 高基数（high cardinality）爆 RAM

```bash
# 看每个 bucket 的 series 数
influx query 'from(bucket:"default") |> range(start:-1h) |> group(columns: ["_measurement"]) |> count()'

# 高基数 = 把 user_id 等高基数字段做 tag → 改放 field
# tag 数 × 不同值数 = series 数（爆炸性增长）
```

## 验证

```bash
systemctl is-active influxdb
curl -fsS http://127.0.0.1:8086/health
sudo -u influxdb influx ping
sudo -u influxdb influx bucket list
```

## 多次运行

`installMode: skip-existing`。**Setup 仅首次跑**——重复 setup 会失败但不影响。**已存在数据保留**。

## ⚠️ 敏感性

**review** — 时序数据可能含**业务指标 / IoT 传感器数据 / 用户行为**。

强制：

1. 默认 127.0.0.1 监听，远程访问通过反代 + auth
2. 用 token 而非 admin 密码（业务应用最小权限）
3. 公网必须 HTTPS

## 隐私说明

- Telemetry 已禁用（`reporting-disabled: true`）
- 数据本地存储 `/var/lib/influxdb/`
- API token 存 InfluxDB 内（创建 token 时只显示一次）
