# Prometheus 监控

Prometheus 是云原生的指标监控系统：定期 scrape 各种 exporter 拿指标，存到本地 TSDB（时序数据库），提供 PromQL 查询语言。配 Grafana 一起用最经典。EnvForge 装的是 Prometheus 主程序——还需要单独的 exporter（如 node_exporter）才能采集具体指标。

## 你将得到什么

- ✅ Prometheus 2.55.x 二进制装到 `/usr/local/bin/prometheus`
- ✅ promtool（验证配置 / 测试规则）
- ✅ 专用 `prometheus` 系统用户
- ✅ 配置 `/etc/prometheus/prometheus.yml`（含一个 self-scrape job）
- ✅ 数据目录 `/var/lib/prometheus`（TSDB）
- ✅ systemd 服务，按表单 端口 / 监听地址 / 保留时长 / 抓取间隔 启动

## 表单字段说明

### `http_port`

默认 9090（Prometheus 事实标准端口）。

### `bind_address`

> ⚠️ **Prometheus 自身没有用户认证**。`0.0.0.0` 暴露公网 = 所有监控数据全公开（含业务量、内部服务名、错误率）。

| 值 | 适用 |
|---|---|
| `127.0.0.1`（默认） | nginx + basic auth 反代场景 |
| 内网 IP | 内网部署 |
| `0.0.0.0` | **必须**配反代 + auth + 防火墙 |

### `retention_time`

每 1000 时间序列每天 ~1 MB（按 churn 浮动）。

| 值 | 大小估算 |
|---|---|
| `15d`（默认） | ~ 几百 MB |
| `30d` | ~ 1-2 GB |
| `90d` | ~ 几 GB |
| `365d` | ~ 几十 GB |

更长期需要 Thanos / VictoriaMetrics / Cortex / Mimir。

### `scrape_interval`

| 值 | 适用 | 影响 |
|---|---|---|
| `5s` | 高频业务监控 | 磁盘 3× |
| `15s`（默认） | 行业标准 | 平衡 |
| `30s` | 节省资源 | 错过短期 spike |
| `1m` | 长周期监控 | 太粗 |

## 配置文件 / 目录速查

```
/etc/prometheus/
├── prometheus.yml                    # ← 主配置（EnvForge 写入）
├── rules/                            # ← 告警 / recording 规则（自己加）
│   ├── alerts.yml
│   └── recording.yml
├── targets/                          # ← file_sd 动态目标
│   ├── nodes.yml
│   └── apps.yml
└── web.yml                           # web 认证 / TLS 配置（启用时）

# 数据
/var/lib/prometheus/                  # TSDB（prometheus 用户拥有）
├── data/
│   ├── chunks_head/                  # 当前 head block（内存映射）
│   ├── 01HXXXX...                    # 已 compact 的 block（每 2h 一个）
│   ├── wal/                          # 预写日志（崩溃恢复）
│   └── tombstones                    # 删除标记
└── lock                               # 进程锁

# 二进制 / systemd
/usr/local/bin/prometheus
/usr/local/bin/promtool
/usr/lib/systemd/system/prometheus.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制下载（无包） | 二进制下载 |
| 二进制位置 | `/usr/local/bin/prometheus` | 相同 |
| 服务名 | `prometheus` | `prometheus` |
| 默认端口 | 9090 | 9090 |
| 数据目录 | `/var/lib/prometheus` | 相同 |

## 常见配置模板

### 模板 A — 推荐 `/etc/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s
  external_labels:
    cluster: production
    environment: prod
    region: us-west-1

# 告警 / Recording 规则（路径相对于 prometheus.yml）
rule_files:
  - 'rules/alerts.yml'
  - 'rules/recording.yml'

# Alertmanager 地址（不用告警可注释）
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - 127.0.0.1:9093

scrape_configs:
  # Prometheus 自身
  - job_name: prometheus
    static_configs:
      - targets: ['127.0.0.1:9090']

  # node_exporter（每台被监控机器装一个）
  - job_name: node
    static_configs:
      - targets:
          - '127.0.0.1:9100'
        labels:
          host: web1

  # 文件动态目标（推荐方式）
  - job_name: file_sd_apps
    file_sd_configs:
      - files:
          - 'targets/*.yml'
        refresh_interval: 30s

  # 黑盒探测（HTTP/TCP probe）
  - job_name: blackbox-http
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://example.com
          - https://api.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115        # blackbox_exporter 监听地址

  # Kubernetes 自动发现（如有 k8s 集群）
  # - job_name: kubernetes-pods
  #   kubernetes_sd_configs:
  #     - role: pod
  #   relabel_configs:
  #     - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  #       action: keep
  #       regex: true
```

### 模板 B — 文件动态目标（避免改主配置）

`/etc/prometheus/targets/web-servers.yml`：

```yaml
- targets:
    - 'web1.internal:9100'
    - 'web2.internal:9100'
    - 'web3.internal:9100'
  labels:
    role: web
    env: prod

- targets:
    - 'staging1.internal:9100'
  labels:
    role: web
    env: staging
```

`/etc/prometheus/targets/databases.yml`：

```yaml
- targets:
    - 'pg1.internal:9187'
  labels:
    role: postgres
    env: prod

- targets:
    - 'redis1.internal:9121'
  labels:
    role: redis
    env: prod
```

加新机器 = 改这些 yml + Prometheus 自动 reload，**不用重启**。

### 模板 C — 告警规则 `rules/alerts.yml`

```yaml
groups:
  - name: instance
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.instance }} down"
          description: "{{ $labels.instance }} of job {{ $labels.job }} 已下线超过 5 分钟"

      - alert: HighCPU
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.instance }} CPU 高 ({{ $value | humanize }}%)"

      - alert: HighMemory
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.instance }} 内存高 ({{ $value | humanize }}%)"

      - alert: DiskFull
        expr: (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.instance }} / 分区 > 90% ({{ $value | humanize }}%)"

  - name: http
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "5xx 错误率 > 5%"
```

校验语法：

```bash
sudo promtool check rules /etc/prometheus/rules/alerts.yml
```

### 模板 D — Recording 规则（预聚合，加速 dashboard）

`rules/recording.yml`：

```yaml
groups:
  - name: aggregations
    interval: 30s
    rules:
      - record: instance:cpu_usage:rate5m
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

      - record: instance:memory_usage:percent
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))

      - record: job:http_errors:rate5m
        expr: sum by (job) (rate(http_requests_total{code=~"5.."}[5m]))
```

Grafana 直接查 `instance:cpu_usage:rate5m` 而非现算 PromQL，dashboard 渲染快很多。

### 模板 E — Nginx 反代 + Basic Auth

```nginx
upstream prometheus { server 127.0.0.1:9090; }

server {
    listen 443 ssl http2;
    server_name prometheus.example.com;

    ssl_certificate /etc/letsencrypt/live/prometheus.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/prometheus.example.com/privkey.pem;

    auth_basic "Prometheus";
    auth_basic_user_file /etc/nginx/.htpasswd-prometheus;

    location / {
        proxy_pass         http://prometheus;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # 长查询超时
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

## 关键参数调优速查

### 资源占用

| 时间序列数 | RAM | CPU | 磁盘（30 天） |
|---|---|---|---|
| 10k | 200 MB | 0.2 vCPU | 2 GB |
| 100k | 1 GB | 0.5 vCPU | 20 GB |
| 1M | 8 GB | 2 vCPU | 200 GB |
| 10M+ | 64 GB+ | 8 vCPU+ | 联邦 / Thanos |

监控 series 数：

```bash
curl -s http://127.0.0.1:9090/api/v1/status/tsdb | jq '.data.headStats'
```

### 启动参数（systemd unit）

```bash
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --storage.tsdb.retention.time=30d \
  --storage.tsdb.retention.size=50GB \
  --storage.tsdb.wal-compression \
  --web.console.templates=/etc/prometheus/consoles \
  --web.console.libraries=/etc/prometheus/console_libraries \
  --web.listen-address=127.0.0.1:9090 \
  --web.external-url=https://prometheus.example.com/ \
  --web.enable-lifecycle \
  --web.enable-admin-api \
  --query.max-concurrency=20 \
  --query.timeout=2m
```

`--web.enable-lifecycle` 允许：

```bash
curl -X POST http://127.0.0.1:9090/-/reload      # 热重载配置
curl -X POST http://127.0.0.1:9090/-/quit        # 优雅停机
```

### 高基数（high cardinality）问题

label 值组合爆炸是 Prometheus 头号杀手。**不要把高基数字段做 label**：

| ❌ 错误 label | ✅ 改进 |
|---|---|
| `user_id` | 不做 label，放日志 |
| `request_id` | 同上 |
| `email` | 同上 |
| `path`（带参数） | `path_template`（如 `/users/:id`） |
| `error_msg` | `error_type` 枚举 |

排查：

```promql
topk(20, count by (__name__)({__name__=~".+"}))    # 看哪些 metric 序列最多
```

### Federation（多 Prometheus 汇聚）

中央 Prometheus scrape 各分支 Prometheus 的 `/federate`：

```yaml
scrape_configs:
  - job_name: federate
    scrape_interval: 60s
    honor_labels: true
    metrics_path: /federate
    params:
      'match[]':
        - '{job="prometheus"}'
        - '{__name__=~"job:.+"}'      # 只拉聚合后的指标
    static_configs:
      - targets:
          - branch1.internal:9090
          - branch2.internal:9090
```

## 跨发行版兼容

二进制安装，与发行版无关。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| Anolis 9 | ✅ |
| Alpine | 用 `prometheus-linux-amd64-musl` |

发行版自带的 `prometheus` 包（如 Ubuntu 22.04 默认仓库的 2.31）版本太老 + 不支持 TSDB 新功能，**不推荐用**。

## 与其它 catalog 项的配合

- **`grafana-dashboard`** — Prometheus 数据源（标配）
- **`netdata-monitoring`** — Netdata 暴露 Prometheus endpoint 让 Prom scrape
- **node_exporter** — 几乎必装的 system metrics exporter（catalog 还没单独项，可手动装）
- **`docker-host-profile`** — Docker daemon 自带 Prometheus endpoint（启用 metrics-addr）
- **`certbot-ssl`** — HTTPS 证书
- **`alertmanager`** — 告警分发（catalog 暂无单独项）

## 排错

### 服务起不来 + `permission denied: /var/lib/prometheus`

```bash
sudo chown -R prometheus:prometheus /var/lib/prometheus /etc/prometheus
sudo systemctl restart prometheus
```

### `/targets` 上某个 job DOWN

```bash
# 1. 直接 curl 该 endpoint
curl http://target-host:9100/metrics

# 2. 看 Prom 上的错误
# 浏览器打开 http://prometheus:9090/targets，DOWN 的 target 鼠标悬停看 lastError

# 常见原因
# - 端口没开 / 防火墙
# - exporter 没启动
# - metrics_path 配错（默认 /metrics）
# - SSL 证书问题（自签名要 insecure_skip_verify: true）
```

### `out of order sample`

样本时间戳乱序——通常是机器时钟漂移：

```bash
sudo timedatectl status
sudo systemctl restart systemd-timesyncd      # 或 chronyd
```

### 启动报 `mmap: cannot allocate memory`

TSDB head block 太大。降 `--storage.tsdb.retention.time` 或 `--storage.tsdb.retention.size`。

或临时清头：

```bash
sudo systemctl stop prometheus
sudo rm -rf /var/lib/prometheus/wal/*
sudo systemctl start prometheus      # 丢失最近未持久化的数据
```

### 配置改后 `reload` 失败

```bash
# 看错误
curl -X POST http://127.0.0.1:9090/-/reload

# 校验
sudo promtool check config /etc/prometheus/prometheus.yml
```

### PromQL 查询慢 / 超时

```bash
# 1. 提高 query timeout
ExecStart=... --query.timeout=2m

# 2. 用 recording rules 预聚合（模板 D）

# 3. 缩小查询范围
rate(metric[5m])         # 而非 rate(metric[1d])
```

### 磁盘填满

```bash
# 看 tsdb 占用
du -sh /var/lib/prometheus/data/

# 调小 retention
ExecStart=... --storage.tsdb.retention.size=20GB

# 或清老 block（小心：会丢数据）
sudo systemctl stop prometheus
sudo rm -rf /var/lib/prometheus/data/01HXX*    # 老于某时间的 block
sudo systemctl start prometheus
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active prometheus

# 2. 端口
ss -tlnp | grep 9090

# 3. Health
curl -fsS http://127.0.0.1:9090/-/healthy

# 4. 配置可读
sudo promtool check config /etc/prometheus/prometheus.yml

# 5. Targets 状态
curl -s http://127.0.0.1:9090/api/v1/targets | jq '.data.activeTargets[] | {labels: .labels, health: .health}'

# 6. 跑个 PromQL
curl -s "http://127.0.0.1:9090/api/v1/query?query=up" | jq

# 7. TSDB 状态
curl -s http://127.0.0.1:9090/api/v1/status/tsdb | jq '.data.headStats'
```

## 多次运行

`installMode: skip-existing`。二进制下载有 `creates` 守卫。`prometheus.yml` 每次按表单值重写——你**手动加的 scrape_configs 会被覆盖**。建议：

- 业务 scrape job 放 `/etc/prometheus/targets/*.yml`（file_sd_configs，不被 Playbook 重写）
- 或拆 `prometheus.d/*.yml` 用 [include 机制](https://github.com/prometheus/prometheus/issues/1357#issuecomment-2230228657)（社区 fork）

## ⚠️ 敏感性

**review** — Prometheus 暴露**所有监控数据**。即使没业务密码，监控信息本身也敏感（业务量 / 错误率 / 内部服务清单 / 主机 hostname）。

**强制清单**：

1. `bind_address: 127.0.0.1`，对外通过 nginx + auth 反代（模板 E）
2. `node_exporter` 等被监控端的 exporter **也要加防火墙**（默认监听 0.0.0.0:9100）
3. PromQL 远程 API（`/api/v1/admin/tsdb/delete_series`）权限大，慎开 `--web.enable-admin-api`

## 隐私说明

- Prometheus 不发遥测
- 监控数据全部本地存储（TSDB）
- scrape 时 User-Agent 含 Prom 版本和 hostname
- `prometheus.yml` 里的 basic_auth / bearer_token 等凭据明文——文件权限自动 0640 root:prometheus
- 远程 Federation / remote_write 时凭据走 HTTPS + auth header
