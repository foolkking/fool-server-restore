# Cockpit Web 管理面板

Cockpit 是 Red Hat 出品的 web 管理界面——浏览器里管 systemd 服务、查日志、监控资源、
管 Docker 容器、配存储和网络。零配置，systemd socket activation 按需启动，平时不占资源。

**RHEL/CentOS/Anolis 强烈推荐**——这是 Red Hat 默认的远程管理界面。Ubuntu 也支持但不如 RHEL 集成度好。

## 你将得到什么

- 📦 **cockpit** — 主程序
- 📦 **cockpit-storaged** — 存储管理（磁盘、LVM、文件系统）
- ✅ Web UI 在 `https://server-ip:9090`（注意是 https 自签证书）
- ✅ socket activation：平时不占资源，浏览器访问时自动启动
- ✅ 用系统用户密码登录（可选 sudo 提权）

## 安装后

### 浏览器访问

`https://你的服务器:9090`

⚠️ 浏览器会警告自签证书——确认进入后用 Linux 系统用户名密码登录。

### 加 cockpit 模块（按需）

```bash
# Docker / Podman 容器管理
sudo apt-get install cockpit-podman   # Ubuntu
sudo dnf install cockpit-podman       # RHEL

# Network 详细管理
sudo apt-get install cockpit-networkmanager

# 软件包管理（应用 dnf/apt 升级 GUI）
sudo dnf install cockpit-packagekit
```

刷新浏览器立刻有新菜单项。

### 用 Let's Encrypt 证书替换自签

```bash
# Cockpit 会自动加载 /etc/cockpit/ws-certs.d/*.cert 和 *.key
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem /etc/cockpit/ws-certs.d/0-letsencrypt.cert
sudo cp /etc/letsencrypt/live/example.com/privkey.pem /etc/cockpit/ws-certs.d/0-letsencrypt.key
sudo chown root:cockpit-ws /etc/cockpit/ws-certs.d/0-letsencrypt.*
sudo chmod 640 /etc/cockpit/ws-certs.d/0-letsencrypt.*
sudo systemctl restart cockpit.socket
```

### 单台机器管多台（cockpit dashboard）

打开 cockpit → 顶部 + Add new host → 输入其它机器的 SSH 地址。一个浏览器面板看
所有机器的状态。

### 防火墙

```bash
sudo ufw allow 9090/tcp                                # Ubuntu
sudo firewall-cmd --add-service=cockpit --permanent && sudo firewall-cmd --reload  # RHEL
```

## ⚠️ 敏感性

**safe** — Cockpit 用系统用户认证 + sudo 权限模型，安全模型很扎实。但默认 9090 暴露公网仍要小心：
- 用 Let's Encrypt 替换自签证书
- 配 fail2ban 防暴破（cockpit 默认 jail 已经有）
- 考虑改 Cockpit 端口或加 nginx 反代 + auth

## 验证

```bash
systemctl status cockpit.socket --no-pager
sudo ss -tlnp | grep 9090
curl -k https://localhost:9090/ -o /dev/null -w '%{http_code}'   # 应返回 200
```

## 排错

- **9090 端口被 Prometheus 占了** — Prometheus 默认也是 9090。要么改 Prometheus 端口（推荐），要么改 cockpit 监听别的端口（编辑 `/lib/systemd/system/cockpit.socket` 改 `ListenStream=`）。
- **登录后 502** — 系统用户的 shell 是 `/usr/sbin/nologin` 这类不能登录的。Cockpit 要求用户能正常 ssh。
- **跨发行版**：包名 `cockpit` 一致，Ubuntu 在 `universe` 仓库需要启用。RHEL/CentOS/Anolis 上是默认提供的。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

- Cockpit 用系统已有认证，不存独立凭据。
- 不发任何遥测数据。

## 配置文件 / 路径速查

```
/etc/cockpit/
├── cockpit.conf                    # 主配置（很少需要改）
├── ws-certs.d/                     # TLS 证书（按字母序加载第一个）
│   ├── 0-self-signed.cert          # 默认自签证书
│   └── 0-letsencrypt.cert          # 替换为 LE 证书时这个名字
└── disallowed-users                # 这个文件里列的用户禁止登录（默认有 root）

/usr/share/cockpit/                  # 内置模块
/usr/lib/cockpit-bridge              # 后台 bridge 进程

/lib/systemd/system/cockpit.socket   # socket activation（按需启动主服务）
/lib/systemd/system/cockpit.service  # 主服务单元
```

> Cockpit 平时**不在跑**——`cockpit.socket` 监听 9090，第一个浏览器访问时才启动 service。
> 没访问时几乎不占资源，所以"装上不用也没事"。

### `/etc/cockpit/cockpit.conf` 主要选项

```ini
[WebService]
# 监听端口 / 地址（默认 9090，监听所有 IP）
# 这个文件里改 Origin 不改端口；改端口要改 cockpit.socket
Origins = https://cockpit.example.com wss://cockpit.example.com
ProtocolHeader = X-Forwarded-Proto      ; 挂反代时让 Cockpit 知道 scheme
ForwardedForHeader = X-Forwarded-For
LoginTitle = "EnvForge 服务器"            ; 登录页标题
LoginTo = false                          ; 禁用 "Connect to other host" 输入框
AllowUnencrypted = false                 ; HTTPS 强制（默认 false）

[Session]
IdleTimeout = 30                         ; 闲置 30 分钟自动登出
Banner = /etc/issue                      ; 登录页底部显示的 banner

[Log]
Fatal = criticals
```

改完 reload：
```bash
sudo systemctl restart cockpit
```

### 改监听端口（不再用 9090）

Cockpit 的 9090 端口是 systemd socket 决定的，不是 cockpit.conf。要改：

```bash
sudo systemctl edit cockpit.socket
```

```ini
[Socket]
ListenStream=
ListenStream=9999
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart cockpit.socket
sudo firewall-cmd --add-port=9999/tcp --permanent && sudo firewall-cmd --reload
```

### 替换自签证书为 Let's Encrypt

```bash
# 用 Certbot 签证书
sudo certbot certonly --standalone -d cockpit.example.com

# 软链或拷贝到 cockpit 证书目录
sudo cp /etc/letsencrypt/live/cockpit.example.com/fullchain.pem \
        /etc/cockpit/ws-certs.d/0-letsencrypt.cert
sudo cp /etc/letsencrypt/live/cockpit.example.com/privkey.pem \
        /etc/cockpit/ws-certs.d/0-letsencrypt.key

# 权限
sudo chown root:cockpit-ws /etc/cockpit/ws-certs.d/0-letsencrypt.*
sudo chmod 640 /etc/cockpit/ws-certs.d/0-letsencrypt.*

# 重启
sudo systemctl restart cockpit
```

> 文件名按字母序加载。`0-letsencrypt.*` 会先于 `0-self-signed.*` 加载（如果都存在）。
> 把自签的删了/改名为 `9-self-signed.*` 也行。

#### 自动续签后自动 reload

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/cockpit.sh <<'EOF'
#!/bin/sh
DOMAIN="cockpit.example.com"
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/cockpit/ws-certs.d/0-letsencrypt.cert
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem   /etc/cockpit/ws-certs.d/0-letsencrypt.key
chown root:cockpit-ws /etc/cockpit/ws-certs.d/0-letsencrypt.*
chmod 640 /etc/cockpit/ws-certs.d/0-letsencrypt.*
systemctl restart cockpit
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/cockpit.sh
```

### 反向代理（推荐生产部署）

挂在 nginx 后用 443 + 域名比直接暴露 9090 安全。`cockpit.conf` 必须配 Origins / ProtocolHeader：

```ini
[WebService]
Origins = https://cockpit.example.com wss://cockpit.example.com
ProtocolHeader = X-Forwarded-Proto
AllowUnencrypted = true                 ; 仅允许从信任的反代过来的 HTTP（不让外网直连）
```

nginx：
```nginx
server {
    listen 443 ssl http2;
    server_name cockpit.example.com;

    ssl_certificate     /etc/letsencrypt/live/cockpit.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cockpit.example.com/privkey.pem;

    # 长连接（终端 / 文件传输）
    proxy_read_timeout 7d;
    proxy_buffering    off;

    location / {
        proxy_pass         http://127.0.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        $http_connection;
    }
}
```

⚠️ 记得在防火墙关掉 9090 直接暴露：`sudo firewall-cmd --remove-port=9090/tcp --permanent && sudo firewall-cmd --reload`

### 限制谁能登录

`/etc/cockpit/disallowed-users` 每行一个用户名（默认含 root）：
```
root
admin                     # 阻止某些账号通过 Cockpit 登录
```

**白名单更严**：通过 PAM 限制：
```bash
# /etc/pam.d/cockpit 里加（在 auth 段开头）：
auth required pam_listfile.so item=user sense=allow file=/etc/cockpit/allowed-users
```

`/etc/cockpit/allowed-users`：
```
ops
deploy
```

### 加 Cockpit 模块（功能扩展）

每个模块是独立的包：

```bash
# Ubuntu
sudo apt-get install \
  cockpit-storaged           \  # 磁盘 / LVM / 文件系统管理
  cockpit-podman             \  # Podman 容器
  cockpit-machines           \  # KVM 虚拟机
  cockpit-networkmanager     \  # 网络配置
  cockpit-packagekit         \  # 软件包升级 GUI
  cockpit-pcp                \  # Performance Co-Pilot 监控

# RHEL
sudo dnf install \
  cockpit-storaged cockpit-podman cockpit-machines \
  cockpit-networkmanager cockpit-packagekit cockpit-pcp
```

刷新浏览器，左侧菜单就有新条目。

### 多机管理（dashboard）

Cockpit 可以一个面板管多台机器（不需要在每台机器上单独打开）：

UI 顶部 → "Add new host" → 输入其它机器的 SSH 地址 + 凭据。
前提：所有机器都装了 cockpit + 你的用户在那些机器上能 SSH。

### 排查登录失败

最常见 3 个原因：
```bash
# 1. 用户 shell 是 nologin
grep ^username /etc/passwd | tail -1
# 如果显示 /usr/sbin/nologin，登录会被 PAM 拒绝
sudo usermod -s /bin/bash username

# 2. PAM 配置问题
sudo journalctl -u cockpit -n 50 --no-pager | grep -i auth

# 3. cockpit-ws 用户读不到证书
sudo ls -la /etc/cockpit/ws-certs.d/
# 应该是 root:cockpit-ws 640
```
