# Redis 内存数据库

## 概述

Redis 是一个开源的内存数据结构存储系统，可用作数据库、缓存和消息代理。它支持多种数据结构，如字符串、哈希、列表、集合、有序集合等。

## 安装内容

- `redis-server` — Redis 服务端
- 默认端口：6379
- 数据目录：`/var/lib/redis`
- 配置文件：`/etc/redis/redis.conf`

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

## 安装后配置

### 1. 设置密码认证

编辑 `/etc/redis/redis.conf`：

```conf
requirepass your_strong_password_here
```

### 2. 绑定地址

默认只监听 localhost，如需远程访问：

```conf
bind 0.0.0.0
```

### 3. 持久化策略

Redis 支持 RDB 快照和 AOF 日志两种持久化方式：

```conf
# RDB（默认开启）
save 900 1
save 300 10
save 60 10000

# AOF（推荐生产环境开启）
appendonly yes
appendfsync everysec
```

### 4. 内存限制

```conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 5. 重启服务使配置生效

```bash
sudo systemctl restart redis-server
```

## 验证安装

```bash
redis-cli ping
# 应返回 PONG
```

## 安全建议

- 始终设置密码认证
- 生产环境不要暴露 6379 端口到公网
- 使用防火墙限制访问来源
- 禁用危险命令（FLUSHALL、KEYS 等）
- 定期备份 RDB 文件

## 隐私说明

Redis 配置文件中的密码为敏感信息，不会被自动上传或同步。
