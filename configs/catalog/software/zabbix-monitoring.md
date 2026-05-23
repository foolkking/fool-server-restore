# Zabbix Agent 2

Zabbix 是企业级监控系统（开源 + 商用支持）。本 Playbook 装 **Zabbix Agent 2**——被监控端的轻量进程，把本机的 CPU / 内存 / 磁盘 / 服务 / 进程 / 自定义指标发给 Zabbix Server。

> **重要**：本 Playbook **只装 Agent 端**。Zabbix Server 端（含 MySQL/PG + PHP web UI）需要单独部署一台中央机器，所有 Agent 指向 Server。生产推荐 Server / Proxy / Agent 三层。

## 你将得到什么

- 📦 **zabbix-agent2**（来自 Zabbix 官方仓库，**7.0 LTS** 版本）
- ✅ Agent 配置 `/etc/zabbix/zabbix_agent2.conf`
- ✅ Server 地址（被动 + 主动模式）
- ✅ 监听端口 10050
- ✅ 服务自动启动 + 开机自启
- ✅ Zabbix Server / Frontend / Proxy **不**装（只 Agent）

## 表单字段说明

### `zabbix_server` — Zabbix Server 地址

填中央 Server 的 IP 或域名。Agent 会：

- **被动模式**：Server 主动来拉指标（默认）
- **主动模式**：Agent 主动推数据（绕过对端 NAT）

如果还没部署 Server，先填占位（如 `127.0.0.1`），后改：

```bash
sudo nano /etc/zabbix/zabbix_agent2.conf      # 改 Server= 和 ServerActive=
sudo systemctl restart zabbix-agent2
```

### `agent_hostname` — Agent 在 Server 中的标识

> 🔑 **关键**：Server UI 里 Configuration → Hosts → Hostname **必须与本字段完全一致**（区分大小写），否则 Server 拒绝 Agent 请求。

留空 = 用本机 hostname（`hostname` 命令的输出）。

### `listen_port`

默认 10050。注意 **10051** 是 Server 端口（接收 Agent 主动上报），别混。

### `enable_active`

打开后 Agent 主动推数据到 Server（穿透 NAT 必须）。Server 端配置 host 时 Templates 选 "active" 版本（如 `Linux by Zabbix agent active` 而非 `Linux by Zabbix agent`）。

### `tls_psk_identity` / `tls_psk_secret`

可选 PSK 加密。强烈建议公网部署启用：

```bash
# 生成 PSK
openssl rand -hex 32 > /etc/zabbix/agent.psk
chmod 640 /etc/zabbix/agent.psk
sudo chown root:zabbix /etc/zabbix/agent.psk

# 在 Server UI Host → Encryption tab 填同样的 identity 和 PSK
```

## 配置文件 / 目录速查

```
/etc/zabbix/
├── zabbix_agent2.conf                  # ← 主配置
├── zabbix_agent2.d/                    # ← 自定义 UserParameter 放这里（推荐）
│   ├── docker.conf
│   └── userparams.conf
├── zabbix_agent2.psk                   # PSK 密钥（加密时）
└── tls/                                # mTLS 证书（如启用）

/var/log/zabbix/
└── zabbix_agent2.log                    # Agent 日志

/var/run/zabbix/
└── zabbix_agent2.pid

# 仓库源
/etc/apt/sources.list.d/zabbix.list      # Ubuntu/Debian
/etc/yum.repos.d/zabbix.repo             # RHEL/Anolis

# 二进制
/usr/sbin/zabbix_agent2
/usr/bin/zabbix_get                      # Server 端用，验证 Agent 通信
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库添加 | `repo.zabbix.com/zabbix/7.0/ubuntu` 等 | `repo.zabbix.com/zabbix/7.0/rhel/9` |
| 包名 | `zabbix-agent2` | `zabbix-agent2` |
| 服务名 | `zabbix-agent2` | `zabbix-agent2` |
| SELinux | – | RHEL 系需 `sudo setsebool -P zabbix_can_network 1` |

## 常见配置模板

### 模板 A — 推荐 `/etc/zabbix/zabbix_agent2.conf`

```ini
# 基础
PidFile=/var/run/zabbix/zabbix_agent2.pid
LogFile=/var/log/zabbix/zabbix_agent2.log
LogFileSize=10                         # MB，>10MB 后滚动
DebugLevel=3                            # 0-5，3 是 info

# 监听
ListenPort=10050
ListenIP=0.0.0.0                        # 不限制就 0.0.0.0；防火墙限源 IP

# 被动模式 — Server 来拉
Server=10.0.0.5,zabbix-proxy.internal

# 主动模式 — Agent 推到 Server / Proxy
ServerActive=10.0.0.5:10051
Hostname=web1.prod                       # 必须与 Server UI Host 一致
HostMetadata=production,linux,web        # 自动注册时按此匹配模板

# 心跳
HeartbeatFrequency=60                    # 主动模式心跳

# Buffer
BufferSend=5
BufferSize=100
StartAgents=3                            # 并发处理被动请求数

# 超时
Timeout=4                                # 单个 item 采集超时（秒）

# 自定义 UserParameter 自动加载
Include=/etc/zabbix/zabbix_agent2.d/*.conf

# 插件配置（Agent 2 特性，Go plugin 而非 UserParameter）
Plugins.Docker.Endpoint=unix:///var/run/docker.sock
Plugins.SystemRun.LogRemoteCommands=1     # 允许 system.run（**慎用**，等于远程命令执行）

# 加密（PSK）
TLSConnect=psk
TLSAccept=psk
TLSPSKIdentity=PSK001
TLSPSKFile=/etc/zabbix/zabbix_agent2.psk
```

应用：`sudo systemctl restart zabbix-agent2`。

### 模板 B — 自定义 UserParameter

`/etc/zabbix/zabbix_agent2.d/userparams.conf`：

```ini
# 简单：直接命令
UserParameter=mysql.queries[*],mysql -uzabbix -p$1 -e "SHOW STATUS LIKE 'Queries'" | awk 'NR==2 {print $$2}'
UserParameter=docker.containers,docker ps -q | wc -l
UserParameter=disk.iowait,iostat -c 1 2 | tail -2 | head -1 | awk '{print $$5}'
UserParameter=cert.expire[*],echo | openssl s_client -servername $1 -connect $1:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2

# 多值（脚本输出）
UserParameter=app.healthcheck,/usr/local/bin/healthcheck.sh
```

> **`$1` 双 dollar 的坑**：UserParameter 里的 `$1`（含义：item key 第一个参数）和 shell 自身的 `$1` 不是一回事。要 shell 引用必须 `$$1` 双美元转义。

```bash
sudo systemctl restart zabbix-agent2
```

测试（在 Agent 机器上）：

```bash
zabbix_agent2 -t mysql.queries[secret_pass]
zabbix_agent2 -t docker.containers
zabbix_agent2 -t cert.expire[example.com]
```

Server UI 给 Host 加 Item，Key 填 `docker.containers`。

### 模板 C — 在 Zabbix Server UI 里加 Host

打开 Server Web UI → Configuration → Hosts → Create host：

| 字段 | 填什么 |
|---|---|
| Hostname | **必须与 Agent conf 的 `Hostname=` 一致** |
| Visible name | UI 里显示的友好名（可中文） |
| Groups | 选个组（如 Linux servers / Production） |
| Interfaces | Agent IP + 10050（被动）；主动模式可不填 |
| Templates | 链接 `Linux by Zabbix agent` 或 `Linux by Zabbix agent active` |

保存后等 1-2 分钟，Hosts 列表里 Availability 应变绿（被动模式 ZBX 图标）。

### 模板 D — 防火墙规则（仅允许 Server）

```bash
# Ubuntu (UFW)
sudo ufw allow from 10.0.0.5 to any port 10050 proto tcp
sudo ufw allow from 10.0.0.5 to any port 10051 proto tcp     # 仅 Proxy 节点需要

# RHEL/Anolis (firewalld)
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="10.0.0.5" port port=10050 protocol=tcp accept' --permanent
sudo firewall-cmd --reload
```

### 模板 E — 自动注册（auto-registration，无需手动加 Host）

Server UI → Configuration → Actions → Auto registration → Create action：

```
Conditions:
  Host metadata contains "production"

Operations:
  - Add host
  - Add to host groups: Linux servers
  - Link to templates: Linux by Zabbix agent active
```

Agent 配置 `HostMetadata=production,linux`，启动后 Server 自动注册。

## 关键参数调优速查

### 性能

| 参数 | 默认 | 推荐 |
|---|---|---|
| `StartAgents` | 3 | 5-10（高并发 item 时） |
| `Timeout` | 3 | 4-10（慢命令） |
| `BufferSize` | 100 | 1000（主动模式 + 大量 item） |
| `MaxLinesPerSecond` | 20 | 200（log 监控） |

### Agent 1 vs Agent 2

| 项 | Agent 1（C） | Agent 2（Go，**推荐**） |
|---|---|---|
| 内存 | ~5 MB | ~30 MB |
| 性能 | 单进程 | 多协程，并发好 |
| 插件 | UserParameter（外部命令） | 内置 Go plugin（Docker / Memcached / MongoDB / Postgres / Redis 等） |
| 维护 | 老（Zabbix 1.x 起） | 新（4.4+），活跃 |
| 协议 | Plain JSON | 同 |

本 Playbook 装 Agent 2。

### 占用估算

| 监控规模 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 100 items（默认） | 30 MB | < 1% | < 100 MB（仅日志） |
| 1000 items（很多 UserParameter） | 50 MB | 1-3% | < 100 MB |
| 1 万 items（异常情况） | 100 MB+ | 5-10% | – |

## 跨发行版兼容

Zabbix 不在发行版默认仓库，本 Playbook 添加官方仓库。

| 发行版 | 仓库 |
|---|---|
| Ubuntu 22.04 | `https://repo.zabbix.com/zabbix/7.0/ubuntu/pool/main/z/zabbix-release/zabbix-release_7.0-1+ubuntu22.04_all.deb` |
| Ubuntu 24.04 | `...ubuntu24.04...deb` |
| Debian 12 | `...debian12...deb` |
| RHEL 9 / Rocky / Alma | `...rhel/9/x86_64/zabbix-release-7.0-1.el9.noarch.rpm` |
| Anolis 9 | 走 RHEL 9 仓库 ✅ |

EnvForge Playbook 自动检测发行版并加对应仓库。

## 与其它 catalog 项的配合

- **`prometheus-monitoring`** — Zabbix 和 Prometheus 是两套独立的监控生态，可并存（Zabbix Server 端 7.0+ 可作为 Prometheus exporter 数据源）
- **`postgres-profile` / `mysql-server`** — 给 Agent 2 的 Postgres/MySQL plugin 用专用监控账号
- **`docker-host-profile`** — Docker plugin 自动采集容器指标（无需 UserParameter）
- **`firewalld` / `ufw`** — 限制 10050 仅 Server IP（模板 D）
- **`fail2ban-protection`** — 给 10050 加 jail（防扫描）

## 排错

### Server UI 显示 host 红色（unreachable / no data）

```bash
# 1. Agent 在跑
sudo systemctl status zabbix-agent2

# 2. 端口在听
sudo ss -tlnp | grep 10050

# 3. 在 Agent 机器自己测
zabbix_agent2 -t agent.ping
zabbix_agent2 -t system.uptime

# 4. 在 Server 机器测
zabbix_get -s <agent-ip> -k agent.ping       # 应输出 1
zabbix_get -s <agent-ip> -p 10050 -k system.uptime

# 5. Hostname 一致性
grep ^Hostname /etc/zabbix/zabbix_agent2.conf
# 与 Server UI Host 的 Hostname 字段对比

# 6. 防火墙 / SELinux
sudo journalctl -u zabbix-agent2 -n 50
sudo getenforce && sudo ausearch -m avc | grep zabbix
```

### `failed to accept incoming connection`

Agent 拒绝连接。检查 `Server=` 参数：

```bash
# 必须含 Server IP
grep ^Server= /etc/zabbix/zabbix_agent2.conf

# Server IP 改了？
sudo sed -i 's/^Server=.*/Server=10.0.0.99/' /etc/zabbix/zabbix_agent2.conf
sudo systemctl restart zabbix-agent2
```

### SELinux 阻止 `connection refused`（RHEL/Anolis）

```bash
sudo ausearch -m avc -ts recent | grep zabbix
sudo setsebool -P zabbix_can_network 1
sudo setsebool -P zabbix_run_sudo 1           # 仅 Agent 用 sudo 时
```

或临时关 SELinux 测试：

```bash
sudo setenforce 0       # 临时
# 测试通后立即开回 sudo setenforce 1，并修 policy
```

### UserParameter 不工作

```bash
# 在 Agent 机器手动测
zabbix_agent2 -t mysql.queries[password]

# 错误 1：脚本权限
sudo -u zabbix /path/to/script.sh

# 错误 2：$1 没双 dollar 转义
# 错：UserParameter=...,echo $1
# 对：UserParameter=...,echo $$1
```

### 启动报 `cannot bind socket: Address already in use`

10050 被占：

```bash
sudo ss -tlnp | grep 10050
# 找进程 kill 或换端口（注意 Server 端 host 配置同步改）
```

### Agent 主动模式不发数据

```bash
sudo journalctl -u zabbix-agent2 -n 100 | grep -i active

# 常见原因
# 1. ServerActive= 没配
# 2. Hostname 与 Server UI 不一致
# 3. Server 10051 端口防火墙挡了 Agent 来的连接
```

### 升级到 7.0 后老 plugin 报错

Agent 2 的 plugin API 7.0 与 6.x 有差异。重新编译第三方 plugin 或升级到匹配版本。

### `[Zabbix agent ping]` failed timeout

`Timeout=` 太短：

```ini
Timeout=10        # 10 秒（默认 3）
```

或某个 UserParameter 跑得慢——拆成异步脚本写文件，UserParameter 仅 cat 文件。

## 验证

```bash
# 1. 服务在跑
systemctl is-active zabbix-agent2

# 2. 端口
sudo ss -tlnp | grep 10050

# 3. 版本
zabbix_agent2 --version | head -1            # 应 v7.0.x

# 4. Self test（Agent 机器上）
zabbix_agent2 -t agent.ping                   # 1
zabbix_agent2 -t agent.version
zabbix_agent2 -t system.uptime
zabbix_agent2 -t system.cpu.load
zabbix_agent2 -t vm.memory.size[available]

# 5. 主动模式心跳（看日志）
sudo journalctl -u zabbix-agent2 -n 30 | grep -i "active check"

# 6. Server 端测试（在 Server 机器）
# zabbix_get -s <agent-ip> -k system.uptime
```

## 多次运行

`installMode: skip-existing`。包安装幂等。`zabbix_agent2.conf` 每次按表单值重写——你**手动加的 UserParameter 不会丢失**（放 `/etc/zabbix/zabbix_agent2.d/`，Playbook 不动）。

## ⚠️ 敏感性

**review** — Agent 暴露**系统级信息**（进程列表 / 网络连接 / 文件存在性 / 自定义命令输出）。`Plugins.SystemRun.LogRemoteCommands=1` + `system.run` 实际是远程命令执行能力，**慎用**。

**强制清单**：

1. 防火墙限制 10050 仅 Server IP（模板 D）
2. 启用 PSK 加密（公网部署必须）
3. UserParameter 慎放 sudo 命令（zabbix 用户的 sudoers 应严格白名单）
4. 不要在 UserParameter 里把密码作为参数传——会出现在 Agent 日志和 Zabbix DB

## 隐私说明

- Agent 只把数据发给配置的 Zabbix Server，**不上报第三方**
- 默认明文 TCP 传输——公网部署必须开 PSK 或 TLS
- Agent 日志（`/var/log/zabbix/zabbix_agent2.log`）含每个 item 采集结果——慎用 UserParameter 传敏感数据
- HostMetadata 含主机标签，会出现在 Server 端日志和数据库
