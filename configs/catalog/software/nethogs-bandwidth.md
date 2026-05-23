# 网络流量监控工具集

一组诊断网络问题用的 CLI 工具：哪个进程吃带宽 / 哪个 IP 在打我 / 抓包分析 / 端口扫描。装上即用，无需配置。**SSH 远程排错时最有用的一组工具**。

## 你将得到什么

- 📦 **nethogs** — 按进程显示实时带宽（哪个进程在吃流量）
- 📦 **iftop** — 按连接显示实时带宽（哪个 IP 在打我）
- 📦 **vnstat** — 历史流量统计（按天 / 月 / 年）+ 守护进程已启用
- 📦 **tcpdump** — 抓包分析（生成 .pcap，wireshark 打开）
- 📦 **nmap** — 端口扫描 / 服务发现 / OS 指纹

## 配置文件 / 目录速查

```
# vnstat（唯一有持久化数据的）
/etc/vnstat.conf                          # ← 主配置
/var/lib/vnstat/                          # 数据库目录
├── eth0.db                                # 每网卡一个 SQLite
└── vnstat.cache                            # 实时缓存

# 系统级配置
/etc/systemd/system/vnstat.service          # systemd unit

# 工具命令参数（nethogs / iftop / tcpdump / nmap 无配置文件）
~/.tcpdump-history                         # tcpdump 命令历史（可选）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `nethogs` | 默认仓库 | EPEL ✅ |
| `iftop` | 默认仓库 | EPEL ✅ |
| `vnstat` | 默认仓库 | 默认仓库 |
| `tcpdump` | 默认仓库 | 默认仓库 |
| `nmap` | 默认仓库 | 默认仓库 |

EnvForge preflight 自动启 EPEL，RHEL/Anolis 装 nethogs / iftop 不会失败。

## 常见配置模板

### 模板 A — vnstat 调优（每天采样 + 多网卡）

```bash
# /etc/vnstat.conf 关键项
sudo tee -a /etc/vnstat.conf > /dev/null <<'EOF'
# 采样频率
UpdateInterval 30

# 默认显示的网卡（自动选）
Interface ""

# 单位（K/M/G）
UnitMode 1

# 速率单位（自动）
RateUnit 1

# 历史保留（按统计粒度）
DailyDays 30
MonthlyMonths 12
YearlyYears 5
TopDays 10
EOF

sudo systemctl restart vnstat

# 给所有网卡建库
for iface in $(ls /sys/class/net | grep -v lo); do
    sudo vnstat -i $iface --add 2>/dev/null
done
```

### 模板 B — 现场排错"按问题选工具"

```bash
# ====== 流量异常高 ======
sudo nethogs                              # 哪个进程
sudo nethogs -v 1                         # 累计模式
sudo iftop -nNP                            # 流量去往哪些 IP
vnstat -d                                  # 历史趋势

# ====== 服务器被打 ======
sudo ss -tan | awk 'NR>1 {print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head    # 连最多的 IP
sudo tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn) != 0' -c 100             # 抓 SYN 包看 SYN flood
sudo iftop -BPn                                                            # 实时 byte 模式

# ====== 网络丢包 / 延迟高 ======
mtr -c 100 8.8.8.8                          # 路径分析
ping -c 100 -i 0.2 1.1.1.1                  # 丢包率
sudo tcpdump -i any -nn 'icmp'              # 抓 ICMP

# ====== DNS 出问题 ======
sudo tcpdump -i any -nn 'port 53'           # 看 DNS 查询
dig @1.1.1.1 +trace example.com             # 完整 DNS resolution path

# ====== 找占空间 + 找占带宽（混合）======
sudo iotop -o                                # IO（不在本工具集，参 htop-tools）
sudo nethogs                                 # 网络
ncdu /                                       # 磁盘
```

### 模板 C — nethogs 速查

```bash
# 默认显示所有网卡
sudo nethogs

# 指定网卡
sudo nethogs eth0
sudo nethogs eth0 wlan0                      # 多网卡

# 1 秒刷新
sudo nethogs -d 1

# 显示进程 PID
sudo nethogs -p

# 不可中断模式（脚本用）
sudo nethogs -t
```

交互快捷键：

| Key | 作用 |
|---|---|
| `m` | 切换 KB/s ↔ MB/s ↔ Total |
| `r` | 按 received 排序 |
| `s` | 按 sent 排序 |
| `q` | 退出 |

### 模板 D — iftop 速查

```bash
sudo iftop                                   # 默认网卡
sudo iftop -i eth0                            # 指定
sudo iftop -nNP                               # 不解析 host / port（更快）
sudo iftop -F 10.0.0.0/8                      # 仅显示来自此网段
sudo iftop -B                                 # bit/s 改 byte/s
```

交互：

| Key | 作用 |
|---|---|
| `t` | 切换显示模式（双向 / 仅入 / 仅出 / 累计） |
| `b` | 显示当前 bar |
| `T` | 显示总流量 |
| `n` | 切换是否解析 hostname |
| `s` / `d` | 仅源 / 目的 |
| `1` / `2` / `3` | 按 2s / 10s / 40s 平均排序 |
| `q` | 退出 |

### 模板 E — vnstat 速查

```bash
vnstat                                       # 今日 + 本月 总览
vnstat -i eth0                                # 指定网卡

# 按粒度
vnstat -d                                     # 按天
vnstat -m                                     # 按月
vnstat -y                                     # 按年
vnstat -h                                     # 按小时（今日）
vnstat -t                                     # Top N 天
vnstat -5                                     # 5 分钟实时

# 图形版（如装 vnstati）
sudo apt-get install vnstati
vnstati -s -i eth0 -o /tmp/summary.png        # 输出 PNG
vnstati -d -i eth0 -o /tmp/daily.png

# 实时查看
vnstat -l                                     # live 模式
```

vnstat 数据库每天自动 dump。要重置：

```bash
sudo systemctl stop vnstat
sudo rm /var/lib/vnstat/eth0.db
sudo vnstat -i eth0 --add
sudo systemctl start vnstat
```

### 模板 F — tcpdump 速查（抓包）

```bash
# 基础
sudo tcpdump -i eth0                          # 抓所有
sudo tcpdump -i any                            # 所有接口
sudo tcpdump -i eth0 -nn                       # 不解析 host / port

# 过滤
sudo tcpdump -i eth0 'port 80'                 # 仅 80 端口
sudo tcpdump -i eth0 'port 80 or port 443'
sudo tcpdump -i eth0 'host 1.2.3.4'             # 指定 IP
sudo tcpdump -i eth0 'src 1.2.3.4'              # 仅源
sudo tcpdump -i eth0 'dst 1.2.3.4 and port 22'   # 复合
sudo tcpdump -i eth0 'tcp[tcpflags] & tcp-syn != 0'   # SYN 包
sudo tcpdump -i eth0 'icmp'

# 限量
sudo tcpdump -i eth0 -c 100 'port 80'         # 抓 100 个后退出

# 显示包内容
sudo tcpdump -i eth0 -A 'port 80'             # ASCII（看 HTTP header）
sudo tcpdump -i eth0 -X 'port 80'              # hex + ASCII
sudo tcpdump -i eth0 -s 0 -A 'port 80'         # -s 0 = 抓完整包

# 写文件（生产推荐）
sudo tcpdump -i eth0 -w /tmp/capture.pcap 'port 443'
# Ctrl+C 后用 wireshark 打开 /tmp/capture.pcap

# 读文件
sudo tcpdump -r /tmp/capture.pcap

# 滚动文件（避免单文件过大）
sudo tcpdump -i eth0 -w /tmp/cap-%Y%m%d-%H%M%S.pcap -G 60 -W 10 'port 443'
# 每 60 秒新文件，保留最近 10 个
```

### 模板 G — nmap 速查

```bash
# 主机发现
nmap -sn 192.168.1.0/24                       # ping 扫，看哪些主机活着

# 端口扫描
nmap 1.2.3.4                                  # 默认 1000 个最常见端口
nmap -p- 1.2.3.4                              # 全 65535 端口（慢）
nmap -p 22,80,443 1.2.3.4                     # 指定端口
nmap -p 1-1000 -T4 1.2.3.4                    # T0-T5 扫描速度

# 服务版本
nmap -sV 1.2.3.4

# OS 指纹
sudo nmap -O 1.2.3.4

# 全功能（侵入性扫描）
sudo nmap -A 1.2.3.4

# 脚本扫描（NSE）
nmap --script default 1.2.3.4
nmap --script vuln 1.2.3.4                    # 检查已知漏洞
nmap --script http-enum -p 80 1.2.3.4         # 列 web 服务路径

# UDP 扫描（慢）
sudo nmap -sU --top-ports 100 1.2.3.4

# 输出到文件
nmap -oA scan-result 1.2.3.4                  # .nmap / .gnmap / .xml
```

> ⚠️ **法律警告**：扫描非自己拥有 / 未授权的机器在多数国家**违法**。仅扫自己拥有 / 明确授权的资产。

## 关键参数调优速查

### 抓包性能（大流量服务器）

```bash
# 默认 snaplen 256 KB——抓大量小包时占内存
sudo tcpdump -s 96 -i eth0 'port 80'             # 仅抓前 96 字节（够 header）

# Ring buffer 模式（kernel 内存抓包，避免丢包）
sudo tcpdump -B 65535 -i eth0 ...                  # 64MB buffer

# 写文件比终端输出快（终端 print 是瓶颈）
sudo tcpdump -i eth0 -w /tmp/cap.pcap

# 多核并行抓（用 PF_RING 或 AF_PACKET fanout）
sudo tcpdump -i eth0 --packet-buffered ...
```

### vnstat 数据库大小

| 保留期 | 大小（每网卡） |
|---|---|
| 30 天 daily + 12 月 monthly + 5 年 yearly | < 10 MB |
| 365 天 daily + 60 月 monthly | < 50 MB |
| 实时 5 分钟（5 days） | + 1 MB |

存储极小，可放心保留长时间。

### nmap 速度等级

| `-T` | 含义 | 适用 |
|---|---|---|
| `T0` | paranoid | IDS 规避（极慢，> 5h） |
| `T1` | sneaky | 低调（2h） |
| `T2` | polite | 共享网络（30 min） |
| `T3` | normal（默认） | 标准（10 min） |
| `T4` | aggressive | LAN 内（推荐，2 min） |
| `T5` | insane | 极速（< 1 min，可能丢结果） |

## 跨发行版兼容

| 工具 | Ubuntu/Debian | RHEL/Anolis 9 | 备注 |
|---|---|---|---|
| `nethogs` | 默认 | EPEL | 需 root |
| `iftop` | 默认 | EPEL | 需 root |
| `vnstat` | 默认 | 默认 | 自带 systemd |
| `tcpdump` | 默认 | 默认 | 需 root（CAP_NET_RAW） |
| `nmap` | 默认 | 默认 | 部分功能需 root |

EnvForge preflight 启 EPEL 后全部能装。

## 与其它 catalog 项的配合

- **`htop-tools`** — 系统层监控（CPU / 内存 / 磁盘 IO）
- **`prometheus-monitoring`** — node_exporter 长期采集网络指标
- **`netdata-monitoring`** — Web 可视化版本，覆盖本工具集大部分功能
- **`firewalld` / UFW** — 配合诊断防火墙规则

## 排错

### `iotop / nethogs` 报 `OSError: Netlink error: Operation not permitted`

需要 root 或 capability：

```bash
sudo nethogs                                  # 推荐用法

# 或给当前用户加 capability
sudo setcap 'cap_net_admin+eip' $(which nethogs)
```

### `vnstat` 显示 `Not enough data available yet`

vnstat 第一次启动后需采集足够样本（默认 30 分钟才有 daily 统计）。等等就好：

```bash
sudo vnstat -i eth0 --enable                  # 强制启用网卡监控
sudo systemctl restart vnstat
```

### `iftop` 不显示流量

可能 promiscuous 模式问题：

```bash
sudo iftop -i eth0 -P                          # 显示端口
sudo iftop -i eth0 -B                          # bytes 模式

# 看是否有流量
sudo cat /proc/net/dev
```

### `tcpdump` 报 `permission denied`

需 root 或 setcap：

```bash
sudo tcpdump -i eth0 ...
# 或
sudo setcap 'cap_net_raw,cap_net_admin=eip' $(which tcpdump)
```

### `nmap` 扫描结果 `host seems down`

```bash
# 默认 ping 扫描被防火墙挡了
nmap -Pn 1.2.3.4                              # 跳过 host discovery
```

### vnstat 数据库损坏

```bash
sudo systemctl stop vnstat
sudo vnstat -i eth0 --remove
sudo vnstat -i eth0 --add
sudo systemctl start vnstat
# 注意：会丢失历史数据
```

### tcpdump 抓不到 docker 容器流量

容器走 docker0 / br-* 接口：

```bash
# 看接口列表
ip link show

# 抓所有
sudo tcpdump -i any 'host 172.17.0.2'
sudo tcpdump -i docker0
sudo tcpdump -i br-abcd1234
```

## 验证

```bash
# 1. 命令存在
command -v nethogs iftop vnstat tcpdump nmap

# 2. vnstat 在跑
systemctl is-active vnstat

# 3. nmap 能扫本机
nmap -F localhost                              # 快速扫常用端口

# 4. tcpdump 能抓
sudo tcpdump -i any -c 5 -nn

# 5. iftop / nethogs 能启动（按 q 退出）
# sudo iftop &
# sudo nethogs &
```

## 多次运行

`installMode: skip-existing`。包安装幂等。vnstat 服务幂等启用。重跑不会丢失历史数据。

## ⚠️ 敏感性

**safe** — 都是只读监控 / 抓包工具，不改业务配置。但：

- **tcpdump 抓的 .pcap 含明文流量内容**（HTTP / SMTP 等未加密协议看得到密码）——文件权限管理重要
- **nmap 扫描非自有机器违法**（很多国家）
- **iftop / nethogs 暴露的连接信息敏感**（业务调用模式 / 客户端 IP）

## 隐私说明

- vnstat 数据库（`/var/lib/vnstat/`）含每网卡流量历史——**不上传不同步**
- tcpdump .pcap 文件含**完整网络包**——含 HTTP cookie / 密码 / SQL / 图片等
    - 抓包前慎重——工程师常忘了 .pcap 是高度敏感
    - 用完即删 / 加密保存
- nmap 扫描会被对方 IDS / 防火墙记录——扫自己 OK，扫别人有法律风险
- 这些工具自身不发遥测
