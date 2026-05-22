# Zabbix Agent

Zabbix 是企业级监控系统（开源、商用支持）。此 Playbook 装 **Zabbix Agent 2**——
被监控端的轻量进程，把本机的 CPU/内存/磁盘/服务/进程指标发给 Zabbix Server。

> **注意**：这个 Playbook 只装 Agent。Zabbix Server 端（含数据库 + Web UI）需要单独部署一台机器，
> 然后让所有被监控机器的 Agent 指向 Server。

## 你将得到什么

- 📦 **zabbix-agent2**（来自 Zabbix 官方仓库，7.0 LTS 版本）
- ✅ 配置 Server 地址（被动检查源 + 主动检查目标）
- ✅ 监听端口 10050
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### Zabbix Server 地址

填你的 Zabbix Server 的 IP 或 hostname。Agent 会：
- 接受 Server 主动来的检查请求（被动模式）
- 主动向 Server 推数据（主动模式）

如果还没部署 Server，先填占位值（如 `127.0.0.1`），后面改。

### Agent Hostname

**关键字段**：在 Zabbix Server 的 UI 里 Hosts → Hostname **必须和这里完全一致**，
否则 Server 拒绝 Agent 的请求。留空则用本机 hostname（一般够用）。

### 监听端口

默认 10050。注意 10051 是 Server 端口（被动接收 Agent 上报），不要混淆。

## 安装后

### 在 Zabbix Server UI 里加这台机器

打开 Server 的 Web UI → Configuration → Hosts → Create host
- Hostname：填和此 Agent 配置一样的值
- Visible name：在 UI 里显示的友好名
- Groups：选个分组
- Interfaces：填 Agent IP + 10050
- Templates：链接合适的模板（如 "Linux by Zabbix agent active"）

保存后等 1-2 分钟，Hosts 列表里这台机器的 Availability 应该变绿。

### 看 Agent 在采集什么

```bash
sudo zabbix_agent2 -t system.uptime
# 应该输出本机运行时长
sudo zabbix_agent2 -t agent.ping
# 1
sudo zabbix_agent2 -t system.cpu.load
sudo zabbix_agent2 -t vm.memory.size[available]
```

### 调试连接

```bash
# 在 Server 上手动 poll Agent
zabbix_get -s 被监控机器IP -k system.uptime
# 或在 Agent 机器上看日志
sudo tail -f /var/log/zabbix/zabbix_agent2.log
```

### 加自定义检查项

`/etc/zabbix/zabbix_agent2.d/userparams.conf`：
```ini
UserParameter=mysql.queries[*],mysql -uzabbix -ppassword -e "SHOW STATUS LIKE 'Queries'" | awk 'NR==2 {print $2}'
UserParameter=docker.containers,docker ps -q | wc -l
```

```bash
sudo systemctl restart zabbix-agent2
```

然后在 Server UI 里给 Host 加 Item，Key 填 `docker.containers`。

### 防火墙

```bash
# 允许 Server IP 来访 10050
sudo ufw allow from 你的Server-IP to any port 10050  
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="你的Server-IP" port port=10050 protocol=tcp accept' --permanent
```

### 装 Zabbix Server

不在本 Playbook 范围。简略：
1. 一台独立机器（推荐 4GB 内存起）
2. 装 zabbix-server-mysql + zabbix-frontend-php + mysql-server
3. 创建 zabbix 数据库 + 导入 schema
4. 配 PHP-FPM + nginx
5. 浏览器跑安装向导

详见 https://www.zabbix.com/documentation/current/en/manual/installation。

## ⚠️ 敏感性

**review** — Agent 暴露了系统级信息（进程列表、网络连接、文件存在性）。务必：
1. 防火墙限制只允许 Server IP 访问 10050
2. 启用 PSK 加密（Agent ↔ Server 通信加密）

## 验证

```bash
systemctl status zabbix-agent2 --no-pager
sudo zabbix_agent2 -t agent.version
sudo ss -tlnp | grep 10050
```

## 排错

- **`failed to accept incoming connection`** — Server IP 配错或防火墙挡了。
- **Server UI 显示 host 红色（unreachable）** — Agent 配的 Hostname 和 Server UI 里的不一致；或 Agent 没在监听。
- **跨发行版**：Zabbix 不在默认仓库，Playbook 自动添加官方源（仓库结构 Ubuntu/Debian 一种、RHEL/Anolis 一种）。

## 多次运行

`installMode: skip-existing`。包不重装，配置每次重写。

## 隐私说明

- Agent 只把系统指标发给配置的 Zabbix Server，不上报第三方。
- 默认明文传输，公网部署务必启用 PSK 或 TLS。
