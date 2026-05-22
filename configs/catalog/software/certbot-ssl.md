# Certbot / Let's Encrypt SSL

Certbot 自动签发并续签 Let's Encrypt 免费 SSL 证书。EnvForge 把签发命令、
nginx/apache 配置改写、自动续签 timer 一次性配好。

## 你将得到什么

- 📦 **certbot** + 选定的插件（nginx / apache / standalone / webroot）
- ✅ 证书签发并放到 `/etc/letsencrypt/live/<domain>/`（fullchain.pem + privkey.pem）
- ✅ nginx/apache 模式下，对应的 vhost 自动加上 `ssl_certificate` + 80 → 443 跳转
- ✅ `certbot.timer` 启用并设开机自启（每天检查 + 提前 30 天自动续签）

## 使用前提

⚠️ **签发前必须确认：**

1. 域名已经有 A 记录指向本机公网 IP
   ```bash
   dig +short example.com
   # 应当返回本机的公网 IP
   ```

2. 80 端口可达（HTTP-01 challenge 走 80 端口），防火墙放行
   ```bash
   sudo ufw allow 80
   sudo firewall-cmd --add-service=http --permanent && sudo firewall-cmd --reload
   ```

3. 用 standalone 方式时，80 端口不能被其它服务占用

## 表单字段说明

### 域名 `domain`

要签证书的域名。必须已经 DNS 指向本机。**目前只支持单域名**——多域名（SAN）请
每个域名跑一次 Playbook，或者直接用 Certbot CLI：
```bash
sudo certbot --nginx -d a.example.com -d b.example.com
```

### 邮箱 `email`

Let's Encrypt 用此邮箱：
- 证书快过期且自动续签失败时通知（重要！）
- 重要服务变更通知（少）

务必填**真实可用邮箱**，证书续签出问题时这是唯一的告警通道。

### Challenge 方式 `challenge_method`

| 方式 | 适用场景 | 优点 | 缺点 |
|---|---|---|---|
| **nginx** | 已装 nginx | 自动改配置，最省心 | 需要先装 nginx |
| **apache** | 已装 apache2 / httpd | 自动改配置 | 需要先装 apache |
| **standalone** | 还没装 web server | 不依赖现有服务 | 签发期间 80 端口会被 certbot 占（同时不能跑别的 web） |
| **webroot** | 已有任意 web server | 不打扰运行中的服务 | 必须能写 `/var/www/html/.well-known` |

**推荐**：先装 nginx（用 EnvForge 的 nginx Playbook），再用 nginx 方式签证书。

### 测试模式 `staging`

✅ **第一次部署或调试问题时建议先开**。Let's Encrypt 生产服务器有限速：
- 每周每域名 5 次失败签发
- 每周每证书 5 次重复签发

测试模式用 staging 服务器，**没有限速**，但签出来的证书浏览器不信任（用来验证流程是否通的）。流程通了再关掉 staging 重签真证书。

## 安装后

### 看证书路径

```bash
sudo ls -la /etc/letsencrypt/live/example.com/
# fullchain.pem  →  ../../archive/example.com/fullchainN.pem
# privkey.pem    →  ../../archive/example.com/privkeyN.pem
# cert.pem       →  ../../archive/example.com/certN.pem
# chain.pem      →  ../../archive/example.com/chainN.pem
```

应用配置里**永远用 `live/` 下的链接**，不要直接用 `archive/` 下的实际文件——续签时链接会自动指向新版本。

### 手动测试续签

```bash
sudo certbot renew --dry-run
# 模拟续签，看看流程是否能跑通
```

### 看下次续签时间

```bash
sudo certbot certificates
# 列出所有证书 + 到期时间
```

### 续签出问题时

```bash
sudo journalctl -u certbot.timer -n 50
sudo certbot renew --force-renewal  # 强制立刻续签（仅调试时）
```

### 多域名 SAN（高级）

```bash
sudo certbot --nginx -d a.example.com -d b.example.com -d c.example.com
# 一张证书覆盖三个域名
```

### 通配符证书（高级）

通配符必须用 DNS-01 验证（HTTP-01 不支持），需要你的 DNS 服务商有 certbot 插件：

```bash
# Cloudflare 例
sudo apt-get install python3-certbot-dns-cloudflare
sudo certbot certonly \
  --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d "*.example.com" -d "example.com"
```

## ⚠️ 敏感性

**review** — 证书私钥在 `/etc/letsencrypt/archive/` 下，权限是 `root:root 600`。
不要直接 chmod 给应用读，正确做法是应用用 root 启动后 drop privilege（systemd 用 User= + AmbientCapabilities=CAP_NET_BIND_SERVICE），或者把证书复制一份给应用账号读。

## 验证安装

```bash
sudo test -f /etc/letsencrypt/live/example.com/fullchain.pem && echo OK
sudo openssl x509 -in /etc/letsencrypt/live/example.com/fullchain.pem -noout -dates
systemctl list-timers --all | grep certbot
```

## 排错

- **`Connection refused` 或 timeout** — 80 端口不通；检查防火墙 + 域名 DNS。
- **`DNS problem: NXDOMAIN`** — 域名 A 记录还没生效（DNS 传播需 5-30 分钟），等等再试。
- **`Too many failed authorizations recently`** — 触发了 Let's Encrypt 限速。换 staging 调通后再试，或者 1 周后再来。
- **`The given path is not a directory`** — webroot 模式下 `-w` 路径不存在。先 `mkdir -p`。
- **续签静悄悄失败** — 看 `journalctl -u certbot.timer`。常见原因：nginx 启动失败、80 端口被占、域名 DNS 改了但忘了改证书的 -d。
- **跨发行版**：`certbot` 在 RHEL 上需要 EPEL 仓库（EnvForge preflight 已自动启用）。

## 多次运行

`installMode: skip-existing`。已经签过的证书不会重签（Certbot 自己有判断），但会重新尝试启用 `certbot.timer`。

## 隐私说明

- **私钥不会被 EnvForge 上传或同步**——它由 Certbot 在目标机器本地生成，留在 `/etc/letsencrypt/`。
- 你填的邮箱会注册到 Let's Encrypt 账号里。
- ACME 协议本身不发送任何应用数据到 Let's Encrypt，只验证你拥有该域名。
