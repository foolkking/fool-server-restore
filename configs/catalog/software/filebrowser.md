# FileBrowser 网页文件管理器

FileBrowser 是**极轻量的 web 文件管理器**——单 Go 二进制（~10 MB） + SQLite，**~30 MB RAM** 起步。挂个目录就能在浏览器里浏览 / 上传 / 下载 / 编辑文本 / 共享链接 / 多用户权限。**适合**：家庭 NAS 文件管理、远程访问 VPS 文件、服务器管理员临时上传文件。**与 Nextcloud 关系**：互补——NC 是协作云盘（含日历 / 邮件 / 视频会议），FileBrowser 是**直接磁盘视图**（更像 Web 版 Finder）。

## 你将得到什么

- 📦 **FileBrowser 容器**（`filebrowser/filebrowser:latest`）
- ✅ Web UI 监听 `127.0.0.1:8088`
- ✅ 单 SQLite 数据库（用户 / 偏好 / 共享链接）
- ✅ **默认密码已自动重置**（不再是 `admin/admin`）
- ✅ 多用户 + 细粒度权限（按目录 / 按操作）
- ✅ 内置代码编辑器（VS Code / Vim 风格）
- ✅ 文件预览（图片 / 视频 / PDF / Markdown）
- ✅ 共享链接（带过期 + 密码）
- ✅ Healthcheck

## 表单字段说明

### `fb_root_dir`

⚠️ **最关键字段**——FileBrowser 能看到的最顶层目录。

| 路径 | 用途 | 风险 |
|---|---|---|
| `/srv` | 服务数据目录（默认） | 安全 |
| `/mnt/data` | NAS / 大盘挂载点 | 安全 |
| `/home` | 用户家目录 | 中 — 用户隔离 |
| `/` | 整机文件 | **危险** — 暴露系统配置 / SSH key |

**强烈建议**：建一个专用目录（如 `/srv/files`）作为 root，**不要直接 root /**。

### `fb_port`

本机绑定端口，仅 127.0.0.1。生产用反代。

### `fb_admin_user` / `fb_admin_password`

管理员账号。

⚠️ **FileBrowser 默认 admin/admin** —— **公网部署必须立即改**。Playbook 自动重置：

- 留空 = 自动生成 16 位密码（运行结束日志显示一次）
- 填了 = 用此密码

### `fb_data_dir`

```
{data_dir}/
├── docker-compose.yml
├── .filebrowser.json       # 主配置
└── database.db              # SQLite（用户 + 偏好 + 共享链接）
```

**备份 `database.db`** = 备份所有用户 / 共享配置（不含管理的文件本身）。

## 配置文件 / 目录速查

```
{data_dir}/.filebrowser.json     # 启动配置（root / port / database 路径）
{data_dir}/database.db            # SQLite

# 容器内
/srv                              # 你 fb_root_dir 的挂载点
/database.db
/.filebrowser.json
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name files.example.com;

    ssl_certificate     /etc/letsencrypt/live/files.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/files.example.com/privkey.pem;

    # 大文件上传 / 下载
    client_max_body_size 10G;
    proxy_read_timeout 600s;
    send_timeout 600s;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 B — 加用户

```
1. 浏览器打开 https://files.example.com → 用 admin 登录
2. Settings（齿轮）→ User Management → New User
   Username: alice
   Password: <强密码>
   Scope:    /home/alice         ← 仅看自己的家目录
   Permissions:
     ✓ Admin              (false — 不是管理员)
     ✓ Modify
     ✓ Create
     ✓ Rename
     ✓ Delete
     ✓ Share              (false — 不允许公开分享)
     ✓ Download
     ✓ Execute            (false — 不能执行 shell 命令)
   Lock Password: false
   Hide dotfiles: true
```

### 模板 C — 共享链接（短期分享）

```
1. 文件管理界面 → 选文件 / 文件夹 → 右上 "Share" 按钮
2. 设置:
   Expires: 7 days       (或自定义)
   Password: <可选>
3. 复制链接发给对方
4. 对方打开 → （输密码 →）下载
```

链接管理：Settings → Shares → 看所有 / 撤销。

### 模板 D — 自定义品牌（公司 LOGO）

```
Settings → Application
  Branding:
    Name:     Acme Inc Files
    Theme:    Dark
    Logo file: 上传你的 LOGO（200x60 png 推荐）
```

### 模板 E — 命令 hooks（上传后自动处理）

```bash
# 改 .filebrowser.json
{
  ...
  "shell": ["/bin/sh", "-c"],
  "commands": {
    "after_upload": ["echo 'New file:' >> /tmp/uploads.log"],
    "after_delete": ["..."]
  }
}
```

容器内能跑 shell 命令——可触发病毒扫描 / 缩略图生成 / 通知 webhook。

### 模板 F — 二进制部署（不用 Docker）

```bash
# 下载二进制（GitHub release 多平台）
wget https://github.com/filebrowser/filebrowser/releases/latest/download/linux-amd64-filebrowser.tar.gz
tar -xzf linux-amd64-filebrowser.tar.gz
sudo mv filebrowser /usr/local/bin/

# 初始化
sudo mkdir -p /opt/filebrowser
cd /opt/filebrowser
sudo filebrowser config init
sudo filebrowser config set --address 127.0.0.1 --port 8088
sudo filebrowser config set --root /srv
sudo filebrowser users add admin <密码> --perm.admin

# systemd
sudo tee /etc/systemd/system/filebrowser.service <<EOF
[Unit]
Description=FileBrowser
After=network.target

[Service]
ExecStart=/usr/local/bin/filebrowser -c /opt/filebrowser/.filebrowser.json
WorkingDirectory=/opt/filebrowser
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now filebrowser
```

### 模板 G — 备份

```bash
# database.db 备份足够（含所有用户 / 共享 / 偏好）
cp /opt/filebrowser/database.db /backup/filebrowser-$(date +%F).db

# 或整个数据目录
tar -czf filebrowser-backup-$(date +%F).tar.gz /opt/filebrowser
```

## 关键参数调优速查

### 资源占用

| 用户数 | RAM | CPU |
|---|---|---|
| 1-5 | 30 MB | 极低 |
| 5-50 | 80 MB | < 1% |
| 50+ | 200 MB+ | 1-2% |

### 大文件上传

```nginx
# nginx
client_max_body_size 50G;
proxy_read_timeout 1800s;
client_body_timeout 1800s;
```

FileBrowser 自身**无文件大小限制**——靠浏览器 / 反代决定。

### 性能

```
Settings → Application
  Disable thumbnails:     true   # 极大目录禁缩略图（默认开）
```

### 并发上传

无限制——每个用户的上传独立线程。瓶颈在磁盘 IO / 网络。

## 跨发行版兼容

| 项 | 状态 |
|---|---|
| Ubuntu/Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64（树莓派） | ✅（多架构镜像 + 二进制） |
| 二进制部署 | ✅ 任何 Linux |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — Docker 部署前提（不用 Docker 走二进制）
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`nextcloud`** — **互补不互斥**——NC 协作云，FB 直接管理
- **`samba-share` / `nfs-server`** — 互补——SMB/NFS 给原生客户端，FB 给 Web
- **`authelia` / `keycloak`** — FileBrowser 不直接支持 OIDC，但反代加 forward-auth 可保护

## 排错

### Web UI 显示 admin/admin 还能登录

**严重安全问题**——Playbook 应自动重置密码。手动重置：

```bash
docker exec -it filebrowser /filebrowser users update admin --password 'NewSecurePass'
```

或重置整个 admin 账号：

```bash
docker exec -it filebrowser sh
filebrowser users ls
filebrowser users rm admin
filebrowser users add admin <密码> --perm.admin
exit
docker restart filebrowser
```

### 上传大文件失败 / 超时

```bash
# 1. 反代 timeout 不够（见模板 A）
# 2. 浏览器 / 网络问题（试小文件）
# 3. 磁盘满
df -h /srv
```

### 文件夹显示空（实际有文件）

```bash
# 1. 容器内能看到吗？
docker exec filebrowser ls /srv

# 2. root 目录挂载错？
docker inspect filebrowser | grep -A5 Mounts

# 3. 权限问题（FileBrowser 以 root 跑，但宿主某些挂载点 SELinux 阻止）
ls -laZ /srv      # RHEL 系
sudo setsebool -P container_use_sysadm on
```

### 中文文件名乱码

```bash
# 服务器 locale 问题
sudo locale-gen zh_CN.UTF-8
sudo update-locale LANG=zh_CN.UTF-8

# 容器环境变量
# docker-compose.yml 加：
environment:
  LANG: zh_CN.UTF-8
  LC_ALL: zh_CN.UTF-8
```

### 共享链接打不开

```bash
# 1. 公网域名 nginx 反代正确？
# 2. 链接过期了？Settings → Shares 看
# 3. 链接 base URL 配错了？
docker exec filebrowser cat /.filebrowser.json | grep baseURL
# 应是空字符串或 "/" — 反代到根路径
```

### 忘了 admin 密码

```bash
# 进容器重置
docker exec -it filebrowser /filebrowser users update admin --password 'NewPass123'
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=filebrowser

# 2. health 端点
curl -fsS http://127.0.0.1:8088/health
# OK

# 3. 配置正确
docker exec filebrowser cat /.filebrowser.json | grep -E '"root"|"port"'

# 4. root 挂载
docker exec filebrowser ls /srv | head -10

# 5. 用户列表
docker exec filebrowser /filebrowser users ls
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` + `.filebrowser.json` 每次按表单值重写——**`database.db` 不动**（保留所有用户 / 偏好 / 共享）。`fb_admin_password` 每次跑都会被重置（用表单值或新生成的）—— **手动改的密码会被覆盖**。要保护手动改的：每次跑 Playbook 前先备份 `database.db`。

## ⚠️ 敏感性

**review** — FileBrowser 直接暴露文件系统。配错 = 重大数据泄露。

强制：

1. **公网必须 HTTPS**
2. **不要把 `fb_root_dir` 设成 `/`**——会暴露 SSH key / `/etc/shadow` 等
3. admin 强密码 + 长期保密（公网启用 fail2ban-protection 防爆破）
4. 关闭"允许执行"权限（`Execute: false`）—— 普通用户不需要 shell 命令
5. 公开分享链接默认带过期 + 密码（不要永久 + 无密码）
6. 备份 `database.db`（含密码 hash）—— 加密存储

## 隐私说明

- **完全本地**——所有文件在你服务器
- **零遥测**（FileBrowser 开源）
- 共享链接含 token，**任何拿到链接的人都能访问**——分享前确认目标
- 文件本身不被加密存储——OS 级看到内容（FileBrowser 仅做访问控制）
- 操作日志默认在容器 stdout（不持久），可以关 `--noauth` 或导出到外部 syslog
