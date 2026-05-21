# Docker + Compose 开发环境

## 概述

Docker + Docker Compose 是现代开发环境的标准容器化方案。通过容器隔离应用依赖，使用 Compose 编排多容器服务，实现一致的开发、测试和部署体验。

## 包含组件

| 组件 | 说明 |
|------|------|
| Docker Engine | 容器运行时 |
| Docker Compose | 多容器编排工具 |
| Docker Buildx | 多平台构建工具 |

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y docker.io docker-compose-plugin docker-buildx-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

## 安装后配置

### 1. 将当前用户加入 docker 组（免 sudo）

```bash
sudo usermod -aG docker $USER
# 需要重新登录生效
newgrp docker
```

### 2. 配置镜像加速（中国用户推荐）

创建 `/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
sudo systemctl restart docker
```

### 3. Docker Compose 示例

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html

  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: dev_password
      MYSQL_DATABASE: myapp
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

volumes:
  mysql_data:
```

```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

### 4. 常用开发镜像

```bash
docker pull node:20-alpine
docker pull python:3.12-slim
docker pull postgres:16-alpine
docker pull redis:alpine
docker pull nginx:alpine
```

### 5. 磁盘清理

```bash
# 清理未使用的镜像、容器和网络
docker system prune -f

# 清理所有未使用的数据（包括 volume）
docker system prune -a --volumes
```

## 验证安装

```bash
docker --version
docker compose version
docker buildx version
docker run hello-world
```

## 常用命令

```bash
docker compose up -d       # 后台启动
docker compose down        # 停止并删除
docker compose restart     # 重启
docker compose exec web sh # 进入容器
docker compose logs -f     # 查看日志
```

## 适用场景

- 本地开发环境（数据库、缓存、消息队列）
- 微服务架构开发
- CI/CD 流水线
- 应用容器化部署
