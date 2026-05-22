# Samba 文件共享

Samba 提供 SMB/CIFS 协议网络文件共享。Windows / macOS / Linux 都能 mount 它的共享。
适合家庭 NAS、办公室文件服务器、跨平台资料同步。

## 你将得到什么

- 📦 **samba** + **samba-common**
- ✅ 一个共享目录（按表单值创建）
- ✅ 一个 Samba 用户 + 密码
- ✅ `[share]` 段追加到 `/etc/samba/smb.conf`
- ✅ smbd 服务启动并设开机自启

## 表单字段说明

### 共享名 / 路径 / 用户 / 密码

`share_name` 是客户端连接时的路径名（`\\server-ip\share_name`）。
`share_path` 是服务器上的实际目录（如 `/srv/samba/shared`），EnvForge 会自动创建。
`share_user` + `share_password` 是登录凭据。

### 允许匿名 `guest_ok`

**默认关闭**。开启就是无密码访问，仅适合受限可信内网（家庭 NAS）。

### 只读 `read_only`

只读模式适合分发文件（比如安装包仓库、只读归档）。

### 工作组 `workgroup`

Windows 工作组名。家庭/小型办公用默认 `WORKGROUP`，AD 域环境填域名。

## 安装后

### 客户端连接

**Windows 资源管理器**：
```
\\server-ip\shared
```
弹出登录框输入用户名密码即可。

**macOS Finder**：⌘K → `smb://server-ip/shared`

**Linux mount**：
```bash
sudo apt-get install cifs-utils
sudo mount -t cifs //server-ip/shared /mnt/shared \
  -o username=envforge,password=...,uid=$(id -u),gid=$(id -g)
```

### 防火墙

```bash
# Ubuntu
sudo ufw allow samba
# RHEL/Anolis
sudo firewall-cmd --add-service=samba --permanent && sudo firewall-cmd --reload
```

### 加更多 share

编辑 `/etc/samba/smb.conf`，追加：
```ini
[backup]
   path = /srv/samba/backup
   valid users = alice
   read only = no
```

然后：
```bash
sudo testparm           # 检查语法
sudo systemctl reload smbd
```

### 加 Samba 用户

```bash
sudo useradd -s /usr/sbin/nologin alice
sudo smbpasswd -a alice    # 输入两次密码
```

## ⚠️ 敏感性

**review** — Samba 默认监听 139/445，**绝不要直接公网暴露**。SMB 协议历史漏洞多
（WannaCry / EternalBlue），公网暴露等于送上门。仅在内网/VPN 内使用。

## 验证

```bash
sudo testparm -s
sudo systemctl status smbd --no-pager
sudo smbclient -L localhost -U envforge%密码
sudo ss -tlnp | grep -E ':(139|445) '
```

## 排错

- **客户端连不上 + Windows 报 "0x80004005"** — 检查 firewall 开了 samba 服务没 / smbd 服务在跑没。
- **`NT_STATUS_ACCESS_DENIED`** — 用户密码错 / share 的 `valid users` 没包含你 / 目录权限不对。
- **`NT_STATUS_LOGON_FAILURE`** — `smbpasswd -a` 没成功（系统用户没存在），先 `sudo useradd`。
- **跨发行版**：`samba` 包在两边名字一样，服务名也是 `smbd`，无需翻译。RHEL 的 SELinux 默认会阻止 Samba 写非默认目录，需要 `sudo setsebool -P samba_export_all_rw 1` 或给目录打标签 `sudo semanage fcontext -a -t samba_share_t '/srv/samba/shared(/.*)?' && sudo restorecon -R /srv/samba/shared`。

## 多次运行

`installMode: skip-existing`。share 段如果已存在不会重复添加，但密码每次会重置。

## 隐私说明

- Samba 密码会在任务日志里出现一次。
- `/etc/samba/smb.conf` 不上传不同步。
- 共享目录里的文件**不被** EnvForge 备份。
