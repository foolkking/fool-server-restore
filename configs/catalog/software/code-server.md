# code-server (浏览器版 VSCode)

VSCode 的 web 版——浏览器打开就能用 VSCode 的所有功能，IDE 后端跑在服务器上。
适合：iPad/Chromebook 远程开发、把 IDE 放在大内存服务器上、跨设备代码无缝切换。

## 你将得到什么

- 📦 **code-server**（用官方 install 脚本装到 `/usr/bin/code-server`）
- ✅ user-level systemd 服务（按当前登录用户跑，不是 root）
- ✅ 配置 `~/.config/code-server/config.yaml`（端口 + 密码）
- ✅ Web UI 在 `:8080`

## 表单字段说明

### 监听地址

**强烈建议保持 127.0.0.1**——code-server 是个完整的 IDE 后端，能跑任意命令、读任意文件。
0.0.0.0 + 弱密码暴露公网 = 等于把 root shell 挂网上。

推荐访问方式：
1. **SSH 隧道**：本机 `ssh -L 8080:localhost:8080 user@server`，浏览器开 `http://localhost:8080`
2. **反向代理 + HTTPS + 防火墙限源 IP**：见下面"安装后"

### 登录密码

留空自动生成 24 位强密码（运行结束显示一次）。

## 安装后

### 通过 SSH 隧道访问（最安全）

本机：
```bash
ssh -L 8080:localhost:8080 user@server
```
然后浏览器打开 `http://localhost:8080`，输入密码登录。

### 通过反向代理 + HTTPS 公网访问

```nginx
server {
    listen 443 ssl http2;
    server_name code.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # WebSocket（终端、实时通知）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 没有超时，保持长连接（写代码可能闲置很久）
        proxy_read_timeout 1800;
    }
}
```

防火墙：只允许你自己的 IP 访问 443（特别是动态 IP 用 VPN 固定 IP 后再开）。

### 装 VSCode 扩展

打开后右上角扩展图标，搜索 + 装。注意：
- code-server 用自己的扩展市场（不是官方 Microsoft 那个），但大部分主流扩展都有
- 闭源扩展（C++ Tools / Pylance / Remote-SSH）在 code-server 上不工作（License 限制）
- 替代方案：开源扩展（C/C++ Clang / Python LSP / 等）

### 切换主题 / Settings sync

UI 里 Settings → Profile，可以从你 VSCode 桌面版同步设置。

或者：自己复制 `~/.local/share/code-server/User/settings.json` 到服务器。

### 文件挂载

code-server 默认能看 `~/`。要打开别的目录：UI 左侧 Explorer → Open Folder → 输入路径。

如果你想让 code-server 跑在某个项目目录，启动时加 `--default-folder /path/to/project`。

## ⚠️ 敏感性

**privileged** — code-server 等于远程 IDE，**有完整的代码执行能力**。攻陷 = 服务器被完全控制。
1. 不要 0.0.0.0 直接暴露
2. 强密码必须的（24 位以上）
3. 反向代理 + HTTPS + IP 白名单

## 验证

```bash
USR=$(whoami)
systemctl is-active code-server@$USR
curl -I http://127.0.0.1:8080/
```

## 排错

- **登录页 502** — code-server 还在启动（首次 5-10 秒）。
- **打不开终端** — WebSocket 没正确代理。检查 nginx 配置 `Upgrade` / `Connection` 头。
- **某些扩展装不上** — code-server 不能装 closed-source 的 Microsoft 扩展。找开源替代。
- **跨发行版**：用官方 install 脚本，自动适配 Ubuntu / Debian / RHEL / Anolis。

## 多次运行

`installMode: skip-existing`。已装就跳过，但密码每次会被表单值覆盖（重写 config.yaml）。

## 隐私说明

- 密码会在任务日志里出现一次。
- code-server 不发遥测，但底层 VSCode 内核默认有 telemetry——UI 里 File → Preferences → Settings 搜 "telemetry" 关掉。
- 你的代码所有内容都在服务器上 `~/`，不上传不同步。

## 配置文件速查

```
~/.config/code-server/
├── config.yaml                     # ← EnvForge 写的：bind-addr / auth / password
└── extensions/                     # 装了的 VSCode 扩展

~/.local/share/code-server/
├── User/
│   ├── settings.json               # 编辑器设置（同步 VSCode 桌面版可复制此文件）
│   └── keybindings.json
├── logs/
└── Workspaces/

~/.config/systemd/user/code-server.service     # 用户级 systemd 单元（EnvForge 创建）
```

### `~/.config/code-server/config.yaml` 详解

```yaml
# 监听 (强烈保持 127.0.0.1，公网访问走反向代理)
bind-addr: 127.0.0.1:8080

# 认证：password / none / basic
auth: password
password: <强密码>

# Hashed 密码（推荐！明文密码会显示在 ps 输出 + 日志里）
# 生成：echo -n 'mypassword' | npx argon2-cli -e
# hashed-password: "$argon2i$v=19$m=4096,t=3,p=1$..."

# HTTPS（自签证书，不挂反代时启用）
cert: false
# cert: /etc/code-server/cert.pem
# cert-key: /etc/code-server/key.pem

# 默认打开目录
# user-data-dir: /home/user/.local/share/code-server
# extensions-dir: /home/user/.config/code-server/extensions

# 禁用更新检查
disable-update-check: true

# 关 telemetry
disable-telemetry: true

# 信任所有 workspace（不再每次问"你信任作者吗"）
disable-workspace-trust: true
```

改完：
```bash
systemctl --user restart code-server
```

### 反向代理 + HTTPS（生产推荐）— nginx 完整示例

```nginx
server {
    listen 443 ssl http2;
    server_name code.example.com;

    ssl_certificate     /etc/letsencrypt/live/code.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/code.example.com/privkey.pem;

    # 长连接 / 大请求体（粘贴大文件）
    client_max_body_size 1g;

    # WebSocket 必备 + 长 timeout（写代码闲置不能断）
    proxy_read_timeout    7d;
    proxy_send_timeout    7d;
    proxy_buffering       off;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        upgrade;
        proxy_set_header   Accept-Encoding   gzip;
    }
}
```

加 IP 白名单（强烈推荐）：在 server 块顶部：
```nginx
allow 1.2.3.4;          # 你的家里 IP
allow 5.6.7.0/24;       # 公司 IP 段
deny all;
```

### systemd 单元详解

EnvForge 装的是 user-level systemd（`systemctl --user`），跑在登录用户身份下。
要查看 / 修改：

```bash
systemctl --user status code-server
systemctl --user restart code-server
systemctl --user edit code-server          # 编辑 override

# 看日志
journalctl --user -u code-server -f -n 100
```

让 user systemd 在用户没登录时也跑（即开机自启 user services）：
```bash
sudo loginctl enable-linger $USER
```

### 常用 settings.json（VSCode 偏好）

`~/.local/share/code-server/User/settings.json`：
```json
{
  "editor.fontSize": 14,
  "editor.fontFamily": "'JetBrains Mono', 'Fira Code', monospace",
  "editor.fontLigatures": true,
  "editor.tabSize": 2,
  "editor.formatOnSave": true,
  "editor.minimap.enabled": false,
  "editor.rulers": [80, 120],
  "files.autoSave": "afterDelay",
  "files.eol": "\n",
  "terminal.integrated.fontSize": 13,
  "terminal.integrated.shell.linux": "/bin/bash",
  "git.autofetch": true,
  "telemetry.telemetryLevel": "off",
  "redhat.telemetry.enabled": false
}
```

### 装扩展（命令行）

```bash
# UI 商店之外的另一种装法（适合脚本批量装）
code-server --install-extension ms-python.python
code-server --install-extension dbaeumer.vscode-eslint
code-server --install-extension esbenp.prettier-vscode
code-server --install-extension golang.go

# 看已装
code-server --list-extensions
```

### 替代 Microsoft 闭源扩展的开源方案

| Microsoft 闭源 | 开源替代 | 备注 |
|---|---|---|
| Pylance | Pyright (`ms-pyright.pyright`) | 微软自己开源的 LSP |
| C/C++ Tools | clangd (`llvm-vs-code-extensions.vscode-clangd`) | 性能更好 |
| Remote-SSH | (内置) | code-server 本身就在远程，不需要 |
| Python (M$) | Python (`ms-python.python` 开源版本) | code-server 商店有兼容版 |
| Live Share | （无替代） | 协作编辑功能闭源限制无法商用 |

### 多 workspace 隔离

要在同台机器跑多个独立 code-server 实例（不同项目用不同密码 + 端口）：

```bash
# 复制 service 单元
cp ~/.config/systemd/user/code-server.service ~/.config/systemd/user/code-server-projectA.service

# 编辑 projectA 的 service：
# - 改 ExecStart 加 --bind-addr 127.0.0.1:8081
# - 改 --user-data-dir /home/$USER/.local/share/code-server-projectA
# - 改 --extensions-dir /home/$USER/.config/code-server-projectA/extensions

systemctl --user enable --now code-server-projectA
```

### 排查"WebSocket 一直连不上"

```bash
# 1. 直接 curl，确认 code-server 自身在服务
curl -I http://127.0.0.1:8080/

# 2. 检查 nginx 是否转发了 Upgrade header
curl -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -i http://127.0.0.1:8080/

# 3. 看浏览器 DevTools → Network → WS 标签
#    返回 200/302 而不是 101 = 反代没正确处理 Upgrade
```
