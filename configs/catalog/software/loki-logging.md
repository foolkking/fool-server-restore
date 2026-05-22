# Grafana Loki 日志聚合

Loki 是 "Prometheus for logs"——只索引日志的元数据（label），不索引内容。
比 ELK (Elasticsearch + Logstash + Kibana) 便宜 10 倍，但**只能按 label 过滤**，
全文搜索能力不如 Elasticsearch。

适合：集中收集多机日志、按服务 / level / host 过滤、Grafana 里看图。
不适合：深度全文搜索、复杂 SQL-like 查询、合规审计。

## 你将得到什么

- ✅ Loki 3.x 二进制装到 `/usr/local/bin/loki`
- ✅ 配置文件 `/etc/loki/loki.yml`（filesystem 单机模式，TSDB 索引）
- ✅ 数据目录 `/var/lib/loki`（chunks + index + WAL）
- ✅ systemd 服务，按表单端口/保留时长启动

**Loki 只是 server 端**——还需要 promtail / alloy 之类的 agent 把日志推过来。

## 表单字段说明

### HTTP 端口

默认 3100。Grafana 添加 Loki 数据源 + Promtail 推日志都用这个端口。

### 监听地址

127.0.0.1 适合 Grafana 同机部署。要从其它机器收日志的话，改 0.0.0.0 + 防火墙限源 IP。

### 保留时长

格式 `<数字>h`（小时）。compactor 每两小时跑一次清理。

## 安装后

### 配 Grafana 数据源

Grafana → Connections → Data sources → Add → Loki
URL: `http://localhost:3100`
Save & test → 显示 "Data source connected"。

### 装 Promtail（日志推送 agent）— 在每台要收日志的机器上

```bash
# 在被监控的机器上
VER=3.2.1
curl -fsSL "https://github.com/grafana/loki/releases/download/v${VER}/promtail-linux-amd64.zip" -o /tmp/promtail.zip
sudo unzip -o /tmp/promtail.zip -d /usr/local/bin
sudo mv /usr/local/bin/promtail-linux-amd64 /usr/local/bin/promtail
sudo chmod +x /usr/local/bin/promtail

sudo tee /etc/promtail.yml > /dev/null <<'EOF'
server:
  http_listen_port: 9080

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://YOUR-LOKI-SERVER:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          host: $(hostname)
          __path__: /var/log/*log

  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          host: $(hostname)
          __path__: /var/log/nginx/*.log
EOF

# 创建 systemd unit, start
```

### 在 Grafana 里查询

打开 Grafana → Explore → 选 Loki 数据源：
```logql
{job="nginx"}              # 所有 nginx 日志
{job="nginx"} |= "error"   # 含 "error" 字符串的
{host="web1"} | json | level="warn"   # JSON 日志，level 为 warn 的
rate({job="nginx"} |~ "5\\d\\d" [5m])    # 5xx 错误率
```

### 直接 push 日志（不用 promtail）

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"streams":[{"stream":{"job":"manual"},"values":[["'"$(date +%s%N)"'","hello world"]]}]}' \
  http://localhost:3100/loki/api/v1/push
```

## ⚠️ 敏感性

**review** — 日志可能含 PII / 密码等敏感信息。Loki 没认证，0.0.0.0 暴露公网会被人随便查日志。务必 nginx + auth 反代。

## 验证

```bash
systemctl status loki --no-pager
curl http://localhost:3100/ready
curl http://localhost:3100/metrics | head
```

## 排错

- **`failed to enable retention deletes`** — 旧版本 schema 配置不支持，确保 `delete_request_store: filesystem` 已加（Playbook 已加）。
- **磁盘满了 + 没自动清** — `compactor.retention_enabled: true` 没生效，看日志 `journalctl -u loki | grep compactor`。
- **Grafana 报 502** — Loki 启动慢 / `bind_address` 是 127.0.0.1 但 Grafana 在另一台机器（要么 Grafana 同机，要么改 0.0.0.0）。
- **跨发行版**：用二进制安装，无包管理器差异。

## 多次运行

`installMode: skip-existing`。已下载二进制不重下，loki.yml 每次重写。

## 隐私说明

- 已禁用 Loki 的 anonymous usage report（`analytics.reporting_enabled: false`）。
- 日志数据全部本地存储。
