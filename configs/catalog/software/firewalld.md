# firewalld 动态防火墙

firewalld 是 RHEL/CentOS/Fedora/Anolis 系统默认的防火墙管理器（取代 iptables 的高层 API）。
和 UFW 不同的是，firewalld 用 zone 概念组织规则——同一台机器不同网卡可以属于不同 zone。

> **注意**：UFW 和 firewalld 不能同时启用。RHEL 系统用 firewalld，Ubuntu 用 UFW。

## 你将得到什么

- 📦 **firewalld**
- ✅ 服务启动并设开机自启
- ✅ 默认 zone 是 `public`：允许 SSH，拒绝其它入站
- ✅ SSH 服务已加入默认 zone 白名单

## 安装后

### 看当前规则

```bash
sudo firewall-cmd --list-all
sudo firewall-cmd --list-services
sudo firewall-cmd --list-ports
```

### 开放端口/服务

```bash
# 按服务名（推荐，自动包含端口和协议）
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=samba
sudo firewall-cmd --reload

# 按端口
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=51820/udp
sudo firewall-cmd --reload
```

### Rich rules（限制来源 IP）

```bash
# 只允许 1.2.3.4 访问 3306
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="1.2.3.4" port port=3306 protocol=tcp accept'

# 拒绝某个 IP 全部连接
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="9.9.9.9" reject'

sudo firewall-cmd --reload
```

### Zone 管理

```bash
# 看所有 zone
sudo firewall-cmd --get-zones

# 把网卡 eth1 划到 internal zone（允许更多服务）
sudo firewall-cmd --permanent --zone=internal --change-interface=eth1
```

### 临时 vs 持久化

不带 `--permanent` 的命令立即生效但**重启后失效**。一般工作流：
```bash
# 1. 先临时加规则测试
sudo firewall-cmd --add-port=8080/tcp
# 2. 测试 OK 后加到 permanent
sudo firewall-cmd --permanent --add-port=8080/tcp
# 3. 或者直接 --runtime-to-permanent 把当前所有临时规则固化
sudo firewall-cmd --runtime-to-permanent
```

### 与 docker 共存

Docker 启动时会写大量 iptables 规则到 DOCKER 链。firewalld 默认会刷新 iptables，
导致 Docker 规则丢失，容器无法访问外网。解决：
```bash
# 让 firewalld 不去碰 DOCKER 链
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0
sudo systemctl restart firewalld docker
```

## ⚠️ 敏感性

**privileged** — 防火墙是网络层最重要的安全屏障。配错可能：
- 把自己锁出 SSH（强烈建议先确认 SSH 已开放！EnvForge 已自动加）
- 阻断生产服务

## 验证

```bash
systemctl status firewalld --no-pager
sudo firewall-cmd --state               # 应该返回 running
sudo firewall-cmd --list-all
```

## 排错

- **`Failed to start firewalld`** — 通常是 iptables-services 在跑，先 `sudo systemctl disable --now iptables` 再启 firewalld。
- **规则不生效** — 忘了 `--reload` 或 `--permanent`。
- **跨发行版**：firewalld 包在 Ubuntu 上也有，但 Ubuntu 默认用 UFW。在 Ubuntu 上装 firewalld 需要 `sudo systemctl disable --now ufw` 先关 UFW。

## 多次运行

`installMode: skip-existing`。包不重装，只确保 SSH 一直在白名单。

## 隐私说明

防火墙规则不上传不同步。
