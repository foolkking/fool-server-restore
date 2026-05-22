# SSH 服务器加固

按照 SSH 安全最佳实践修改 `/etc/ssh/sshd_config`：改默认端口、禁用密码登录、
禁止 root 直接登录、限制用户、缩短超时。配合 fail2ban + 防火墙形成"洋葱式"防护。

## 你将得到什么

- ✅ SSH 端口按表单值修改
- ✅ root 直接登录默认禁用
- ✅ 密码认证默认禁用，只允许密钥
- ✅ 闲置连接超时（ClientAliveInterval + CountMax）
- ✅ 单次连接最多 N 次认证尝试（MaxAuthTries）
- ✅ 可选 AllowUsers 白名单
- ✅ **改完不 restart 而是 reload sshd**——保留你当前的 SSH 连接

## ⚠️ 防自锁三原则

**改 SSH 配置最大的风险是把自己锁出去**。本 Playbook 已采取保护措施，但你也要：

1. **改端口前**：先在防火墙放行新端口，再改 sshd
   ```bash
   sudo ufw allow 22222/tcp                # Ubuntu
   sudo firewall-cmd --add-port=22222/tcp --permanent && sudo firewall-cmd --reload  # RHEL
   ```

2. **关密码登录前**：先确认你能用密钥登录
   ```bash
   # 在你本地机器上：
   ssh -i ~/.ssh/your-key user@server
   # 能直接进去（无密码提示）说明密钥可用
   ```

3. **保留备用通道**：云控制台 web ssh / 物理控制台。改 sshd 期间不要关闭现有 SSH 窗口。

## 表单字段说明

### SSH 端口 `ssh_port`

改非标端口能挡掉 ~90% 的自动扫描。常用：2222 / 22222 / 60022。

### 允许 root 登录 `permit_root_login`

- **no**（推荐）：完全禁用 root SSH 登录。需要 root 操作时先以普通用户登录再 `sudo`
- **prohibit-password**：仅允许 root 密钥登录（自动化场景）
- **yes**：完全开放（**不推荐**）

### 允许密码认证 `password_authentication`

- **no**（推荐）：仅密钥登录
- **yes**：允许密码（容易被爆破，必须配 fail2ban）

### 允许的用户 `allow_users`

留空 = 不限制。填写时用空格分隔，如 `alice bob ops@*`（`@`后是允许的来源 IP/host）。
**务必把你自己当前正在用的账号包含进去**。

### ClientAlive 设置

服务端每 `interval` 秒发一次探测包，连续 `count_max` 次无响应就断开。
- `interval=300, count_max=2` → 闲置 10 分钟（300 × 2）后自动断
- `interval=0` → 不发探测，依赖网络层

### MaxAuthTries

单次连接里最多失败 N 次。配合 fail2ban 进一步阻挡爆破。

## 安装后

### 验证新配置生效（在改完之前不要关现有连接！）

新开一个终端：
```bash
ssh -p $NEW_PORT user@server   # 用新端口连
```
确认能连上才关掉旧连接。

### 万一真锁出去了

通过云控制台 web ssh / 物理控制台 / 救援模式，恢复备份：
```bash
sudo cp /etc/ssh/sshd_config.envforge.bak /etc/ssh/sshd_config
sudo systemctl reload sshd
```

EnvForge 在第一次修改 sshd_config 时会自动备份到 `.envforge.bak`。

### 配合 fail2ban

`ssh-hardening` 主要做配置层加固，对暴力破解的防护要靠 fail2ban：装上后会自动监控 sshd 日志，连续失败 5 次就 ban 1 小时。

## ⚠️ 敏感性

**privileged** — 直接修改 sshd 配置，配错就连不上服务器。

## 验证

```bash
sudo sshd -t                  # 语法检查（不重启服务）
sudo ss -tlnp | grep ssh      # 看监听端口
ssh -p $PORT -v user@server   # 详细日志，调试连接问题
```

## 排错

- **`Bad configuration option`** — sshd 版本太老不认识某个新选项。`sshd -t` 看具体哪行，删掉它。
- **改完连不上** — 走备用通道恢复 `.envforge.bak`。
- **AllowUsers 把自己挡了** — 同上。
- **`Permission denied (publickey)`** — 你的公钥还没在 `~/.ssh/authorized_keys`。先用 `ssh-copy-id` 加进去再禁密码登录。
- **跨发行版**：sshd_config 文件路径在 Ubuntu 和 RHEL 上都一样（`/etc/ssh/sshd_config`），无需翻译。服务名 RHEL 上是 `sshd`，Ubuntu 上是 `ssh`，service 模块的 SERVICE_ALIASES 已自动翻译。

## 多次运行

`installMode: replace-existing`。每次运行会把 7 个核心配置项重写为表单值，覆盖手动调整。

## 隐私说明

- sshd_config 不上传也不同步。
- AllowUsers 字段会出现在任务日志（账号名是公开信息但仍要注意）。
