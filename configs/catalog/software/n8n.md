# n8n 工作流自动化

n8n 是**自托管 Zapier / Make 替代品**——可视化拖拽编排 **400+ 应用集成**（GitHub / Slack / Stripe / Telegram / 邮件 / HTTP webhook / SQL / 等）。**适合**：定时任务 / webhook 处理 / 跨服务联动 / 中小团队替代付费 SaaS 自动化。

## 你将得到什么

- 📦 **n8n** Docker 容器（n8nio/n8n:latest）
- ✅ Web UI 监听 `127.0.0.1:5678`
- ✅ Basic Auth 启用（用户名 + 密码）
- ✅ 内置 SQLite（开发够用，生产推荐 PG）
- ✅ Encryption key 自动生成
- ✅ Telemetry 已禁用
- ✅ Webhook URL 用配置的域名

## 表单字段说明

### `n8n_domain` / `n8n_port`

域名 + 本机端口。生产挂反代 + HTTPS。

### `n8n_admin_user` / `n8n_admin_password`

Basic Auth 凭据。

### `n8n_encryption_key`

> ⚠️ **极其关键**——n8n 用此 key 加密所有 stored credentials（OAuth token / API key / 数据库密码）。**丢失 = 所有 saved credentials 永久无法解密**！

留空 = 自动 32 位。**务必离线备份**到密码管理器 / 物理保险箱。

### `n8n_data_dir`

数据目录（含 SQLite）。

### `n8n_timezone`

影响 cron 节点 + 日志时间戳。

## 配置文件 / 目录速查

```
/opt/n8n/
├── docker-compose.yml                       # ← EnvForge 写入
├── config                                     # n8n 配置（自动生成）
├── database.sqlite                            # 默认 SQLite
├── n8nEventLog.log
├── nodes/                                      # 自定义节点（npm install）
└── git/                                          # （如启用 git 集成）

# 容器内
/home/node/.n8n  → /opt/n8n
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker（仅） |
| 镜像 | `n8nio/n8n:latest` |
| 默认 backend | SQLite |
| 生产 backend | PostgreSQL（推荐 > 100 工作流） |

## 常见配置模板

### 模板 A — 第一个工作流（webhook → Slack）

UI（http://server:5678）登录后：

1. **+ Add Workflow**
2. 拖个 **Webhook** 节点
    - Path: `notify-slack`
    - Method: POST
3. 拖个 **Slack** 节点连上
    - Resource: Message
    - Channel: #alerts
    - Text: `={{$json.message}}`
4. 配 Slack credentials（OAuth）
5. **Save** → **Activate**
6. Webhook URL：`https://n8n.example.com/webhook/notify-slack`
7. 测试：

```bash
curl -X POST https://n8n.example.com/webhook/notify-slack \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello from curl!"}'
```

### 模板 B — 定时任务（cron + HTTP request）

```
Cron 节点（每天 9 AM）→ HTTP Request（GET API）→ IF（数据有变）→ 邮件通知
```

### 模板 C — Nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name n8n.example.com;
    ssl_certificate /etc/letsencrypt/live/n8n.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.example.com/privkey.pem;

    client_max_body_size 100M;

    # WebSocket（编辑器实时同步）
    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 D — 切换到 PostgreSQL backend（生产）

`docker-compose.yml` 加 PG 服务，环境变量改：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: <pg-pass>
      POSTGRES_DB: n8n
    volumes:
      - n8n-pg-data:/var/lib/postgresql/data

  n8n:
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: <pg-pass>
    depends_on:
      - postgres

volumes:
  n8n-pg-data:
```

迁移现有数据：n8n CLI export → 切 backend → import。

### 模板 E — 队列模式（高负载）

默认所有 workflow 在主进程跑。高负载需 worker 模式 + Redis：

```yaml
services:
  redis:
    image: redis:7-alpine

  n8n-main:
    environment:
      EXECUTIONS_MODE: queue
      QUEUE_BULL_REDIS_HOST: redis
      QUEUE_BULL_REDIS_PORT: 6379

  n8n-worker:
    image: n8nio/n8n:latest
    command: worker
    environment:
      # 同 main
      EXECUTIONS_MODE: queue
      QUEUE_BULL_REDIS_HOST: redis
    deploy:
      replicas: 3                           # 3 个 worker
```

### 模板 F — 备份（**关键**）

```bash
# 1. 停服务
cd /opt/n8n
docker compose stop

# 2. tar 数据
sudo tar czf /backup/n8n-$(date +%F).tar.gz -C /opt/n8n .

# 3. 启
docker compose start

# 4. 加密备份（**必须**——含 encryption key + credentials）
gpg -c /backup/n8n-$(date +%F).tar.gz
```

或用 n8n CLI export workflow：

```bash
docker exec n8n n8n export:workflow --all --output=/home/node/.n8n/backup-workflows.json
```

### 模板 G — 升级

```bash
cd /opt/n8n
docker compose pull
docker compose up -d                       # 自动 schema migration
```

升级前**务必备份**——major 升级偶有 breaking change。

## 关键参数调优速查

### 资源占用

| 工作流数 | 同时执行 | RAM | CPU |
|---|---|---|---|
| < 50 | < 5 | 200 MB | 0.2 vCPU |
| < 500 | < 20 | 1 GB | 1 vCPU |
| > 500 | > 50 | 4 GB+ + Redis 队列模式 | 2-4 vCPU |

### Webhook 性能

n8n webhook 在主进程响应，慢 webhook 会阻塞编辑器。**生产用队列模式**。

### Workflow 数据保留

```
Settings → 默认保留所有 execution 数据
环境变量：EXECUTIONS_DATA_PRUNE=true / EXECUTIONS_DATA_MAX_AGE=336（小时）
```

### 自定义节点

```bash
docker exec n8n npm install n8n-nodes-mycustom
docker compose restart n8n
```

或 build 自定义镜像。

## 跨发行版兼容

容器化跨发行版一致。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`postgres-profile`** — PG backend 用
- **`redis-server`** — 队列模式用
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`mosquitto-mqtt`** — n8n 有 MQTT 节点接 IoT
- **`vault-secrets`** — 通过 Vault 拿动态凭据

## 排错

### Webhook URL 不对

```bash
# .env 里 N8N_HOST + WEBHOOK_URL 必须一致
docker exec n8n env | grep -E '(N8N_HOST|WEBHOOK_URL)'

# 反代后 webhook 应是 https://n8n.example.com/webhook/...
```

### Credentials 解密失败 `error: bad decrypt`

`N8N_ENCRYPTION_KEY` 改了 ——** 已存的 credentials 全部丢失**：

```bash
# 用旧 key 启动 → 导出 workflow → 用新 key 启动 → 重新填 credentials
docker exec n8n n8n export:credentials --all --output=/tmp/creds.json
```

### 工作流执行卡死

```bash
# 看运行中的 execution
docker exec n8n n8n executions:list --status running

# 强制 cancel
docker exec n8n n8n executions:cancel --id <exec-id>
```

### 内存泄漏 / 越用越慢

升级到最新版（n8n 频繁修内存 issue）。或定时重启容器：

```bash
0 4 * * * docker restart n8n
```

### PG migration 失败

```bash
# 看错误
docker logs n8n | grep -i migration

# 回滚（极少需要）
docker compose down
# 改 image 回老版本
docker compose up -d
```

## 验证

```bash
docker ps | grep n8n
curl http://127.0.0.1:5678/healthz                     # {"status":"ok"}
docker exec n8n n8n --version
# 看 Workflow 数
docker exec n8n n8n list:workflow
```

## 多次运行

`installMode: skip-existing`。docker-compose.yml 重写。**数据目录保留**——所有 workflow / credentials / execution 历史不丢。**Encryption key 每次按表单值更新**——但**改 encryption key 会让所有 saved credentials 解密失败**。

要改 key 务必先：

```bash
docker exec n8n n8n export:credentials --decrypted --all --output=/tmp/creds.json
# 然后改 key 重启 → 重新 import credentials（会用新 key 重新加密）
```

## ⚠️ 敏感性

**review** — n8n 持有**所有第三方服务的 token**（Slack / Google / Stripe / 等）。

强制：

1. **Encryption key 离线备份**（最重要）
2. 公网必须 HTTPS
3. Basic auth 强密码（生产用 OIDC / SAML）
4. 反代加 IP 白名单（admin 接口）
5. 工作流不要 commit credentials 到外部 git

## 隐私说明

- Telemetry 已禁用（`N8N_DIAGNOSTICS_ENABLED=false`）
- 所有 credentials 加密存数据库（用 encryption key）
- Execution 历史含**节点输入输出**——可能含敏感数据（API 响应、用户信息）
- 默认本地 SQLite——不上传不同步
- Webhook URL 暴露 = 任何人能触发对应工作流（要在工作流里加认证）
