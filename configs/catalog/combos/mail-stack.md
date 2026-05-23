# 自托管邮件全栈

**完整自托管邮件服务器**——发邮件 + 收邮件 + 网页 webmail + 反垃圾 + DKIM + DMARC + 自动 HTTPS。一键部署 3 容器：

- 📦 **docker-mailserver** — Postfix + Dovecot + Rspamd + Fail2Ban
- 📦 **Roundcube** — 网页 webmail（多账号 / 邮件过滤 / 联系人）
- 📦 **Caddy** — 自动 HTTPS（webmail + mail.* LE 证书共用）

**适合**：自建企业邮箱、家庭自定义域邮箱、私密通讯需求。

## ⚠️ 部署前必读

**自托管邮件比想象难 5 倍**——配错就进 Gmail / Outlook 垃圾箱。**部署前确认**：

| 项 | 检查 |
|---|---|
| 静态公网 IP（不是动态宽带） | `curl ifconfig.me` 多次结果一致 |
| 反向 DNS（PTR）能改 | VPS 控制台是否能改 PTR |
| ISP / VPS 不在垃圾名单 | https://mxtoolbox.com/blacklists.aspx |
| 25 端口出方向通 | `telnet smtp.gmail.com 25` 不被封 |
| 4 个 DNS 记录会配 | A + MX + SPF + DMARC + DKIM |

**推荐 VPS**：Hetzner / Vultr / Linode（25 端口默认开 + PTR 可改）。**避坑**：AWS / GCP / 大多数住宅宽带 25 默认封。

## 你将得到什么

完整邮件栈一键部署：

- ✅ SMTP（端口 25 + 465 + 587）
- ✅ IMAPS（端口 993）—— 手机 / 桌面客户端连接
- ✅ Webmail（https://webmail.<域名>）—— Roundcube 网页登录
- ✅ Rspamd 反垃圾 + 自动 DKIM 签名 + DMARC 校验
- ✅ Fail2Ban 自动封暴力破解 IP
- ✅ Caddy 自动 LE 证书签发 + 续期（webmail + mail 双域名共证书）
- ✅ Maildir 格式（备份友好）

## 表单字段说明

### `ms_mail_hostname`

MX 记录指向的 FQDN（如 `mail.example.com`）。

⚠️ **必须配的 DNS**：

```
A      mail.example.com.            <服务器 IP>
PTR    <服务器 IP>.in-addr.arpa     mail.example.com    ← VPS 控制台改
```

PTR 与 A 记录**互相指向**——Gmail / Outlook 严格校验。

### `ms_mail_domain`

邮箱 @ 后面的部分（如 `example.com`）。

### `ms_webmail_hostname`

Roundcube 网页域名（如 `webmail.example.com`）。**与 mail_hostname 不同**——一个走 SMTP/IMAP，一个走 HTTPS web。

### `ms_postmaster_email`

DMARC report 收件人。**Playbook 不自动建该邮箱**——记得跑：

```bash
docker exec -it mailserver setup email add postmaster@example.com
```

### `ms_acme_email`

Caddy 用此邮箱向 Let's Encrypt 注册账号（接证书过期通知）。

### `ms_data_dir`

```
{data_dir}/
├── docker-compose.yml
├── Caddyfile
├── mailserver-data/         # 用户邮件（Maildir）
├── mailserver-state/        # postfix / dovecot 状态
├── mailserver-logs/         # 邮件日志
├── mailserver-config/       # 用户清单 + DKIM keys
├── roundcube-data/          # Roundcube 偏好 / 联系人 / 过滤规则
└── caddy-data/              # LE 证书（webmail + mail 共用）
```

**每日备份**——`mailserver-data/` 是所有邮件，丢了等于你公司收件箱被销毁。

## 配置文件 / 目录速查

```
{data_dir}/mailserver-config/
├── postfix-accounts.cf            # 用户清单（账号 + bcrypt 密码 hash）
├── postfix-virtual.cf             # 别名
├── postfix-aliases.cf             # 系统别名
├── postfix-relaymap.cf            # 中继路由（用 SES 时）
└── opendkim/keys/                 # DKIM 私钥（**敏感**——离线备份）

{data_dir}/Caddyfile                # Caddy 反代配置
```

## 常见配置模板

### 模板 A — 完整 DNS 配置（部署后第一件事）

```
名字                                类型   值                                     TTL
mail                                A      <你的服务器 IP>                        300
webmail                             A      <你的服务器 IP>                        300
@                                   MX     mail.example.com.   优先级 10           300
@                                   TXT    "v=spf1 mx ~all"                       300
_dmarc                              TXT    "v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com" 300
mail._domainkey                     TXT    <见模板 C>                              300
```

PTR（反向 DNS）：必须在 VPS 控制台配，不能在 DNS 提供商那边。

### 模板 B — 加邮箱用户

```bash
# 加用户（提示输密码）
docker exec -it mailserver setup email add user1@example.com

# postmaster 必加（RFC 要求）
docker exec -it mailserver setup email add postmaster@example.com

# 列用户
docker exec -it mailserver setup email list

# 改密码
docker exec -it mailserver setup email update user1@example.com

# 加别名
docker exec -it mailserver setup alias add admin@example.com user1@example.com
```

### 模板 C — DKIM key 生成 + DNS

```bash
# 1. 生成（首次必跑）
docker exec -it mailserver setup config dkim

# 2. 拿 DNS 记录
cat /opt/mail-stack/mailserver-config/opendkim/keys/example.com/mail.txt

# 输出类似：
# mail._domainkey  IN TXT  ( "v=DKIM1; h=sha256; k=rsa; "
#   "p=MIIBIjANBgkqhki..." )

# 3. 加到 DNS（合并成单行）
# 名字: mail._domainkey
# 类型: TXT
# 值:   v=DKIM1; h=sha256; k=rsa; p=MIIBIj...

# 4. 等 DNS 传播 + 验证
dig +short TXT mail._domainkey.example.com
```

### 模板 D — 测分（部署完必做）

```bash
# 在 https://www.mail-tester.com 拿临时邮箱
# 比如 test-XXXX@srv1.mail-tester.com

# 用 webmail 或命令行发邮件
sudo apt install -y swaks
swaks --to test-XXXX@srv1.mail-tester.com \
      --from user1@example.com \
      --server localhost:587 \
      --auth --auth-user user1@example.com

# 去 https://www.mail-tester.com/test-XXXX 看分数
# < 8 = 进垃圾箱（必修）
# 8-9 = 边缘（DKIM / SPF 任一弱）
# 10  = 完美
```

### 模板 E — Roundcube 高级配置

Roundcube 默认配置已可用，但部分设置在 `roundcube-data/` 里。

```bash
# 启用 ManageSieve（用户级邮件过滤规则）
# Playbook 已默认开 — 用户登录后 Settings → Filters

# 启用 PGP 加密（plugin）
# 改 docker-compose.yml roundcube 服务的 ROUNDCUBEMAIL_PLUGINS:
ROUNDCUBEMAIL_PLUGINS: "archive,zipdownload,managesieve,enigma"
```

### 模板 F — 通过中继发送（VPS 25 出方向被封时）

很多 VPS（AWS / GCP / 部分 DO）封 25 出向。用 SendGrid / SES 中继：

```bash
# 1. 中继商账号拿 SMTP 凭据
# 2. 配 sasl
echo '[smtp.sendgrid.net]:587 apikey:SG.XXXX' \
    | sudo tee /opt/mail-stack/mailserver-config/postfix-sasl-password.cf

# 3. 配 relayhost
echo '@example.com [smtp.sendgrid.net]:587' \
    | sudo tee /opt/mail-stack/mailserver-config/postfix-relaymap.cf

# 4. 重启
docker restart mailserver
```

发件人 IP 信誉用中继商，避开 VPS IP 黑名单。

### 模板 G — 备份

```bash
#!/bin/bash
# /etc/cron.daily/mail-backup
DEST=backup@nas.lan:/backup/mail/

# 邮件 + 配置（含 DKIM keys 等）
sudo rsync -az --delete /opt/mail-stack/ "$DEST/"

# Roundcube DB 单独导出（含联系人 / 过滤规则）
docker exec roundcube /bin/bash -c "sqlite3 /var/roundcube/db/sqlite.db .dump" \
    | gzip > /tmp/roundcube-$(date +%F).sql.gz
sudo rsync -az /tmp/roundcube-*.sql.gz "$DEST/"

find /tmp/roundcube-*.sql.gz -mtime +7 -delete
```

### 模板 H — 添加新邮件域

一个 mailserver 可以服务多个域：

```bash
# 加新域（DNS 同样配 MX / SPF / DMARC / DKIM）
docker exec -it mailserver setup email add user@second-domain.com

# 生成第二个域的 DKIM
docker exec -it mailserver setup config dkim domain second-domain.com
cat /opt/mail-stack/mailserver-config/opendkim/keys/second-domain.com/mail.txt
```

## 关键参数调优速查

### 资源占用

| 邮箱数 / 流量 | RAM | 磁盘 |
|---|---|---|
| < 5 用户 / 个人用 | 800 MB | 邮件量 × 1.1 |
| < 50 用户 | 1.5 GB | – |
| < 500 用户 | 3 GB | – |
| > 500 | 商业方案（Mailcow / Mailu 集群版） | – |

### 大附件支持

```bash
# 默认 25 MB → 调到 50 MB
echo 'message_size_limit = 52428800' \
    | sudo tee -a /opt/mail-stack/mailserver-config/postfix-main.cf
docker restart mailserver
```

Roundcube 上传也要调：

```yaml
# docker-compose.yml roundcube
environment:
  ROUNDCUBEMAIL_UPLOAD_MAX_FILESIZE: 50M
```

### 反垃圾调严

```yaml
# /opt/mail-stack/mailserver-config/rspamd/override.d/actions.conf
actions {
  reject = 12;          # 默认 15 → 12 更严
  add_header = 5;        # 默认 6 → 5
  greylist = 3;          # 默认 4
}
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64 | ⚠️ Roundcube 镜像仅 amd64（mailserver / Caddy 都支持 ARM） |
| 25 端口公网 | 看 VPS（关键） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`certbot-ssl`** — **不需要**（Caddy 自带 ACME）
- **`firewall-baseline`** — 配合放行 25/80/443/465/587/993
- **`fail2ban-protection`** — Playbook 内置 fail2ban，外部不需要
- **`docker-mailserver`** — 单独的 software 项；本 combo 是其上层封装（带 webmail + 反代）

## 排错

### Gmail / Outlook 拒收 / 进垃圾箱

```bash
# 跑 mail-tester 拿分数
swaks --to test-XXXX@srv1.mail-tester.com \
      --from user1@example.com \
      --server localhost:587 \
      --auth --auth-user user1@example.com

# 看 https://www.mail-tester.com/test-XXXX
# 失分项：
#   - "Reverse DNS": PTR 配错
#   - "SPF":         DNS SPF 记录漏 / 错
#   - "DKIM":        DKIM TXT 没加 / 加错
#   - "DMARC":       DMARC TXT 漏
#   - "IP Reputation": VPS IP 在黑名单（换 VPS / 用中继）
```

### Webmail 无法登录

```bash
# 1. mailserver 跑着？
docker ps --filter name=mailserver

# 2. 用户存在？
docker exec mailserver setup email list

# 3. 密码对？
docker exec -it mailserver setup email update user1@example.com

# 4. Roundcube 能连 mailserver？
docker exec roundcube curl -fsS ssl://mailserver:993 -o /dev/null
# 失败 → 网络问题，重启 docker compose
```

### Caddy 拿不到 LE 证书

```bash
# 1. DNS 真指向本机？
dig +short A mail.example.com
dig +short A webmail.example.com

# 2. 80 端口公网通？
nc -zv $(curl -s ifconfig.me) 80
# 失败 → 防火墙 / NAT 没放 80

# 3. 看 Caddy 日志
docker logs caddy | tail -50
```

### `Connection refused` 25 端口连不通

```bash
# 1. 容器跑着 + 端口映射？
docker ps | grep mailserver
# PORTS 应有 0.0.0.0:25->25/tcp

# 2. 防火墙
sudo ufw status            # 25/465/587/143/993 都应允许
sudo firewall-cmd --list-all

# 3. VPS 25 出方向封？
telnet smtp.gmail.com 25
# 失败 → 模板 F 用中继
```

### Webmail 显示 "STARTTLS failed"

```bash
# Roundcube 配错 — 应连 ssl://mailserver:993（IMAPS）而非 imap://
docker exec roundcube env | grep ROUNDCUBEMAIL_DEFAULT
# ROUNDCUBEMAIL_DEFAULT_HOST=ssl://mailserver
# ROUNDCUBEMAIL_DEFAULT_PORT=993
```

### 邮件队列堆积

```bash
# 看队列
docker exec mailserver mailq

# 强制重发
docker exec mailserver postqueue -f

# 删全部（小心）
docker exec mailserver postsuper -d ALL
```

## 验证

```bash
# 1. 三个容器都跑着
docker ps --filter name=mailserver --filter name=roundcube --filter name=caddy

# 2. SMTP / IMAPS 端口监听
sudo ss -tlnp | grep -E ':(25|465|587|143|993) '

# 3. HTTPS 端口
sudo ss -tlnp | grep ':443 '

# 4. webmail 可达
curl -fsS https://webmail.example.com -o /dev/null -w '%{http_code}\n'
# 200

# 5. mailserver supervisor
docker exec mailserver supervisorctl status
# postfix / dovecot / rspamd / fail2ban 都 RUNNING

# 6. 真实发件
swaks --to friend@gmail.com --from user1@example.com --server localhost:587 --auth
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` + `Caddyfile` 每次按表单值重写——**`mailserver-config/` 内手动改的（用户清单 / DKIM keys / 自定义规则）保留**。已存邮件不动（Maildir 格式，每邮件一文件）。

## ⚠️ 敏感性

**privileged** — 邮件服务器是公认运维难度最大 + 出事最严重的服务。

强制：

1. **开 25 出向前**：先确认 IP 不在黑名单 + PTR 正确——否则 Gmail 黑名单 30 天
2. DKIM 私钥（`opendkim/keys/`）**离线备份**
3. SMTP 用户强密码（每用户至少 16 位随机）
4. 监控 mailq 不堆积
5. **每月跑一次 mail-tester**（防 IP 信誉滑坡）
6. 定期清旧邮件（5 年家庭邮件容易上百 GB）

## 隐私说明

- 所有邮件存本地 Maildir——**完全自托管**
- DKIM 签名 / DMARC 让你域的邮件可被验证防伪造
- ClamAV 默认关（吃 RAM）
- Rspamd 默认仅本地规则（不查外部信誉服务）
- LE 证书包含 webmail + mail 双域名（透明 — 任何人查 cert 都能看到）
- 加密备份（borgbackup + 强密码）—— 邮件含 token / 密码重置链接，备份必加密
