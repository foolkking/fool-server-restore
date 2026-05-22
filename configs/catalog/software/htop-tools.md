# 系统监控 CLI 工具集

一组诊断系统性能用的命令行工具。装上即用，无需配置。

## 你将得到什么

- 📦 **htop** — 现代版 top（彩色、可点击、tree view）
- 📦 **btop** — 比 htop 还现代的版本（鼠标支持、磁盘网络面板）
- 📦 **iotop** — 监控磁盘 IO（哪个进程在读写磁盘）
- 📦 **ncdu** — NCurses 磁盘用量分析器（哪些目录在占空间）
- 📦 **sysstat** — 含 sar / iostat / mpstat 等历史数据工具

## 用法

### htop — 替代 top

```bash
htop
```
`F2` 设置 / `F5` tree 模式 / `F9` 杀进程 / `F10` 退出

### btop — 比 htop 还酷

```bash
btop
```
鼠标可点击，CPU/内存/网络/磁盘四个面板可切换。

### iotop — 哪个进程在吃磁盘

```bash
sudo iotop -o   # 仅显示有 IO 的进程
```
适合排查"磁盘 100% 但 CPU 空闲"的问题。

### ncdu — 找占空间的目录

```bash
sudo ncdu /
# 可交互浏览，按 d 删除选中目录
```
比 `du -sh /*` 直观 100 倍。

### sysstat — 历史性能数据

`sysstat` 装上后默认每 10 分钟采集一次。

```bash
sar              # 看今天的 CPU / 内存历史
sar -r           # 仅内存
sar -n DEV       # 网络
sar -d           # 磁盘
sar -f /var/log/sa/sa15  # 看 15 号那天的（按日存档）
iostat -x 2       # 实时磁盘 IO（每 2 秒一次）
mpstat -P ALL 2   # 每个 CPU 核的占用
vmstat 2          # 虚拟内存 + IO + CPU 概览
```

历史数据非常有用——故障发生后很久还能查"昨天 3 点 CPU 是多少"。

## ⚠️ 敏感性

**safe** — 都是只读监控工具。

## 验证

```bash
command -v htop btop iotop ncdu sar
systemctl is-active sysstat
```

## 排错

- **`btop` 没装上** — 旧发行版（Ubuntu 20.04 / RHEL 8）默认仓库没 btop。EnvForge preflight 会启用 EPEL，理论上能装。装不上就先用 htop。
- **`sar` 显示 "Cannot open"** — sysstat 第一次装完还没采集到数据，等 10 分钟再来。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

不发遥测。sysstat 把性能数据存在 `/var/log/sa/`，不上传不同步。
