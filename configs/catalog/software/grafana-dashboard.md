# Grafana 可视化面板

## 概述

Grafana 是开源的数据可视化和监控平台，支持从 Prometheus、InfluxDB、Elasticsearch 等多种数据源创建丰富的仪表盘。是服务器运维和应用监控的标准可视化工具。

## 安装内容

- `grafana` — Grafana 服务端（默认端口 3000）
- 配置文件：`/etc/grafana/grafana.ini`
- 数据目录：`/var/lib/grafana/`
- 日志目录：`/var/log/grafana/`

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y apt-transport-https software-properties-common
# 添加 Grafana 官方仓库
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update -qq
sudo apt-get install -y grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

> 注意：如果 apt 仓库中已有 grafana 包，可直接 `sudo apt-get install -y grafana`。

## 安装后配置

### 1. 首次登录

- 访问：`http://your-server-ip:3000`
- 默认用户名：`admin`
- 默认密码：`admin`（首次登录后强制修改）

### 2. 添加 Prometheus 数据源

1. 登录 Grafana → Configuration → Data Sources
2. 点击 "Add data source"
3. 选择 "Prometheus"
4. URL 填写：`http://localhost:9090`
5. 点击 "Save & Test"

### 3. 导入常用仪表盘

推荐仪表盘 ID（从 grafana.com 导入）：
- **1860** — Node Exporter Full（系统监控全面板）
- **3662** — Prometheus 2.0 Overview
- **11074** — Node Exporter for Prometheus

导入方法：Dashboards → Import → 输入 ID → Load

### 4. 修改监听端口（可选）

编辑 `/etc/grafana/grafana.ini`：

```ini
[server]
http_port = 3000
```

### 5. 启用 HTTPS（生产环境推荐）

```ini
[server]
protocol = https
cert_file = /etc/grafana/ssl/grafana.crt
cert_key = /etc/grafana/ssl/grafana.key
```

## 验证安装

```bash
sudo systemctl status grafana-server
curl -s http://localhost:3000/api/health
```

## 隐私说明

Grafana 的管理员密码和数据源连接信息为敏感数据，不会被自动同步。
