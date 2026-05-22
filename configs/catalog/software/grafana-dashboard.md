# Grafana 可视化面板

Grafana 是开源的监控可视化平台——把 Prometheus / Loki / InfluxDB / MySQL / 几十种数据源
拼装成漂亮的仪表盘。EnvForge 用 Grafana Labs 官方仓库装 Grafana 11+（比发行版自带的版本新很多）。

## 你将得到什么

- 📦 **grafana**（来自 grafana.com 官方仓库，自动跟进 minor 升级）
- ✅ Web UI 在 `http://localhost:3000`
- ✅ admin 账号密码已设
- ✅ 服务自动启动并设开机自启
- ✅ 数据存储默认 SQLite（小型部署够用，~10 dashboard 无压力）

## 表单字段说明

### 管理员账号 / 密码

`admin_user` 和 `admin_password` 写到 `/etc/grafana/grafana.ini`。
**重要警告**：`grafana.ini` 的 `admin_password` 只在**第一次启动 Grafana 时**初始化数据库密码。
如果是 Grafana 已经初始化过、再次运行此 Playbook，密码不会被改。这种情况手动用 grafana-cli：
```bash
sudo grafana-cli admin reset-admin-password 新密码
```

### HTTP 端口

默认 3000。生产环境推荐挂在 nginx/Traefik 后用 443 + 域名，3000 端口只在本机绑定。

### 域名

仅当通过反向代理暴露时填上。Grafana 用它生成 OAuth 回调 URL 和邮件链接。

## 安装后

### 添加数据源

打开 Web UI → Connections → Data sources → Add data source。常见数据源：
- **Prometheus** — 监控指标（同 catalog 里有 prometheus-monitoring Playbook）
- **Loki** — 日志聚合（同 catalog 里有 loki-logging）
- **MySQL / PostgreSQL** — 业务数据库
- **InfluxDB** — 时序数据

### 创建仪表盘

两种方式：
1. **手动**：Dashboards → New → 选数据源 + 写 PromQL/SQL
2. **导入**：在 https://grafana.com/grafana/dashboards/ 找现成的（搜 "node exporter" / "nginx" 等），复制 dashboard ID，UI 里 Import 直接用

### 反向代理（Nginx 例子）

```nginx
server {
    listen 443 ssl;
    server_name grafana.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 支持（实时仪表盘）
    location /api/live/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 启用匿名访问（公开仪表盘）

`/etc/grafana/grafana.ini`：
```ini
[auth.anonymous]
enabled = true
org_role = Viewer
```

### 配 SMTP 发告警邮件

```ini
[smtp]
enabled = true
host = smtp.gmail.com:587
user = you@gmail.com
password = app-password
from_address = grafana@yourdomain.com
```

## ⚠️ 敏感性

**review** — Grafana 仪表盘可能展示敏感的业务指标（订单数、用户数、错误率）。务必：
1. 不要 0.0.0.0 + 弱密码暴露公网
2. 用反向代理 + HTTPS
3. 创建专门的 Viewer 账号给非管理员，不要把 admin 给开发同学

## 验证

```bash
systemctl status grafana-server --no-pager
curl -u admin:你的密码 http://127.0.0.1:3000/api/org
```

## 排错

- **`Login failed`** — `grafana.ini` 改 admin_password 不生效。用 `sudo grafana-cli admin reset-admin-password` 重设。
- **`Internal server error`** — 看 `sudo journalctl -u grafana-server -n 50`。常见：grafana.ini 语法错、SQLite 数据库损坏（`/var/lib/grafana/grafana.db`，删了重启会重新初始化）。
- **跨发行版**：Grafana 不在默认仓库，Playbook 添加 grafana.com 官方源。

## 多次运行

`installMode: skip-existing`。已安装不重装，但 grafana.ini 每次重写。**密码不会重置**——见上面的"重要警告"。

## 隐私说明

- admin 密码会在任务日志里出现一次。
- Grafana 数据库 `/var/lib/grafana/grafana.db` 含所有仪表盘、数据源凭据、用户密码（hash 过）。
