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
