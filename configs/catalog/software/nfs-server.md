# NFS 文件服务器

NFS（Network File System v4）是 **Linux 之间共享盘的事实标准**——内核级实现，比 Samba 简单 3 倍 + 性能高 30%+。**适合**：homelab Linux 机器互连、Proxmox 共享存储、容器宿主机挂数据盘、CI 节点共享缓存。**不适合**：Windows 客户端（虽然能装 nfs-client，但默认无）—— 那场景用 `samba-share`。

## 你将得到什么

- 📦 **NFS server**（Debian `nfs-kernel-server` / RHEL `nfs-utils`）
- ✅ Export `/srv/nfs/share`（可改），CIDR 客户端白名单
- ✅ NFSv4 优先（不需 portmap / mountd / statd 端口）
- ✅ `/etc/exports` 写入 + `exportfs -ra` 立即生效
- ✅ 自动放行防火墙（UFW / firewalld 都覆盖）
- ✅ systemd 服务 + 开机自启
- ✅ 旧 `/etc/exports` 备份到 `.envforge.bak`

## 表单字段说明

### `nfs_export_path`

NFS 共享目录绝对路径。**默认 `/srv/nfs/share`**——路径不存在会自动 `mkdir -p`。生产建议按用途分目录（`/srv/nfs/media` / `/srv/nfs/backup` / `/srv/nfs/cicache`），避免一个被写满影响所有。

### `nfs_allowed_clients`

允许的客户端，4 种写法：

| 写法 | 例 | 说明 |
|---|---|---|
| CIDR | `192.168.1.0/24` | **推荐**——整个内网段 |
| 单 IP | `10.0.0.5` | 单台机 |
| 主机名 | `nas.lan` | 解析自 /etc/hosts 或 DNS |
| 通配域 | `*.example.com` | 整域 |
| 全开 | `*` | **绝不在公网用** |

### `nfs_options`

| 选项 | 含义 | 推荐场景 |
|---|---|---|
| `rw` | 读写（默认） | 共享盘 |
| `ro` | 只读 | 公共数据集 / ISO 镜像库 |
| `sync` | 同步写（每写都落盘） | **生产默认** |
| `async` | 异步写（性能好但崩溃丢数据） | 临时缓存 |
| `no_subtree_check` | 关闭子树检查（性能 + 兼容） | **几乎都开** |
| `root_squash` | 远端 root 映射为 nobody | **公开网用** |
| `no_root_squash` | 保留远端 root 权限 | 内网信任客户端 |
| `all_squash` | 所有用户映射 nobody | 公共写入区 |

### `nfs_protocol_version`

- **`4`（默认）**：TCP only，不需 portmap，单端口 2049。所有现代 Linux 用这个。
- `3`：兼容老客户端（< Ubuntu 14 / RHEL 6），需开 portmap + mountd 端口。
- `all`：v3 + v4 同时启。

### `nfs_create_export_dir`

`true` = 自动 mkdir。`false` = 假设目录已存在（用于"我已经有 /data 目录想 export 它"场景）。

## 配置文件 / 目录速查

```
/etc/exports                                    # 主配置（一行一个 export）
/etc/exports.envforge.bak                       # 旧配置备份
/etc/nfs.conf                                    # RHEL 系：协议版本 / 线程数（仅 RHEL 9+）
/etc/default/nfs-kernel-server                  # Debian 系：RPCNFSDCOUNT 线程数
/etc/idmapd.conf                                # NFSv4 ID 映射

# 服务
nfs-kernel-server   (Debian)
nfs-server          (RHEL)
rpcbind             (仅 v3 需要)

# 端口
2049/tcp                                        # NFSv4 唯一端口
111/tcp,udp                                     # rpcbind（仅 v3）
20048/tcp                                        # mountd（仅 v3）
```

| 项 | Debian/Ubuntu | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `nfs-kernel-server` | `nfs-utils` |
| 客户端包 | `nfs-common` | `nfs-utils` |
| 服务名 | `nfs-kernel-server` | `nfs-server` |
| 配置 | `/etc/default/nfs-kernel-server` | `/etc/nfs.conf` |
| Anolis 9 | – | ✅ glibc 兼容 |

## 常见配置模板

### 模板 A — 客户端挂载（一次性）

```bash
# Debian/Ubuntu 客户端先装
sudo apt install -y nfs-common
# RHEL 客户端
sudo dnf install -y nfs-utils

# 临时挂载
sudo mkdir -p /mnt/nfs
sudo mount -t nfs <server-ip>:/srv/nfs/share /mnt/nfs

# 验证
df -h /mnt/nfs
ls /mnt/nfs
```

### 模板 B — 永久挂载（fstab）

```bash
# /etc/fstab
<server-ip>:/srv/nfs/share  /mnt/nfs  nfs  defaults,_netdev,noatime  0  0
```

`_netdev` 关键——告诉 systemd 等网络起来再挂。漏了开机会卡。

### 模板 C — 多 export（不同路径不同权限）

`/etc/exports`:

```
# 内网读写
/srv/nfs/share        192.168.1.0/24(rw,sync,no_subtree_check,root_squash)

# 媒体只读（多 IP）
/srv/nfs/media        192.168.1.0/24(ro,sync) 10.0.0.0/8(ro,sync)

# 备份盘（仅特定机）
/srv/nfs/backup       backup-server.lan(rw,sync,no_root_squash)
```

每改完跑：`sudo exportfs -ra`

### 模板 D — 性能调优（高 IO 场景）

`/etc/default/nfs-kernel-server` (Debian) 或 `/etc/nfs.conf` (RHEL)：

```bash
# Debian: 默认 8 线程，IO 重场景调到 32
RPCNFSDCOUNT=32

# RHEL /etc/nfs.conf
[nfsd]
threads=32
```

挂载选项调优（客户端）：

```bash
# /etc/fstab
<server>:/srv/nfs/share  /mnt/nfs  nfs4  defaults,rsize=131072,wsize=131072,hard,intr,noatime  0  0
```

| 选项 | 作用 | 推荐 |
|---|---|---|
| `rsize=131072` `wsize=131072` | 读写块大小 128k | 千兆 / 万兆网开 |
| `hard` | 服务器宕机时**永远等**（不丢数据） | 默认 |
| `soft` | N 秒超时返回错误 | 仅 read-only 场景 |
| `intr` | 允许 Ctrl-C 中断卡死的操作 | 默认 |
| `noatime` | 不更新访问时间（性能） | 都开 |

### 模板 E — Kerberos 加密（公网 NFS）

公网 NFS 必须配 Kerberos——否则**明文传输**。简化指引：

```
sec=krb5p     # 默认明文 → krb5p（认证 + 加密）
```

详见 `man 5 exports` 的 `sec=` 章节。家庭内网通常不需要。

## 关键参数调优速查

### 资源占用

| 共享内容 | RAM | CPU | 网络 |
|---|---|---|---|
| 单客户端文档共享 | 50 MB | 极低 | < 100 Mbps |
| 5 客户端 + 视频流 | 200 MB | 中 | 千兆吃满 |
| 20 客户端 + 编译共享 | 1 GB+ | 高 | 多网卡 bond |

### 性能瓶颈

1. **磁盘 IO** — NFS 性能 = 底层磁盘性能（NFS 本身开销 < 5%）。SSD > HDD
2. **网络** — 千兆只能 ~110 MB/s，多客户端必须 10GbE
3. **sync vs async** — sync 安全但慢一半；async 快但断电丢数据

### 安全要点

| 风险 | 缓解 |
|---|---|
| 明文传输 | 公网必配 `sec=krb5p`；内网 OK |
| `no_root_squash` 暴露 | 默认 `root_squash`，仅内网信任客户端开 |
| 任意 IP 访问 | `nfs_allowed_clients` 必填具体 CIDR，**绝不 *** |
| UID 撞车 | NFSv4 用 idmapd 名字映射；客户端 / server 用户 UID 一致最稳 |

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `nfs-kernel-server` | `nfs-utils` |
| 服务 | `nfs-kernel-server.service` | `nfs-server.service` |
| 配置文件 | `/etc/exports` `/etc/default/nfs-kernel-server` | `/etc/exports` `/etc/nfs.conf` |
| 防火墙 | UFW `allow 2049/tcp` | firewalld `--add-service=nfs` |
| Anolis 9 | – | ✅ |

## 与其它 catalog 项的配合

- **`samba-share`** — 互补（Win/Mac 用 SMB，Linux 用 NFS）
- **`firewall-baseline`** — 配合放行 2049/tcp（仅内网段）
- **`rsync-tools`** — NFS 是块级共享，rsync 是文件同步——场景互补

## 排错

### 客户端挂载卡住

```bash
# 服务端在监听 2049 吗？
sudo ss -tlnp | grep :2049

# 防火墙
sudo ufw status               # Debian
sudo firewall-cmd --list-all  # RHEL

# 客户端直接 telnet 试连
telnet <server-ip> 2049
```

### `mount: access denied`

```bash
# 服务端：客户端 IP 在白名单吗？
sudo exportfs -v
# 输出应有 192.168.1.5(rw,...) 等

# 客户端：你的 IP 是？
ip addr | grep inet

# 不匹配 → 改 /etc/exports 加入客户端 CIDR → sudo exportfs -ra
```

### `Stale file handle`

```bash
# server 重启 / export 改了 → 客户端持有的 file handle 失效
# 客户端重新 mount
sudo umount -fl /mnt/nfs
sudo mount /mnt/nfs
```

### 写入慢

```bash
# 服务端 sync vs async
grep sync /etc/exports                          # async 性能 +50%（牺牲安全）

# 服务端线程数（Debian）
cat /proc/fs/nfsd/threads                       # 默认 8，调到 32

# 客户端 rsize/wsize（默认 64k，1Gbit 网用 128k）
mount | grep nfs
```

### Anolis 9 上 idmap 错（用户名变 nobody）

```bash
# /etc/idmapd.conf
[General]
Domain = your.domain                            # server 和 client 必须一致

sudo systemctl restart nfs-idmapd
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active nfs-server || systemctl is-active nfs-kernel-server

# 2. 端口监听
ss -tlnp | grep :2049

# 3. Export 列表
sudo exportfs -v

# 4. 客户端实测挂载
sudo mkdir /tmp/nfs-test
sudo mount -t nfs localhost:/srv/nfs/share /tmp/nfs-test
ls /tmp/nfs-test
sudo umount /tmp/nfs-test
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`/etc/exports` 每次按表单值重写**——你手动加的 export 行**会被覆盖**。多 export 场景请直接编辑 `/etc/exports` 而非重跑 Playbook。

## ⚠️ 敏感性

**review** — NFS 默认明文传输，**绝不能裸跑公网**。

强制：

1. `nfs_allowed_clients` 必填具体 CIDR——`*` 仅适合**单机封闭测试**
2. 默认 `root_squash`——内网信任客户端再考虑 `no_root_squash`
3. 公网必配 Kerberos `sec=krb5p`
4. 客户端 / 服务端用户 UID 对齐（或用 NFSv4 idmap）

## 隐私说明

- NFS 内核级，**无遥测**
- 默认明文传输，内网安全；公网必加密
- 客户端访问不记录到日志（除非开 nfs-utils audit）
