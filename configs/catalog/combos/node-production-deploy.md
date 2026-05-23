# Node.js 生产部署（Node + PM2 + Nginx）

**Node.js 应用生产部署的标准方案**：Node.js（NodeSource LTS）+ PM2（进程管理）+ Nginx（反代 + 静态文件 + HTTPS 终结）。比 Docker 部署简单、占用少、调试直接，适合中小项目。

## 你将得到什么

- 📦 **Node.js LTS**（来自 NodeSource 官方仓库，22.x 默认）
- 📦 **npm**（捆绑）
- 📦 **PM2**（npm 全局）+ pm2-logrotate
- 📦 **Nginx**（反代到 Node 应用）
- ✅ Nginx 默认 server 块反代 `127.0.0.1:3000`
- ✅ PM2 systemd unit（`pm2-<user>.service`）—— 开机自启 + 恢复 saved 进程列表

## 表单字段说明

### `node_version`

NodeSource LTS 版本：

| 值 | EOL |
|---|---|
| `22`（默认） | 2027-04 |
| `20` | 2026-04 |
| `18` | 2025-04 |

### `pm2_user`

PM2 daemon 跑哪个用户。**强烈建议建专用 deploy 用户**（不给 sudo）：

```bash
sudo useradd -m -s /bin/bash deploy
# 加 SSH key 让 deploy 能远程
```

### `app_port`

Node 应用监听端口（Nginx 反代到此）。默认 3000。

### `domain`

填上后 Nginx server_name 用此域名。后续接 Certbot SSL。

## 配置文件 / 目录速查

```
# Node.js
/usr/bin/node /usr/bin/npm                    # 系统级
/usr/lib/node_modules/                          # 全局包

# PM2（用户级）
~/.pm2/                                          # PM2 主目录
├── pm2.log                                      # daemon 日志
├── dump.pm2                                     # `pm2 save` 的进程列表
├── logs/                                         # 应用日志
└── modules/                                      # 装的模块（pm2-logrotate 等）

/etc/systemd/system/pm2-<user>.service           # systemd unit

# Nginx
/etc/nginx/sites-available/                      # Ubuntu vhost 模板
/etc/nginx/sites-enabled/                         # 启用的 vhost
/etc/nginx/conf.d/                                 # RHEL vhost
/var/log/nginx/                                    # 日志

# 项目（典型）
/opt/myapp/                                        # 应用代码
├── src/
├── dist/                                          # 编译产物
├── node_modules/
├── package.json
├── ecosystem.config.js                             # PM2 配置
└── .env                                            # 环境变量（**含 secrets，权限 0600**）
```

## 常见配置模板

### 模板 A — 部署一个 Node 应用（完整流程）

```bash
# 1. 创建专用部署用户
sudo useradd -m -s /bin/bash deploy
sudo passwd deploy

# 2. 切到 deploy 用户
sudo su - deploy

# 3. 拉代码（git）
git clone https://github.com/me/myapp.git /opt/myapp
cd /opt/myapp

# 4. 装依赖
npm ci --omit=dev                                  # 仅生产依赖
npm run build                                       # TypeScript / 构建步骤

# 5. 配 .env
cat > .env <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://app:secret@localhost:5432/myapp
REDIS_URL=redis://localhost:6379
EOF
chmod 600 .env

# 6. PM2 启动
pm2 start ecosystem.config.js --env production
pm2 save                                            # 关键！保存进程列表

# 7. 退回 root，配 systemd 自启
exit
sudo -u deploy pm2 startup systemd -u deploy --hp /home/deploy   # 输出一条命令
# 复制粘贴跑那条 systemctl enable 命令
```

### 模板 B — `ecosystem.config.js` 推荐配置

```javascript
module.exports = {
  apps: [{
    name: 'myapp',
    script: './dist/server.js',
    cwd: '/opt/myapp',
    exec_mode: 'cluster',
    instances: 'max',                                // = CPU 核数

    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    // 自动重启
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',                      // 内存超 500M 自动重启
    restart_delay: 4000,
    exp_backoff_restart_delay: 100,

    // 日志
    error_file: '/var/log/pm2/myapp-error.log',
    out_file: '/var/log/pm2/myapp-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // 优雅停机
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,

    // 不监听文件变化（生产关）
    watch: false,

    // Source map（TS 错误堆栈显示原文件）
    source_map_support: true
  }]
};
```

详见 `nodejs-pm2.md`。

### 模板 C — Nginx 反代（推荐）

`/etc/nginx/sites-available/myapp.conf`（Ubuntu）或 `/etc/nginx/conf.d/myapp.conf`（RHEL）：

```nginx
upstream myapp_backend {
    least_conn;                                      # PM2 cluster 模式时让 nginx 选最闲的
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# HTTP → HTTPS 跳转（如启用 HTTPS）
server {
    listen 80;
    server_name myapp.example.com;
    return 301 https://$host$request_uri;
}

# 主 server
server {
    listen 443 ssl http2;
    server_name myapp.example.com;

    ssl_certificate     /etc/letsencrypt/live/myapp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;

    # 静态文件由 nginx 直出（性能）
    location /static/ {
        alias /opt/myapp/dist/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        gzip_static on;
    }

    # SPA fallback（Vue / React Router）
    location / {
        try_files $uri $uri/ @backend;
    }

    location @backend {
        proxy_pass         http://myapp_backend;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection "";

        # 超时（长连接 / 长查询）
        proxy_read_timeout  300s;
        proxy_connect_timeout 10s;
        proxy_buffering     off;                      # SSE / streaming
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass         http://myapp_backend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400;
    }

    # 业务 API
    location /api/ {
        proxy_pass http://myapp_backend;
        # 共用 location @backend 的 header（用 include /etc/nginx/proxy_params; 简化）
    }

    # 错误页
    error_page 502 503 504 /50x.html;
    location = /50x.html { root /usr/share/nginx/html; }

    # 安全 header
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "DENY";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}
```

应用：

```bash
sudo ln -s /etc/nginx/sites-available/myapp.conf /etc/nginx/sites-enabled/   # Ubuntu
sudo nginx -t && sudo systemctl reload nginx
```

### 模板 D — 部署管理（pm2 deploy）

`ecosystem.config.js` 加：

```javascript
deploy: {
    production: {
        user: 'deploy',
        host: ['app1.example.com', 'app2.example.com'],
        ref: 'origin/main',
        repo: 'git@github.com:me/myapp.git',
        path: '/opt/myapp',
        'post-deploy': 'npm ci --omit=dev && npm run build && pm2 reload ecosystem.config.js --env production'
    }
}
```

```bash
# 第一次（初始化目标机器）
pm2 deploy production setup

# 后续部署
pm2 deploy production

# 回滚到上次
pm2 deploy production revert 1
```

### 模板 E — 多版本灰度（蓝绿部署）

```bash
# 启动 v2 在不同端口
PORT=3001 pm2 start ecosystem.config.js --name myapp-v2

# nginx 配置 split traffic
upstream myapp_backend {
    server 127.0.0.1:3000 weight=80;       # v1 80%
    server 127.0.0.1:3001 weight=20;        # v2 20%
}

# 验证 v2 OK 后全切
upstream myapp_backend {
    server 127.0.0.1:3001;
}

sudo nginx -s reload

# 关 v1
pm2 stop myapp
pm2 delete myapp
pm2 save
```

### 模板 F — 优雅 graceful reload

```bash
# 0 停机 reload（cluster 模式）
pm2 reload myapp                                       # 一个一个 worker 替换

# 普通 restart（瞬间停 + 启）
pm2 restart myapp

# 先发 SIGTERM 等 5s（kill_timeout）再 SIGKILL
```

应用代码必须处理 SIGTERM：

```javascript
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, draining...');
    await server.close();                              // 等连接处理完
    process.exit(0);
});

if (process.send) process.send('ready');               // PM2 wait_ready 用
```

## 关键参数调优速查

### Cluster instances

```javascript
{
    instances: 'max',                                   // 全部 CPU 核
    instances: 4,                                        // 固定
    instances: -1,                                        // CPU - 1（留 1 核给 OS）
}
```

### V8 heap

```bash
# 单个 worker 的 V8 heap
NODE_OPTIONS="--max-old-space-size=2048" pm2 start app.js
```

或 ecosystem.config.js:

```javascript
{
    node_args: '--max-old-space-size=2048'
}
```

### Nginx 反代调优

```nginx
upstream myapp {
    keepalive 32;                                        # 保持长连接（性能）
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
}

# 长连接到 Node（关键性能优化）
proxy_http_version 1.1;
proxy_set_header   Connection "";
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Node.js | NodeSource deb | NodeSource rpm |
| Nginx | 默认 / nginx.org repo | 默认 / nginx.org repo |
| Nginx vhost 路径 | `sites-available` + `sites-enabled` | `conf.d/` |

EnvForge Playbook 自动适配。

## 与其它 catalog 项的配合

- **`node-runtime-profile`** — 系统级 Node（本 combo 已含）
- **`nodejs-pm2`** — PM2 进程管理（本 combo 已含）
- **`nginx-web-service`** — Nginx 配置（本 combo 已含）
- **`certbot-ssl`** — HTTPS 证书（推荐组合）
- **`postgres-profile` / `redis-server`** — 业务依赖

## 排错

### `pm2: command not found`

```bash
# npm 全局目录在 PATH
echo "export PATH=\$(npm config get prefix)/bin:\$PATH" >> ~/.bashrc
source ~/.bashrc
```

### 重启后应用没自动起

99% 是忘了 `pm2 save`：

```bash
sudo -u deploy pm2 save
sudo -u deploy pm2 list
```

详见 `nodejs-pm2.md`。

### Nginx 502 Bad Gateway

```bash
# 1. Node 应用在跑？
sudo -u deploy pm2 list
curl -I http://127.0.0.1:3000/

# 2. Nginx 反代配置错？
sudo nginx -t
sudo tail -20 /var/log/nginx/error.log

# 3. SELinux（RHEL）阻止 nginx 反代
sudo setsebool -P httpd_can_network_connect 1
```

### 应用反复重启 / errored

```bash
sudo -u deploy pm2 logs myapp --lines 200
# 常见
# - 端口被占
# - 依赖没装齐（npm install）
# - 配置文件 / .env 缺
# - max_memory_restart 设太低
```

### Cluster 模式下 sticky session 问题

```nginx
# Nginx 用 ip_hash 而非 round-robin
upstream myapp {
    ip_hash;
    server 127.0.0.1:3000;
}
```

或用 Redis session（推荐）。

### HTTPS 证书续签后没自动 reload

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## 验证

```bash
# 1. Node + npm + PM2
node --version
npm --version
pm2 --version

# 2. Nginx 在跑
systemctl is-active nginx

# 3. PM2 systemd unit
systemctl status pm2-deploy                         # 替 deploy 为你的用户

# 4. 应用反代通
curl -I http://localhost                              # 通过 Nginx 到 Node

# 5. 看 PM2 状态
sudo -u deploy pm2 list

# 6. 看应用日志
sudo -u deploy pm2 logs myapp --lines 30

# 7. 看 Nginx access log
sudo tail -20 /var/log/nginx/access.log
```

## 多次运行

`installMode: skip-existing`。包安装幂等。Nginx vhost 文件每次按表单值重写——**手动改的反代配置会丢**。建议把自定义 location 放独立 conf 文件。

## ⚠️ 敏感性

**review** — Node + PM2 + Nginx 三层服务。

强制：

1. PM2 跑专用 deploy 用户，不给 root
2. .env 文件权限 0600
3. 公网 80/443 → HTTPS（certbot-ssl）
4. 业务账号最小权限连数据库

## 隐私说明

- Nginx access log 含每个请求 IP / URL / UA
- PM2 应用日志含 stdout/stderr —— 业务日志可能含敏感数据
- `.env` / `ecosystem.config.js` 含数据库密码等 secret —— 备份时加密
- Node.js 不发遥测；PM2 默认不发；npm 发匿名安装统计（可关）
