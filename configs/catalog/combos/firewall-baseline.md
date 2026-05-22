# 防火墙基线热门组合

一套面向公网 Linux 服务器的入门防火墙规则模板：默认拒绝入站、放行 SSH/HTTP/HTTPS、限速防爆破、记录拒绝日志。适合刚开机的云主机做初始化。

## 组合内容

- ✅ 入站默认 `deny`，仅放行 22 / 80 / 443
- ✅ 出站默认 `allow`（允许更新和外部 API 调用）
- ✅ SSH 端口启用速率限制（每秒 6 次以内，防暴力破解）
- ✅ 拒绝包写入日志（`/var/log/ufw.log` 或 `firewalld` 日志），方便事后审计
- ✅ 自动检测发行版选择 `ufw`（Ubuntu/Debian）或 `firewalld`（RHEL/CentOS/Anolis）

## 用户说明

应用前必须检查当前业务端口，避免误关服务。**强烈建议先 dry-run** 看看会动哪些规则，再正式执行。

如果你的应用监听非标准端口（数据库 5432、Node 3000、面板 54321 等），请先把它们加入白名单后再运行此组合，否则下次部署到这台机器的应用会被默认规则挡住。

## 验证

```bash
# Ubuntu/Debian
sudo ufw status verbose
sudo ufw show added

# RHEL/CentOS/Anolis
sudo firewall-cmd --list-all
sudo firewall-cmd --list-services
```

## 隐私说明

端口暴露情况可能透露服务结构（在用什么数据库、监听了哪些 dev port 等），公开分享你的防火墙规则前请先脱敏，避免给对手提供攻击面信息。
