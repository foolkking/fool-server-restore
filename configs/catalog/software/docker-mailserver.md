# docker-mailserver 完整邮件栈

docker-mailserver 是**自托管邮件全栈**——单容器集成 Postfix（SMTP）+ Dovecot（IMAP/POP3）+ Rspamd（反垃圾 + DKIM + DMARC）+ Fail2Ban + 可选 ClamAV。**适合**：自建邮箱、企业内部邮件、自定义域邮件。**严重警告**：自托管邮件 **DNS 配置错就进垃圾箱**——必须有正确的 PTR / SPF / DKIM / DMARC，且 IP 信誉良好（很多 VPS IP 段被 Gmail / Outlook 默认黑名单）。

## ⚠️ 部署前必读

**自托管邮件比想象难 5 倍**——大厂（Gmail / Outlook / Yahoo）严格反垃圾，**配错就被静默丢弃**。

### 必备前置（缺一进垃圾箱）

| 项 | 检查方法 |
|---|---|
| 静态 IP（不能是动态 DHCP） | `curl ifconfig.me` 多查几次看是否变 |
| 反向 DNS（PTR）匹配 hostname | `dig -x $(curl -s ifconfig.me)` 应得 `mail.example.com` |
| ISP / VPS 不在垃圾名单 | https://mxtoolbox.com/blacklists.aspx |
| 25 端口出站可用 | 大多数住宅宽带 + 部分 VPS（AWS / GCP）默认封 25 |
| MX + SPF + DKIM + DMARC DNS 全配 | 启动 Playbook 后跟着提示走 |

### 推荐 VPS（25 端口默认开 + 反向 DNS 可改）

- ✅ Hetzner / Vultr / Linode（小机房 / 默认开）
- ⚠️ DigitalOcean / OVH（要发工单解封 25）
- ❌ AWS EC2 / GCP（25 出站默认全封——必须用 587 中继到 SES / SendGrid）

## 你将得到什么

- 📦 **mailserver 容器**（`ghcr.io/docker-mailserver/docker-mailserver:latest`）
- ✅ Postfix（SMTP，端口 25 + 465 + 587）
- ✅ Dovecot（IMAP 143 + IMAPS 993）
- ✅ Rspamd（反垃圾 + DKIM 签名 + DMARC 校验）
- ✅ Fail2Ban（封暴力破解 IP）
- ✅ Policyd-SPF（入站 SPF 校验）
- ✅ Sieve（用户级邮件过滤规则）
- ⚪ ClamAV（**默认关**——吃 1GB+ RAM）
- ✅ Maildir 格式（备份友好）
- ✅ TLS（Let's Encrypt 集成）

## 表单字段说明

### `dms_hostname`

**最关键**——邮件服务器自己的 FQDN（不是邮件地址里的 @ 后面）。

```
邮件地址: user@example.com   (dms_domain = example.com)
邮件服务器: mail.example.com  (dms_hostname = mail.example.com)
```

DNS 必须配：

```
A      mail.example.com.      <服务器 IP>
PTR    <服务器 IP>.in-addr.arpa  mail.example.com   ← VPS 控制台改
```

PTR 与 hostname **必须互相匹配**（A 记录 → IP，IP PTR → 同 hostname）。否则邮件被 Gmail / Outlook 直接拒。

### `dms_domain`

邮箱 @ 后面的部分。

### `dms_postmaster_email`

DMARC 失败 / 邮件 bounce 等系统通知发到这里。

⚠️ **Playbook 不会自动创建该邮箱**——记得跑：

```bash
docker exec -it mailserver setup email add postmaster@example.com
```

### `dms_data_dir`

```
{data_dir}/
├── data/                      # 用户邮件（Maildir，每邮件一文件）
├── state/                     # postfix / dovecot 状态
│   └── letsencrypt/           # LE 证书 symlink
├── logs/                      # 邮件日志
└── config/                    # 用户列表 / DKIM keys / 自定义配置
    ├── postfix-accounts.cf    # 用户清单
    ├── postfix-virtual.cf     # 别名
    └── opendkim/keys/         # DKIM private key
```

**每日备份**——尤其 `data/` 和 `config/`。

### `dms_enable_clamav`

**默认 false**——ClamAV 吃 1 GB+ RAM。家庭 / 小 VPS（< 2 GB RAM）必关。Rspamd 已检查附件 hash 黑名单 + URL 信誉，已经有 90% 防护。

### `dms_enable_fail2ban`

**默认 true**——SMTP / IMAP 暴力破解很猖獗。

### `dms_log_level`

排错时调 debug，平时 info。trace 日志爆炸（几小时几 GB）。

## 配置文件 / 目录速查

```
{data_dir}/config/
├── postfix-accounts.cf            # 用户清单 + 密码 hash
├── postfix-virtual.cf             # 别名（一收件人多地址）
├── postfix-aliases.cf             # 系统别名（postmaster: → user1）
├── postfix-relaymap.cf            # 中继路由（用 SES / SendGrid 时）
├── postfix-sasl-password.cf       # 中继认证
├── opendkim/keys/<domain>/        # DKIM 私钥（**敏感**）
├── ssl/                            # 自签证书路径（不用 LE 时）
├── rspamd/                         # 反垃圾自定义规则
└── sieve/                          # 用户邮件过滤规则
```

## 常见配置模板

### 模板 A — 加邮箱用户

```bash
# 加用户（系统会提示输密码）
docker exec -it mailserver setup email add user1@example.com
docker exec -it mailserver setup email add user2@example.com

# 列用户
docker exec -it mailserver setup email list

# 改密码
docker exec -it mailserver setup email update user1@example.com

# 删用户
docker exec -it mailserver setup email del user1@example.com
```

### 模板 B — 邮件别名（一收件人多地址）

```bash
# postmaster@ alex@ 都路由到 user1@
docker exec -it mailserver setup alias add postmaster@example.com user1@example.com
docker exec -it mailserver setup alias add alex@example.com user1@example.com
```

### 模板 C — DKIM key 生成 + DNS

```bash
# 1. 生成（首次必跑）
docker exec -it mailserver setup config dkim

# 2. 拿 DNS 记录（从生成的 mail.txt）
cat /opt/mail/config/opendkim/keys/example.com/mail.txt
# 输出类似：
# mail._domainkey  IN TXT  ( "v=DKIM1; h=sha256; k=rsa; "
#   "p=MIIBIjANBgkqhki..." )

# 3. 把 mail._domainkey.example.com 加到 DNS（TXT 记录）
# 名字: mail._domainkey
# 类型: TXT
# 值:   v=DKIM1; h=sha256; k=rsa; p=MIIBIj...（合并成一行）

# 4. 验证
dig +short TXT mail._domainkey.example.com
```

### 模板 D — SPF / DMARC DNS

```
# SPF（example.com 的 TXT 记录）
v=spf1 mx ~all

# DMARC（_dmarc.example.com 的 TXT）
v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com; pct=100

# 解释:
# p=none       仅监控（部署初期用）
# p=quarantine 失败放垃圾箱（推荐）
# p=reject     失败直接拒（最严，确保 DKIM/SPF 全对再启用）
```

### 模板 E — 配 LE 证书

```bash
# 1. 停 mailserver 释放 80 端口
cd /opt/mail
docker compose stop

# 2. certbot standalone（参考 certbot-ssl Playbook）
sudo certbot certonly --standalone -d mail.example.com

# 3. 把 LE 目录链到 mailserver state
sudo ln -s /etc/letsencrypt /opt/mail/state/letsencrypt

# 4. 启动
docker compose up -d

# 5. 验证（应显示 LE 而不是 self-signed）
openssl s_client -connect mail.example.com:993 < /dev/null 2>&1 | grep issuer

# 6. 证书续期 hook（让 mailserver 重新加载）
echo '#!/bin/bash
docker exec mailserver supervisorctl restart postfix dovecot' \
    | sudo tee /etc/letsencrypt/renewal-hooks/post/mailserver.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/mailserver.sh
```

### 模板 F — 通过中继发送（VPS 25 出站封时）

很多 VPS（AWS / GCP）封 25 出站。用 SendGrid / SES / Mailgun 中继：

```bash
# 1. 在中继商账号拿 SMTP 凭据
# 2. 配 sasl_password
echo '[smtp.sendgrid.net]:587 apikey:YOUR-API-KEY' \
    | sudo tee /opt/mail/config/postfix-sasl-password.cf

# 3. 配 relayhost
echo '@example.com [smtp.sendgrid.net]:587' \
    | sudo tee /opt/mail/config/postfix-relaymap.cf

# 4. 重启
docker restart mailserver
```

发件人 IP 信誉用中继商，不用担心 VPS 黑名单。

### 模板 G — Webmail（Roundcube）

```yaml
# 加到 docker-compose.yml
services:
  # mailserver: ...

  roundcube:
    image: roundcube/roundcubemail:latest
    container_name: roundcube
    restart: unless-stopped
    depends_on:
      - mailserver
    environment:
      ROUNDCUBEMAIL_DEFAULT_HOST: ssl://mailserver
      ROUNDCUBEMAIL_DEFAULT_PORT: 993
      ROUNDCUBEMAIL_SMTP_SERVER: tls://mailserver
      ROUNDCUBEMAIL_SMTP_PORT: 587
    volumes:
      - /opt/roundcube/db:/var/roundcube/db
      - /opt/roundcube/www:/var/www/html
    ports:
      - "127.0.0.1:8090:80"
```

反代 webmail.example.com → 8090 即可（同 nginx 模板）。

### 模板 H — 备份 / 还原

```bash
# 备份（含所有邮件 + 配置 + DKIM keys）
sudo systemctl stop docker     # 或 docker compose down
sudo tar -czf mail-backup-$(date +%F).tar.gz -C /opt mail
sudo systemctl start docker

# 还原（新机器）
sudo tar -xzf mail-backup-YYYY-MM-DD.tar.gz -C /opt
cd /opt/mail
docker compose up -d
```

## 关键参数调优速查

### 资源占用

| 邮箱数 | RAM（含 Rspamd） | RAM（含 ClamAV） | 磁盘 |
|---|---|---|---|
| < 5 | 500 MB | 1.5 GB | 邮件量 × 1.1 |
| < 50 | 1 GB | 2 GB | – |
| < 500 | 2 GB | 3 GB | – |

### 反垃圾调优（Rspamd）

```yaml
# /opt/mail/config/rspamd/override.d/actions.conf
actions {
  reject = 15;          # 默认 15 → 调严 12
  add_header = 6;        # 标 X-Spam（默认 6）
  greylist = 4;          # 灰名单（默认 4）
}
```

```yaml
# /opt/mail/config/rspamd/override.d/local.conf
# 自动学习
classifier "bayes" {
  autolearn = true;
  expire = 100d;
}
```

```bash
# 标垃圾邮件（用户拖到 Junk 文件夹自动学习）
docker restart mailserver
```

### IMAP 性能

```bash
# Dovecot 默认配置已合理。1k 用户 / 100 GB 邮件量级才需调
# 看连接数：
docker exec mailserver doveadm who | wc -l
```

### 邮件大小限制

```bash
# 默认 25 MB → 调到 50 MB
echo 'message_size_limit = 52428800' \
    | sudo tee -a /opt/mail/config/postfix-main.cf
docker restart mailserver
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu/Debian | ✅ |
| RHEL/Anolis 9 | ✅ |
| ARM64 | ✅（多架构镜像） |
| 25 端口公网出站 | 看 VPS（重要） |
| 系统 postfix 冲突 | Playbook 自动检测 |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`certbot-ssl`** — 提供 LE 证书（mail.example.com）
- **`firewall-baseline`** — 配合放行 25/465/587/143/993
- **`fail2ban-protection`** — Playbook 内置的 fail2ban 已够用，外部不需要
- **`nextcloud`** — 配合做"自托管邮件 + 文件 + 日历"全栈
- 配套：Roundcube（webmail）/ SOGo（webmail + 日历）—— 见模板 G

## 排错

### Gmail 拒收 / 进垃圾箱

```bash
# 用 mail-tester 测得分（< 8 分必进垃圾箱）
swaks --to test-XXXX@srv1.mail-tester.com \
      --from user1@example.com \
      --server localhost:587 \
      --auth --auth-user user1@example.com

# 查看 https://www.mail-tester.com/test-XXXX
# 看哪项失分（PTR / SPF / DKIM / DMARC / IP 黑名单）
```

### 25 端口连不通（外发邮件失败）

```bash
# 测试 25 出站
telnet smtp.gmail.com 25
# 卡住或拒绝 = VPS 封了 25

# 解法 A: 找 VPS 客服解封
# 解法 B: 用模板 F 通过 SES / SendGrid 中继
```

### PTR 记录不对

```bash
# 查
dig -x $(curl -s ifconfig.me) +short
# 必须输出 mail.example.com.

# 不对 = 去 VPS 控制台改 PTR
# DigitalOcean: 控制台 → Droplet → Networking → PTR
# Linode: Linodes → Network → Edit RDNS
# AWS: 工单
```

### DKIM 验证失败（dig 看不到 TXT）

```bash
# 1. 真的生成了？
docker exec mailserver ls /tmp/docker-mailserver/opendkim/keys/example.com/

# 2. DNS 真的加了？等 5 分钟（DNS 传播）
dig +short TXT mail._domainkey.example.com

# 3. 加 DNS 时 selector 必须是 mail（不是 default 等）
```

### `Connection refused` 客户端连不上 IMAP

```bash
# 1. 端口监听？
sudo ss -tlnp | grep -E ':(25|143|465|587|993) '

# 2. 防火墙
sudo ufw status                  # Debian
sudo firewall-cmd --list-all     # RHEL

# 3. 容器健康
docker exec mailserver supervisorctl status
```

### 用户登录失败 `authentication failed`

```bash
# 1. 用户存在？
docker exec mailserver setup email list

# 2. 密码对？重设
docker exec -it mailserver setup email update user1@example.com

# 3. Fail2Ban 把你封了？
docker exec mailserver fail2ban-client status
docker exec mailserver fail2ban-client unban <你的 IP>
```

### 邮件队列堆积

```bash
# 看队列
docker exec mailserver mailq

# 看队列里某邮件
docker exec mailserver postcat -q <queue-id>

# 强制重发
docker exec mailserver postqueue -f

# 删特定
docker exec mailserver postsuper -d <queue-id>

# 删全部（小心）
docker exec mailserver postsuper -d ALL
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=mailserver

# 2. 所有 daemon 在跑
docker exec mailserver supervisorctl status

# 3. 端口监听
sudo ss -tlnp | grep -E ':(25|465|587|143|993) '

# 4. SMTP 连接
echo "EHLO test" | nc localhost 25
# 应有 250 ...

# 5. IMAP（已配 LE 后）
openssl s_client -connect localhost:993 -servername mail.example.com < /dev/null 2>&1 | head -20

# 6. 真实发送（让朋友 / Gmail 收）
docker exec mailserver swaks --to friend@gmail.com --from user1@example.com --auth
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——`postfix-accounts.cf` / `postfix-virtual.cf` / `opendkim/keys/` 等 **`config/` 内手动改的不动**（仅在你删 `data_dir` 时才丢）。

## ⚠️ 敏感性

**privileged** — 邮件服务器是**整个互联网公认的最难配置 + 最容易出事的服务**。

强制：

1. **开 25 出站前**：先确认 IP 不在黑名单 + PTR 正确——否则 Gmail 直接黑名单你的 IP（30 天解禁）
2. DKIM 私钥（`opendkim/keys/`）**离线备份**——丢了 = 重发的邮件签名校验失败
3. SMTP 强密码（每用户至少 16 位随机）
4. 监控 mailq 不堆积（堆 = 被退）
5. 公网应用所有 SMTP 强制 STARTTLS（Playbook 默认）
6. **每月**测一次 mail-tester 分数（防 IP 信誉滑坡）

## 隐私说明

- 所有邮件存本地 Maildir——**完全自托管**
- DKIM 签名 = 收件方能验证邮件确从你域发出
- DMARC report 让你看到伪造你域的攻击
- ClamAV 病毒库每日从公网更新（暴露 IP）
- Rspamd Reputation 服务（默认关）会查询公网 hash 库
- **加密备份**：邮件含密文很危险（重要 token / 重置链接），备份必须加密（如 borgbackup + 强密码）
