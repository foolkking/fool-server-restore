# Samba 文件共享

Samba 提供 SMB / CIFS 协议网络文件共享。**Windows / macOS / Linux 都能挂载**它的 share。适合家庭 NAS、办公室文件服务器、跨平台资料同步。

> ⚠️ **绝不公网暴露 Samba**。SMB 协议历史漏洞多（WannaCry / EternalBlue），公网暴露 = 送上门。仅内网 / VPN 内使用。

## 你将得到什么

- 📦 **samba** + **samba-common**
- ✅ 一个共享目录（按表单值创建）
- ✅ 一个 Samba 用户 + 密码
- ✅ `[share]` 段追加到 `/etc/samba/smb.conf`
- ✅ smbd / nmbd 服务自动启动 + 开机自启

## 表单字段说明

### `share_name`

客户端连接时的路径名（`\\server-ip\<share_name>`）。建议简短无空格。

### `share_path`

服务器上实际目录（如 `/srv/samba/shared`）。EnvForge 自动创建并设权限 0775。

### `share_user` / `share_password`

登录凭据。Samba **独立于系统密码体系**——这是 Samba 用户名 / 密码，与 Linux 系统账号无直接关系（虽然 Samba 用户必须先存在为 Linux 用户）。

### `guest_ok`

| 值 | 行为 |
|---|---|
| ❌ 关闭（**默认**） | 必须密码登录 |
| ✅ 开启 | 匿名访问。仅家庭 NAS / 受信内网 |

### `read_only`

| 值 | 适用 |
|---|---|
| ❌ 关闭 | 读写（默认，可上传文件） |
| ✅ 开启 | 仅读（分发安装包 / 归档） |

### `workgroup`

Windows 工作组名。家庭 / 小型办公用 `WORKGROUP`，AD 域环境填域名。

## 配置文件 / 目录速查

```
/etc/samba/
├── smb.conf                              # ← 主配置
├── smbpasswd                              # 老式密码文件（已弃用）
├── tdb_passdb.tdb                         # 默认 TDB 用户数据库
├── secrets.tdb                            # 域 / 信任关系密钥
└── usershare/                             # 用户级共享（可选）

/var/lib/samba/                           # 运行时状态
├── private/
│   ├── passdb.tdb                         # ← 用户数据库（推荐 backend）
│   └── secrets.tdb
├── lock/                                   # 文件锁
└── log/                                    # 各客户端日志

/var/log/samba/
├── log.smbd                                # smbd 日志
├── log.nmbd                                # NetBIOS 名称服务
└── log.<client-name>                       # 每客户端独立日志

# 数据共享目录（典型）
/srv/samba/shared/                         # ← EnvForge 默认创建
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `samba` `samba-common` | `samba` `samba-common-tools` |
| 服务名 | `smbd` + `nmbd` | `smb` + `nmb` |
| 配置文件 | `/etc/samba/smb.conf` | 相同 |
| 默认共享 root | – | – |
| SELinux | – | **必须**配（默认拒绝） |

## 常见配置模板

### 模板 A — 推荐 `/etc/samba/smb.conf`（生产基线）

```ini
#==============================================================
# Global parameters
#==============================================================
[global]
    workgroup = WORKGROUP
    server string = EnvForge File Server
    server role = standalone server
    netbios name = filesrv

    # 仅监听内网网卡（绝不 0.0.0.0 公网）
    interfaces = 127.0.0.1 10.0.0.0/8 192.168.0.0/16
    bind interfaces only = yes

    # 协议（SMB1 早被废弃，明确禁用）
    server min protocol = SMB2
    server max protocol = SMB3

    # 加密（强烈推荐）
    server signing = mandatory
    smb encrypt = required                    # SMB3 加密

    # 用户认证
    security = user
    passdb backend = tdbsam
    map to guest = Bad User                    # 失败用户映射为 guest（前提 guest 启用）

    # 字符集
    unix charset = UTF-8
    dos charset = CP932                         # Windows 中文用 CP936

    # 性能
    socket options = TCP_NODELAY IPTOS_LOWDELAY SO_RCVBUF=131072 SO_SNDBUF=131072
    use sendfile = yes
    aio read size = 16384
    aio write size = 16384
    deadtime = 30                                # 30 分钟空闲断
    max log size = 1000                          # KB

    # 名字解析（家庭 NAS）
    name resolve order = lmhosts host wins bcast

    # WINS（一般关掉，使用 DNS）
    wins support = no

    # 打印（绝大多数场景关掉）
    load printers = no
    printing = bsd
    printcap name = /dev/null
    disable spoolss = yes

    # 日志
    log file = /var/log/samba/log.%m
    log level = 1

#==============================================================
# Shares
#==============================================================
[shared]
    comment = Shared files
    path = /srv/samba/shared
    valid users = @smbusers                     # 仅 smbusers 组成员
    read only = no
    browseable = yes
    create mask = 0644
    directory mask = 0755
    force group = smbusers                       # 新建文件归属组
    inherit permissions = yes
    veto files = /._*/.DS_Store/Thumbs.db/      # 不让客户端看 macOS / Win 元数据
    delete veto files = yes

[backup]
    comment = Read-only backup share
    path = /srv/samba/backup
    valid users = @smbusers
    read only = yes
    browseable = yes

[private]
    comment = Per-user private folder
    path = /srv/samba/private/%U                  # %U = 当前用户名（自动隔离）
    valid users = %S                              # 仅本人能进
    read only = no
    browseable = no                                # 不在共享列表显示
    create mask = 0600
    directory mask = 0700
```

应用：

```bash
sudo testparm                                   # 校验语法
sudo systemctl reload smbd                      # 重载（不断现有连接）
```

### 模板 B — 创建 Samba 用户

```bash
# 1. 先建 Linux 用户（Samba 用户必须有对应 Linux 用户）
sudo useradd -M -s /usr/sbin/nologin alice         # -M 不建 home，nologin 不让 SSH 登录
sudo passwd alice                                  # 系统密码（可选，nologin 时无意义）

# 2. 加入 Samba 用户组
sudo groupadd -f smbusers
sudo usermod -aG smbusers alice

# 3. 设 Samba 密码（这是连接 Samba 时用的，与系统密码独立）
sudo smbpasswd -a alice                            # 提示输入两次新密码

# 4. 启用账号
sudo smbpasswd -e alice

# 验证
sudo pdbedit -L                                    # 列所有 Samba 用户
sudo pdbedit -L -v                                 # 详细
```

### 模板 C — 客户端连接

#### Windows 资源管理器

```
\\10.0.0.5\shared
```

弹出登录 → 填用户名 / 密码。"记住凭据"勾上。

或映射网络驱动器：

```
右键"此电脑" → 映射网络驱动器 → \\10.0.0.5\shared
```

#### macOS Finder

```
⌘K → smb://10.0.0.5/shared
```

或菜单栏 → 前往 → 连接服务器 → `smb://...`。

#### Linux mount（永久）

```bash
# /etc/fstab
//10.0.0.5/shared  /mnt/shared  cifs  credentials=/root/.smbcred,uid=1000,gid=1000,iocharset=utf8,vers=3.0  0  0

# /root/.smbcred（权限 0600）
sudo tee /root/.smbcred > /dev/null <<EOF
username=alice
password=alice-password
EOF
sudo chmod 600 /root/.smbcred

# 挂载
sudo mkdir -p /mnt/shared
sudo apt-get install cifs-utils
sudo mount -a
```

#### Linux mount（一次性）

```bash
sudo mount -t cifs //10.0.0.5/shared /mnt/shared \
  -o username=alice,password=...,uid=$(id -u),gid=$(id -g),vers=3.0,iocharset=utf8
```

### 模板 D — 防火墙

```bash
# Ubuntu (UFW)
sudo ufw allow samba
# 或精细
sudo ufw allow from 10.0.0.0/8 to any port 137,138 proto udp
sudo ufw allow from 10.0.0.0/8 to any port 139,445 proto tcp

# RHEL/Anolis (firewalld)
sudo firewall-cmd --add-service=samba --permanent
# 或限制源 IP
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" service name="samba" accept' --permanent
sudo firewall-cmd --reload
```

### 模板 E — RHEL/Anolis SELinux 配置（关键）

RHEL 系 SELinux 默认拒绝 Samba 写非默认目录。两条路：

```bash
# 方案 1：给目录打 samba_share_t 标签
sudo semanage fcontext -a -t samba_share_t '/srv/samba/shared(/.*)?'
sudo restorecon -R /srv/samba/shared

# 方案 2：开 boolean（更宽松）
sudo setsebool -P samba_export_all_rw 1
sudo setsebool -P samba_enable_home_dirs 1     # 共享 home 目录
sudo setsebool -P samba_load_libgfapi 1         # GlusterFS 集成
```

EnvForge Playbook 自动跑方案 1（首选最小权限）。

### 模板 F — 与 macOS Time Machine 兼容

```ini
[timemachine]
    comment = Time Machine
    path = /srv/samba/timemachine
    valid users = @smbusers
    read only = no

    fruit:aapl = yes                            # macOS 元数据兼容
    fruit:time machine = yes                     # TM 标记
    fruit:time machine max size = 500G           # 限制大小防爆磁盘
    vfs objects = catia fruit streams_xattr
    durable handles = yes
    kernel oplocks = no
    kernel share modes = no
    posix locking = no
    inherit acls = yes
```

global 段也要加：

```ini
[global]
    fruit:metadata = stream
    fruit:model = MacSamba
    fruit:posix_rename = yes
    fruit:veto_appledouble = no
    fruit:wipe_intentionally_left_blank_rfork = yes
    fruit:delete_empty_adfiles = yes
```

## 关键参数调优速查

### 性能

| 参数 | 默认 | 推荐 |
|---|---|---|
| `socket options` | （空） | `TCP_NODELAY IPTOS_LOWDELAY SO_RCVBUF=131072 SO_SNDBUF=131072` |
| `use sendfile` | yes | yes（默认 OK） |
| `aio read size` / `aio write size` | 0 | 16384（异步 IO） |
| `deadtime` | 0 | 30（30 分钟空闲断） |
| `min receivefile size` | 0 | 16384 |
| `server multi channel support` | yes | yes（SMB3 多通道） |

### 协议版本

| 协议 | 版本 |
|---|---|
| SMB1 / NT1 | **永远禁用**（漏洞 / WannaCry） |
| SMB2 | Vista+ / OS X 10.7+ |
| SMB2_22 | Windows 8 / 2012 |
| SMB3 | Windows 8 / 2012R2，**默认推荐** |
| SMB3_11 | Windows 10，最新 |

```ini
[global]
server min protocol = SMB2
server max protocol = SMB3
```

### 加密

```ini
[global]
smb encrypt = required                          # 强制加密（SMB3）
# = desired                                      # 协商，不强制
# = off                                           # 关闭（**不推荐**）

server signing = mandatory                       # 数据完整性签名
```

加密 + 签名会让吞吐降 20-40%——内网可信场景可关。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `samba` | `samba` |
| 服务名 | `smbd` `nmbd` | `smb` `nmb` |
| Web UI 包 | `swat`（已废弃） | `samba-swat`（同废弃） |
| 默认仓库版本 | Ubuntu 22 = 4.15，Ubuntu 24 = 4.19 | RHEL 9 / Anolis 9 = 4.19 |
| SELinux | 不需要 | **必须**配 |
| firewall | UFW | firewalld |

## 与其它 catalog 项的配合

- **`firewall-baseline` / `firewalld`** — 限制 Samba 端口仅内网
- **`fail2ban-protection`** — 给 Samba 加 jail（防爆破）
- **`rsync-tools`** — 把 Samba 共享目录同步到 borg 备份
- **`cockpit-panel`** — Web UI 管理 Samba 用户（cockpit-samba 插件）

## 排错

### Windows 报 `0x80004005` 或 `you can't access this shared folder`

```bash
# 1. 防火墙开了？
sudo ufw status                                  # Ubuntu
sudo firewall-cmd --list-services                 # RHEL

# 2. smbd 在跑？
sudo systemctl status smbd

# 3. 端口在听？
sudo ss -tlnp | grep -E ':(139|445) '

# 4. Windows 客户端禁用了 SMB1（默认）+ 你 server 强制 SMB1
# 服务端确保 server min protocol = SMB2

# 5. 防火墙允许 IPv4 + IPv6 ？
sudo ufw allow proto tcp from any to any port 445
```

### `NT_STATUS_ACCESS_DENIED`

```bash
# 1. Samba 用户密码错（与系统密码无关，要 smbpasswd 里设过）
sudo pdbedit -L | grep alice
sudo smbpasswd -a alice                           # 重设

# 2. share 的 valid users 不含你
grep -A5 '\[shared\]' /etc/samba/smb.conf

# 3. 文件系统权限不对
ls -ld /srv/samba/shared
# 应是 drwxrwsr-x  smbusers 组
sudo chown -R :smbusers /srv/samba/shared
sudo chmod -R 2775 /srv/samba/shared             # SGID 让新文件继承组

# 4. SELinux（RHEL）
sudo ausearch -m avc -ts recent | grep smbd
# 看 audit2why 输出
```

### `NT_STATUS_LOGON_FAILURE`

`smbpasswd -a` 没成功——通常是系统用户没存在：

```bash
sudo useradd -M -s /usr/sbin/nologin alice        # 先建 Linux 用户
sudo smbpasswd -a alice                            # 再加 Samba
sudo smbpasswd -e alice                            # 启用
```

### 服务起不来

```bash
sudo journalctl -u smbd -n 50

# 99% 是 smb.conf 语法错
sudo testparm                                       # 详细错误

# 常见
# - share 里 path = 路径不存在
# - valid users 引用的组 / 用户不存在
# - interfaces 写错网卡名
```

### 中文文件名乱码

```ini
[global]
unix charset = UTF-8
dos charset = CP936                                # 中文 Windows 客户端
```

或客户端挂载时指定：

```bash
sudo mount -t cifs //... -o iocharset=utf8,codepage=cp936
```

### 性能差（< 50 MB/s 千兆 LAN）

```bash
# 1. 启用 sendfile + 异步 IO
[global]
use sendfile = yes
aio read size = 16384
aio write size = 16384

# 2. 关闭 oplocks（小文件多场景反而慢）
oplocks = no
level2 oplocks = no

# 3. 调 socket buffer
socket options = TCP_NODELAY SO_RCVBUF=131072 SO_SNDBUF=131072

# 4. 客户端用 SMB3
sudo mount -t cifs //... -o vers=3.0
```

### `[2024/01/15 10:00:00, 0] panic action`

Samba 崩溃。看 core dump：

```bash
sudo journalctl -u smbd | grep -i panic
ls /var/lib/samba/log/cores/
```

通常升级 samba 版本能解。

### macOS Finder 显示 .DS_Store / ._* 元数据

加 veto + Time Machine 配置（模板 F）。

## 验证

```bash
# 1. 配置语法
sudo testparm -s

# 2. 服务在跑
systemctl is-active smbd
systemctl is-active nmbd                          # NetBIOS（可选）

# 3. 端口
sudo ss -tlnp | grep -E ':(139|445) '
sudo ss -ulnp | grep -E ':(137|138) '

# 4. 列共享
sudo smbclient -L localhost -U <user>%<pass>

# 5. 实际连接（与远程客户端一致）
sudo smbclient //localhost/shared -U <user>%<pass>
# smb: \> ls
# smb: \> exit

# 6. SELinux（RHEL）
sudo getsebool -a | grep samba
ls -lZ /srv/samba/shared
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**share 段如已存在不重复加**；但 Samba 用户密码每次会重置（按表单值）。

要保留手动加的 share：放 `/etc/samba/smb.conf.d/*.conf` + 主配置 include。

## ⚠️ 敏感性

**review** — Samba 占 137-139 / 445 端口。

强制：

1. **绝不公网暴露**（用 `bind interfaces only = yes` + 防火墙）
2. SMB1 必须禁用
3. SMB3 加密生产推荐启用
4. Samba 用户独立密码体系——不要复用系统重要密码
5. RHEL 系 SELinux 必须配（模板 E）

## 隐私说明

- Samba 密码会在 EnvForge 任务日志出现一次
- `/etc/samba/smb.conf` 不上传不同步
- **共享目录里的文件不被 EnvForge 备份**
- Samba 日志（`/var/log/samba/log.<client>`）含**每个客户端连接 / 文件访问记录**——按合规需求保留
- TDB / passdb 用户数据库含密码 hash（NTLM hash，**不可逆但可彩虹表攻击**）——文件权限 600 root:root，备份注意加密
- macOS / Windows 客户端缓存的凭据可能写到本机 keychain / Credential Manager
