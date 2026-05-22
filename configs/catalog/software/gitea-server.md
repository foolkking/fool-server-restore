# Gitea 自托管 Git 服务

Gitea 是轻量级的自托管 Git 服务（类似 GitLab，但资源占用低，单机就能跑）。EnvForge 用官方二进制安装，配 systemd 单元和数据目录。

## 你将得到什么

- ✅ Gitea 最新 stable 二进制（`/usr/local/bin/gitea`）
- ✅ 系统用户 `git`，数据目录 `/var/lib/gitea`，配置 `/etc/gitea`
- ✅ systemd 单元 `gitea.service`，开机自启
- ✅ 默认监听 `localhost:3000`（**走反向代理才暴露公网**）
- ✅ 默认用 SQLite 数据库（`/var/lib/gitea/data/gitea.db`，单机够用）

## 自动化步骤

1. 下载 Gitea 官方二进制到 `/tmp/gitea`，校验后移到 `/usr/local/bin/`
2. 创建系统用户 `git`（无登录 shell）
3. 创建目录结构 `/var/lib/gitea/{custom,data,log}` 并设置权限
4. 写入 systemd 单元 `/etc/systemd/system/gitea.service`
5. `systemctl enable --now gitea`

## 安装后：首次配置（5 分钟）

启动后访问 `http://<server-ip>:3000`（或你的反向代理域名），会进入安装向导：

1. **数据库**：保持 SQLite（推荐单机）；超过 100 用户再考虑 MySQL/PostgreSQL
2. **Server Domain**：填你的实际域名（用 IP 也行）
3. **Gitea Base URL**：`https://git.example.com/` 这种带斜杠的完整 URL
4. **管理员账号**：必须填，否则任何注册的第一个用户会变成管理员
5. **邮件**：可以暂时跳过，后续在 admin 面板开启 SMTP

提交后会写入 `/etc/gitea/app.ini`，重启服务即可。

## 配 HTTPS（强烈建议）

Gitea 自带 LetsEncrypt 支持，但更稳的做法是用 nginx 反向代理 + Certbot：

```nginx
server {
  listen 443 ssl http2;
  server_name git.example.com;
  ssl_certificate /etc/letsencrypt/live/git.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/git.example.com/privkey.pem;

  client_max_body_size 1G;  # 大仓库 push 需要

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

EnvForge 已有 `Nginx Web 服务` Playbook（带反向代理表单）和 `Certbot SSL` Playbook，组合用即可。

## SSH Git 推送

默认 Gitea 在 22 端口看 git 用户的 SSH key。如果你已有真实 sshd 在 22 端口，要么把 Gitea 改用内置 SSH server（`/etc/gitea/app.ini` 设 `[server] START_SSH_SERVER = true` + 不同端口），要么把 sshd 移到别的端口，**不要两个都监听 22**。

## ⚠️ 敏感性

**review** — Gitea 服务本身的安全模型较稳（无密码默认）。但首次登录的用户自动成为管理员，所以确保你是第一个访问 `/install` 的人；安装后立刻禁用注册（设置里 `Disable Registration`）。

## 验证

```bash
systemctl status gitea --no-pager
curl -fsSL http://localhost:3000/api/v1/version
sudo journalctl -u gitea -n 30 --no-pager
```

## 排错

- **3000 端口被占** — 这是 Node/dev server 的常用端口；改 `/etc/gitea/app.ini` 的 `[server] HTTP_PORT = 3001` 后重启。
- **clone 报 `error: RPC failed; HTTP 413`** — nginx 的 `client_max_body_size` 太小，调到 1G 以上。
- **管理员账号忘了密码** — `sudo -u git gitea admin user change-password --username admin --password "新密码"`

## 多次运行

`installMode: skip-existing` — 已经装好的不会被覆盖；要升级二进制，先 `systemctl stop gitea`，下载新二进制覆盖 `/usr/local/bin/gitea`，再 `systemctl start gitea`。

## 隐私说明

`/etc/gitea/app.ini` 含数据库连接信息和 SECRET_KEY；备份这台机器时，记得排除或加密这个文件。EnvForge 的环境捕获默认会扫描其中的 secret 值并脱敏。
