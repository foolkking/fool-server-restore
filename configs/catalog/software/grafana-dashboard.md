# Grafana 可视化面板

Grafana 是开源的监控可视化平台——把 Prometheus / Loki / InfluxDB / MySQL / Elasticsearch 等几十种数据源拼装成漂亮的仪表盘。EnvForge 通过 Grafana Labs 官方仓库装 Grafana 11+（比发行版自带版本新很多）。**Prometheus + Grafana** 是行业事实标准的监控可视化栈。

## 你将得到什么

- 📦 **grafana**（来自 `apt.grafana.com` / `rpm.grafana.com` 官方仓库，11.x 系列）
- ✅ Web UI 在 `http://<host>:3000`（默认仅 127.0.0.1）
- ✅ admin 账号密码已设（**仅首次启动初始化数据库时生效**）
- ✅ 服务自动启动 + 开机自启
- ✅ 数据存储默认 SQLite（小型部署够用，~100 dashboard 无压力）
- ✅ 核心日志输出到 systemd journal + `/var/log/grafana/grafana.log`

## 表单字段说明

### `admin_user` / `admin_password`

写到 `/etc/grafana/grafana.ini` 的 `[security]` 段。

> ⚠️ **关键限制**：admin_password 只在 Grafana **第一次启动初始化数据库时**生效。如果之前已经初始化过，密码不会被覆盖。
>
> **重置已存在数据库的 admin 密码**：
> ```bash
> sudo grafana-cli admin reset-admin-password 新密码
> ```

留空 = EnvForge 自动生成 24 位强密码（运行结束日志显示一次）。

### `http_port`

默认 3000。生产推荐挂 nginx/Traefik 后用 443，3000 仅本机绑定。

### `domain`

仅当通过反向代理暴露时填上。Grafana 用它生成绝对 URL（OAuth 回调 / 邮件链接 / share link）。

### `bind_address`

| 值 | 适用 |
|---|---|
| `127.0.0.1`（默认） | 反代场景，安全 |
| `0.0.0.0` | 直接公网访问（**不推荐**，至少要先改强密码 + IP 白名单） |

## 配置文件 / 目录速查

```
/etc/grafana/
├── grafana.ini                          # ← 主配置（EnvForge 写入）
├── ldap.toml                            # LDAP 集成（可选）
├── provisioning/                        # ← Provisioning（声明式管理）
│   ├── datasources/                     # 自动添加数据源
│   ├── dashboards/                      # 自动加载 dashboard JSON
│   ├── alerting/                        # 告警规则
│   ├── notifiers/                       # 告警通道
│   └── plugins/                         # 插件配置
└── certs/                               # TLS 证书（如启用）

# 数据
/var/lib/grafana/
├── grafana.db                           # SQLite 主数据库（仪表盘 / 用户 / 数据源凭据）
├── plugins/                             # grafana-cli 装的插件
├── alerting/                            # 告警状态
├── csv/                                 # 报表导出
├── png/                                 # 图片渲染
└── dashboards/                          # 文件型 dashboard

# 日志
/var/log/grafana/grafana.log             # 主日志（按天 rotate）

# 用户级（grafana-cli config 可改）
/usr/share/grafana/                      # 安装目录（不要改）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `grafana`（来自 grafana.com 仓库） | `grafana`（来自 grafana.com 仓库） |
| 仓库源 | `apt.grafana.com` | `rpm.grafana.com` |
| 服务名 | `grafana-server` | `grafana-server` |
| 数据目录 | `/var/lib/grafana` | 相同 |
| 配置文件 | `/etc/grafana/grafana.ini` | 相同 |
| 运行用户 | `grafana` | 相同 |

## 常见配置模板

### 模板 A — 推荐 `/etc/grafana/grafana.ini` 关键调优

```ini
[server]
http_port = 3000
http_addr = 127.0.0.1
domain = grafana.example.com
root_url = https://grafana.example.com/
serve_from_sub_path = false              # 反代到 / 子路径时改 true
read_timeout = 30s

[security]
admin_user = admin
admin_password = <strong-pass>
secret_key = <openssl rand -hex 32>      # 用于加密数据源 password 等
disable_initial_admin_creation = false   # 首次仍创建 admin
disable_gravatar = true                  # 不联网取头像（隐私 / 内网）
cookie_secure = true                     # HTTPS 反代后开
cookie_samesite = lax
strict_transport_security = true
strict_transport_security_max_age_seconds = 31536000

[auth.anonymous]
enabled = false                          # 默认禁用
# org_role = Viewer                       # 启用时控制只读角色

[users]
allow_sign_up = false                    # 不允许自助注册
auto_assign_org_role = Viewer
default_theme = dark

[log]
mode = console file
level = info

[analytics]
reporting_enabled = false                # 不发遥测
check_for_updates = false                # 不检查更新（避免外网请求）
check_for_plugin_updates = false

[dashboards]
versions_to_keep = 20

[unified_alerting]
enabled = true
execute_alerts = true

[smtp]
enabled = true
host = smtp.example.com:587
user = grafana@example.com
password = <smtp-pass>
from_address = grafana@example.com
from_name = Grafana
startTLS_policy = MandatoryStartTLS

# 用 Postgres / MySQL 替代 SQLite（多实例 / 大型部署）
# [database]
# type = postgres
# host = 127.0.0.1:5432
# name = grafana
# user = grafana
# password = <db-pass>
# ssl_mode = disable
```

应用：`sudo systemctl restart grafana-server`。

### 模板 B — Provisioning 自动添加 Prometheus 数据源

`/etc/grafana/provisioning/datasources/prometheus.yml`：

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: true
    jsonData:
      httpMethod: POST
      timeInterval: 15s
      manageAlerts: true
      prometheusType: Prometheus
      prometheusVersion: 2.55.0

  - name: Loki
    type: loki
    access: proxy
    url: http://localhost:3100
    editable: true
    jsonData:
      maxLines: 1000

  - name: PostgreSQL Production
    type: postgres
    url: localhost:5432
    user: grafana_reader
    secureJsonData:
      password: <db-pass>
    jsonData:
      database: app_prod
      sslmode: disable
      maxOpenConns: 10
      maxIdleConns: 5
      connMaxLifetime: 14400
      timescaledb: false
```

应用：`sudo systemctl restart grafana-server`。

### 模板 C — Provisioning 自动加载 Dashboard

`/etc/grafana/provisioning/dashboards/main.yml`：

```yaml
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    folderUid: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

把 dashboard JSON 放到 `/var/lib/grafana/dashboards/`，重启后自动出现。

### 模板 D — Nginx 反代 + HTTPS

```nginx
upstream grafana { server 127.0.0.1:3000; }

server {
    listen 443 ssl http2;
    server_name grafana.example.com;

    ssl_certificate /etc/letsencrypt/live/grafana.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grafana.example.com/privkey.pem;

    # 通用反代
    location / {
        proxy_pass         http://grafana;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # WebSocket（实时仪表盘 / Grafana Live）
    location /api/live/ {
        proxy_pass         http://grafana;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400;
    }
}
```

`grafana.ini` 同步改：

```ini
[server]
domain = grafana.example.com
root_url = https://grafana.example.com/
```

### 模板 E — 装常用插件

```bash
# 列已装
grafana-cli plugins ls

# 装
sudo grafana-cli plugins install grafana-clock-panel
sudo grafana-cli plugins install grafana-piechart-panel
sudo grafana-cli plugins install grafana-worldmap-panel
sudo grafana-cli plugins install grafana-polystat-panel

# 重启生效
sudo systemctl restart grafana-server
```

国内服务器装插件慢，可设镜像：

```ini
# grafana.ini
[plugins]
plugin_admin_enabled = true
```

或手动从 `https://grafana.com/grafana/plugins/<id>/?tab=installation` 下载 zip 解压到 `/var/lib/grafana/plugins/`。

## 关键参数调优速查

### 数据库后端选择

| 后端 | 适用 | 注 |
|---|---|---|
| SQLite（默认） | 单机 < 100 dashboard，< 50 users | 文件锁，备份只需复制 grafana.db |
| MySQL/MariaDB | 多用户 / HA | 推荐 MySQL 8.0+ / MariaDB 10.11+ |
| PostgreSQL | 多用户 / 企业 | 推荐 PG 15+ |

切到 PG 步骤：

```bash
# 1. 创建数据库
sudo -u postgres createuser grafana -P
sudo -u postgres createdb -O grafana grafana

# 2. 改 grafana.ini [database] 段（见模板 A）

# 3. 迁移（小心：会清空目标库）
sudo systemctl stop grafana-server
sudo grafana-cli admin database-migrate
sudo systemctl start grafana-server
```

### 性能

| 参数 | 默认 | 推荐 |
|---|---|---|
| `[dataproxy] timeout` | 30s | 60s（重查询） |
| `[dataproxy] dialTimeout` | 10s | 30s |
| `[server] read_timeout` | 0（无超时） | 30s |
| `[render] concurrent_render_request_limit` | 30 | 业务高峰可加大 |
| `[unified_alerting] evaluation_timeout` | 30s | 60s |

### 资源占用

| 部署规模 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 个人 / 小团队（< 20 dashboard） | 256 MB | 0.5 vCPU | 1 GB |
| 中型（100 dashboard, 100 users） | 1 GB | 1 vCPU | 10 GB |
| 大型（1000+ dashboard） | 4 GB | 2 vCPU | 50 GB（PG 后端） |

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库添加 | `apt.grafana.com stable main`（apt） | `rpm.grafana.com`（dnf） |
| GPG 密钥 | `https://apt.grafana.com/gpg.key` | rpm 自带签名 |
| systemd unit | `/lib/systemd/system/grafana-server.service` | 相同 |
| 包大小 | ~70 MB | ~70 MB |

EnvForge Playbook 自动检测包管理器并加对应仓库。Grafana 自家仓库覆盖所有主流发行版。

**Anolis 9 注**：使用 RHEL 9 兼容仓库，已验证。

## 与其它 catalog 项的配合

- **`prometheus-monitoring`** — Prometheus + Grafana 是经典监控栈（模板 B）
- **`loki-logging`** — 日志走 Loki，Grafana 同时显示指标 + 日志（同 dashboard 关联 trace ID）
- **`postgres-profile`** — PG 作为 Grafana 后端数据库（多用户 / HA 场景）；或作为业务数据源
- **`mysql-server` / `mariadb`** — 同上
- **`nginx-web-service`** — 反代到 :3000（模板 D）
- **`certbot-ssl`** — HTTPS 证书

## 排错

### 登录失败 `Invalid username or password`

```bash
# 重置 admin 密码
sudo grafana-cli admin reset-admin-password 新密码

# 看日志
sudo journalctl -u grafana-server -n 100
```

### 启动失败 / 502 Bad Gateway

```bash
sudo systemctl status grafana-server
sudo journalctl -u grafana-server -n 50

# 常见原因
# 1. grafana.ini 语法错（缩进 / 段名错）
sudo grafana-server cfg:default.paths.data=/var/lib/grafana cfg:default.paths.logs=/var/log/grafana cfg:default.paths.plugins=/var/lib/grafana/plugins cfg:default.paths.provisioning=/etc/grafana/provisioning

# 2. SQLite 损坏
sudo systemctl stop grafana-server
sudo cp /var/lib/grafana/grafana.db /var/lib/grafana/grafana.db.bak
sudo rm /var/lib/grafana/grafana.db
sudo systemctl start grafana-server          # 全新数据库（丢失所有 dashboard）

# 3. 端口被占
sudo ss -tlnp | grep 3000

# 4. SELinux（RHEL/Anolis）阻止 grafana 监听端口
sudo ausearch -c grafana --raw | audit2allow -M grafana_local
sudo semodule -i grafana_local.pp
```

### Provisioning 数据源没出现

```bash
# 看 provisioning 错误
sudo journalctl -u grafana-server | grep -i provision

# 检查 yaml 语法
sudo grafana-server --homepath=/usr/share/grafana --config=/etc/grafana/grafana.ini

# Provisioning 目录权限
sudo chown -R grafana:grafana /etc/grafana/provisioning
```

### Dashboard 显示 "Templating - Failed to upgrade legacy queries"

老 dashboard 用 Grafana 8 之前的 query 格式。在 dashboard JSON 里手动改或用 Grafana UI 重存。

### 反代后图形不显示 / Console 报 CORS

`grafana.ini` 必须设 `domain` + `root_url` 与反代域名一致：

```ini
[server]
domain = grafana.example.com
root_url = https://grafana.example.com/
```

子路径反代 `/grafana/`：

```ini
root_url = https://example.com/grafana/
serve_from_sub_path = true
```

### Plugin 装不上 `error: failed to download`

国内服务器到 `grafana.com` 偶发慢。手动下载：

```bash
wget https://github.com/grafana/grafana-piechart-panel/archive/refs/tags/v2.0.0.zip
sudo unzip v2.0.0.zip -d /var/lib/grafana/plugins/grafana-piechart-panel
sudo chown -R grafana:grafana /var/lib/grafana/plugins
sudo systemctl restart grafana-server
```

### 邮件告警发不出 `dial tcp: lookup smtp.example.com: no such host`

DNS 错或 SMTP 配错。测试：

```bash
nslookup smtp.example.com
sudo -u grafana telnet smtp.example.com 587
```

Gmail 必须用 [App Password](https://myaccount.google.com/apppasswords) 而非账号密码（开了 2FA 后）。

### 数据源 `network error` 但本机 curl 能通

Grafana 默认运行用户 `grafana` 没权限访问某些 socket（如 `/var/run/docker.sock`）。加用户组：

```bash
sudo usermod -aG docker grafana
sudo systemctl restart grafana-server
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active grafana-server

# 2. 端口在听
ss -tlnp | grep 3000

# 3. API 通
curl -fsS http://127.0.0.1:3000/api/health
# 应输出 {"commit":"...","database":"ok","version":"..."}

# 4. 登录 API
curl -fsS -u admin:你的密码 http://127.0.0.1:3000/api/org

# 5. 看版本
curl http://127.0.0.1:3000/api/health | grep version
```

## 多次运行

`installMode: skip-existing`。包安装幂等。`grafana.ini` 每次按表单值重写——你**手动加的配置会被覆盖**。要保留自定义：

- 用 provisioning 文件（`/etc/grafana/provisioning/`，Playbook 不动）
- 或把自定义放 `/etc/grafana/grafana.ini.d/*.ini`（Grafana 11+ 支持，自动 merge）

**admin 密码**只在数据库初始化时设——重跑不会重置（见表单字段说明）。

## ⚠️ 敏感性

**review** — Grafana 仪表盘可能展示敏感业务指标（订单数 / 用户数 / 错误率 / 响应时间）。数据源凭据存在 `grafana.db`（用 `secret_key` 加密）。

**强制注意**：
1. 不要 `0.0.0.0` + 弱密码暴露公网
2. 用反向代理 + HTTPS（模板 D）
3. 创建 Viewer 角色给开发者，不要全部 admin
4. `grafana.ini` 的 `secret_key` 必须随机（`openssl rand -hex 32`）——这个 key 是数据源密码加密钥
5. SMTP 密码 / API token 等都进 `grafana.ini`，文件权限自动 0640 grafana:grafana

## 隐私说明

- admin 密码会在 Playbook 任务日志里出现一次（触发 EnvForge 的 sensitive-scan）
- `grafana.db` / `grafana.ini` 含数据源凭据（加密）+ 用户密码（hash）
- 默认 `analytics.reporting_enabled = false`（本 Playbook 已设）：不发使用统计给 Grafana Labs
- 默认 `disable_gravatar = true`（本 Playbook 已设）：不联网取头像
- Plugin 装包会从 `grafana.com` CDN 拉，请求会被 Grafana Labs 看到
- 数据源拉取的业务数据（如 PG 查询结果）只在 Grafana 内存中处理，不外发
