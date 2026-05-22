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
