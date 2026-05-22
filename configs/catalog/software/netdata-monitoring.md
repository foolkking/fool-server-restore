# Netdata 实时监控

Netdata 是开箱即用的单机监控——装上就有 **600+ 指标**和**漂亮的实时仪表盘**，
无需配置数据源、无需画 dashboard。每秒粒度，浏览器打开就能看。

适合：
- 服务器突然慢了，想立刻知道是哪里的问题
- 单机部署、不想搭 Prometheus + Grafana 全套

不适合：
- 多机集群监控（Netdata 也支持但不如 Prometheus）
- 长期历史数据 + 告警 + alerting 集成（用 Prometheus）

## 你将得到什么

- ✅ Netdata 最新 stable 版（kickstart 脚本安装到 `/opt/netdata`）
- ✅ Web UI 在 `http://localhost:19999`（仪表盘 + 实时图表）
- ✅ 600+ 内置 collector（CPU / 内存 / 磁盘 / 网络 / 进程 / Docker / 数据库 / web server / ...）
- ✅ Anomaly detection 内置（机器学习识别异常指标）
- ✅ Telemetry 已关闭（不发匿名统计回 Netdata）

## 表单字段说明

### 监听地址

**Netdata 没有用户认证机制**。0.0.0.0 暴露公网 = 把你的系统指标全公开。
默认 127.0.0.1，远程访问请挂 nginx + basic auth 后端。

### 内存中保留时长

Netdata 把指标存在内存的环形缓冲区。默认 1 小时（约 200MB 内存，依监控指标数）。
长期数据需要切换到 `dbengine` 模式（持久化磁盘）。

## 安装后

### 浏览器访问

`http://localhost:19999` — 立刻有完整仪表盘。第一次打开会引导你做一次 tour。

### 反向代理 + 认证（生产推荐）

```nginx
server {
    listen 443 ssl;
    server_name netdata.example.com;

    auth_basic "Netdata";
    auth_basic_user_file /etc/nginx/htpasswd;

    location / {
        proxy_pass http://127.0.0.1:19999;
        proxy_http_version 1.1;
        proxy_pass_request_headers on;
        proxy_set_header Connection "keep-alive";
        proxy_store off;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Server $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# 创建 htpasswd
sudo apt-get install apache2-utils
sudo htpasswd -c /etc/nginx/htpasswd admin
```

### 持久化指标到磁盘（dbengine）

`/etc/netdata/netdata.conf`：
```ini
[db]
mode = dbengine
storage tiers = 3
update every = 1
```

dbengine 用三层存储自动 downsampling，保留几个月数据但磁盘只占几个 GB。

### Cloud 模式（多机统一面板，免费）

`https://app.netdata.cloud` 注册账号，按页面提示给每台机器跑 claim 命令，所有机器
的指标在一个面板里看。

### 装额外 collector

```bash
sudo /opt/netdata/usr/libexec/netdata/plugins.d/python.d.plugin debug --modules
# 看哪些 module 没启用
```

例如要监控 nginx：
```ini
# /etc/netdata/python.d/nginx.conf
local:
  url: http://127.0.0.1/stub_status
```

```bash
sudo systemctl restart netdata
```

## ⚠️ 敏感性

**safe** — 指标采集是只读的，不动系统配置。但 web UI **没认证**，公网暴露要谨慎。

## 验证

```bash
systemctl status netdata --no-pager
curl http://localhost:19999/api/v1/info
sudo ss -tlnp | grep 19999
```

## 排错

- **kickstart 脚本失败** — 通常是网络问题（curl 访问 get.netdata.cloud 不通）。试 https://github.com/netdata/netdata 直接源码编译。
- **服务起来但 19999 不响应** — 检查 `bind to` 配置；防火墙是否挡了。
- **CPU 占用高** — Netdata 默认每秒一次采集所有 600+ 指标，在弱机器上会占 1-3% CPU。可以调 `update every = 5`（5 秒一次）减负担。
- **跨发行版**：用官方 kickstart 脚本，自动适配 Ubuntu / Debian / RHEL / Anolis / Arch。

## 多次运行

`installMode: skip-existing`。已装就跳过 kickstart，仅刷 `bind to` 和 `history` 配置。

## 隐私说明

- Telemetry 已默认禁用（kickstart `--disable-telemetry` 参数）。
- 监控数据全部本地存储，不上传任何东西。
- Cloud 模式需要主动 claim，不 claim 就不发任何数据出去。
