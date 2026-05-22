# 网络流量监控工具集

一组诊断网络问题用的 CLI 工具：哪个进程吃带宽、哪个 IP 在打我、抓包分析。
都是 no-config，装上即用。

## 你将得到什么

- 📦 **nethogs** — 按进程显示实时带宽（哪个进程在吃流量）
- 📦 **iftop** — 按连接显示实时带宽（哪个 IP 在打我）
- 📦 **vnstat** — 历史流量统计（每天/每月/每年）+ 守护进程已启用
- 📦 **tcpdump** — 抓包分析
- 📦 **nmap** — 端口扫描 / 服务发现

## 用法速览

### nethogs — 哪个进程在吃带宽

```bash
sudo nethogs            # 默认显示所有网卡
sudo nethogs eth0       # 指定网卡
sudo nethogs -d 1       # 1 秒刷新
```
按 `m` 切换 KB/s ↔ MB/s，`q` 退出。

### iftop — 哪个 IP 在打我

```bash
sudo iftop                  # 默认网卡
sudo iftop -i eth0
sudo iftop -nNP             # 不解析域名 / 端口（更快）
```
按 `t` 切显示模式，`q` 退出。

### vnstat — 历史流量

```bash
vnstat                  # 看今日/本月汇总
vnstat -d               # 按天列出最近几天
vnstat -m               # 按月列
vnstat -h               # 按小时列今天
vnstat -l               # 实时显示
vnstat -i eth0          # 指定网卡
```

### tcpdump — 抓包

```bash
sudo tcpdump -i eth0                          # 抓所有
sudo tcpdump -i eth0 port 80                  # 仅 80 端口
sudo tcpdump -i eth0 host 1.2.3.4             # 仅这个 IP
sudo tcpdump -i eth0 -w capture.pcap          # 写到文件，用 wireshark 分析
sudo tcpdump -i eth0 -A 'port 80'             # ASCII 显示包内容
sudo tcpdump -i eth0 -c 100 'icmp'            # 抓 100 个 ICMP 包后退出
```

### nmap — 端口扫描

```bash
nmap 192.168.1.0/24                # 扫整个子网哪些主机活着
nmap -p 22,80,443 1.2.3.4          # 扫指定端口
nmap -sV 1.2.3.4                   # 探测服务版本
nmap -A 1.2.3.4                    # 全功能扫描（OS / 版本 / 脚本）
```
**注意**：扫描非自有的机器在很多国家是违法的。仅用于自己拥有/授权的资产。

## 诊断剧本

### "我的服务器流量异常高"

```bash
# 1. 哪个进程在吃流量
sudo nethogs

# 2. 流量主要去往哪些 IP
sudo iftop -nNP

# 3. 看历史趋势（最近几天）
vnstat -d
```

### "服务器被人打"

```bash
# 1. 看哪些 IP 连了过多
sudo ss -tan | awk 'NR>1 {print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# 2. 抓 SYN 包看是否在 SYN flood
sudo tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn) != 0' -c 100

# 3. 临时 ban
sudo iptables -I INPUT -s 1.2.3.4 -j DROP
```

### "DNS 出问题"

```bash
sudo tcpdump -i any -nn 'port 53'
```

## ⚠️ 敏感性

**safe** — 都是只读的监控/抓包工具，不改系统配置（vnstat 守护进程除外）。

## 验证

```bash
command -v nethogs iftop vnstat tcpdump nmap
systemctl is-active vnstat
```

## 排错

- **跨发行版**：这些工具大部分要 EPEL（Playbook preflight 已自动启用）。RHEL 上 `nethogs` 和 `iftop` 在 EPEL，`tcpdump` / `nmap` / `vnstat` 在主仓库。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

- vnstat 数据库在 `/var/lib/vnstat/`，含每个网卡的流量历史。不上传不同步。
- tcpdump 抓包文件可能含敏感数据（cookie、密码），生成的 .pcap 务必妥善处理。
