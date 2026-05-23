# Netdata 实时监控

Netdata 是**开箱即用**的单机监控——装上就有 600+ 指标和漂亮的实时仪表盘，**无需配置数据源、无需画 dashboard、无需 Prometheus**。每秒粒度，浏览器打开就能看。

**适合**：服务器突然慢了想立刻知道哪里有问题；单机 / 小规模部署；不想搭 Prometheus + Grafana 全栈。

**不适合**：多机集群中央监控（Netdata 也支持 cloud 模式但定位不同）；长期历史数据 + 复杂告警；与现有 PromQL/Grafana 体系集成。

## 你将得到什么

- ✅ Netdata 最新 stable（kickstart 脚本装到 `/opt/netdata`）
- ✅ Web UI 在 `http://<host>:19999`
- ✅ 600+ 内置 collector：CPU / 内存 / 磁盘 / 网络 / 进程 / Docker / nginx / postgres / redis / mysql / k8s / 系统调用 / IRQ / ZFS / ...
- ✅ ML-based anomaly detection 内置（自动识别异常点，无需写规则）
- ✅ Telemetry 已禁用（kickstart `--disable-telemetry`）
- ✅ 默认 dbengine 模式（自动 downsample 到三层存储，保留几个月只占几 GB）

## 表单字段说明

### `bind_address`

> ⚠️ Netdata **没有内置用户认证**。`0.0.0.0` 暴露公网 = 系统指标全公开（含进程列表、网络连接、磁盘使用、可能含 host 名 / 用户名）。

| 值 | 适用 |
|---|---|
| `127.0.0.1` 或 `localhost`（**默认**） | nginx + basic auth 反代场景 |
| `10.0.0.0/8` 或具体内网 IP | 内网部署 |
| `*` 或 `0.0.0.0` | **必须**配合 nginx + auth + 防火墙 |

### `history_seconds` / 内存中保留时长

dbengine 三层存储，本字段控制 tier0（每秒粒度）保留时长。默认 1 小时（约 200 MB 内存，依监控指标数）。tier1（分钟）和 tier2（小时）按比例自动 downsampling。

### `update_every`

采集频率（秒）。默认 1 秒。

| 值 | 影响 |
|---|---|
| 1 | 默认；CPU 占用 1-3%（弱机可能更高） |
| 5 | 弱 VPS / 低优先级机器 |
| 10 | 轻量监控 |

## 配置文件 / 目录速查

```
/opt/netdata/                              # 主安装目录（不是发行版包，独立树）
├── usr/sbin/netdata                       # 主二进制
├── usr/libexec/netdata/                   # collector 插件
└── etc/netdata/                           # 配置软链到下面

/etc/netdata/                              # ← 主配置目录
├── netdata.conf                           # ← 主配置
├── stream.conf                            # streaming（多机汇聚）配置
├── go.d/                                  # Go 写的 collector 配置（nginx / postgres / etc.）
│   ├── nginx.conf
│   ├── postgres.conf
│   └── ...
├── python.d/                              # Python collector
├── charts.d/                              # Bash collector
├── health.d/                              # 告警规则
├── apps_groups.conf                       # 进程分组
└── claim.conf                             # Netdata Cloud 接入

# 数据 / 状态
/var/cache/netdata/                        # dbengine 数据（按指标 + 时间分块）
/var/lib/netdata/                          # 配置缓存 / Cloud claim 状态
/var/log/netdata/                          # 日志
├── access.log
├── error.log
└── collector.log

# systemd
/usr/lib/systemd/system/netdata.service   # 服务单元
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | kickstart 脚本（`get.netdata.cloud`） | 相同 |
| 二进制位置 | `/opt/netdata/usr/sbin/netdata` | 相同 |
| 服务名 | `netdata` | `netdata` |
| 默认端口 | `19999` | `19999` |
| Web 静态资源 | `/opt/netdata/usr/share/netdata/web/` | 相同 |

## 常见配置模板

### 模板 A — 调整核心配置 `/etc/netdata/netdata.conf`

```ini
# 全局
[global]
    update every = 1                        # 1 秒采集（默认）
    memory mode = dbengine                  # 默认就是
    history = 86400                         # 内存中保留 1 天
    process scheduling policy = idle        # 低优先级，避免影响业务

# Web
[web]
    bind to = 127.0.0.1:19999
    allow connections from = localhost 10.0.0.0/8
    allow dashboard from = localhost 10.0.0.0/8
    allow streaming from = *
    web files owner = root
    web files group = netdata
    disable web logging = no

# DB engine（多 tier 长期存储）
[db]
    mode = dbengine
    storage tiers = 3
    update every = 1                         # tier 0
    dbengine multihost disk space MB = 1024  # tier 0 大小（默认 256MB）
    dbengine page cache size MB = 128         # 内存缓存
    dbengine tier 1 update every iterations = 60
    dbengine tier 1 multihost disk space MB = 384
    dbengine tier 2 update every iterations = 60
    dbengine tier 2 multihost disk space MB = 128

# 健康监控（告警）
[health]
    enabled = yes
    log path = /var/log/netdata/health.log

# 限流（避免 Netdata 自身吃 CPU）
[plugin:proc]
    update every = 1
[plugin:diskspace]
    update every = 30
```

应用：`sudo systemctl restart netdata` 或 `sudo netdatacli reload-health`。

### 模板 B — Nginx 反代 + Basic Auth（生产必备）

```nginx
upstream netdata_backend {
    server 127.0.0.1:19999;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name netdata.example.com;

    ssl_certificate /etc/letsencrypt/live/netdata.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/netdata.example.com/privkey.pem;

    auth_basic "Netdata";
    auth_basic_user_file /etc/nginx/.htpasswd-netdata;

    location / {
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Server $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://netdata_backend;
        proxy_http_version 1.1;
        proxy_pass_request_headers on;
        proxy_set_header Connection "keep-alive";
        proxy_store off;

        # WebSocket（实时图表）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    gzip on;
    gzip_proxied any;
    gzip_types *;
}
```

```bash
sudo apt-get install apache2-utils                  # Ubuntu
sudo dnf install httpd-tools                         # RHEL
sudo htpasswd -c /etc/nginx/.htpasswd-netdata admin  # 提示输入密码

sudo nginx -t && sudo systemctl reload nginx
```

### 模板 C — 启用 Nginx / PostgreSQL / Redis 监控

#### Nginx

需要先在 nginx 启用 stub_status：

```nginx
# /etc/nginx/conf.d/status.conf
server {
    listen 127.0.0.1:80 default_server;
    location /stub_status {
        stub_status;
        allow 127.0.0.1;
        deny all;
    }
}
```

`/etc/netdata/go.d/nginx.conf`：

```yaml
jobs:
  - name: local
    url: http://127.0.0.1/stub_status
```

#### PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER netdata; GRANT pg_monitor TO netdata;"
```

`/etc/netdata/go.d/postgres.conf`：

```yaml
jobs:
  - name: local
    dsn: 'postgres://netdata@127.0.0.1:5432/postgres?sslmode=disable'
```

#### Redis

```bash
# 如有密码，配 requirepass
```

`/etc/netdata/go.d/redis.conf`：

```yaml
jobs:
  - name: local
    address: redis://127.0.0.1:6379
    # password: <redis-pass>
```

应用：`sudo systemctl restart netdata`。

### 模板 D — 多机汇聚（Streaming / Parent-Child）

每台机器跑 Netdata 但只是 child，把数据流给 parent 节点统一看。

#### Parent（中央节点）

`/etc/netdata/stream.conf`：

```ini
[<API_KEY_GENERATED_VIA_uuidgen>]
    enabled = yes
    default history = 86400
    default memory mode = dbengine
    health enabled by default = auto
    allow from = 10.0.0.0/8 192.168.0.0/16
```

#### Child（被监控节点）

`/etc/netdata/stream.conf`：

```ini
[stream]
    enabled = yes
    destination = parent.example.com:19999
    api key = <SAME_API_KEY>
    timeout seconds = 60
```

Parent 节点 web UI 里能看到所有 child 的指标，child 自己也能本地看。

### 模板 E — 加自定义告警

`/etc/netdata/health.d/custom-disk.conf`：

```yaml
template: disk_space_critical
   on: disk.space
class: Utilization
 type: System
component: Disk
 hosts: *
families: *
   calc: $used * 100 / ($avail + $used)
  units: %
  every: 30s
   warn: $this > 80
   crit: $this > 95
  delay: down 15m multiplier 1.5 max 1h
   info: disk space usage
     to: sysadmin
```

通知通道在 `/etc/netdata/health_alarm_notify.conf` 配（slack / discord / email / pagerduty / webhook）。

## 关键参数调优速查

### 资源占用

| 部署 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 单机默认 dbengine（300 指标） | 200 MB | 1-3% | 1 GB |
| 单机重度（800 指标，开 Anomaly） | 400 MB | 3-5% | 3 GB |
| Parent 收 5 个 child | 1 GB | 5-10% | 8 GB |
| Parent 收 50 个 child | 4 GB | 20% | 50 GB |

### Anomaly Detection

```ini
[ml]
    enabled = yes
    minimum num samples to learn = 900       # 15 分钟训练数据起步
    num samples to train = 14400             # 4 小时滚动训练窗口
    num samples to diff = 1
    delay = 5
```

CPU 弱的机器关掉：`enabled = no`。

### Cloud 模式（多机统一面板，免费）

```bash
# 在 https://app.netdata.cloud 注册账号
# UI 给 claim 命令，类似：
sudo netdata-claim.sh -token=YOUR_TOKEN -rooms=YOUR_ROOM
sudo systemctl restart netdata
```

之后所有 claim 过的节点在 Cloud UI 里统一查看。Cloud 是 SaaS（数据走 Netdata 自家服务器）——介意隐私就别 claim，Netdata 不强制。

## 跨发行版兼容

kickstart 脚本（`get.netdata.cloud`）支持：

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| **Anolis 9** | ✅（与 RHEL 9 兼容） |
| Alpine | ⚠️（用 docker `netdata/netdata` 镜像更稳） |
| ARM 64 / ARM 32 | ✅（自动选） |

EnvForge Playbook 调用官方 kickstart 脚本，自动适配。

## 与其它 catalog 项的配合

- **`prometheus-monitoring`** — Netdata 可暴露 `/api/v1/allmetrics?format=prometheus`，让 Prometheus scrape；也能反向（Netdata scrape Prometheus 数据源）
- **`grafana-dashboard`** — Grafana 可加 Netdata 数据源（用 simple-json-datasource 插件）
- **`nginx-web-service`** — 反代 + auth（模板 B）
- **`certbot-ssl`** — HTTPS 证书
- **`postgres-profile` / `mysql-server` / `redis-server`** — Netdata 自动检测并采集数据库指标（模板 C）

## 排错

### kickstart 脚本失败

```bash
# 国内服务器 get.netdata.cloud 偶发慢
# 手动从 GitHub release 装
VER=v1.46.3
curl -L "https://github.com/netdata/netdata/releases/download/${VER}/netdata-${VER#v}.tar.gz" | sudo tar -xz -C /opt/
cd /opt/netdata-${VER#v}
sudo ./netdata-installer.sh --dont-wait --disable-telemetry
```

### 服务起来但 19999 不响应

```bash
# 检查 bind_address
sudo grep "bind to" /etc/netdata/netdata.conf

# 检查防火墙
sudo ufw allow 19999                # 仅在内网用时
sudo firewall-cmd --add-port=19999/tcp --permanent  # RHEL

# 看日志
sudo tail -50 /var/log/netdata/error.log
sudo journalctl -u netdata -n 50
```

### CPU 占用 5%+（小机器）

```bash
# 1. 降采样间隔
sudo sed -i 's/update every = 1/update every = 5/' /etc/netdata/netdata.conf

# 2. 关 ML
echo -e '[ml]\n    enabled = no' | sudo tee -a /etc/netdata/netdata.conf

# 3. 关用不上的 collector
sudo /opt/netdata/usr/libexec/netdata/plugins.d/python.d.plugin debug --modules    # 看哪些跑着

sudo systemctl restart netdata
```

### Web UI 显示 No data

```bash
# 检查 dbengine
ls /var/cache/netdata/         # 应有文件

# 重置 dbengine（会丢历史）
sudo systemctl stop netdata
sudo rm -rf /var/cache/netdata/*
sudo systemctl start netdata
```

### Anomaly 检测一直 "training"

需要至少 15 分钟数据积累。等等就好。

### Streaming child 连不上 parent

```bash
# child 上看
sudo journalctl -u netdata | grep -i stream

# 常见原因
# 1. API key 不一致
# 2. parent 的 19999 没对内网开
# 3. allow from 不含 child IP
```

### 自定义 collector 不工作

```bash
# 调试某个 collector
sudo -u netdata /opt/netdata/usr/libexec/netdata/plugins.d/go.d.plugin -d -m nginx
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active netdata

# 2. 端口在听
sudo ss -tlnp | grep 19999

# 3. API
curl -fsS http://127.0.0.1:19999/api/v1/info | head
curl -fsS http://127.0.0.1:19999/api/v1/charts | jq '.charts | keys | length'

# 4. 看采集到的指标数
curl -fsS http://127.0.0.1:19999/api/v1/allmetrics?format=prometheus | wc -l

# 5. 健康（告警）状态
curl -fsS http://127.0.0.1:19999/api/v1/alarms?all
```

## 多次运行

`installMode: skip-existing`。kickstart 脚本有 `creates: /opt/netdata/usr/sbin/netdata` 守卫——已装跳过。`netdata.conf` 第一次写入；重跑只刷 `bind to` / `history` / `update every` 表单字段，**不会**覆盖你手动加的 `[plugin:*]` 配置。

要升级 Netdata：

```bash
sudo /opt/netdata/usr/libexec/netdata/netdata-updater.sh
```

或重跑 kickstart（带 `--reinstall`）。

## ⚠️ 敏感性

**safe** — 指标采集是只读，不动系统配置。但 Web UI **没认证**——风险等级取决于 `bind_address`：

- `127.0.0.1`：safe（仅本机访问）
- 内网 IP / VPN：safe-review
- `0.0.0.0` 公网：privileged（必须配反代 + auth）

## 隐私说明

- Telemetry 已禁用（本 Playbook 启用 `--disable-telemetry`）
- 监控数据全部本地存储（`/var/cache/netdata/`），**不上传任何东西**
- **Cloud 模式需主动 claim**——不 claim 不发数据出去
- 如果 claim 了，所有指标会经 Netdata Cloud（SaaS）转发——介意隐私就别 claim
- Web UI 访问日志默认开启（`/var/log/netdata/access.log`），含访问 IP
- 自定义 collector 拉数据库 / nginx status 时会用配置的凭据，凭据存在 `/etc/netdata/go.d/*.conf`（权限 0640 root:netdata）
