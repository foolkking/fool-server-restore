# Monitoring Stack（监控全家桶）

**完整可观测性栈一键部署**：Prometheus（指标）+ Grafana（可视化）+ Loki（日志）+ node_exporter（系统指标）+ cadvisor（容器指标）。Docker compose 部署，**预配置 Grafana 数据源**——开箱可用。

## 你将得到什么

- 📦 **Prometheus** — 时序指标数据库（端口 9090）
- 📦 **Grafana OSS** — 可视化（端口 3000，**预配 Prom + Loki 数据源**）
- 📦 **Loki** — 日志聚合（端口 3100）
- 📦 **node_exporter** — 系统指标（CPU / 内存 / 磁盘 / 网络）
- 📦 **cadvisor** — Docker 容器指标
- ✅ Grafana admin 账号 + 密码已设
- ✅ Prometheus 抓取自动配置（含 node + cadvisor + loki self）
- ✅ 数据持久化 `/opt/monitoring/`

## 表单字段说明

### `monitoring_data_dir`

数据存储目录。按 `prometheus_retention` 大小可达数十 GB。

### `grafana_admin_password`

Grafana admin 密码。留空 = 自动 18 位。

### `monitoring_domain_grafana`

Grafana 对外域名。用于 root_url 生成 OAuth 回调 / share link 绝对路径。

### `prometheus_retention`

格式 `7d` / `30d` / `90d`。每 1k 时间序列每天 ~1 MB 磁盘。

## 配置文件 / 目录速查

```
/opt/monitoring/
├── docker-compose.yml                     # ← 主 compose
├── prometheus-config/
│   └── prometheus.yml                      # Prometheus 主配置
├── prometheus-data/                         # TSDB（按 retention 大小）
├── grafana-config/
│   └── datasources.yml                     # 自动添加的 Prom + Loki 数据源
├── grafana-data/                            # Grafana SQLite + dashboard
├── loki-config/
│   └── loki.yml                              # Loki 主配置
└── loki-data/                                # 日志 chunks + index
```

## 常见配置模板

### 模板 A — 首次访问 Grafana

```
http://<server-ip>:3000
```

用 admin / 表单密码登录。

### 模板 B — 导入预制 dashboard（最关键步骤）

UI → Dashboards → New → Import → 输入 ID：

| ID | 名称 | 数据源 |
|---|---|---|
| **1860** | Node Exporter Full | Prometheus |
| **14282** | cadvisor exporter | Prometheus |
| **17777** | Loki Logs | Loki |
| **9614** | nginx exporter | Prometheus |
| **9628** | postgres exporter | Prometheus |
| **2583** | mysql exporter | Prometheus |
| **893** | docker swarm | Prometheus |

点 Import → 选 Prometheus 数据源 → Import。立刻看到所有指标图。

### 模板 C — Promtail 推日志到 Loki（在每台被监控机器装）

详见 `loki-logging.md` 模板 B。简版：

```bash
# 在被监控机器
docker run -d --name promtail \
    -v /var/log:/var/log \
    -v ./promtail-config.yml:/etc/promtail/config.yml \
    grafana/promtail:latest \
    -config.file=/etc/promtail/config.yml
```

`promtail-config.yml`:

```yaml
clients:
  - url: http://<monitoring-server-ip>:3100/loki/api/v1/push
scrape_configs:
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          host: ${HOSTNAME}
          __path__: /var/log/*.log
```

### 模板 D — 加额外 scrape target

`prometheus.yml` 加：

```yaml
scrape_configs:
  - job_name: my-app
    static_configs:
      - targets: ['app1.internal:9100', 'app2.internal:9100']
        labels:
          env: production

  - job_name: blackbox
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
        replacement: blackbox-exporter:9115
```

热重载（不重启 Prom）：

```bash
docker exec prometheus kill -HUP 1
# 或
curl -X POST http://127.0.0.1:9090/-/reload
```

### 模板 E — 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name grafana.example.com;
    ssl_certificate /etc/letsencrypt/live/grafana.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grafana.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/live/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 模板 F — 加 Alertmanager（告警分发）

`docker-compose.yml` 加：

```yaml
services:
  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    restart: unless-stopped
    volumes:
      - {{ monitoring_data_dir }}/alertmanager-config:/etc/alertmanager
    ports:
      - "127.0.0.1:9093:9093"
    networks: [monitoring]
```

`alertmanager-config/alertmanager.yml`:

```yaml
route:
  receiver: 'slack'

receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#alerts'
```

`prometheus.yml` 加：

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alerts.yml'
```

`prometheus-config/alerts.yml`:

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
```

### 模板 G — 备份

```bash
# 1. 停服务
cd /opt/monitoring
docker compose stop

# 2. tar
sudo tar czf /backup/monitoring-$(date +%F).tar.gz -C /opt monitoring

# 3. 启
docker compose start
```

## 关键参数调优速查

### 资源占用

| 监控目标 | RAM | CPU | 磁盘（30 天） |
|---|---|---|---|
| 1 台机器 | 1.5 GB | 1 vCPU | 5 GB |
| 5 台 | 3 GB | 2 vCPU | 20 GB |
| 20 台 | 8 GB | 4 vCPU | 100 GB |

### Prometheus retention

```yaml
command:
  - --storage.tsdb.retention.time=30d
  - --storage.tsdb.retention.size=50GB
```

### Loki retention

```yaml
limits_config:
  retention_period: 168h         # 7 天（默认）
```

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`prometheus-monitoring` / `grafana-dashboard` / `loki-logging`** — 单独 Playbook（本 combo 是 docker 版组合）
- **`netdata-monitoring`** — 替代品（更轻但功能少）
- **`zabbix-monitoring`** — 不同体系（push 模式）

## 排错

### 容器启动失败

```bash
cd /opt/monitoring
docker compose logs <service>           # 看具体错
docker compose ps
```

### Grafana 显示 No data

```bash
# 1. 数据源生效？
# UI → Connections → Data sources → 看 Prometheus 状态

# 2. Prometheus 在抓取？
# 浏览器 http://server:9090/targets

# 3. 容器间网络
docker compose exec grafana wget -O- http://prometheus:9090/api/v1/query?query=up
```

### node_exporter 没数据

```bash
# 容器需要挂 /proc /sys /
docker inspect node-exporter | grep -A5 Mounts
```

### 磁盘吃满

```bash
docker system df
du -sh /opt/monitoring/*

# 调小 retention
# 改 docker-compose.yml + restart
```

## 验证

```bash
docker ps | grep -E '(prometheus|grafana|loki|node-exporter|cadvisor)'

curl http://127.0.0.1:9090/-/healthy
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3100/ready

# 看抓的 target
curl -s http://127.0.0.1:9090/api/v1/targets | jq '.data.activeTargets[] | .labels.job'
```

## 多次运行

`installMode: skip-existing`。compose.yml + 配置文件每次重写，**所有数据保留**。

## ⚠️ 敏感性

**review** — 监控数据含**业务运行细节**（请求量 / 错误率 / 内部服务清单）。

强制：

1. 公网必须 HTTPS + auth
2. Prometheus / Loki 端口仅 127.0.0.1，反代 + IP 白名单
3. cadvisor 用 `privileged: true` —— 必要但要监控启动
4. Grafana admin 强密码

## 隐私说明

- 默认 telemetry 全关（Grafana / Prometheus / Loki / cadvisor 都默认不发）
- 数据全部本地存储
- Loki 日志可能含 PII / 密码（应用日志的事，监控栈不脱敏）
- cadvisor 暴露**所有容器**信息（环境变量名 / image / 资源用量）—— 仅本机访问
