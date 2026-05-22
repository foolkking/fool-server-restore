# Nginx Web 服务

一键安装并配置 Nginx，支持静态站点和反向代理两种模式。

## 你将得到什么

- ✅ Nginx 主程序（来自系统包源，会自动处理 dnf module 启用、SELinux 标签等）
- ✅ 一份名为 `envforge-default.conf` 的 server 块（写入 `/etc/nginx/conf.d/`，不会覆盖你已有的配置）
- ✅ 启动 + 开机自启 + 重启时优先 `nginx -t` 校验
- ✅ 独立的访问/错误日志：`/var/log/nginx/envforge-access.log`、`envforge-error.log`

> 已有 web 服务（apache2 / httpd / caddy）占用 80 端口时，请改用其他端口（例如 8080）或先停止旧服务。

## 表单字段说明

填写右侧表单，EnvForge 会把这些值代入 Playbook 模板。

### 网站域名 `domain`

你的网站访问地址。还没有域名时，填本机 IP 即可（例如 `47.251.100.201`）。
绑定域名时建议使用二级域名（`web.example.com` 而非裸 `example.com`），便于后续扩展。

### 监听端口 `listen_port`

Nginx 监听的端口。**默认 80** 是标准 HTTP 端口，绑定后浏览器无需指定端口；
但 80 经常被其他服务占用（apache2/httpd/某些云监控）。如遇启动失败提示
"Address already in use"，改成 8080/8088 等高位端口即可。

### 启用反向代理 `enable_reverse_proxy`

- **关闭**（默认）：作为静态文件服务器，提供 `/usr/share/nginx/html` 目录。
- **开启**：所有请求转发到后端应用，适合 Node.js / Python / Go / Rust 写的动态站点。

### 后端地址 `upstream_url`（仅反向代理模式）

后端应用监听的地址。常见值：
- `http://127.0.0.1:3000`（Node.js 默认）
- `http://127.0.0.1:8000`（Django/Flask 默认）
- `http://127.0.0.1:8080`（Spring Boot/Tomcat 默认）

EnvForge 会自动配好 `Host`、`X-Real-IP`、`X-Forwarded-*` 头，以及 WebSocket 升级支持。

### 上传大小限制 `client_max_body_size`

`nginx` 默认只允许 1 MB 的请求体，对 API 够用但不够上传文件。普通网站选 10 MB，
有文件上传需求选 100 MB，大文件场景选 1 GB。

## 安装后

打开浏览器访问 `http://{domain}:{listen_port}` 即可看到 Nginx 默认页面（静态模式）
或被代理到后端的页面（代理模式）。

## 后续步骤

### 配置 HTTPS

EnvForge 已提供 `Certbot SSL` 一键卡片：安装本 Playbook 后再装 Certbot，按提示输入
邮箱和域名，自动签发 Let's Encrypt 证书并写回 Nginx 配置。

### 自定义站点

`/etc/nginx/conf.d/envforge-default.conf` 是 EnvForge 管理的文件，会在重新运行时被覆盖。
要长期保留的自定义配置，请放到另一个文件名（如 `myapp.conf`）下，避免冲突。

### 排错

```bash
sudo nginx -t                              # 配置语法检查
sudo systemctl status nginx --no-pager -l  # 查看启动状态
sudo journalctl -u nginx -n 50             # 查看最近日志
sudo ss -tlnp | grep :80                   # 看谁占了 80 端口
```

## 隐私说明

证书私钥不进入 Playbook 模板，由 Certbot 在目标机器上独立生成。
