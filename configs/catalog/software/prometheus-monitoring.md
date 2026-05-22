# Prometheus 监控

Prometheus 是云原生的指标监控系统：定期 scrape 各种 exporter 拿指标，存到本地 TSDB，
提供 PromQL 查询语言。配 Grafana 一起用最经典。

## 你将得到什么

- ✅ Prometheus 2.55.x 二进制装到 `/usr/local/bin/prometheus`
- ✅ promtool 也装上（验证配置 / 测试规则）
- ✅ 专用 prometheus 系统用户
- ✅ 配置 `/etc/prometheus/prometheus.yml`（一个示范 scrape job）
- ✅ 数据目录 `/var/lib/prometheus`
- ✅ systemd 单元，按表单的端口/保留时长/抓取间隔启动

## 表单字段说明

### HTTP 端口

默认 9090，是 Prometheus 的事实标准端口。

### 监听地址

**Prometheus 自身没有用户认证机制**——0.0.0.0 暴露公网就是把所有监控数据全公开。
默认 127.0.0.1，前面挂 nginx + basic auth 之后再说远程访问。

### 数据保留时长

每 1000 时间序列每天大约 1MB（取决于 churn）。算下来：
- 默认 15d：~ 几百 MB
- 90d：~ 几 GB
- 365d：~ 数十 GB

更长期归档应该用 Thanos / VictoriaMetrics / Cortex。

### 抓取间隔

15 秒是行业默认。改 5 秒会让磁盘占用 3x，改 1 分钟太粗会错过短期 spike。

## 安装后

### 装 Node Exporter（本机系统指标）

`prometheus.yml` 已经包含一个 `localhost:9100` 的 scrape job。在 EnvForge 的 catalog 里搜
"node_exporter"（如果有）或手动装：

```bash
# 二进制方式
VER=1.8.2
curl -fsSL "https://github.com/prometheus/node_exporter/releases/download/v${VER}/node_exporter-${VER}.linux-amd64.tar.gz" | sudo tar -xz -C /usr/local/bin --strip-components=1 node_exporter-${VER}.linux-amd64/node_exporter
# 创建 systemd unit, 启动监听 9100
```

### 添加更多 scrape job

编辑 `/etc/prometheus/prometheus.yml`：
```yaml
scrape_configs:
  - job_name: my-app
    static_configs:
      - targets: ['127.0.0.1:8000']
        labels:
          env: production

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
        replacement: 127.0.0.1:9115  # blackbox_exporter
```

校验 + 重载：
```bash
sudo promtool check config /etc/prometheus/prometheus.yml
sudo systemctl reload prometheus
```

### 看哪些 target 在 UP

打开 `http://localhost:9090/targets`，所有 scrape 的状态一目了然。DOWN 的 target 鼠标悬停看错误原因。

### 查询数据（PromQL）

打开 `http://localhost:9090/graph`：
```promql
# CPU 使用率（去掉 idle）
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# 内存使用率
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# HTTP 5xx 错误率
sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

### 配 Grafana 数据源

Grafana → Connections → Data sources → Add → Prometheus，URL 填 `http://localhost:9090`，Save & test。

### 告警规则（按需）

```yaml
# /etc/prometheus/alerts.yml
groups:
  - name: instance
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.instance }} is down"
```

`prometheus.yml` 里 include：
```yaml
rule_files:
  - alerts.yml
```

实际发告警还需要 Alertmanager（独立服务）。

## ⚠️ 敏感性

**review** — Prometheus 会 scrape 各种敏感指标（业务量、错误率、内部服务名）。务必：
1. 不要 0.0.0.0 直接公网暴露
2. nginx + basic auth 反向代理
3. exporter 也要有访问控制（node_exporter 默认 0.0.0.0 也是问题）

## 验证

```bash
systemctl status prometheus --no-pager
curl http://localhost:9090/-/healthy
sudo promtool check config /etc/prometheus/prometheus.yml
```

## 排错

- **服务起不来 + `permission denied: /var/lib/prometheus`** — 数据目录所有者不是 prometheus，重跑 Playbook 或 `sudo chown -R prometheus:prometheus /var/lib/prometheus`。
- **`/targets` 上某个 job DOWN** — 该端口没服务在监听，或防火墙挡了，或 metrics 路径错。
- **跨发行版**：用二进制安装，无包管理器差异。

## 多次运行

`installMode: skip-existing`。已下载二进制不会重下，prometheus.yml 每次重写——你手动加的 scrape_configs 会被覆盖。建议 prometheus.yml 拆分：基础部分 EnvForge 管，业务部分放 `/etc/prometheus/conf.d/*.yml` 后用 `file_sd_configs` 引用。

## 隐私说明

- 监控数据本地存储，不上传不同步。
- prometheus.yml 不含密码（一般），但 scrape_configs 的 basic_auth 段可能含。
