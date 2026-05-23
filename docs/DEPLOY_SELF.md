# 用现有 EnvForge 部署一个新的 EnvForge 服务器

> 场景：你手里**已经有一台正在运行的 EnvForge**（下面称 **A**，控制端），现在想把这个项目部署到**另一台空服务器** B，让 B 也成为一个对外提供 EnvForge 服务的实例。
>
> 用 A 的 UI 当部署控制台，把 B 加为受管 VM，用现成的 catalog Playbook 跑完 B 的基础设施（Docker / 防火墙 / nginx + HTTPS / 监控），中间只在 B 上跑一次 git clone + docker compose up。

不是这个场景？

- 第一次从零部署（手里没有任何 EnvForge）→ 看 [DEPLOY.md](./DEPLOY.md)
- 想用 EnvForge 加固宿主机但**不复制**实例 → 把下面 Phase 2 的"宿主机"换成"目标 VM"，跳过 Phase 3 即可

---

## 用得着这种部署的场景

- **多区域多实例**：A 在国内、B 在海外，同一个团队两个独立控制台
- **给客户 / 团队复制**：每个客户一套独立的 EnvForge 实例（数据互不相通）
- **蓝绿升级**：在 B 上起新版本测试通过，DNS 切到 B 之后销毁 A
- **从单机迁到大盘 / 异地容灾**：把 A 的 `envforge_data` 备份恢复到 B
- **教学 / 演示**：临时拉一台 B 给学员体验，结束后销毁

---

## 前置条件

✅ **A** —— 已运行的 EnvForge，你有 admin 账号
✅ **B** —— 一台空 Linux 服务器（Ubuntu 22.04+ / Debian 12+ / RHEL 9+ / Anolis 9+），SSH 可达
✅ **域名** —— 你给 B 准备的域名（如 `envforge-b.example.com`），DNS A 记录已指向 B 的公网 IP
✅ **B 上的 sudo 账号** —— 见下面 step 1，给 EnvForge 用的

---

## 一、把 B 加为 A 的受管目标

### 1.1 在 B 上准备 SSH + sudo 账号

直接 SSH 进 B（**这是整个流程里仅有的两次直连 B 的步骤之一**）：

```bash
ssh root@<B 的 IP>
# 或你 VPS 默认的初始账号（ubuntu / centos / 等）
```

在 B 上跑：

```bash
# 创建专用账号给 A 远程管理
sudo useradd -m -s /bin/bash envforge-mgr
sudo passwd envforge-mgr                                  # 设强密码（A 里要填）

# Ubuntu/Debian
sudo usermod -aG sudo envforge-mgr
# RHEL/Anolis
# sudo usermod -aG wheel envforge-mgr

# NOPASSWD sudo（catalog Playbook 跑过程中不能卡密码输入）
echo "envforge-mgr ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/envforge-mgr
sudo chmod 0440 /etc/sudoers.d/envforge-mgr

# 验证
sudo -u envforge-mgr sudo -n whoami        # 应输出 root
```

退出 SSH。**之后 1.2 到 Phase 3 全部在 A 的 UI 里完成。**

### 1.2 在 A 的 UI 里加连接

浏览器登录 **A** → 顶栏 "VM Manager" → "Add connection"：

| 字段 | 填什么 |
|---|---|
| Name | `B - production` 或任取 |
| Host | B 的公网 IP（如 `203.0.113.42`）或域名 |
| Port | `22`（B 的 sshd 端口，没改过就是 22） |
| User | `envforge-mgr` |
| Auth | Password / Key |
| Sudo password | （空，NOPASSWD 已配） |

点 "Test & Save"。约 3-5 秒后状态变 ✅，A 已经能看到 B 的发行版 / 内核 / 已装包清单。

---

## 二、用 catalog Playbook 给 B 配基础环境

回到 A 主页 → "Market" → 选 "B - production" 作为目标 → 依次跑下面 Playbook。每个都是 catalog 现成的，**不需要你写一行 yaml**。

### 2.1 必跑（基础设施 + 安全）

| 顺序 | Catalog id | 表单怎么填 | 时间 |
|---|---|---|---|
| 1 | `swap-config` | size: 2G, swappiness: 10 | 30s |
| 2 | `ssh-hardening` | 端口可改成 22222；保持 PermitRootLogin no；AllowUsers: envforge-mgr | 20s |
| 3 | `firewall-baseline` | 放行 SSH 新端口 + 80 + 443，**入站默认 deny**。⚠️ 跑这步前确认你 ssh 端口已放行，否则会自锁 | 30s |
| 4 | `docker-host-profile` | 默认即可（装 Docker Engine + Compose + buildx + 自启） | 2-3 分钟 |
| 5 | `fail2ban-protection` | bantime: 1h；maxretry: 5；ssh_port: 同 step 2；ignoreip: **务必加你自己 IP + A 的 IP** | 30s |

跑完上面 5 项，B 已经是一台**生产级安全姿态**的 Docker 主机了——5 分钟。

### 2.2 ⚠️ SSH 加固后的一次性确认

刚跑完 `ssh-hardening` 改了 SSH 端口（如 22222）后，A 之前保存的 B 连接还是用 port 22。需要去 A 的 VM Manager 编辑 B 连接：

```
VM Manager → 选 "B - production" → Edit
  Port: 22222         ← 改成新端口
  Save
```

测试连接 → 应该重新变 ✅。

> 如果新端口连不上，多半是防火墙没放行新 SSH 端口（步骤 3 的表单里漏填）。补救：从你本地 SSH 进 B 用旧端口（如果 sshd 还在监听旧端口）改防火墙；最坏情况通过 VPS 控制台 console 进入修复。

---

## 三、把 EnvForge 项目装到 B 上

⚠️ **这一步是整个流程里 catalog 暂无现成 Playbook 的部分**（catalog 没有 "deploy EnvForge 自身" 的项——这种需求很少见）。两种方式选一种：

### 方案 A：A 用"自定义 shell 任务"在 B 上跑命令（推荐）

A 主页 → "Custom Playbook" / "Run shell" 功能（或写一个临时 yaml）。跑下面这一组命令：

```bash
# 在 B 的 envforge-mgr 用户身份下
sudo mkdir -p /opt/envforge
sudo chown envforge-mgr:envforge-mgr /opt/envforge
cd /opt/envforge

# 拉代码
git clone https://github.com/foolkking/envforge.git .

# 拷 .env 模板
cp .env.example .env

# 生成 master key 写入 .env
KEY=$(openssl rand -base64 32)
sed -i "s|^ENVFORGE_MASTER_KEY=.*|ENVFORGE_MASTER_KEY=$KEY|" .env

# 设 admin 邮箱（⚠️ 改成你的真实邮箱）
echo "ENVFORGE_ADMIN_EMAILS=admin@example.com" >> .env

# 设公网 URL（⚠️ 改成你给 B 的真实域名）
sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://envforge-b.example.com|" .env

# 显示 master key（⚠️ 务必离线备份此值——丢了 = B 上所有保存的凭据永久不可解）
echo "🔑 B 的 master key（务必备份）: $KEY"

# 启动
docker compose up -d

# 等待启动
sleep 30
curl -fsS http://127.0.0.1:5173/api/health
```

A 的任务输出里会显示 master key —— **立刻复制保存到密码管理器**（同时离线备份）。

> 想让这步更可重复？把上面命令保存为一个 catalog 项（admin 在 catalog 管理面板创建），下次部署 C / D / E 直接复用。

### 方案 B：直接 SSH 进 B 手工跑

不想用 A 跑 shell 命令？直接 SSH 进 B 一次：

```bash
ssh envforge-mgr@<B 的 IP> -p 22222

# 然后在 B 上跑（与方案 A 完全相同）
sudo mkdir -p /opt/envforge && sudo chown $USER /opt/envforge && cd /opt/envforge
git clone https://github.com/foolkking/envforge.git .
cp .env.example .env
KEY=$(openssl rand -base64 32)
sed -i "s|^ENVFORGE_MASTER_KEY=.*|ENVFORGE_MASTER_KEY=$KEY|" .env
echo "ENVFORGE_ADMIN_EMAILS=admin@example.com" >> .env
sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://envforge-b.example.com|" .env
echo "🔑 master key: $KEY"          # 离线备份此值
docker compose up -d
sleep 30
curl -fsS http://127.0.0.1:5173/api/health
exit
```

> 用 SSH 隧道在你本机访问验证（防火墙现在已经把 5173 关在外面了）：
> `ssh -L 5173:127.0.0.1:5173 envforge-mgr@<B 的 IP> -p 22222`
> 然后浏览器开 `http://127.0.0.1:5173` —— 应该看到 EnvForge 登录页。**先不要在 B 上注册账号**——等 Phase 3 配完 HTTPS 再注册。

---

## 四、给 B 配 nginx 反向代理 + Let's Encrypt

⚠️ **先理清场景**：B 上跑几个对外的服务？

- **只有 EnvForge 一个**（最简单）→ 走 [4.A](#4a-单服务场景)
- **EnvForge + 其它（Vaultwarden / Nextcloud / Filebrowser / 等）** → 走 [4.B](#4b-多服务场景多域名共一台-nginx)

⚠️ **当前 catalog 的 `nginx-web-service` Playbook 是按"单一站点"设计的**——重复跑只保留最后一次的域名。**多服务必须按 4.B 的方式手工加额外 conf 文件**。

### 4.A 单服务场景

只有 EnvForge 一个站点。回到 A 的 UI → 选 "B - production" → 跑两个 Playbook：

#### 4.A.1 `nginx-web-service`

| 字段 | 值 |
|---|---|
| domain | `envforge-b.example.com`（确认 DNS A 记录已指向 B 的 IP） |
| listen_port | 443 |
| 反向代理 | ✅ |
| upstream | `http://127.0.0.1:5173` |
| 客户端最大上传 | 20m |
| SSE 超时 | 3600s |

跑完 nginx 已就绪（HTTP，因为 LE 证书还没签）。

#### 4.A.2 `certbot-ssl`

| 字段 | 值 |
|---|---|
| domain | 同上 `envforge-b.example.com` |
| email | 你的邮箱（用于 LE 过期通知） |
| challenge | nginx |

跑完 LE 证书自动签发 + nginx 自动改 HTTPS + cron 自动续签。

#### 4.A.3 验证

打开浏览器 `https://envforge-b.example.com/` —— **绿色锁** + 看到 EnvForge 登录页。

注册第一个账号（用 step 3 里 `ENVFORGE_ADMIN_EMAILS` 填的邮箱），登录后是 admin。

🎉 **B 现在是一台完整可用的对外 EnvForge 实例了**。

---

### 4.B 多服务场景（多域名共一台 nginx）

最常见的自托管姿态——B 上同时跑：

| 服务 | 容器端口（127.0.0.1）| 公开域名 |
|---|---|---|
| EnvForge | 5173 | envforge-b.example.com |
| Vaultwarden | 8086 | vault.example.com |
| Filebrowser | 8088 | files.example.com |
| Homepage | 3010 | home.example.com |
| ... | ... | ... |

#### 4.B.1 DNS 准备

每个公开域名都加 A 记录指向 B 的公网 IP（**不要漏**——不解析 = nginx 等不到 LE challenge）：

```
envforge-b.example.com    A    <B 公网 IP>
vault.example.com          A    <B 公网 IP>
files.example.com          A    <B 公网 IP>
home.example.com           A    <B 公网 IP>
```

或加通配 `*.example.com` 一劳永逸（详见 4.B.5）。

#### 4.B.2 用 nginx-web-service 跑"主站"（一次）

A 的 UI → 选 "B - production" → 跑 `nginx-web-service`：

| 字段 | 值 |
|---|---|
| domain | `envforge-b.example.com`（选你最重要的那个域名） |
| listen_port | 443 |
| 反向代理 | ✅ |
| upstream | `http://127.0.0.1:5173` |

跑完 nginx 装好 + EnvForge 域名 server 块就位。

#### 4.B.3 给主站签 LE

A 的 UI → 跑 `certbot-ssl`：

| 字段 | 值 |
|---|---|
| domain | `envforge-b.example.com` |
| email | 你的邮箱 |
| challenge | nginx |

**只签这一个**——其它服务的证书在 4.B.4 单独签。

#### 4.B.4 给每个额外服务加独立 conf + 签证书

⚠️ **不要再跑 `nginx-web-service`** —— 它会覆盖掉主站配置。每个新服务**直接编辑独立 conf 文件**：

A 的 UI → "Custom Playbook" / "Run shell"，对每个服务跑下面的命令组（替换变量）：

```bash
# 配置变量（每个服务改这 3 行）
SERVICE_NAME=vaultwarden
SERVICE_DOMAIN=vault.example.com
SERVICE_UPSTREAM=http://127.0.0.1:8086

# 写 nginx server 块
sudo tee /etc/nginx/conf.d/$SERVICE_NAME.conf >/dev/null <<EOF
server {
    listen 80;
    server_name $SERVICE_DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $SERVICE_DOMAIN;

    # certbot 等下会把这里的 ssl_certificate 路径自动改对
    ssl_certificate     /etc/letsencrypt/live/$SERVICE_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$SERVICE_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 256m;
    proxy_read_timeout 600s;

    location / {
        proxy_pass $SERVICE_UPSTREAM;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
EOF

# 给该域名签证书（用 nginx plugin，certbot 自动改 nginx 配置）
sudo certbot --nginx -d $SERVICE_DOMAIN \
    --non-interactive --agree-tos -m admin@example.com \
    --redirect

# 校验 + reload
sudo nginx -t && sudo systemctl reload nginx

# 验证
curl -fsI https://$SERVICE_DOMAIN/
```

每加一个服务重复这一组（改 `SERVICE_NAME` / `SERVICE_DOMAIN` / `SERVICE_UPSTREAM`）。

> 💡 **建议把这个脚本存为 admin 自定义 catalog 项**——以后给 B / C / D / 任意机器加新域名都直接 UI 选项目跑。

#### 4.B.5（推荐）通配证书 — 一次签所有子域

域名多（10+）时每个单独签证书会触发 LE rate limit。用通配证书更省：

```bash
# 需要 DNS 服务商 API（Cloudflare / Aliyun DNS / DNSPod / 等）
sudo apt install -y python3-certbot-dns-cloudflare        # Cloudflare 例

# 配 API token
sudo mkdir -p /etc/letsencrypt/secrets
sudo tee /etc/letsencrypt/secrets/cloudflare.ini >/dev/null <<EOF
dns_cloudflare_api_token = YOUR_CF_API_TOKEN
EOF
sudo chmod 600 /etc/letsencrypt/secrets/cloudflare.ini

# 签通配
sudo certbot certonly --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/secrets/cloudflare.ini \
    -d "*.example.com" -d "example.com" \
    --non-interactive --agree-tos -m admin@example.com
```

之后 4.B.4 的 conf 文件全部用同一份证书：

```nginx
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
```

不再需要 `certbot --nginx` 单独跑——只要 nginx conf 引用了正确路径，加新服务**只需写 conf + reload**。

#### 4.B.6 拒绝陌生域名（防扫描）

加一个"default deny"server，防止爬虫直接访问 IP 看到任意一个站点：

```bash
# 自签证书给 default 用
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -subj "/CN=localhost" \
    -keyout /etc/nginx/ssl/self-signed.key \
    -out    /etc/nginx/ssl/self-signed.crt

# 写 default-deny
sudo tee /etc/nginx/conf.d/000-default-deny.conf >/dev/null <<'EOF'
server {
    listen 80 default_server;
    listen 443 ssl http2 default_server;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/self-signed.crt;
    ssl_certificate_key /etc/nginx/ssl/self-signed.key;

    return 444;        # 关闭连接不响应
}
EOF
```

⚠️ EnvForge `nginx-web-service` 写的 `envforge-default.conf` 里也声明了 `default_server`——会冲突。修复：

```bash
sudo sed -i 's/ default_server//g' /etc/nginx/conf.d/envforge-default.conf
sudo nginx -t && sudo systemctl reload nginx
```

文件名前缀 `000-` 让 default-deny.conf 排在最前面（nginx 用文件名字典序加载）。

#### 4.B.7 替代方案：用 Caddy 一劳永逸

如果你**还没装 nginx**，从一开始用 Caddy 更省心。catalog 有 `caddy-server` 项 —— 一份 Caddyfile 列所有域名，**全部自动签 LE 证书 + 自动续期**：

```caddy
envforge-b.example.com {
    reverse_proxy 127.0.0.1:5173
}
vault.example.com {
    reverse_proxy 127.0.0.1:8086
}
files.example.com {
    reverse_proxy 127.0.0.1:8088
}
home.example.com {
    reverse_proxy 127.0.0.1:3010
}
```

每加一个服务 = 多 3 行 Caddyfile + 重启 Caddy。**不需要任何 certbot / openssl 操作**。

适合**新机器从零起 + 多域名**场景。已装好 nginx 想换 Caddy 不划算。

#### 4.B.8 验证全部

```bash
# 在 B 上看 nginx 配置
sudo nginx -T | grep server_name

# 应列出所有域名

# 浏览器逐个测
curl -I https://envforge-b.example.com/
curl -I https://vault.example.com/
curl -I https://files.example.com/
# 全 200 / 302 = OK

# 看证书是否对
echo | openssl s_client -connect vault.example.com:443 -servername vault.example.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

🎉 **B 现在是一台多服务对外 + 全 HTTPS 的实例**。

---

> 📚 **更详细的 nginx 多服务配置**（公用 TLS 参数、命名约定、限速、PHP-FPM、HSTS 等）见 [`nginx-web-service.md`](../configs/catalog/software/nginx-web-service.md) 的"模板 F / G"段落。

---

## 五、可选：监控 B 是否健康

让 A 持续监控 B 的存活：

### 5.1 `uptime-kuma`（如果 A 已装）

A 的 Uptime Kuma 里加监控：

```
+ Add New Monitor → HTTP(s)
  Name:     B EnvForge
  URL:      https://envforge-b.example.com/api/health
  Interval: 60s
  Retries:  3
```

→ B 不健康时 A 的 Uptime Kuma 会发 Discord / Telegram / 邮件告警。

### 5.2 把 B 加到 A 的 `homepage`

A 的 Homepage（如装了 `homelab-dashboard` combo）→ 编辑 `services.yaml`：

```yaml
- 多实例:
    - B - Production:
        href: https://envforge-b.example.com
        description: Production EnvForge instance
        icon: si-docker
```

A 的首页就有了 B 的入口卡片。

---

## 六、可选：把 B 也加为 B 自己的受管目标

奇怪但有用——让 B 也能管理 B 自己（同 [Phase 1.1](#11-在-b-上准备-ssh--sudo-账号) 步骤）：

```
B 的 UI → VM Manager → Add Connection
  Name:  Self host
  Host:  172.17.0.1                  # B 上的 Docker 网关
  Port:  22222                        # B 的新 SSH 端口
  User:  envforge-mgr
  Auth:  Password
```

这样如果 A 哪天挂了 / 不可达，B 自己仍能继续管理自己（升级 / 维护）。**A 和 B 数据完全独立**——一处的用户 / 连接 / 任务历史不会同步到另一处。

---

## 七、A 和 B 的数据迁移（蓝绿升级 / 灾备恢复用）

如果你在 B 上想**继承 A 的所有数据**（用户 / 连接 / 任务历史 / 自定义 catalog），而不是一个全新的实例：

```bash
# 在 A 上备份
cd /opt/envforge
docker run --rm -v envforge_data:/d:ro -v $(pwd)/backups:/b \
  alpine tar czf /b/envforge-$(date +%F).tar.gz -C /d .

# 把备份和 .env 安全传到 B
scp backups/envforge-*.tar.gz envforge-mgr@<B 的 IP>:/tmp/
scp .env envforge-mgr@<B 的 IP>:/tmp/envforge.env       # 含 master key——加密传

# 在 B 上恢复（**必须**用 A 的原 .env 覆盖 B 自己生成的，否则凭据解不开）
ssh envforge-mgr@<B 的 IP> -p 22222 <<'EOF'
cd /opt/envforge
docker compose down
sudo cp /tmp/envforge.env .env                          # 覆盖（含 A 的 master key）
docker volume rm envforge_data
docker volume create envforge_data
docker run --rm -v envforge_data:/d -v /tmp:/b:ro \
  alpine tar xzf /b/envforge-*.tar.gz -C /d
docker compose up -d
EOF
```

✅ B 现在的数据库 / 用户 / 连接 / 凭据 / 任务历史**全部继承 A**。

⚠️ **A 和 B 不能同时用同一份数据**（runtime-db.json 是单写的 SafeJsonStore，没有多写协调）—— 这只适合"蓝绿切换"或"A 出故障迁到 B"的一次性迁移，不是双向同步。

---

## 八、销毁 A（如果是蓝绿升级）

DNS 切到 B + 验证 B 正常运行 ≥ 24h 后：

```bash
# 在 A 上
cd /opt/envforge
docker compose down            # 软停（不删 volume）

# 等几天确认 B 没问题再彻底销毁
# docker compose down -v       # 不可逆 —— 删 volume
# sudo rm -rf /opt/envforge
```

或者保留 A 当**冷备份目标**——A 不对外服务，但 `docker compose down` 后 volume 留着，需要时 `up -d` 即可。

---

## 九、流程清单速查

| 阶段 | 在哪做 | 内容 | 时间 |
|---|---|---|---|
| 1.1 | SSH 进 B | 创建 envforge-mgr + NOPASSWD sudo | 1 分钟 |
| 1.2 | A 的 UI | 加 B 连接 | 30 秒 |
| 2.1 | A 的 UI | 跑 5 个 Playbook（swap / ssh-hardening / firewall / docker / fail2ban） | 5 分钟 |
| 2.2 | A 的 UI | 改 B 连接的 SSH 端口 | 30 秒 |
| 3 | A 的 UI（shell）或 SSH 进 B | clone + .env + master key + `docker compose up -d` | 2 分钟 |
| 4.A 单服务 | A 的 UI | nginx-web-service + certbot-ssl | 3 分钟 |
| 4.B 多服务 | A 的 UI（shell）| 主站 nginx + 通配证书 / 各服务独立 conf | 5-10 分钟（看域名数）|
| 5（可选） | A 的 UI | uptime-kuma + homepage 加 B | 1 分钟 |
| 6（可选） | B 的 UI | 加 B 自己为受管目标 | 30 秒 |
| 7（可选） | A + B 命令行 | 数据迁移 | 5 分钟 |

**总计**：

- **单服务 EnvForge** = **12-15 分钟**
- **多服务（4 个域名）** = **18-25 分钟**

---

## 十、为什么这种部署模式有意义

直白对比"在 B 上从零跑 [DEPLOY.md](./DEPLOY.md) 全套"：

| 项 | 纯手动（DEPLOY.md） | 用 A 部署 B（本文） |
|---|---|---|
| 装 Docker | SSH 进 B + 跑 5-10 行 apt/dnf 命令 | A 的 UI 跑 `docker-host-profile`（自动按发行版选包名） |
| swap / SSH 加固 / 防火墙 / fail2ban | 写 80-100 行配置 + 容易写错 | A 的 UI 跑 4 个 Playbook，每个表单填几个值 |
| nginx + LE | SSH 进 B + 写 nginx.conf + 跑 certbot | A 的 UI 跑 2 个 Playbook，自动签发 + 续期 |
| 后续监控 / dashboard | 自己装 | A 的 Uptime Kuma 自动盯，A 的 Homepage 直接显示 |
| 跨多台 B / C / D | 每台都重复整套手动 | **每台 5 分钟**（同样跑那 7 个 Playbook） |
| 失败重跑 | 手动检查哪步跑了哪步没跑 | catalog Playbook 全部幂等，重跑不会重复装 |
| 操作审计 | 散落在 SSH history | A 的任务历史含每步的 stdout / stderr / 退出码 |

**结论**：每多部署一台 EnvForge 实例，A 的价值就增加一份——这是把"运维知识"从"散落在 README 文档"固化到"可执行的 Playbook"的具体收益。

---

## 十一、常见问题

### Q: B 装完后 A 还需要管它吗？

不需要。B 和 A 是两个独立实例。Phase 5 的监控只是"我希望 A 知道 B 是否健康"——可选。

### Q: A 挂了 B 还能用吗？

完全可以——B 是独立 docker stack，不依赖 A。Phase 6 的"B 也管 B 自己"步骤更进一步，让你在 A 长期不可达时仍能维护 B。

### Q: 多台 B、C、D、E 一起部署？

把 Phase 1-4 全套对每台跑一遍。**强烈建议**把 Phase 3 的 shell 命令保存为 admin 的自定义 catalog 项（通过 catalog 管理面板），后续直接选项目跑。

### Q: master key 能不能 A B 共用一个？

**仅当**你想让 B 继承 A 的数据（Phase 7）—— 此时必须共用。**否则**每个实例**生成独立的 master key**——降低单点泄露风险。

### Q: B 上跑哪些 catalog 项？

- 必跑：`swap-config` / `ssh-hardening` / `firewall-baseline` / `docker-host-profile` / `fail2ban-protection` / `nginx-web-service` / `certbot-ssl`
- 推荐：`uptime-kuma`（可选监控）/ `homepage`（如多实例需要总入口）
- B 的本地服务：取决于 B 跑哪些目标 VM——这就回到正常的"用 EnvForge 装服务"流程

### Q: B 跑了一段时间 A 想下线了，怎么把数据还给 B 自己？

不需要——B 的数据从一开始就在 B 上（A 只是"操作面板"）。直接停 A 即可，B 不受影响。除非用了 Phase 7 数据迁移让 B 从 A 继承数据 —— 那也是一次性事件。

### Q: B 上要跑 EnvForge + Vaultwarden + Nextcloud + ... 多个 Web 服务，每个都要 HTTPS，nginx 怎么配？

走 [4.B 多服务场景](#4b-多服务场景多域名共一台-nginx)。一句话总结：

- 一个 nginx 实例可以同时服务几十个不同域名
- catalog 的 `nginx-web-service` Playbook 是**单站点设计**，重复跑会覆盖——只用一次
- 额外的服务**不再跑 Playbook**，直接编辑 `/etc/nginx/conf.d/<service>.conf` 加 server 块
- 域名多（10+）用通配证书省 LE rate limit
- 全新机器多服务 → 考虑 `caddy-server` 或 `traefik-proxy`，更适合多域名场景

### Q: 已经按 4.A 装了 EnvForge，后来想加 Vaultwarden 怎么办？

不用重新装 nginx。直接走 4.B.4 给 Vaultwarden 加独立 conf + certbot 签证书。EnvForge 那个 server 块（envforge-default.conf）保留不动。

---

## 十二、参考链接

- [DEPLOY.md](./DEPLOY.md) — 纯手动从零部署 EnvForge（A 的初始部署，或者完全不靠 A 装 B）
- [README.md](../README.md) — 项目总览
- [docs/CATALOG.md](./CATALOG.md) — 完整 115 项 catalog（找你想跑的 Playbook）
- [docs/PRODUCT.md](./PRODUCT.md) — 产品定位 / 角色 / 隐私模型
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — 引擎和模块设计
