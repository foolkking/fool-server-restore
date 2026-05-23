# Catalog 清单

> 当前共 **100 个软件 (software)** + **15 个组合 (combo)** = **115 个 Playbook**。
> 数据来源：`apps/api/src/catalog.ts`（真相之源）。新增项时同步更新本文档。
> 最后更新：2026-05-24（第 15 批：扩充 15 项落地——新增 filebrowser / uptime-kuma / homepage / dozzle / paperless-ngx / navidrome / audiobookshelf / freshrss / stirling-pdf / mealie / linkwarden / seafile 12 项软件 + homelab-dashboard / selfhost-media / selfhost-pkm 3 个组合）

每条标注：
- **id** — catalog 内部唯一标识，URL / API / 本地文件名都用这个
- **sensitivity** — 风险等级：`safe`（无副作用）/ `review`（值得过目）/ `privileged`(动系统级 / 数据 / 网络栈)
- **docker** — 是否支持 docker compose 部署模式（✅ = 用户可在 UI 选 system 还是 docker）

---

## 一、Software（100 项，按 category 分组）

### 🟦 runtime — 运行时（10 项）

跑代码的语言环境。装上后能跑对应语言写的程序，但不开端口、不动数据。

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `node-runtime-profile` | Node.js 运行时配置 | review | – | NodeSource LTS + npm 全局工具 + registry 镜像 |
| `python-toolchain` | Python 工具链 | safe | – | python3 + pip + venv + 编译依赖 |
| `golang-runtime` | Go 语言运行时 | safe | – | 官方二进制装 /usr/local/go |
| `openjdk-runtime` | Java / OpenJDK 运行时 | safe | – | OpenJDK 17 + Maven |
| `rust-toolchain` | Rust 工具链 | safe | – | rustup + cargo + clippy + rustfmt |
| `nodejs-version-mgr` | NVM Node 版本管理 | safe | – | 用户级多版本 Node 切换 |
| `pyenv-toolchain` | pyenv Python 版本管理 | safe | – | 用户级多版本 Python 切换 |
| `dotnet-runtime` | .NET 8 SDK | safe | – | Microsoft 官方源，C#/F#/VB.NET |
| `php-toolchain` | PHP 8 工具链 | safe | – | Ubuntu 加 ondrej PPA + Composer |
| `ruby-toolchain` | Ruby + Bundler | safe | – | 系统 Ruby 3 + 编译依赖 |

### 🟧 developer — 开发者工具（16 项）

写代码 / 跑构建 / CI/CD / 运维诊断。

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `git-version-control` | Git 版本控制 | safe | – | git + git-lfs + 全局 user.* |
| `htop-tools` | 系统监控工具集 | safe | – | htop / btop / iotop / ncdu / sysstat |
| `rust-cli-tools` | 现代 CLI 工具集 | safe | – | bat / ripgrep / fd / eza / zoxide / fzf / tldr |
| `zsh-shell` | Zsh + Oh My Zsh | safe | – | 含主题 + 插件 |
| `fish-shell` | Fish Shell + Starship | safe | – | 智能补全 + 跨 shell 提示符 |
| `neovim-editor` | Neovim 编辑器 | safe | – | 现代 vim 分支 + LSP |
| `tmux-multiplex` | tmux 终端复用器 | safe | – | SSH 断后保持任务 |
| `code-server` | code-server (Web VSCode) | review | – | 浏览器版 VSCode（远程 IDE） |
| `ansible-tool` | Ansible 自动化工具 | safe | – | 真 Ansible CLI（pip 装） |
| `flutter-sdk` | Flutter SDK | safe | – | git clone 到 /opt/flutter |
| `jenkins-ci` | Jenkins CI/CD | review | ✅ | 含 Java 17 |
| `gitlab-runner` | GitLab Runner | review | – | runner 持你部署凭据 |
| `gitlab-ce` | GitLab CE 完整 DevOps 平台 | privileged | ✅ | git + CI + 容器仓库 + issue + wiki，最低 4GB RAM |
| `terraform-iac` | Terraform IaC | review | – | HashiCorp 官方源 |
| `sonarqube` | SonarQube 代码质量 | review | ✅ | 代码静态分析 |
| `dozzle` | Dozzle Docker 日志查看器 | privileged | ✅ | 实时容器日志 web 查看，~30MB RAM |

### 🟪 database — 数据库 / 缓存 / 搜索（12 项）

数据持久化层。除 `sqlite` 外都开端口、监听网络。

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `postgres-profile` | PostgreSQL 数据库 | privileged | ✅ | PG 16 + contrib |
| `mysql-server` | MySQL 数据库 | privileged | ✅ | MySQL 8.0 + 安全初始化 |
| `mariadb` | MariaDB 数据库 | review | ✅ | MySQL 兼容分支 |
| `sqlite` | SQLite3 嵌入式数据库 | safe | – | 仅 CLI + 库；无服务无端口 |
| `mongodb` | MongoDB 文档数据库 | review | ✅ | 7.0 Community |
| `redis-server` | Redis 内存数据库 | review | ✅ | 7.x + requirepass + maxmemory |
| `valkey-server` | Valkey 内存数据库 | review | ✅ | Redis 7.4 BSD fork（Linux Foundation） |
| `memcached` | Memcached 缓存 | review | ✅ | 高性能内存缓存 |
| `elasticsearch` | Elasticsearch 搜索引擎 | review | ✅ | 8.x + TLS + 自动改 elastic 密码 |
| `meilisearch` | Meilisearch 搜索引擎 | review | ✅ | 轻量替代 ES，<100MB RAM，应用内全文搜索 |
| `clickhouse` | ClickHouse 分析数据库 | review | ✅ | 列式 OLAP，亿级行亚秒查询 |
| `influxdb` | InfluxDB 时序数据库 | review | ✅ | IoT / 监控指标 / 性能数据长期存储 |

### 🟥 security — 安全 / 凭据 / 证书（7 项）

防御性 / 凭据 / 证书 / SSO。

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `certbot-ssl` | Certbot / Let's Encrypt SSL | review | – | nginx / apache / standalone / webroot 4 种 challenge |
| `fail2ban-protection` | Fail2Ban 入侵防护 | review | – | 默认开 SSH jail |
| `firewalld` | firewalld 防火墙 | privileged | – | RHEL 系默认；UFW 替代品 |
| `vault-secrets` | HashiCorp Vault | privileged | – | DevOps 密钥管理；首次需手动 init/unseal |
| `authentik` | Authentik 身份认证服务器 | privileged | ✅ | OIDC / SAML / LDAP SSO（4 容器栈） |
| `keycloak` | Keycloak SSO | privileged | ✅ | 企业级 SSO 事实标准（Red Hat 主导） |
| `authelia` | Authelia 轻量 SSO | privileged | ✅ | forward-auth 中间件 ~50MB RAM，配反代用 |

### 🟦 container — 容器引擎 / 编排（4 项）

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `docker-host-profile` | Docker 容器引擎 | privileged | – | docker-ce + compose + buildx + 镜像加速器 |
| `portainer` | Portainer Docker 管理 | review | ✅ | Docker Web UI |
| `kubernetes-tools` | Kubernetes 工具集 | review | – | kubectl + helm + k9s（仅客户端） |
| `k3s` | K3s 轻量 Kubernetes | privileged | – | Rancher 单二进制集群（500MB RAM 起步） |

### 🟩 network — 网络 / VPN / 代理 / DNS / 文件共享（12 项）

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `wireguard-vpn` | WireGuard VPN | privileged | – | 现代 VPN，配置极简 |
| `tailscale` | Tailscale Mesh VPN | review | – | 基于 WG 的零配置 mesh VPN，自动 P2P |
| `openvpn-server` | OpenVPN 服务器 | privileged | – | 经典方案，PKI 完整流程 |
| `traefik-proxy` | Traefik 反向代理 | review | ✅ | 自动 ACME + Docker label 发现 |
| `haproxy-lb` | HAProxy 负载均衡 | review | ✅ | 高性能 TCP/HTTP LB |
| `openresty` | OpenResty (Nginx + Lua) | review | – | 写 Lua 脚本扩展 nginx |
| `nethogs-bandwidth` | 网络流量监控 | safe | – | nethogs / iftop / vnstat / tcpdump / nmap |
| `samba-share` | Samba 文件共享 | review | – | Windows / macOS / Linux 跨平台 |
| `nfs-server` | NFS 文件服务器 | review | – | Linux 之间共享盘标准方案，homelab 必备 |
| `x-ui-panel` | 3x-ui 面板 | privileged | – | Xray + 多协议代理面板 |
| `pihole` | Pi-hole 网络广告屏蔽 | privileged | ✅ | 本地 DNS + 广告 / 跟踪域名屏蔽 |
| `adguard-home` | AdGuard Home 网络广告屏蔽 | privileged | ✅ | Pi-hole 现代替代，内建 DoH/DoT/DoQ |

### 🟨 service — 服务 / 应用（39 项）

跑起来对外提供服务的应用。

| id | 名称 | sensitivity | docker | 备注 |
|---|---|---|---|---|
| `nginx-web-service` | Nginx Web 服务 | review | ✅ | 静态站点 / 反向代理两种模式 |
| `caddy-server` | Caddy Web 服务器 | review | ✅ | Go 写，自动 HTTPS（内置 LE） |
| `vaultwarden` | Vaultwarden 密码管理器 | privileged | ✅ | Bitwarden 服务端 Rust 重写，~100MB RAM |
| `wikijs` | Wiki.js 知识库 | review | ✅ | 现代 Wiki，Markdown + git 同步 |
| `bookstack` | BookStack 文档平台 | review | ✅ | 层级化技术文档（书 → 章节 → 页面） |
| `paperless-ngx` | Paperless-ngx 文档管理 | review | ✅ | 扫描 / 上传 PDF → OCR + AI 标签 + 全文搜索 |
| `n8n` | n8n 工作流自动化 | review | ✅ | 自托管 Zapier 替代品 |
| `nocodb` | NocoDB 无代码数据库 | review | ✅ | 把 MySQL/PG/SQLite 变 Airtable 风格 GUI |
| `umami` | Umami 隐私友好分析 | review | ✅ | GA 替代品，无 cookie / GDPR 友好 |
| `home-assistant` | Home Assistant 智能家居 | review | ✅ | 5000+ 设备集成的家居自动化中枢 |
| `immich` | Immich 自托管照片库 | review | ✅ | Google Photos 替代，AI 人脸 + 物体识别 |
| `forgejo` | Forgejo 自托管 Git | review | ✅ | Gitea 社区 fork（FSF 推荐） |
| `docker-mailserver` | docker-mailserver 邮件服务器 | privileged | ✅ | 完整邮件栈（Postfix + Dovecot + Rspamd + DKIM） |
| `onlyoffice-docs` | OnlyOffice Document Server | review | ✅ | 在线协作 Office，Nextcloud 推荐文档后端 |
| `filebrowser` | FileBrowser 网页文件管理器 | review | ✅ | 极轻量 web 文件管理，~30MB RAM |
| `uptime-kuma` | Uptime Kuma 监控 | review | ✅ | 自托管 Uptime Robot，70+ 通知渠道 |
| `homepage` | Homepage 应用启动面板 | review | ✅ | 应用入口 + 实时 widgets，多服务管理 |
| `navidrome` | Navidrome 音乐流媒体 | review | ✅ | 自托管 Spotify 替代，Subsonic API 兼容 |
| `audiobookshelf` | Audiobookshelf 有声书服务器 | review | ✅ | 有声书 + 播客，iOS/Android 原生 App |
| `freshrss` | FreshRSS 阅读器 | review | ✅ | 自托管 RSS / Atom 聚合器 |
| `stirling-pdf` | Stirling PDF 工具箱 | safe | ✅ | 50+ PDF 操作（合并 / 拆分 / OCR / 等），完全本地 |
| `mealie` | Mealie 食谱管理器 | safe | ✅ | URL 一键导入 + 自动汇总采购清单 |
| `linkwarden` | Linkwarden 书签 + 网页归档 | review | ✅ | Pocket 替代，自动全文 + 截图归档 |
| `seafile` | Seafile 文件同步 | review | ✅ | 专业文件同步，性能比 Nextcloud 高 10× |
| `prometheus-monitoring` | Prometheus 监控 | review | ✅ | 时序指标 + Node Exporter |
| `grafana-dashboard` | Grafana 可视化面板 | review | ✅ | Grafana 11+ |
| `loki-logging` | Grafana Loki 日志 | review | ✅ | "Prometheus for logs" |
| `netdata-monitoring` | Netdata 实时监控 | safe | – | 600+ 指标，零配置 |
| `zabbix-monitoring` | Zabbix Agent | review | – | 仅 Agent，Server 需另装 |
| `cockpit-panel` | Cockpit Web 管理面板 | safe | – | RHEL 系默认推荐 |
| `swap-config` | Swap 交换空间 | safe | – | 默认 2GB swap 文件 |
| `rabbitmq` | RabbitMQ 消息队列 | review | ✅ | AMQP + management plugin |
| `mosquitto-mqtt` | Mosquitto MQTT 代理 | review | ✅ | IoT / 智能家居必备 |
| `minio-storage` | MinIO 对象存储 | review | ✅ | S3 兼容 |
| `nodejs-pm2` | PM2 进程管理 | safe | – | Node.js "systemd"，前置依赖 Node |
| `rsync-tools` | 备份同步工具集 | safe | – | rsync + rclone + borgbackup + restic |
| `nextcloud` | Nextcloud 私有云盘 | review | ✅ | snap 安装，含 nginx + PHP + MariaDB + Redis |
| `gitea-server` | Gitea Git 服务器 | review | ✅ | 轻量 GitLab 替代品 |
| `jellyfin-media` | Jellyfin 媒体服务器 | review | ✅ | 自托管 Plex/Emby |

---

## 二、Combo（15 项）

每个 combo 是预先编排好的"软件 + 系统命令"套餐。`installMode: replace-existing` 的会按表单值每次重写关键配置。

### 1. `ssh-hardening` — SSH 安全加固

- **类别**：security · **风险**：privileged · **部署**：system · **install mode**：replace-existing
- **包含**：
    - 📦 `openssh-server`（确保已装）
    - ⚙️ `sudo systemctl restart sshd`
- **Playbook 实际改动**：禁 root 登录 / 禁密码认证 / 改端口 / MaxAuthTries / ClientAlive 超时 / AllowUsers 白名单 / 配置改完只 reload 不切现有连接
- **典型用途**：公网 sshd 默认配置防爆破第一道防线

### 2. `firewall-baseline` — 防火墙基线

- **类别**：network · **风险**：privileged · **部署**：system · **install mode**：replace-existing
- **包含**：
    - 📦 `ufw`（RHEL 系自动切到 firewalld）
    - ⚙️ `sudo ufw enable`
- **Playbook 实际还会做**：默认 deny incoming + 默认 allow outgoing + 放行 22/80/443 + SSH 速率限制 + 拒绝包写日志
- **典型用途**：任何公网 Linux 机器开机第一件事

### 3. `lamp-stack` — LAMP 全栈环境

- **类别**：service · **风险**：review · **部署**：system · **install mode**：skip-existing
- **包含**：
    - 📦 `apache2` · Apache2 web server
    - 📦 `mysql-server` · MySQL Server
    - 📦 `php` · PHP 解释器
    - 📦 `libapache2-mod-php` · Apache PHP 模块
    - 📦 `php-mysql` · PHP MySQL 扩展
    - ⚙️ `sudo systemctl enable apache2`
    - ⚙️ `sudo systemctl enable mysql`
- **典型用途**：WordPress / Drupal / Laravel / 老 PHP CMS

### 4. `lemp-stack` — LEMP 全栈环境

- **类别**：service · **风险**：review · **部署**：system + docker · **install mode**：skip-existing
- **包含**：
    - 📦 `nginx`
    - 📦 `mysql-server`
    - 📦 `php-fpm`
    - 📦 `php-mysql`
    - ⚙️ `sudo systemctl enable nginx`
    - ⚙️ `sudo systemctl enable mysql`
- **典型用途**：现代 PHP 应用（Laravel / Symfony / WordPress 性能版）

### 5. `node-production-deploy` — Node.js 生产部署

- **类别**：runtime · **风险**：review · **部署**：system + docker · **install mode**：skip-existing
- **包含**：
    - 📦 `nodejs` · Node.js LTS
    - 📦 `npm`
    - 📦 `pm2`（npm 全局）
    - 📦 `nginx`（反代到 :3000）
    - ⚙️ `sudo systemctl enable nginx`
- **典型用途**：Express / Fastify / Next.js / NestJS 上线

### 6. `docker-compose-dev` — Docker + Compose 开发环境

- **类别**：container · **风险**：review · **部署**：system · **install mode**：skip-existing
- **包含**：
    - 📦 `docker.io` · Docker Engine
    - 📦 `docker-compose-plugin` · `docker compose` v2
    - 📦 `docker-buildx-plugin` · 多架构构建
    - ⚙️ `sudo systemctl enable docker`
- **典型用途**：开发机 / CI runner / 本地实验环境

### 7. `security-baseline` — 安全基线（终极组合）

- **类别**：security · **风险**：privileged · **部署**：system · **install mode**：replace-existing
- **包含**：
    - 📦 `ufw`
    - 📦 `fail2ban`
    - 📦 `unattended-upgrades`
    - ⚙️ `sudo systemctl enable fail2ban`
- **Playbook 实际还会做**：UFW 默认策略 + 放行 SSH/HTTP/HTTPS + 编辑 sshd_config + Fail2Ban SSH jail + unattended-upgrades 每日安全补丁
- **典型用途**：VPS 一开机就跑这个 = `firewall-baseline + ssh-hardening + fail2ban-protection + 自动更新` 四合一

### 8. `monitoring-stack` — 监控全家桶（Prometheus + Grafana + Loki）

- **类别**：service · **风险**：review · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `prom/prometheus` · 时序指标
    - 📦 `grafana/grafana-oss` · 可视化（**预配数据源**）
    - 📦 `grafana/loki` · 日志
    - 📦 `prom/node-exporter` · 系统指标
    - 📦 `gcr.io/cadvisor/cadvisor` · 容器指标
- **典型用途**：完整可观测性栈一键部署，适合中小规模生产

### 9. `selfhost-essentials` — 自托管必备四件套

- **类别**：service · **风险**：privileged · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `traefik:v3` · 反代 + 自动 HTTPS
    - 📦 `vaultwarden/server` · 密码管理
    - 📦 `pihole/pihole` · 广告屏蔽 DNS
    - 📦 `homeassistant/home-assistant` · 智能家居
- **典型用途**：家庭 / 小团队 NAS 的"开箱即用"标配——反代统一入口、家庭密码、内网广告屏蔽、IoT 中枢一次到位

### 10. `ai-localllm-stack` — 本地 AI 推理栈

- **类别**：service · **风险**：review · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `ollama/ollama` · 本地 LLM 引擎（Llama 3 / Qwen / Mistral）
    - 📦 `ghcr.io/open-webui/open-webui` · ChatGPT 风格 web 界面
    - 📦 `searxng/searxng` · 元搜索（给 AI 检索补充实时知识）
- **典型用途**：完全本地的 ChatGPT 替代——无 API 费用、数据不出本机、可挂 GPU 加速

### 11. `mail-stack` — 自托管邮件全栈

- **类别**：service · **风险**：privileged · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `ghcr.io/docker-mailserver/docker-mailserver` · Postfix + Dovecot + Rspamd + DKIM + Fail2Ban
    - 📦 `roundcube/roundcubemail` · Webmail UI
    - 📦 `caddy:latest` · 自动 HTTPS 反代（webmail.* + mail.*）
- **典型用途**：自托管完整邮件服务——发邮件 + 收邮件 + 网页版 + 反垃圾——一键起，含 DKIM / DMARC / SPF DNS 配置指引
- **重要**：自托管邮件比想象难——必须有静态 IP + 反向 DNS + 25 端口出方向通 + 完整 DNS 配置（详见 mail-stack.md）

### 12. `sso-stack` — 单点登录中央认证

- **类别**：security · **风险**：privileged · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `traefik:v3` · 反向代理 + 自动 LE HTTPS
    - 📦 `authelia/authelia` · forward-auth SSO 后端（TOTP + WebAuthn）
    - 📦 `redis:7-alpine` · session store
- **典型用途**：给所有自托管应用一个统一登录入口——其他应用加一个 Docker label 就受 SSO 保护，含 WebAuthn / TOTP 2FA

### 13. `homelab-dashboard` — Homelab 控制中心

- **类别**：service · **风险**：privileged · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `ghcr.io/gethomepage/homepage` · 应用入口面板
    - 📦 `louislam/uptime-kuma` · 服务存活监控 + 状态页
    - 📦 `amir20/dozzle` · 实时容器日志查看器
- **典型用途**：homelab 装好一堆服务后必备——一个入口看到所有应用 + 它们的健康 + 实时日志

### 14. `selfhost-media` — 自托管多媒体三件套

- **类别**：service · **风险**：review · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `jellyfin/jellyfin` · 视频流媒体（Plex 替代）
    - 📦 `deluan/navidrome` · 音乐流媒体（Subsonic API 兼容）
    - 📦 `ghcr.io/advplyr/audiobookshelf` · 有声书 + 播客（官方 App）
- **典型用途**：家庭 / 个人 NAS 完整媒体方案——视频 / 音乐 / 有声书各用专精工具

### 15. `selfhost-pkm` — 自托管个人知识库

- **类别**：service · **风险**：review · **部署**：docker · **install mode**：skip-existing
- **包含**：
    - 📦 `requarks/wiki:2` · Wiki.js 知识库（写作 / 整理）
    - 📦 `freshrss/freshrss` · RSS 订阅（信息源）
    - 📦 `ghcr.io/linkwarden/linkwarden` · 书签 + 网页归档
- **典型用途**：信息消费 → 整理 → 沉淀的完整闭环（RSS 拉信息 → Linkwarden 收藏 → Wiki.js 整理产出）

---

## 三、统计速览

| 维度 | 数量 / 比例 |
|---|---|
| 软件总数 | 100 |
| 组合总数 | 15 |
| 支持 Docker 部署的项 | 60+（数据库 11 + 服务 36 + 网络 5 + 容器 1 + 开发 4 + 安全 4 + combo 9） |
| `replace-existing` 模式（每次重写配置） | 3 个 combo（`ssh-hardening` / `firewall-baseline` / `security-baseline`） |
| `safe` 风险占比 | 27 项（23%） |
| `review` 风险占比 | 67 项（58%） |
| `privileged` 风险占比 | 21 项（19%） |

## 四、Category 含义速查

| category | 含义 | software | combo | 合计 |
|---|---|---|---|---|
| `runtime` | 编程语言运行时 | 10 | 1 | 11 |
| `developer` | 开发者工具 / CI / IaC / 编辑器 / 容器调试 | 16 | 0 | 16 |
| `database` | 数据库 / 缓存 / 搜索 | 12 | 0 | 12 |
| `security` | 防火墙 / 入侵防护 / 凭据 / 证书 / SSO | 7 | 3 | 10 |
| `container` | 容器引擎 / 编排 | 4 | 1 | 5 |
| `network` | 网络相关：VPN / 代理 / DNS / 文件共享 | 12 | 1 | 13 |
| `service` | 跑起来对外提供服务的应用 | 39 | 9 | 48 |
| **合计** | – | **100** | **15** | **115** |

## 五、相关文件位置

```
apps/api/src/catalog.ts                         ← 本文档的真相之源（CatalogItem[]）
configs/catalog/software/<id>.md                ← 每个软件的用户指南（Markdown）
configs/catalog/playbooks/<id>.yaml             ← 每个 Playbook 的执行步骤
configs/catalog/playbooks/<id>.vars.json        ← 表单字段定义（可配置项）
configs/catalog/combos/<id>.md                  ← 组合的用户指南
configs/catalog/docker/<id>.yaml                ← Docker compose 部署片段（仅 docker 模式项）
```

新增 catalog 项的清单：

1. 在 `apps/api/src/catalog.ts` 加 `CatalogItem` 对象（id / kind / category / sensitivity / components / compatibility）
2. 在 `configs/catalog/playbooks/` 加 `.yaml`（执行步骤）
3. 在 `configs/catalog/playbooks/` 加 `.vars.json`（如需表单）
4. 在 `configs/catalog/software/`（或 `combos/`）加 `.md`（用户指南）
5. （可选）在 `configs/catalog/docker/` 加 `.yaml`（docker compose 片段）
6. 同步更新本文档的清单
7. 跑 `npm run audit:catalog` 验证一致性
8. 跑 `npm run build --workspace @fool/api` 重新生成 dist（**否则前端读不到新增项**）

> **完整的字段规范、md 11 个区块要求、Playbook 必备环节、PR 自检清单**
> 见 **[CATALOG_AUTHORING.md](./CATALOG_AUTHORING.md)**。
