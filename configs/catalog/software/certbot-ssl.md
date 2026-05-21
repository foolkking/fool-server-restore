# Certbot / Let's Encrypt SSL

## 概述

Certbot 是 Let's Encrypt 官方推荐的 ACME 客户端，用于自动获取和续期免费的 SSL/TLS 证书。支持与 Nginx、Apache 等 Web 服务器自动集成。

## 安装内容

- `certbot` — Let's Encrypt 客户端
- `python3-certbot-nginx` — Nginx 自动配置插件

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y certbot python3-certbot-nginx
```

## 安装后配置

### 1. 为 Nginx 站点申请证书

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot 会自动：
- 验证域名所有权
- 获取证书
- 修改 Nginx 配置启用 HTTPS
- 设置 HTTP → HTTPS 重定向

### 2. 仅获取证书（不修改 Web 服务器配置）

```bash
sudo certbot certonly --standalone -d example.com
```

### 3. 自动续期

Certbot 安装后会自动创建 systemd timer 或 cron job：

```bash
# 查看续期定时器状态
sudo systemctl status certbot.timer

# 手动测试续期
sudo certbot renew --dry-run
```

### 4. 证书位置

```text
证书：/etc/letsencrypt/live/example.com/fullchain.pem
私钥：/etc/letsencrypt/live/example.com/privkey.pem
```

## 验证安装

```bash
certbot --version
sudo certbot certificates
```

## 注意事项

- 域名必须已解析到当前服务器 IP
- 80 端口必须可从外网访问（用于 HTTP-01 验证）
- 证书有效期 90 天，自动续期会在到期前 30 天执行
- 通配符证书需要 DNS-01 验证方式

## 隐私说明

SSL 私钥是高度敏感信息，绝不会被上传或同步。证书本身是公开信息。
