# Swap 交换空间

很多云服务器（特别是低配 VPS / Aliyun / 部分 AWS）默认**没有 swap**。物理内存吃满后
直接 OOM 杀进程。装一个 swap 文件可以缓解（不是真治疗，但能让系统活下来）。

## 你将得到什么

- ✅ 一个 swap 文件（按表单大小，默认 2GB）
- ✅ swap 自动激活
- ✅ 持久化到 `/etc/fstab`（重启后自动 swapon）
- ✅ `vm.swappiness` 按表单值持久化

## 表单字段说明

### Swap 大小

经验法则：

| 物理内存 | 推荐 Swap |
|---|---|
| < 2 GB | 内存的 2 倍 |
| 2-8 GB | 等量内存 |
| 8-64 GB | 4 GB（足够，除非要 hibernate） |
| > 64 GB | 不建议，调优后用 zram 或者干脆不要 swap |

### swappiness

数值越大越倾向用 swap（牺牲性能换内存）：
- **0**：能不用就不用 swap（适合数据库 / 高性能服务器）
- **10**：服务器经典值（推荐）
- **60**：Linux 默认（桌面）
- **100**：积极用 swap

### Swap 路径

默认 `/swapfile`。建议放在**根分区**——不要放 NFS / 加密分区 / 慢磁盘。

## 安装后

### 验证

```bash
swapon --show
# NAME      TYPE  SIZE USED PRIO
# /swapfile file    2G   0B   -2

free -h
# 看 Swap 行的 total，应该等于你设的大小
```

### 临时改大小

```bash
sudo swapoff /swapfile
sudo rm /swapfile
sudo fallocate -l 4G /swapfile     # 改成 4GB
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 监控 swap 使用

```bash
# swap 用得多说明物理内存吃紧
free -h
# 哪个进程在 swap 里
sudo smem -s swap -t -r | head
```

### zram（可选，更现代的方案）

zram 是内存压缩交换——比 swap 文件快 10x，不写盘。Linux 内核内置：
```bash
sudo modprobe zram
sudo apt-get install zram-tools     # Ubuntu，自动配置
sudo dnf install zram-generator     # RHEL
```

如果机器内存 < 4GB 但还想跑 docker/k8s，zram 比 swap 文件好。

## ⚠️ 敏感性

**safe** — swap 是基础设施层，不动业务数据。

但有一些注意：
- swap **占磁盘空间**（默认 / 分区 2GB），磁盘紧张时要确认有空间
- 创建 swap 文件那一步可能耗时（依磁盘速度，1GB 大约 1-3 秒）

## 验证

```bash
swapon --show
free -h
sysctl vm.swappiness
grep swap /etc/fstab
```

## 排错

- **`fallocate: not supported`** — 文件系统不支持（如 NFS、某些加密 fs）。Playbook 自动 fallback 到 `dd`，但慢。
- **swap 没生效** — 重启后看 `swapon --show`，没 swap 检查 /etc/fstab 是否有那行。
- **磁盘空间不足** — `df -h /` 看根分区还有多少空间，至少要预留比 swap 大的空间。

## 多次运行

`installMode: skip-existing`。已存在的 swap 文件不会被重新创建（保留内容）。但 swappiness 每次会按表单值更新。

## 隐私说明

swap 文件可能包含进程内存的内容（明文）。**敏感场景建议加密**：
```bash
sudo cryptsetup luksFormat /swapfile
# 或者用 zram + 内存压缩，避免写盘
```

EnvForge 的 swap 文件不加密（行业默认）。如果机器是物理机被人偷了，理论上能从 swap 里恢复出运行过的进程数据（密码、token 等）——VPS 场景一般不用担心。
