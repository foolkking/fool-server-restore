# Nginx Web 服务

## 安装内容

- Nginx
- 反向代理模板
- 日志目录建议

## 简单私人配置

用户需要手动确认域名、证书路径、上游端口。

```bash
nginx -t
systemctl reload nginx
```

## 隐私说明

证书私钥不进入市场配置。
