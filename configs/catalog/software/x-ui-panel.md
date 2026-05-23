# 3x-ui 面板

3x-ui 是基于 [Xray-core](https://github.com/XTLS/Xray-core) 的多协议代理面板（VLESS / VMess / Trojan / Shadowsocks / WireGuard）。EnvForge 自动跑官方 install.sh，再用 `x-ui setting` 把端口、用户名、密码改成你填写的值——**安装完成后立刻能用确定的凭据登录**，不留默认账号。

## 你将得到什么

- ✅ Xray-core + 3x-ui 面板（来自 GitHub 官方源）
- ✅ systemd 单元 `x-ui.service`（已设开机自启）
- ✅ 端口 / 访问路径 / 管理员账号按表单值生效（**不再用默认账号**）
- ✅ SQLite 数据库存配置（`/etc/x-ui/x-ui.db`）
- ✅ 自动备份脚本（每天，可选）

## 表单字段说明

### `panel_port`

3x-ui 默认 54321。**强烈建议改非标高位端口**（30000-60000 区间，如 39527 / 47832），扫描器一般只扫常见端口。

> 改端口后记得防火墙开放：`sudo ufw allow {panel_port}/tcp` 或 `sudo firewall-cmd --add-port={panel_port}/tcp --permanent --reload`。

### `panel_path`

Web 路径前缀。默认 `/`（访问 `http://ip:port/`）。**强烈建议改成不可猜的路径**（如 `/admin-dashboard-x9k2` / `/secret-path`），扫描器仅扫根路径。**必须以 `/` 开头**。

### `admin_username`

不要用 `admin` / `root` / `xui`（爆破字典首选）。建议 6-12 位随机字母数字组合。

### `admin_password`

留空 = EnvForge 自动生成 24 位强密码（运行结束日志显示一次）。自定义建议 ≥ 16 位混合字符。

## 配置文件 / 目录速查

```
/etc/x-ui/                                # ← 主目录
├── x-ui.db                                # SQLite 数据库（用户 / 入站 / 出站规则）
├── bin/
│   ├── xray-linux-amd64                    # Xray-core 二进制
│   └── geoip.dat geosite.dat               # 地理 / 站点数据库（路由用）
└── config.json                              # Xray 运行时配置（自动生成，不要手改）

/usr/local/x-ui/
└── x-ui                                     # 面板二进制

/usr/bin/x-ui                                # 命令行管理工具

/var/log/x-ui/
├── access.log                               # 代理访问日志
└── error.log                                # 错误日志

# systemd
/etc/systemd/system/x-ui.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 官方 install.sh（兼容多平台） | 同 |
| 二进制位置 | `/usr/local/x-ui/` | 同 |
| 数据目录 | `/etc/x-ui/` | 同 |
| 服务名 | `x-ui` | `x-ui` |

## 常见配置模板

### 模板 A — 安装后立即必做的 5 件事

```bash
# 1. 浏览器登录确认凭据有效
# http://server-ip:你的端口/你的路径

# 2. 进入面板 "面板设置" 再次改密码（双重确认）

# 3. 启用 HTTPS（强烈建议）
#    UI → 面板设置 → 面板证书 → 上传 certbot 拿的 fullchain.pem + privkey.pem
#    或直接走 Let's Encrypt（面板内置）

# 4. 启用 IP 限制（仅自己 IP 能登）
#    UI → 面板设置 → 面板 IP 限制

# 5. 启用 fail2ban 兼容日志
#    UI → 面板设置 → 启用 fail2ban
```

### 模板 B — 添加一个 VLESS + Reality 入站（推荐）

Reality 是 Xray 的 anti-censorship 协议，伪装最像真实 HTTPS。

UI 操作流程：

1. 入站列表 → 添加入站
2. 协议：`vless`
3. 端口：`443`（与真实 HTTPS 端口一致最难识别）
4. 网络：`tcp`
5. 流控：`xtls-rprx-vision`
6. 安全：`reality`
7. uTLS：`chrome`（伪装为 Chrome 浏览器）
8. ServerNames：`www.microsoft.com`（要伪装的真实域名）
9. Dest：`www.microsoft.com:443`
10. 私钥：点 "Get New Cert" 自动生成
11. ShortIds：留空（自动生成）
12. 用户：随便加几个 UUID

保存后客户端导入 URL（点二维码）。

### 模板 C — 自动备份配置（防数据丢失）

```bash
# 装 cron job
sudo crontab -e
```

```cron
# 每天凌晨 3 点备份 x-ui 数据库 + Xray config
0 3 * * * /usr/bin/cp /etc/x-ui/x-ui.db /var/backups/x-ui-$(date +\%Y\%m\%d).db && find /var/backups -name 'x-ui-*.db' -mtime +30 -delete
```

或用面板内置的备份功能（设置 → 数据库导出）发送到 Telegram bot。

### 模板 D — Telegram bot 通知（流量告警 / 异常登录）

UI → 设置 → Telegram

```
Bot Token: 1234567:AAA...                  (找 @BotFather 创建)
Chat ID:   123456789                          (找 @userinfobot 拿)
通知项：
  ☑ 登录通知
  ☑ 流量告警（每用户超 80% 配额）
  ☑ 入站状态变化
```

### 模板 E — Reverse Proxy + Cloudflare（隐藏真实 IP）

```
Client → Cloudflare（CDN）→ Cloudflare Tunnel → x-ui 面板
                              （不需要开 80/443）
```

```bash
# 装 cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
sudo chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# 登录 + 创建 tunnel
cloudflared tunnel login
cloudflared tunnel create my-xui

# 配置：~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: panel.example.com
    service: http://localhost:54321
  - service: http_status:404

# 路由 + 启动
cloudflared tunnel route dns my-xui panel.example.com
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

之后 `https://panel.example.com/path` 访问面板，真实 IP 不暴露。

## 关键参数调优速查

### 性能

```bash
# 看 Xray 资源占用
top -p $(pgrep xray)

# 通常 1 核 + 256 MB 能撑 100+ 并发用户
```

### 流量限制（per-user）

UI → 入站 → 客户端管理 → 编辑用户：

| 字段 | 适用 |
|---|---|
| 总流量 | 用户总配额（按月重置） |
| 过期时间 | 自动停用 |
| IP 限制 | 同时连接数 |

### Xray 路由优化（GeoIP 分流）

Reality 入站默认所有流量走 VPN。要分流（国内直连 / 国外走代理）：

UI → Xray 设置 → 路由：

```json
{
  "rules": [
    {
      "type": "field",
      "ip": ["geoip:cn", "geoip:private"],
      "outboundTag": "direct"
    },
    {
      "type": "field",
      "domain": ["geosite:cn", "geosite:apple-cn", "geosite:google-cn"],
      "outboundTag": "direct"
    }
  ]
}
```

## 跨发行版兼容

3x-ui 用预编译二进制，跨平台一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Rocky / Alma 9 | ✅ |
| Anolis 9 | ✅ |
| Alpine | ⚠️ 用 [3x-ui Docker 镜像](https://hub.docker.com/r/mhsanaei/3x-ui) |
| ARM64 | ✅（自动选 arm64 二进制） |

EnvForge Playbook 调用官方 install.sh 自动适配。

## 与其它 catalog 项的配合

- **`certbot-ssl`** — 给面板 HTTPS（强烈推荐）
- **`fail2ban-protection`** — 给面板路径加 jail 防爆破
- **`firewalld` / UFW** — 限制面板端口仅自己 IP 访问
- **`nginx-web-service`** — 反代到 3x-ui（多一层隔离）

## 排错

### 安装脚本失败

国内服务器到 GitHub raw 偶发慢。手动：

```bash
wget https://github.com/MHSanaei/3x-ui/releases/latest/download/x-ui-linux-amd64.tar.gz
sudo tar -xzf x-ui-linux-amd64.tar.gz -C /usr/local/
sudo /usr/local/x-ui/x-ui-linux-amd64 install
```

### 浏览器打不开面板

```bash
# 1. 服务在跑？
sudo systemctl status x-ui

# 2. 端口在听？
sudo ss -tlnp | grep <YOUR_PORT>

# 3. 防火墙开了？
sudo ufw status
sudo firewall-cmd --list-ports

# 4. 云厂商安全组开了？
# AWS / Aliyun / Tencent / DigitalOcean 都有独立的入站规则

# 5. 路径对了？panel_path 是 /admin-x123 而非 /
curl http://server-ip:port/admin-x123
```

### 忘记密码 / 锁在外面

```bash
sudo x-ui              # 进交互菜单
# → 8. 重置用户名和密码
# → 输入新值
sudo systemctl restart x-ui
```

### Reality 客户端连不上

```bash
# 1. 看 xray 日志
sudo journalctl -u x-ui -n 100

# 2. 时间戳偏差（Reality 校验时间）
sudo timedatectl status            # NTP 同步要正常

# 3. ServerNames 域名不通
# Reality 需要伪装的真实域名（如 microsoft.com）能从 server 访问
curl https://www.microsoft.com -I

# 4. 客户端公钥 / shortId 不对
# UI 重新拿配置 URL，重新导入客户端
```

### 流量统计不准

3x-ui 流量统计有 1-5 分钟延迟。立即看：

```bash
sudo cat /var/log/x-ui/access.log | tail -20
```

### Telegram bot 不通知

```bash
# 测试 bot
curl "https://api.telegram.org/bot<BOT_TOKEN>/getMe"

# 测试 chat ID
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>&text=test"
```

国内 server 到 api.telegram.org 可能慢——加 socks5 proxy。

### 升级后 panel 进不去

升级有时重置设置：

```bash
sudo x-ui                 # 进菜单
# → 6. 设置面板端口 / 路径
# 重新设回你的值

# 或备份恢复
sudo cp /var/backups/x-ui-20260520.db /etc/x-ui/x-ui.db
sudo systemctl restart x-ui
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active x-ui

# 2. 端口
sudo ss -tlnp | grep <YOUR_PORT>

# 3. 访问面板
curl -I http://127.0.0.1:<YOUR_PORT><YOUR_PATH>

# 4. xray 在跑（一旦有入站启用后）
ps aux | grep xray
sudo cat /var/log/x-ui/access.log | tail
```

## 多次运行

`installMode: skip-existing`。已装跳过 install.sh。**面板端口 / 路径 / 用户名 / 密码每次按表单值更新**——保留入站配置和用户列表（在 SQLite 里）。

## ⚠️ 敏感性

**review** — 代理面板，配置错误风险：

- **暴露默认凭据**（54321 端口 + admin/admin）= 数小时内被扫到接管
- **入站设置错**（端口冲突 / 私钥泄露）= 客户端连不上
- **法律合规**：在某些司法管辖区使用 / 提供代理服务**违法**——使用前确认本地法律

EnvForge 默认配置：随机端口 + 随机路径 + 随机用户名 + 强密码——已极大降低被扫风险。

## 隐私说明

- **用户名 / 密码**会在 EnvForge 任务运行日志里出现（终端面板可见）
- 任务历史保留这些值——介意可手动删除任务记录
- 自动生成的密码**只在运行时显示一次**，**不会**保存到 EnvForge 数据库
- 忘记密码只能 SSH 到服务器跑 `sudo x-ui` 重置
- access.log 记录所有客户端 IP / 访问域名——按合规需求处理
- 3x-ui 不发遥测，但 Xray-core 的某些配置（如订阅链接 fetch）会产生外部请求
- 客户端订阅 URL 含敏感凭据（UUID / shortId / 服务端公钥）——通过加密通道分发
