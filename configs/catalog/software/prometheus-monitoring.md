# Prometheus 监控

## 概述

Prometheus 是云原生计算基金会（CNCF）的开源监控和告警系统。它采用拉取模式采集时序指标数据，配合 Node Exporter 可以监控服务器的 CPU、内存、磁盘、网络等系统指标。

## 安装内容

- `prometheus` — 监控服务端（默认端口 9090）
- `prometheus-node-exporter` — 系统指标采集器（默认端口 9100）
- 配置文件：`/etc/prometheus/prometheus.yml`
- 数据目录：`/var/lib/prometheus/`

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y prometheus prometheus-node-exporter
sudo systemctl enable prometheus
sudo systemctl start prometheus
```

## 安装后配置

### 1. 基础配置

编辑 `/etc/prometheus/prometheus.yml`：

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### 2. 添加告警规则（可选）

创建 `/etc/prometheus/alerts.yml`：

```yaml
groups:
  - name: system
    rules:
      - alert: HighCPU
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CPU 使用率超过 80%"

      - alert: HighMemory
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "内存使用率超过 90%"
```

### 3. 数据保留策略

```bash
# 默认保留 15 天，可通过启动参数修改
# 编辑 /etc/default/prometheus
ARGS="--storage.tsdb.retention.time=30d"
```

### 4. 重启服务

```bash
sudo systemctl restart prometheus
```

## 验证安装

```bash
sudo systemctl status prometheus
curl http://localhost:9090/-/healthy
curl http://localhost:9100/metrics | head -20
```

## 访问 Web UI

浏览器访问：`http://your-server-ip:9090`

## 隐私说明

Prometheus 配置中的目标地址可能包含内部网络信息。指标数据本身通常不包含敏感信息。
