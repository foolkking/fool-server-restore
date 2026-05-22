# Nextcloud 私有云盘

Nextcloud 是开源版"自建 Dropbox / Google Drive"——文件同步、日历、联系人、协作文档、
端到端加密。EnvForge 用 snap 安装，**内置 nginx + PHP + Redis + MariaDB 全套**，
无需手动配 LAMP/LEMP，一条命令完事。

## 你将得到什么

- 📦 **snap nextcloud**（含所有内置依赖）
- ✅ 监听 80（HTTP），可选 443（HTTPS）
- ✅ 管理员账号已创建
- ✅ 内置 nginx + PHP-FPM + Redis（缓存）+ MariaDB（数据库）
- ✅ 自动 cron 任务（处理后台同步、清理）
- ✅ 可选 Let's Encrypt 自动申请

## 表单字段说明

### 域名（可选）

填上后加到 `trusted_domains`（Nextcloud 安全机制：只允许配置过的域名访问）。
不填只能用 IP 访问。

### 管理员账号

`admin` 是默认值但是被爆破字典常见，建议改名。

### 启用 HTTPS

勾上后调用 `nextcloud.enable-https lets-encrypt`，自动签证书。前提：
1. `domain` 已经 DNS 指向本机
2. 80 端口在防火墙开了（HTTP-01 challenge 需要）
3. `letsencrypt_email` 已填

## 安装后

### 浏览器访问

`http://server-ip` 或 `https://your-domain.com`

第一次进入会跳到登录页，用 admin 账号密码登录。

### 装 Nextcloud Apps

UI → 右上角头像 → Apps → 浏览安装。常用：
- **Calendar / Contacts** — 日历联系人
- **Mail** — 邮件客户端（取代 Thunderbird）
- **Notes** — Markdown 笔记
- **Talk** — 视频通话
- **Office** — 在线编辑文档（占用大）
- **Photos** — 照片管理（含人脸识别）

### 命令行管理（occ 工具）

```bash
sudo nextcloud.occ user:list
sudo nextcloud.occ user:add john          # 加用户
sudo nextcloud.occ user:resetpassword john
sudo nextcloud.occ files:scan --all       # 扫描文件
sudo nextcloud.occ status                 # 实例状态
sudo nextcloud.occ config:system:get      # 看配置
```

### 数据存储位置

snap 部署的数据在：
- 配置：`/var/snap/nextcloud/current/nextcloud/config/`
- 用户文件：`/var/snap/nextcloud/common/nextcloud/data/`
- 数据库：`/var/snap/nextcloud/common/mysql/`

**生产备份必须包括上面所有目录**。或用 `sudo nextcloud.export` 命令一键打包。

### 改默认数据目录到大磁盘

```bash
sudo nextcloud.disable-https
sudo systemctl stop snap.nextcloud.apache
# 移动 /var/snap/nextcloud/common/nextcloud/data 到目标位置
# 改 config.php 的 datadirectory
```

详见 https://snapcraft.io/docs/installation。

### 客户端

Nextcloud 有 Windows / macOS / Linux / iOS / Android 桌面客户端，配置方式都一样：
连 URL + admin 账号 + 应用密码（在 UI → 安全 → 设备和会话生成）。

## ⚠️ 敏感性

**review** — Nextcloud 是个人/企业数据中心。挂了或被攻陷 = 文件/日历/联系人全暴露。
1. 务必启用 HTTPS（公网部署）
2. admin 账号用强密码
3. **频繁备份数据目录**——snap 升级偶尔有 bug
4. 装最新版才有最新安全补丁，snap 自动升级是优势

## 验证

```bash
sudo snap services nextcloud
sudo nextcloud.occ status
curl -I http://localhost   # 应返回 302 重定向到 /index.php/login
```

## 排错

- **snap 装不上 (RHEL/CentOS/Anolis)** — RHEL 8+ 需要先：
  ```bash
  sudo dnf install -y epel-release
  sudo dnf install -y snapd
  sudo systemctl enable --now snapd.socket
  sudo ln -s /var/lib/snapd/snap /snap   # snap 路径 symlink
  # 重启或退出当前 shell 让 PATH 更新
  ```
- **首次访问超慢** — snap 第一次启动 1-3 分钟（数据库初始化、PHP 预热）。
- **`Untrusted domain`** — 加到 trusted_domains：`sudo nextcloud.occ config:system:set trusted_domains 2 --value='your-domain.com'`。
- **跨发行版**：snap 安装跨发行版统一，但 RHEL 系列要先装 snapd 才能用。

## 多次运行

`installMode: skip-existing`。snap 已装就不会重装。trusted_domains 和 HTTPS 配置每次会更新。**admin 账号一旦创建过就不会再被改密码**——重设密码用 `sudo nextcloud.occ user:resetpassword admin`。

## 隐私说明

- admin 密码会在任务日志里出现一次。
- 用户上传的文件全部本地存储 `/var/snap/nextcloud/common/nextcloud/data/`，不上传不同步。
- snap 自动统计使用率，可关：`sudo snap set core refresh.metered=hold`。
