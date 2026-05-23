# Grafana Loki 日志聚合

Loki 是 "Prometheus for logs"——只索引日志的元数据（label），不索引内容。比 ELK（Elasticsearch + Logstash + Kibana）便宜 10× 内存 / 5× 磁盘，但**只能按 label 过滤后再扫文本**——全文搜索能力不如 Elasticsearch。

**适合**：集中收集多机日志、按 service / level / host 过滤、Grafana 里看图、Prometheus 体系下的日志补全。

**不适合**：深度全文搜索、复杂 SQL-like 查询、合规审计（日志变更追踪 / WORM 存储）。

## 你将得到什么

- ✅ Loki 3.x 二进制装到 `/usr/local/bin/loki`
- ✅ 配置 `/etc/loki/loki.yml`（filesystem 单机模式 + TSDB 索引 + retention）
- ✅ 数据目录 `/var/lib/loki`（chunks + index + WAL）
- ✅ systemd 服务，按表单 端口 / 监听地址 / 保留时长 启动
- ✅ 专用 `loki` 系统用户

> **注意**：Loki **只是 server 端**——还需要 [Promtail](https://grafana.com/docs/loki/latest/clients/promtail/) / [Grafana Alloy](https://grafana.com/docs/alloy/latest/) / vector 之类的 agent 把日志推过来。

## 表单字段说明

### `http_port`

默认 3100。Grafana 添加 Loki 数据源 + Promtail 推日志都用这个端口。

### `bind_address`

| 值 | 适用 |
|---|---|
| `127.0.0.1`（默认） | Grafana / Promtail 同机部署 |
| `0.0.0.0` | 多机：从其它机器收日志（**必须**配防火墙限源 IP） |

Loki 没认证机制——公网暴露要么 nginx + basic auth 要么 mTLS。

### `retention_period`

格式 `<数字>h`（小时）或 `<数字>d`。compactor 每 2 小时跑一次清理。

| 值 | 用途 |
|---|---|
| `744h` (31d) | 默认，常用 |
| `168h` (7d) | 短期 / 容量受限 |
| `2160h` (90d) | 合规需求 |

## 配置文件 / 目录速查

```
/etc/loki/
├── loki.yml                          # ← 主配置（EnvForge 写入）
└── runtime-config.yml                # 运行时配置（多租户限流 / 保留期覆盖）

/var/lib/loki/                        # 数据目录（loki 用户拥有）
├── chunks/                           # 日志数据（压缩 + checksum）
├── index/                            # TSDB 索引（按 label 查询用）
├── wal/                              # 预写日志（崩溃恢复）
└── compactor/                        # compactor 临时

/var/log/loki/                        # Loki 自身的运行日志
/usr/local/bin/loki                   # 二进制
/usr/lib/systemd/system/loki.service  # systemd unit

# Promtail（agent，独立部署）
/etc/promtail/
├── promtail.yml                      # 主配置
└── positions.yaml                    # 各文件读取偏移（避免重复推送）
/usr/local/bin/promtail
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制下载（无包） | 二进制下载 |
| GitHub releases | `https://github.com/grafana/loki/releases` | 相同 |
| 端口 | 3100（HTTP）+ 9095（gRPC，可选） | 相同 |
| 服务名 | `loki` | `loki` |

## 常见配置模板

### 模板 A — 推荐 `/etc/loki/loki.yml`（单机生产）

```yaml
auth_enabled: false                                  # 单租户

server:
  http_listen_address: 127.0.0.1
  http_listen_port: 3100
  grpc_listen_port: 9095
  log_level: info

common:
  path_prefix: /var/lib/loki
  storage:
    filesystem:
      chunks_directory: /var/lib/loki/chunks
      rules_directory: /var/lib/loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

ingester:
  chunk_idle_period: 1h                              # 1h 不写就 flush
  max_chunk_age: 1h
  chunk_target_size: 1572864                          # 1.5MB chunk
  chunk_retain_period: 30s
  wal:
    enabled: true
    dir: /var/lib/loki/wal

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  tsdb_shipper:
    active_index_directory: /var/lib/loki/index
    cache_location: /var/lib/loki/index_cache
    cache_ttl: 24h

limits_config:
  retention_period: 744h                              # 31 天
  ingestion_rate_mb: 10                                # 单租户每秒 10MB
  ingestion_burst_size_mb: 20
  max_streams_per_user: 10000
  max_global_streams_per_user: 10000
  max_query_length: 721h                                # 30 天 + 1h 缓冲
  max_query_parallelism: 32
  per_stream_rate_limit: 5MB
  per_stream_rate_limit_burst: 20MB
  reject_old_samples: true
  reject_old_samples_max_age: 168h                      # 拒绝 7 天前的日志

compactor:
  working_directory: /var/lib/loki/compactor
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
  delete_request_store: filesystem                       # Loki 3.x 必须

ruler:
  storage:
    type: local
    local:
      directory: /var/lib/loki/rules
  rule_path: /var/lib/loki/rules-temp
  alertmanager_url: http://localhost:9093                # 不用告警可注释
  ring:
    kvstore:
      store: inmemory
  enable_api: true

analytics:
  reporting_enabled: false                               # 不发遥测
```

应用：`sudo systemctl restart loki`。

### 模板 B — Promtail Agent（在每台要收日志的机器上）

#### 安装

```bash
VER=3.2.1
curl -fsSL "https://github.com/grafana/loki/releases/download/v${VER}/promtail-linux-amd64.zip" -o /tmp/promtail.zip
sudo unzip -o /tmp/promtail.zip -d /usr/local/bin
sudo mv /usr/local/bin/promtail-linux-amd64 /usr/local/bin/promtail
sudo chmod +x /usr/local/bin/promtail
sudo useradd --system --no-create-home --shell /sbin/nologin promtail
sudo mkdir -p /var/lib/promtail /etc/promtail
sudo chown promtail:promtail /var/lib/promtail
```

#### 配置 `/etc/promtail/promtail.yml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0
  log_level: info

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://YOUR-LOKI-SERVER:3100/loki/api/v1/push
    backoff_config:
      min_period: 500ms
      max_period: 5m
      max_retries: 10
    batchwait: 1s
    batchsize: 1048576

scrape_configs:
  # 系统日志（rsyslog / journald）
  - job_name: system
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
        host: ${HOSTNAME}
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
      - source_labels: ['__journal_priority_keyword']
        target_label: 'level'

  # /var/log 文件
  - job_name: varlogs
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          host: ${HOSTNAME}
          __path__: /var/log/*.log

  # nginx 访问日志
  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          host: ${HOSTNAME}
          __path__: /var/log/nginx/*.log
    pipeline_stages:
      - regex:
          expression: '^(?P<remote_addr>[\w\.]+) - (?P<remote_user>[^ ]*) \[(?P<time_local>[^\]]+)\] "(?P<method>[^ ]*) (?P<path>[^ ]*) (?P<protocol>[^"]*)" (?P<status>\d+) (?P<bytes>\d+)'
      - labels:
          method:
          status:
      - timestamp:
          source: time_local
          format: '02/Jan/2006:15:04:05 -0700'

  # Docker 容器日志（自动发现）
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
```

#### systemd unit `/etc/systemd/system/promtail.service`

```ini
[Unit]
Description=Promtail
After=network.target

[Service]
Type=simple
User=promtail
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/promtail.yml
Restart=on-failure
RestartSec=5

# Promtail 需要读 /var/log（包括 root 拥有的文件）
SupplementaryGroups=adm systemd-journal docker

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now promtail
```

### 模板 C — Grafana 添加 Loki 数据源

Grafana → Connections → Data sources → Add → Loki

```
URL: http://localhost:3100
（如多租户）HTTP Headers: X-Scope-OrgID = your-tenant-id
```

Save & test → 显示 "Data source connected and labels found"。

### 模板 D — LogQL 查询示例

打开 Grafana → Explore → 选 Loki：

```logql
# 1. 所有 nginx 日志
{job="nginx"}

# 2. 包含 "error" 字符串
{job="nginx"} |= "error"

# 3. 排除某些字符串
{job="nginx"} != "GET /healthz" != "kube-probe"

# 4. 正则匹配
{job="nginx"} |~ "5\\d\\d"

# 5. JSON 日志解析
{job="myapp"} | json | level="warn" | line_format "{{.timestamp}} {{.msg}}"

# 6. logfmt 解析
{job="myapp"} | logfmt | duration > 1s

# 7. 5 分钟内 5xx 错误率（指标查询）
sum(rate({job="nginx"} |~ "5\\d\\d" [5m])) by (host)

# 8. 按状态码统计
sum by (status) (count_over_time({job="nginx"} | regexp "(?P<status>\\d{3})" [1h]))

# 9. 不同 level 的日志数
sum by (level) (count_over_time({job=~".+"} | json [5m]))
```

### 模板 E — 直接 push 日志（不用 promtail）

适合脚本 / 一次性推送：

```bash
NOW_NS=$(date +%s%N)
curl -X POST -H "Content-Type: application/json" \
  http://localhost:3100/loki/api/v1/push \
  -d '{
    "streams": [
      {
        "stream": { "job": "manual", "host": "'"$(hostname)"'" },
        "values": [
          ["'"$NOW_NS"'", "manual log entry"],
          ["'"$NOW_NS"'", "another line"]
        ]
      }
    ]
  }'
```

## 关键参数调优速查

### 资源占用

| 部署规模 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 单机（< 100MB/day） | 200 MB | 0.2 vCPU | 10 GB |
| 中型（1-10 GB/day） | 1 GB | 1 vCPU | 100 GB |
| 大型（100+ GB/day） | 8 GB+ | 4 vCPU | TB 级 + 对象存储 |

### Limits 调优

| 参数 | 默认 | 调高场景 |
|---|---|---|
| `ingestion_rate_mb` | 4 | 大流量集中推日志（如 nginx 高 QPS） |
| `ingestion_burst_size_mb` | 6 | 上同 |
| `max_streams_per_user` | 5000 | label 组合多（多 host × 多 service） |
| `per_stream_rate_limit` | 3MB | 单 stream 高吞吐 |
| `reject_old_samples_max_age` | 168h | 历史日志回填时调高 |

### 索引策略

```yaml
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb              # 推荐（v13 schema）
      # store: boltdb-shipper   # 旧版（v12 及之前），3.x 后弃用
```

迁移：在 `schema_config.configs` 加新条目而非改老的（保持时间连续性）。

### Object Storage（多机 / 大量数据）

```yaml
common:
  storage:
    s3:
      bucketnames: my-loki-bucket
      endpoint: s3.amazonaws.com
      region: us-east-1
      access_key_id: ${AWS_ACCESS_KEY_ID}
      secret_access_key: ${AWS_SECRET_ACCESS_KEY}
      s3forcepathstyle: false

# 或 MinIO
common:
  storage:
    s3:
      bucketnames: loki-data
      endpoint: minio.example.com:9000
      access_key_id: minio_user
      secret_access_key: minio_pass
      s3forcepathstyle: true
      insecure: true
```

## 跨发行版兼容

二进制安装，与发行版包管理器无关。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| Anolis 9 | ✅ |
| Alpine | ⚠️（需 musl 编译版，官方有提供 `loki-linux-amd64-musl`） |

## 与其它 catalog 项的配合

- **`grafana-dashboard`** — Grafana + Loki 是搭档（模板 C）
- **`prometheus-monitoring`** — Loki 暴露 `/metrics`，Prometheus 可 scrape Loki 自身指标
- **`docker-host-profile`** — Promtail 自动发现 Docker 容器日志（模板 B）
- **`nginx-web-service`** — 反代 Loki + basic auth；Promtail 解析 nginx access log（模板 B）
- **`minio-storage`** — 作为 Loki 的 object storage backend，节省本地磁盘

## 排错

### `failed to create directory: permission denied`

数据目录 owner 不对：

```bash
sudo chown -R loki:loki /var/lib/loki
sudo systemctl restart loki
```

### `failed to enable retention deletes`（Loki 3.x）

老配置缺 `delete_request_store`：

```yaml
compactor:
  retention_enabled: true
  delete_request_store: filesystem        # ← 必须加（Playbook 已加）
```

### 磁盘满 / 没自动清

```bash
# 看 compactor 日志
sudo journalctl -u loki | grep -i compact

# 手动触发清理
curl -X POST http://localhost:3100/loki/api/v1/delete \
  -d '{"query":"{job=\"old\"}", "start":"0", "end":"1640995200"}'

# 检查 retention 实际生效
ls -la /var/lib/loki/chunks/ | head     # 老文件应被删
```

### Grafana 报 502 / connection refused

```bash
# 1. Loki 在跑
systemctl is-active loki

# 2. 端口在听
ss -tlnp | grep 3100

# 3. bind_address 与 Grafana 期望一致
# Grafana 同机：127.0.0.1
# Grafana 异机：0.0.0.0 + 防火墙限源 IP

# 4. 防火墙
sudo ufw status | grep 3100
```

### Promtail "stream limit exceeded"

label 组合爆炸（label 值太多 = 太多 stream）。检查：

```bash
# Loki 上看
curl -s http://localhost:3100/loki/api/v1/labels | jq

# 太多 label 组合的 → 减少 label 维度
# 比如不要把 user_id 当 label（高基数），把它放日志内容
```

### `entry too far behind` 错误

Promtail 推老日志（时间戳 > 168h）。两条路：

```yaml
# 方案 1：调大 reject 窗口（loki.yml）
limits_config:
  reject_old_samples_max_age: 720h    # 30 天

# 方案 2：Promtail 限只推新日志
# pipeline_stages:
#   - drop:
#       older_than: 168h
```

### LogQL 查询慢 / 超时

```bash
# 1. 缩小时间窗口
{job="nginx"} |= "error"      # 默认 1h，按 UI 限制

# 2. 加 label 过滤（比内容过滤快得多）
{job="nginx", host="web1"} |= "error"

# 3. parallel 调高
limits_config:
  max_query_parallelism: 64
```

### Loki 启动 OOM

```bash
# WAL replay 时内存爆。临时：
sudo systemctl stop loki
sudo rm -rf /var/lib/loki/wal/*       # 丢失最近未 flush 的日志
sudo systemctl start loki
```

或调小 `chunk_target_size`。

## 验证

```bash
# 1. 服务健康
systemctl is-active loki
curl -fsS http://localhost:3100/ready                # 应输出 ready
curl -fsS http://localhost:3100/metrics | head

# 2. 端口
sudo ss -tlnp | grep 3100

# 3. 推一条日志
curl -X POST -H "Content-Type: application/json" http://localhost:3100/loki/api/v1/push -d '{"streams":[{"stream":{"job":"test"},"values":[["'$(date +%s%N)'","hello loki"]]}]}'

# 4. 查 label
curl -s http://localhost:3100/loki/api/v1/labels | jq

# 5. 查刚推的日志
curl -s "http://localhost:3100/loki/api/v1/query_range?query=%7Bjob%3D%22test%22%7D" | jq
```

## 多次运行

`installMode: skip-existing`。二进制下载有 `creates` 守卫——已下载不重下。`loki.yml` 每次按表单值重写——你**手动加的 limits / scrape config 会被覆盖**。要保留：

- 把自定义放 `runtime-config.yml`（不被 Playbook 重写）
- 或用 `include` 引用外部 yml

## ⚠️ 敏感性

**review** — 日志可能含 **PII / 密码 / API token / SQL 查询参数 / 业务数据**。Loki **没有内置认证**，0.0.0.0 暴露 = 任何人可查所有日志。

**强制清单**：

1. `bind_address: 127.0.0.1` 或仅内网 IP
2. 多机场景必须 nginx + basic auth 反代或 mTLS
3. Promtail 日志推送走 HTTPS（避免明文 SQL 等被中间人嗅）
4. 业务应用层做敏感信息脱敏（mask 密码 / 卡号 / 身份证），**不要寄希望于 Loki**

## 隐私说明

- Loki 默认遥测已关闭（本 Playbook 设 `analytics.reporting_enabled: false`）
- 日志数据全部本地存储 / S3（按你配的 storage_config）
- 多租户模式下 `auth_enabled: true` 时按 `X-Scope-OrgID` 隔离——但**没认证授权**，仅按 header 区分
- Promtail 推送日志时 User-Agent 含 host 名（不含个人信息）
- 文件型 positions（`positions.yaml`）记录每个文件读取偏移——**不含日志内容**
