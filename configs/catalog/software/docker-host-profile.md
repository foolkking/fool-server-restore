# Docker 主机配置

## 安装内容

- Docker Engine 或 Docker Desktop
- Docker Compose 插件
- 常用镜像源设置

## 简单私人配置

镜像源应按地区选择。登录 Docker Hub 或私有 registry 的凭据不进入市场配置。

```bash
docker version
docker compose version
```

## 隐私说明

不会同步 `~/.docker/config.json` 中的认证信息。
