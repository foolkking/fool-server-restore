# Swap 交换空间

很多云服务器（特别是低配 VPS / Aliyun / 部分 AWS）默认**没有 swap**——物理内存吃满后直接 OOM 杀进程。配一个 swap 文件可以缓解：让系统有"喘息空间"，避免突发负载触发 OOM。

> **注意**：Swap 不是治本——对内存紧张的根本应对是加内存或优化应用。但作为**安全垫**，2-4 GB swap 几乎是所有 Linux 服务器的标配。

## 你将得到什么

- ✅ 一个 swap **文件**（按表单大小，默认 2 GB；不是 swap 分区）
- ✅ swap 立即激活（`swapon`）
- ✅ 持久化到 `/etc/fstab`（重启后自动 swapon）
- ✅ `vm.swappiness` 按表单值持久化到 `/etc/sysctl.d/99-envforge-swap.conf`
- ✅ 文件权限 0600（仅 root 可读，避免泄露 swap 内的进程内存）

## 表单字段说明

### `swap_size` — Swap 大小（GB）

经验法则：

| 物理内存 | 推荐 Swap | 用途 |
|---|---|---|
| 512 MB - 1 GB | 物理内存 × 2 | 必备，否则 apt 都跑不动 |
| 1-2 GB | 物理内存 × 1.5 | 常见 VPS 配置 |
| 2-8 GB | 等量 | 标准 |
| 8-16 GB | 4 GB | 够 OOM 缓冲 |
| 16-64 GB | 4-8 GB | 不需要等量 |
| > 64 GB | 4-8 GB（或 zram） | 大 swap 反而拖慢系统 |

特殊情况：

- **数据库服务器**：`vm.swappiness=1` + 4-8 GB swap（不要 0，留点弹性）
- **要 hibernate（仅笔记本 / 工作站）**：等量物理内存
- **8 GB+ 内存的服务器**：超过 8 GB swap 没意义，加内存更好

### `swap_path` — Swap 文件路径

默认 `/swapfile`（根分区）。**不要**放：

- NFS / SMB（远程文件系统）
- 加密分区（dm-crypt 没 unlock 时无法 swapon）
- BTRFS（需 `chattr +C` 关 COW，否则碎片化严重）
- ZFS（不支持，需用 zvol）

### `swappiness` — 倾向使用 swap 的程度

| 值 | 行为 |
|---|---|
| `0` | 几乎不用 swap，OOM 时才用（**数据库 / 高性能服务**） |
| `1` | 同 0 但允许极少量（推荐数据库） |
| `10` | 服务器经典值（**生产推荐**） |
| `60` | Linux 默认（桌面） |
| `100` | 积极用 swap（仅极小内存机器） |

数据库（PG / MySQL / Mongo）建议 `vm.swappiness=1`。

### `vfs_cache_pressure`

控制内核回收 inode/dentry 缓存的倾向。默认 100。

| 值 | 适用 |
|---|---|
| `50` | 文件 IO 多的服务（数据库 / nginx 静态站） |
| `100`（默认） | 通用 |
| `200` | 内存极紧 |

## 配置文件 / 目录速查

```
/swapfile                                # ← 默认 swap 文件
/etc/fstab                               # ← 持久化挂载（含一行 /swapfile none swap sw 0 0）
/etc/sysctl.d/99-envforge-swap.conf      # ← swappiness / vfs_cache_pressure 持久化
/proc/sys/vm/swappiness                  # 运行时值（sysctl 间接改这里）
/proc/swaps                              # 当前激活的 swap 列表

# 工具命令
swapon --show          # 看激活状态
free -h                # 看用量
sysctl vm.swappiness   # 看当前值
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| swap 文件路径 | 推荐 `/swapfile`（根分区） | 相同 |
| `mkswap` / `swapon` 命令 | util-linux 自带 | 相同 |
| sysctl 持久化目录 | `/etc/sysctl.d/` | 相同 |
| fstab 格式 | `<file> none swap sw 0 0` | 相同 |

## 常见配置模板

### 模板 A — 手动创建 swap 文件（Playbook 已做，仅供参考）

```bash
# 1. 创建文件（fallocate 优先，几秒；老 fs 用 dd 慢）
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096

# 2. 权限
sudo chmod 600 /swapfile

# 3. 格式化为 swap
sudo mkswap /swapfile

# 4. 激活
sudo swapon /swapfile

# 5. 持久化
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 6. 验证
swapon --show
free -h
```

### 模板 B — 改 swap 大小（在线，不重启）

```bash
# 1. 关掉
sudo swapoff /swapfile

# 2. 删原文件
sudo rm /swapfile

# 3. 新建 8 GB
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 4. 验证（fstab 不用改，已经是 /swapfile）
free -h
```

### 模板 C — 多 swap 文件（更精细控制）

老内核也支持多 swap 文件，可挂在不同盘 + 不同优先级：

```bash
# 主 swap（NVMe 盘，优先级高）
sudo fallocate -l 4G /swap-nvme
sudo chmod 600 /swap-nvme
sudo mkswap /swap-nvme
sudo swapon -p 100 /swap-nvme

# 次 swap（SATA 盘，优先级低）
sudo fallocate -l 4G /mnt/sata/swap-sata
sudo chmod 600 /mnt/sata/swap-sata
sudo mkswap /mnt/sata/swap-sata
sudo swapon -p 50 /mnt/sata/swap-sata

# fstab
echo '/swap-nvme           none swap sw,pri=100 0 0' | sudo tee -a /etc/fstab
echo '/mnt/sata/swap-sata  none swap sw,pri=50  0 0' | sudo tee -a /etc/fstab
```

### 模板 D — zram（推荐替代方案）

zram 是**内存压缩交换**——不写盘，比 swap 文件快 10×。Linux 内核内置：

```bash
# Ubuntu / Debian
sudo apt-get install zram-tools
# 自动配置：默认 zram 大小 = 物理内存 50%

# 看状态
zramctl

# 配置（如需调整）
sudo nano /etc/default/zramswap
# PERCENT=50            # 物理内存的百分比
# ALGO=zstd              # 压缩算法（zstd 最快，lz4 备选）
sudo systemctl restart zramswap

# RHEL / Anolis 9
sudo dnf install zram-generator-defaults
# 配置 /usr/lib/systemd/zram-generator.conf
sudo systemctl daemon-reload
sudo systemctl start /dev/zram0
```

zram 适合：

- ✅ 内存 < 4 GB（用 zram 比写盘 swap 好得多）
- ✅ Container / k8s 节点
- ✅ 写入密集型应用（避免 SSD 损耗）
- ❌ Hibernate（zram 不支持）

可以同时用：zram（小） + swap 文件（大，作为 zram 满后的 fallback）。

### 模板 E — 加密 swap（防 cold boot 攻击）

对于物理机或要求严格隔离的场景：

```bash
# 用 dm-crypt 加密 swap 文件
sudo swapoff /swapfile
sudo cryptsetup -v luksFormat /swapfile         # 设密码
sudo cryptsetup open /swapfile encrypted-swap
sudo mkswap /dev/mapper/encrypted-swap
sudo swapon /dev/mapper/encrypted-swap

# /etc/crypttab
echo "encrypted-swap /swapfile /dev/urandom swap" | sudo tee -a /etc/crypttab

# /etc/fstab（替代原行）
echo "/dev/mapper/encrypted-swap none swap sw 0 0" | sudo tee -a /etc/fstab
```

VPS 场景一般不需要——hypervisor 已经隔离了内存。

## 关键参数调优速查

### `vm.swappiness`

```bash
# 临时改
sudo sysctl -w vm.swappiness=10

# 持久化
echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-envforge-swap.conf
sudo sysctl -p /etc/sysctl.d/99-envforge-swap.conf

# 看当前
cat /proc/sys/vm/swappiness
```

### `vm.vfs_cache_pressure`

```bash
# 数据库 / 文件 IO 多
sudo sysctl -w vm.vfs_cache_pressure=50
echo "vm.vfs_cache_pressure=50" | sudo tee -a /etc/sysctl.d/99-envforge-swap.conf
```

### 监控

```bash
# 看 swap 用量
free -h
# Swap 行的 used > 0 说明在用

# 哪个进程在 swap 里
# 老方法（不准）：cat /proc/<pid>/status | grep VmSwap
# 推荐：smem
sudo apt-get install smem
sudo smem -s swap -t -r | head        # 按 swap 用量排序

# 历史 swap in/out 频率（关键指标）
vmstat 5         # si / so 列；如果持续非 0 说明真的在用
```

`si` / `so` 是 swap-in / swap-out 速率（KB/s）。**持续 > 1MB/s 说明物理内存严重不足**——swap 已是 band-aid，需要真加内存。

### Swap 占用 vs Swap 流动

```bash
# 占用量大但 si/so 是 0 = 历史峰值，现在没流动 = OK
free -h && vmstat 1 5

# 占用量小但 si/so 持续非 0 = 在频繁换页 = 问题
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `fallocate` | 默认（util-linux） | 默认 |
| `mkswap` | 默认 | 默认 |
| `swapon -a` 读 fstab | 默认 systemd 行为 | 相同 |
| sysctl.d 加载 | systemd-sysctl service | 相同 |
| BTRFS 支持 | Ubuntu 23.04+ 内核完善 | RHEL 9 需 `chattr +C` |

**特殊文件系统注**：

- **BTRFS**：需对 swap 文件先 `chattr +C` 关 COW + `truncate -s 0`，否则 swapon 拒绝
- **ZFS**：不支持文件 swap，需用 zvol（`zfs create -V 4G zroot/swap`）
- **加密分区**：unlock 后才能 swapon（systemd-cryptsetup 处理）

EnvForge Playbook 自动检测文件系统并对 BTRFS 处理 NoCOW 属性。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — Docker 默认禁用 OOM killer 在容器层面，宿主机 swap 帮助缓冲
- **`postgres-profile`** — PG 强烈推荐 `vm.swappiness=1`（避免热数据被换出）
- **`mysql-server`** / **`mongodb`** — 同上
- **`elasticsearch`** — 推荐**关闭 swap**（`bootstrap.memory_lock: true` + `vm.swappiness=1`），ES 自己管内存
- **`netdata-monitoring`** / **`prometheus-monitoring`** — 实时看 swap 流动率

## 排错

### `fallocate: not supported`

文件系统不支持（NFS / 部分加密 fs / 老 BTRFS）。Playbook 自动 fallback 到 `dd`，但慢得多（4 GB 需 ~30 秒）。

或换 swap 文件位置到支持的 fs（通常 `/var/swap` 或 `/swapfile`）。

### swap 没生效（重启后没 swap）

```bash
# 1. swapon 看激活的
swapon --show
# 没东西？

# 2. fstab 有没有
grep swap /etc/fstab
# 没有就加：
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. 手动激活
sudo swapon -av
```

### `swapon: /swapfile: insecure permissions, 0644 (recommended 0600)`

权限错：

```bash
sudo chmod 600 /swapfile
sudo swapon /swapfile
```

### 磁盘空间不足

```bash
# 看根分区
df -h /

# 不够的话先清理
sudo apt-get clean              # apt 缓存
sudo journalctl --vacuum-time=7d  # 老日志
sudo docker system prune -a      # docker（如有）
```

### swappiness 改了但没生效

```bash
# 检查
sudo sysctl vm.swappiness         # 应是新值
cat /proc/sys/vm/swappiness        # 同上

# /etc/sysctl.d/ 文件在不在
ls /etc/sysctl.d/ | grep swap
sudo sysctl -p /etc/sysctl.d/99-envforge-swap.conf

# 某些发行版有多个 sysctl 配置文件冲突——后加载的覆盖前面的
sudo sysctl --system 2>&1 | grep -i swappi
```

### BTRFS 上 `swapon: file has holes`

BTRFS 默认 COW，swap 不允许：

```bash
sudo swapoff /swapfile
sudo rm /swapfile
sudo touch /swapfile
sudo chattr +C /swapfile         # 关 COW（必须在文件为空时设）
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### swap 用量持续 > 50% 但 free -h 显示 free 充足

老应用历史峰值留下的占用——内核不主动收回（懒）。要回收：

```bash
sudo swapoff -a && sudo swapon -a    # 强制 swap-in 所有 swapped 数据
# 注意：如果数据量大于 free RAM，机器会卡或 OOM
```

平时不用主动收，让内核管理就好。

### 高频 OOM 即使有 swap

swap 也吃满了。两条路：

```bash
# 1. 加大 swap（治标）
# 见模板 B

# 2. 找内存泄漏（治本）
sudo smem -s rss -r | head -10            # 哪些进程占内存
sudo dmesg | grep -i "killed process"     # OOM killer 杀谁
```

## 验证

```bash
# 1. swap 激活
swapon --show
# NAME      TYPE  SIZE USED PRIO
# /swapfile file    2G   0B   -2

# 2. free 显示 Swap 行 total > 0
free -h

# 3. fstab 包含 swap 行
grep swap /etc/fstab

# 4. swappiness 值生效
sysctl vm.swappiness            # 应等于表单值

# 5. 重启测试（生产慎跑）
# sudo reboot && swapon --show

# 6. 文件权限
ls -la /swapfile                # -rw------- 1 root root
```

## 多次运行

`installMode: skip-existing`。

- 已存在的 swap 文件**不会被重新创建**（保留现有大小）
- swappiness / vfs_cache_pressure 每次按表单值更新
- fstab 行幂等（已存在不重复加）

要改 swap 大小：手动按模板 B 操作（关掉 → 删 → 新建），然后调表单值重跑。

## ⚠️ 敏感性

**safe** — swap 是基础设施，不动业务数据。

注意点：

- swap **占磁盘空间**（默认 2 GB），磁盘紧张时 Playbook 会失败
- 创建 swap 文件可能耗时（依磁盘速度，4 GB ≈ 几秒到 1 分钟）
- 文件权限自动 0600，避免普通用户读

## 隐私说明

- swap 文件可能含进程内存内容（**明文密码 / token / 解密后的数据**）
- 物理机被偷或硬盘被取出时，理论上能从 swap 恢复出运行过的敏感数据
- VPS / 云主机场景一般不用担心（hypervisor 隔离）
- 高安全场景：用 zram（不写盘）或加密 swap（模板 E）
- swap 文件 0600 权限确保普通用户不能读
- `vm.swappiness=0` 几乎不写 swap，但极端情况下仍可能有少量内容落盘
