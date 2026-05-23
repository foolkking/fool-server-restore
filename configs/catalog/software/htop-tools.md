# 系统监控 CLI 工具集

一组诊断系统性能用的命令行工具——CPU / 内存 / 磁盘 IO / 磁盘空间 / 历史性能数据。装上即用，无需配置。**SSH 远程排错时第一批必装的工具**。

## 你将得到什么

- 📦 **htop** — 现代版 top（彩色、可点击、tree view、按 F5 切换）
- 📦 **btop** — 比 htop 更现代（鼠标支持、磁盘网络面板、漂亮的图形）
- 📦 **iotop** — 实时显示哪个进程在读写磁盘
- 📦 **ncdu** — 交互式目录大小分析器（找占空间的文件夹）
- 📦 **sysstat** — 含 `sar` / `iostat` / `mpstat` / `pidstat`，可保留历史数据
- ✅ sysstat 启用：每 10 分钟采集一次，存到 `/var/log/sa/`，事后能查"昨天 3 点 CPU 多少"

## 配置文件 / 目录速查

```
# htop
~/.config/htop/htoprc                # 用户配置（按 F2 设置后自动写）

# btop
~/.config/btop/btop.conf             # 用户配置
~/.config/btop/themes/               # 主题文件

# sysstat（最重要的配置）
/etc/sysstat/sysstat                 # Ubuntu/Debian 主配置（启用 / 间隔）
/etc/sysconfig/sysstat               # RHEL/Anolis 主配置
/etc/cron.d/sysstat                  # cron 任务（每 10 分钟跑 sa1）
/var/log/sa/                         # 历史数据二进制存档（按日切分）
├── sa15                             # 15 号当天数据
├── sa16
├── sar15                            # 15 号每日报告（文本）
└── sar16

# iotop
# 无配置文件，命令行参数为主
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名（核心） | `htop` `btop` `iotop` `ncdu` `sysstat` | `htop` `btop` `iotop` `ncdu` `sysstat` |
| btop 装哪 | Ubuntu 22.04+ 默认仓库；老版本需 snap | EPEL（preflight 自动启用） |
| sysstat cron 路径 | `/etc/cron.d/sysstat` | `/etc/cron.d/sysstat` |
| sysstat 启用文件 | `/etc/default/sysstat` 设 `ENABLED="true"` | 默认就启用，无开关文件 |
| 历史数据保留 | 默认 7 天（`/etc/sysstat/sysstat` 改 `HISTORY=`） | 默认 28 天 |

## 常见配置模板

### 模板 A — sysstat 增加采样频率（默认 10 分钟太粗）

```bash
# Ubuntu/Debian
sudo nano /etc/cron.d/sysstat
# 把
# 5-55/10 * * * * root /usr/lib/sysstat/sa1 1 1
# 改为（每 2 分钟采一次）
# */2 * * * * root /usr/lib/sysstat/sa1 1 1

sudo systemctl restart cron

# 增加历史保留期到 30 天
sudo sed -i 's/^HISTORY=7/HISTORY=30/' /etc/sysstat/sysstat   # Ubuntu
sudo sed -i 's/^HISTORY=28/HISTORY=30/' /etc/sysconfig/sysstat # RHEL
```

### 模板 B — htop 偏好（推荐起手式）

按 `F2` 进设置，或直接写 `~/.config/htop/htoprc`：

```
# 关键非默认值
fields=0 48 17 18 38 39 40 2 46 47 49 1
hide_kernel_threads=1
hide_userland_threads=0
shadow_other_users=0
show_thread_names=0
show_program_path=1
highlight_base_name=1
highlight_megabytes=1
highlight_threads=1
tree_view=0                  # F5 切换
header_margin=1
detailed_cpu_time=0
cpu_count_from_zero=0
update_interval=15            # 1.5 秒刷新（默认 1 秒）
color_scheme=0
delay=15
```

### 模板 C — btop 偏好

```ini
# ~/.config/btop/btop.conf
color_theme = "Default"
theme_background = false
truecolor = true
shown_boxes = "cpu mem net proc"
update_ms = 2000              # 2 秒刷新
proc_sorting = "cpu lazy"
proc_tree = false             # 默认列表模式
log_level = "WARNING"
disks_filter = "exclude=/boot /dev/loop /var/lib/docker"
```

### 模板 D — 常用 sar 查询

```bash
# 今天 CPU 历史
sar

# 今天内存
sar -r

# 今天网络（每个网卡）
sar -n DEV

# 今天磁盘（每个块设备）
sar -d

# 今天 swap
sar -S

# 今天 load avg
sar -q

# 看具体某天（5 号）
sar -f /var/log/sa/sa05
sar -r -f /var/log/sa/sa05            # 5 号内存
sar -d -f /var/log/sa/sa05            # 5 号磁盘

# 时间窗口（如 14:00-15:00）
sar -s 14:00:00 -e 15:00:00

# 实时（每 2 秒，5 次）
sar 2 5
```

## 关键参数调优速查

### 现场排错"按问题选工具"

| 现象 | 第一选择 | 第二选择 |
|---|---|---|
| CPU 100% | `htop` 看哪个进程 | `pidstat 1` |
| 内存被吃光 | `htop` F6 排序 by RES | `ncdu /` 找大文件 |
| 磁盘 100% busy | `iotop -o` | `iostat -x 1` |
| 网络慢 | `iftop` / `nethogs` | `sar -n DEV 1` |
| Load 高但 CPU/IO 都不高 | `vmstat 1`（看 r/b 列） | `pidstat -d 1` |
| 系统昨天慢但现在好了 | `sar -f /var/log/sa/sa<DD>` | – |
| 找占空间目录 | `ncdu /` | `du -h --max-depth=1 /` |

### htop 快捷键速记

| Key | 作用 |
|---|---|
| `F2` | 设置 |
| `F3` | 搜索进程 |
| `F4` | 过滤（按命令名） |
| `F5` | tree view |
| `F6` | 选择排序列 |
| `F7` / `F8` | renice -1 / +1 |
| `F9` | kill 进程（选信号） |
| `F10` | 退出 |
| `space` | 标记多个进程 |
| `c` | tag children with parent |
| `t` | tree view |
| `H` | 显示 / 隐藏用户线程 |
| `K` | 显示 / 隐藏内核线程 |
| `M` | 按内存排序 |
| `P` | 按 CPU 排序 |
| `T` | 按时间排序 |

### iotop 快捷键

| Key | 作用 |
|---|---|
| `o` | 仅显示有 IO 的进程（最常用） |
| `a` | 累计模式（自启动以来） |
| `r` | 反转排序 |
| `i / s` | iotop 自身改 nice |

## 跨发行版兼容

| 工具 | Ubuntu/Debian | RHEL/Anolis 9 | 备注 |
|---|---|---|---|
| `htop` | 默认仓库 | 默认仓库 | – |
| `btop` | Ubuntu 22.04+ 默认；老版本要 snap | EPEL（preflight 启用） | 二进制名 `btop` |
| `iotop` | 默认仓库 | 默认仓库 | 需 root |
| `ncdu` | 默认仓库 | EPEL（preflight 启用） | – |
| `sysstat` | 默认仓库 | 默认仓库 | RHEL 默认就启用，Ubuntu 要 `ENABLED="true"` |

EnvForge preflight 自动在 RHEL/Anolis 启用 EPEL，btop / ncdu 不会找不到。

## 与其它 catalog 项的配合

- **`netdata-monitoring`** — Web 仪表盘版的 htop+btop+sar，自动告警；本工具集是 SSH 内的应急
- **`prometheus-monitoring`** — node_exporter 长期采集；htop/sar 是临场看
- **`zabbix-monitoring`** — 同上
- **`swap-config`** — sysstat 能记录 swap 使用历史

## 排错

### `sar` 显示 `Cannot open /var/log/sysstat/sa15: No such file or directory`

sysstat 第一次装完还没采集到数据。等 10 分钟后再来，或手动触发一次：

```bash
# 强制采一次
sudo /usr/lib/sysstat/sa1 1 1            # Ubuntu/Debian 路径
sudo /usr/lib64/sa/sa1 1 1               # RHEL/Anolis 路径

# 看 cron 是不是在跑
sudo systemctl status cron     # Ubuntu
sudo systemctl status crond    # RHEL
```

### Ubuntu 上 `sar: command not found` 但 sysstat 已装

Ubuntu 默认 sysstat 装完是**禁用**的，要改：

```bash
sudo sed -i 's/^ENABLED="false"/ENABLED="true"/' /etc/default/sysstat
sudo systemctl restart sysstat
sudo systemctl enable sysstat
```

本 Playbook 已自动处理。

### `btop` 找不到（旧 Ubuntu / RHEL）

```bash
# Ubuntu 22.04 之前
sudo snap install btop

# RHEL 9 / Anolis 9 — preflight 应已启用 EPEL
sudo dnf install epel-release
sudo dnf install btop
```

或从源码编译：

```bash
git clone https://github.com/aristocratos/btop.git
cd btop && make && sudo make install
```

### `iotop` 报 `OSError: Netlink error: Operation not permitted`

需要 root 或 CAP_NET_ADMIN：

```bash
sudo iotop                            # 这是预期用法
# 或给当前用户加 capability
sudo setcap 'cap_net_admin+eip' $(which iotop)
```

### `ncdu` 启动慢 / 卡住

扫描大目录（如 `/`）会慢。技巧：

```bash
# 排除某些目录
ncdu --exclude /proc --exclude /sys --exclude /run /

# 离线扫描 + 后续浏览
sudo ncdu -o /tmp/ncdu.json --exclude /proc /
ncdu -f /tmp/ncdu.json
```

## 验证

```bash
# 1. 命令存在
command -v htop btop iotop ncdu sar pidstat iostat

# 2. sysstat 在跑
systemctl is-active sysstat || systemctl is-active cron        # Ubuntu
systemctl is-active crond                                       # RHEL

# 3. sar 能查（首次装完 10 分钟后）
sar -u 1 1                # 实时采一次

# 4. 数据文件存在
ls -la /var/log/sa/        # 应有 saNN 文件
```

## 多次运行

`installMode: skip-existing`。包安装幂等。重跑只会确认服务启用、不会破坏 `~/.config/htop/htoprc` 之类的用户偏好。

## ⚠️ 敏感性

**safe** — 都是只读监控工具。`iotop` 启动需 root（读 netlink）；`htop` 杀进程需相应权限——和直接 `kill` 一致，无新风险。

## 隐私说明

- 不发遥测
- sysstat 把性能数据存在本机 `/var/log/sa/`，**不上传不同步**
- htop / btop 显示进程命令行——如果某进程把密码作为命令行参数传（不推荐），其他用户也能看到（这是 Linux 通病，不是本工具的问题）
- 用 `sar -f` 读历史数据时，二进制 sa 文件版本必须匹配——升级 sysstat 后老 sa 文件可能读不出
