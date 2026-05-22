# PM2 进程管理

PM2 是 Node.js 生态的"systemd"——管理 node 进程：自动重启崩溃的进程、cluster 模式
（多核利用）、零停机重启、内存溢出自动重启、日志聚合。

适合：所有生产 Node.js 应用。比 `node app.js` 直接跑可靠 100 倍。

## 你将得到什么

- 📦 PM2 全局安装（`/usr/local/bin/pm2`）
- ✅ systemd 启动脚本（开机自启 PM2 daemon + 上次保存的应用列表）

**前置依赖**：必须先装 Node.js + npm。EnvForge 的 catalog 里有 `node-runtime-profile`。

## 表单字段说明

### PM2 运行用户

留空则 PM2 daemon 跑在 root（不推荐）。建议建独立 deploy/app 用户：
```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG sudo deploy   # 仅在需要 sudo 时
```

然后表单里填 `deploy`，PM2 会以 deploy 身份开机自启。

## 安装后

### 部署一个 Node 应用

```bash
# 切到运行 PM2 的用户
sudo su - deploy

# 进到应用目录
cd /var/www/myapp

# 启动
pm2 start npm --name "myapp" -- start
# 或者直接启动入口文件
pm2 start app.js --name "myapp"

# 保存当前进程列表（开机自启时会恢复这个列表）
pm2 save
```

### Cluster 模式（多核）

```bash
pm2 start app.js -i max --name "myapp"
# -i max 表示用所有 CPU 核
# -i 4 表示 4 个进程
```

### 看状态 / 日志

```bash
pm2 list                # 进程列表
pm2 monit               # 实时监控（CPU / 内存）
pm2 logs                # 所有进程的日志
pm2 logs myapp          # 单个应用的日志
pm2 logs myapp --lines 200
pm2 flush               # 清空日志
```

### 重启 / 停止

```bash
pm2 restart myapp       # 普通重启
pm2 reload myapp        # 零停机重启（cluster 模式才有意义）
pm2 stop myapp
pm2 delete myapp        # 从 PM2 中移除
```

### 用 ecosystem 文件（推荐）

`/var/www/myapp/ecosystem.config.js`：
```javascript
module.exports = {
  apps: [{
    name: 'myapp',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    max_memory_restart: '500M',   // 超过 500M 自动重启
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/pm2/myapp-error.log',
    out_file: '/var/log/pm2/myapp-out.log'
  }]
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
```

### 部署管理（pm2 deploy）

PM2 还自带远程部署能力（类似简化版 Capistrano）：
```javascript
// ecosystem.config.js 加 deploy 段
deploy: {
  production: {
    user: 'deploy',
    host: 'server.example.com',
    ref: 'origin/main',
    repo: 'git@github.com:me/myapp.git',
    path: '/var/www/myapp',
    'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
  }
}
```

```bash
pm2 deploy production setup    # 第一次
pm2 deploy production          # 后续
```

### 配 nginx 反向代理

参见 `nginx-web-service` 的反代模式。upstream 填 PM2 监听的端口（一般 3000）。

## ⚠️ 敏感性

**review** — PM2 daemon 持有运行用户的所有应用。如果以 root 跑等于把应用权限提到 root。
强烈建议用普通用户。

## 验证

```bash
pm2 --version
pm2 list
systemctl status pm2-deploy   # 替换 deploy 为你的用户名
```

## 排错

- **`pm2: command not found`** — npm 全局目录不在 PATH。`npm config get prefix` 看路径，加到 ~/.bashrc 的 PATH。
- **重启服务器后应用没自动起来** — 忘了 `pm2 save`。startup 命令只让 daemon 起来，但 daemon 启动时只加载 save 过的进程列表。
- **`Error: pm2 startup` 失败** — 不在 systemd 系统上（少见，docker 容器里没 systemd）。手动写 systemd unit 替代。
- **跨发行版**：PM2 是 npm 包，跨发行版无差异。

## 多次运行

`installMode: skip-existing`。npm install -g 会更新 PM2 到最新版（npm 默认行为）。startup unit 重新生成。

## 隐私说明

- PM2 默认不发遥测。但 PM2 Plus 是付费监控服务，需要你主动注册。
- 进程日志在 `~/.pm2/logs/`，按用户隔离。
