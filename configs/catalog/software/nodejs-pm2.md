# PM2 进程管理

PM2 是 Node.js 生态的"systemd"——管理 Node 进程：自动重启崩溃的进程、cluster 模式（多核利用）、零停机部署、内存溢出自动重启、日志聚合。**所有生产 Node.js 应用都该用**——比 `node app.js` 直接跑可靠 100×。

> **前置依赖**：必须先装 Node.js + npm（catalog 里 `node-runtime-profile` 或 `nodejs-version-mgr`）。本 Playbook 用 `npm install -g pm2`。

## 你将得到什么

- 📦 PM2 全局安装（`/usr/lib/node_modules/pm2` + 二进制 `/usr/bin/pm2` 或 `~/.npm-global/bin/pm2`）
- ✅ systemd 启动脚本（开机自启 PM2 daemon + 上次保存的应用列表）
- ✅ 日志目录 `~/.pm2/logs/`
- ✅ pm2-logrotate 模块自动安装（防止日志爆磁盘）

## 表单字段说明

### `pm2_user`

PM2 daemon 跑在哪个用户下。

| 值 | 适用 |
|---|---|
| 留空（默认 root） | **不推荐**——PM2 持有的所有应用都跑 root |
| `deploy` / `app` | **推荐**——独立 service 用户 |

建议先创建专用用户：

```bash
sudo useradd -m -s /bin/bash deploy
sudo passwd deploy            # 设密码（或加 SSH key）
```

然后表单填 `deploy`，PM2 daemon 以该身份开机自启。

### `enable_logrotate`

打开后 `pm2 install pm2-logrotate` 装日志轮转模块（推荐打开）。日志默认按天 rotate，保留 30 天。

## 配置文件 / 目录速查

```
# PM2 全局
/usr/lib/node_modules/pm2/                 # 程序本体（npm 全局装）
/usr/bin/pm2                                # 命令（可能 /usr/local/bin/pm2）

# 用户级（每个跑 PM2 的用户独立）
~/.pm2/                                     # ← 主目录
├── pm2.log                                 # PM2 daemon 自身日志
├── pm2.pid                                  # daemon PID
├── module_conf.json                         # 已装模块的配置
├── pids/                                    # 各应用 PID 文件
├── logs/                                    # 应用日志（默认）
│   ├── myapp-out.log
│   └── myapp-error.log
├── dump.pm2                                  # `pm2 save` 保存的进程列表（开机恢复用）
└── modules/                                  # pm2 install 的模块（如 pm2-logrotate）

# systemd
/etc/systemd/system/pm2-<user>.service       # 开机自启 unit（pm2 startup 生成）

# 项目级（推荐）
<project>/
├── ecosystem.config.js                      # ← PM2 配置文件（替代命令行参数）
├── ecosystem.config.cjs                     # （ESM 项目用 .cjs）
└── package.json                             # 含 PM2 启动脚本
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| pm2 安装 | `npm install -g pm2` | 相同 |
| 二进制位置 | 取决于 `npm config get prefix`，常见 `/usr/bin/pm2` 或 `~/.npm-global/bin/pm2` | 相同 |
| systemd 集成 | `pm2 startup systemd` 生成 | 相同 |

## 常见配置模板

### 模板 A — 推荐 `ecosystem.config.js`（生产部署起手式）

```javascript
module.exports = {
  apps: [
    {
      // ====== 基础 ======
      name: 'myapp',
      script: './dist/server.js',          // 入口（编译后的 JS）
      cwd: '/opt/myapp',                    // 工作目录
      exec_mode: 'cluster',                 // cluster 多进程；fork 单进程
      instances: 'max',                     // = CPU 核数；可设 2 / 4 等数字

      // ====== 环境变量 ======
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001
      },
      // 启动：pm2 start ecosystem.config.js --env staging

      // ====== 自动重启策略 ======
      autorestart: true,                    // 崩溃自动重启
      max_restarts: 10,                      // 在 min_uptime 内重启次数上限
      min_uptime: '10s',                     // 重启冷却
      max_memory_restart: '500M',            // 内存超 500M 自动重启（防泄漏）
      restart_delay: 4000,                   // 重启延迟（毫秒）
      exp_backoff_restart_delay: 100,        // 指数退避重试

      // ====== 日志 ======
      error_file: '/var/log/pm2/myapp-error.log',
      out_file: '/var/log/pm2/myapp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,                      // cluster 模式下合并多 instance 日志

      // ====== 监听文件变化（仅开发用，**生产关掉**）======
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],

      // ====== 优雅停机 ======
      kill_timeout: 5000,                    // SIGTERM → 等 5s → SIGKILL
      wait_ready: true,                      // 等应用 process.send('ready')
      listen_timeout: 10000,                 // wait_ready 超时

      // ====== Source map ======
      source_map_support: true               // 让错误堆栈显示原文件名/行号（TS）
    }
  ],

  // ====== 部署（pm2 deploy 用）======
  deploy: {
    production: {
      user: 'deploy',
      host: ['server1.example.com', 'server2.example.com'],
      ref: 'origin/main',
      repo: 'git@github.com:me/myapp.git',
      path: '/opt/myapp',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    staging: {
      user: 'deploy',
      host: 'staging.example.com',
      ref: 'origin/develop',
      repo: 'git@github.com:me/myapp.git',
      path: '/opt/myapp-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging'
    }
  }
};
```

### 模板 B — 启动 / 停止 / 监控速查

```bash
# 启动
pm2 start ecosystem.config.js --env production

# 状态
pm2 list
pm2 status                          # 同 list
pm2 show myapp                       # 详细信息

# 实时监控
pm2 monit                            # 漂亮的 TUI（CPU / 内存 / 日志）

# 日志
pm2 logs                             # 所有应用
pm2 logs myapp                        # 仅 myapp
pm2 logs myapp --lines 200            # 最近 200 行
pm2 logs myapp --err                   # 仅 stderr
pm2 logs myapp --out                   # 仅 stdout
pm2 flush                              # 清空所有日志

# 重启
pm2 restart myapp                     # 普通重启（瞬间停 → 启）
pm2 reload myapp                      # 零停机（cluster 模式才有意义）
pm2 stop myapp
pm2 delete myapp                       # 从 PM2 移除
pm2 delete all

# 保存当前进程列表（开机自启时恢复这个列表）
pm2 save

# 看占用
pm2 prettylist
pm2 reset myapp                        # 重置统计（重启次数等）
```

### 模板 C — 开机自启（systemd 集成）

```bash
# 1. 生成 startup 命令（PM2 输出对应你 OS 的 startup 命令）
pm2 startup systemd -u deploy --hp /home/deploy

# 输出类似：
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy

# 2. 复制粘贴跑那条命令（需 sudo）

# 3. 启动几个应用
sudo -u deploy pm2 start ecosystem.config.js

# 4. 保存当前列表（关键步骤）
sudo -u deploy pm2 save

# 验证
sudo systemctl status pm2-deploy

# 重启测试
sudo reboot
# 起来后看
sudo -u deploy pm2 list
```

> ⚠️ **新手最常见的坑**：忘了 `pm2 save`。startup unit 启动 daemon 后**只加载 save 过的列表**，没 save 就空空如也。

### 模板 D — pm2-logrotate 配置

```bash
pm2 install pm2-logrotate

# 看默认配置
pm2 conf pm2-logrotate

# 调优
pm2 set pm2-logrotate:max_size 100M       # 单文件 100 MB rotate
pm2 set pm2-logrotate:retain 30            # 保留 30 个历史
pm2 set pm2-logrotate:compress true        # gzip 压缩老日志
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'    # 每天凌晨 rotate
```

### 模板 E — Nginx 反代到 PM2 cluster

```nginx
upstream nodeapp_backend {
    least_conn;
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name app.example.com;

    location / {
        proxy_pass         http://nodeapp_backend;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass         http://nodeapp_backend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }
}
```

PM2 cluster 模式让多个 worker 监听同一端口（Node 内置的 cluster 模块），nginx 直接 upstream 到该端口即可。

### 模板 F — 部署管理（pm2 deploy）

```bash
# 第一次：初始化目标机器
pm2 deploy ecosystem.config.js production setup

# 后续：拉新代码 + 重载
pm2 deploy ecosystem.config.js production

# 看部署日志
pm2 deploy ecosystem.config.js production exec 'pm2 logs --lines 50 --nostream'

# 回滚到上次
pm2 deploy ecosystem.config.js production revert 1
```

> **限制**：pm2 deploy 是 PM2 自带的简化版 Capistrano——适合简单 Node 项目。复杂场景用 GitHub Actions / GitLab CI / Ansible。

## 关键参数调优速查

### exec_mode: `fork` vs `cluster`

| 模式 | 适用 | 注意 |
|---|---|---|
| `fork`（默认） | 单进程 / 不能 cluster 的应用 | TS / 老 framework |
| `cluster` | 多进程，自动 load balance | 应用必须无状态 + 端口共享 |

cluster 限制：

- 多进程间不共享内存（用 Redis / DB 通信）
- 文件 session 不工作（必须 Redis session）
- 全局变量是 per-worker 的

### `instances` 设置

```javascript
instances: 'max'           // = CPU 核数
instances: 4               // 固定 4 个
instances: -1              // CPU 核数 - 1（留 1 核给系统）
instances: 0               // = 'max'
```

CPU 密集应用：`instances = CPU 核数`。
IO 密集（绝大多数 web 应用）：`instances = CPU 核数` 也行；过多会增加内存。

### `max_memory_restart`

```javascript
max_memory_restart: '500M'         // 单位 K/M/G/T
```

防内存泄漏的"自动重启垫"。设到正常使用的 1.5-2 倍。

### Graceful shutdown

```javascript
{
  kill_timeout: 5000,                // SIGTERM 后等 5s 再 SIGKILL
  wait_ready: true,                   // 等应用 ready 信号
  listen_timeout: 10000               // ready 超时
}
```

应用代码里：

```javascript
// 启动完成后通知 PM2
if (process.send) process.send('ready');

// 优雅停机
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, draining...');
    await server.close();             // 等所有连接处理完
    process.exit(0);
});
```

## 跨发行版兼容

PM2 是 npm 包——和 Node.js 一致跨平台。

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Node 来源 | NodeSource / nvm | NodeSource / nvm |
| pm2 包 | `npm install -g pm2` | 相同 |
| systemd 集成 | `pm2 startup systemd` | 相同 |
| 不需要 sudo（用户级） | 配 `npm config set prefix ~/.npm-global` | 相同 |

## 与其它 catalog 项的配合

- **`node-runtime-profile`** — 必装前提（系统级 Node）
- **`nodejs-version-mgr`** — 用 nvm 装 Node 时，PM2 装在某 nvm 版本下，`pm2 startup` 会写死该版本路径——**切版本后 PM2 不会自动跟着切**
- **`nginx-web-service`** — nginx 反代到 PM2 cluster（模板 E）
- **`certbot-ssl`** — HTTPS 终结在 nginx
- **`docker-host-profile`** — 容器化部署不需要 PM2（Docker 自己管 restart：`restart: unless-stopped`），PM2 是裸金属方案

## 排错

### `pm2: command not found`

npm 全局目录不在 PATH：

```bash
# 看 npm 装到哪
npm config get prefix
# 输出比如 /usr/local（pm2 在 /usr/local/bin/pm2）
# 或 /home/deploy/.npm-global

# 加 PATH
echo 'export PATH=$(npm config get prefix)/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### 重启服务器后应用没自动起

99% 是忘了 `pm2 save`：

```bash
# 应用启动后必须跑
pm2 save

# 验证 dump 文件存在
ls -la ~/.pm2/dump.pm2

# 手动测试恢复
pm2 resurrect
```

### `pm2 startup` 失败

不在 systemd 系统上。看：

```bash
which systemctl                  # 应有
ps -p 1 | head                    # PID 1 应是 systemd
```

非 systemd 系统（如 Docker 容器、Alpine）不能用 PM2 startup。容器内手动跑：

```bash
docker run -d -e NODE_ENV=production -p 3000:3000 ...
# 或 docker compose 用 restart: unless-stopped 替代 PM2
```

### 应用反复重启

```bash
pm2 logs myapp --lines 100        # 看错误

# 常见
# 1. 端口被占
# 2. 依赖没装齐（npm install）
# 3. 配置文件缺失
# 4. 内存太小（max_memory_restart 设太低）
```

`min_uptime` 期间崩溃 `max_restarts` 次后 PM2 会标 `errored` 并停止重试。

### Cluster 模式下端口冲突

```javascript
// 错：每个 worker 都试着监听 3000，第二个失败
const server = http.createServer(...);
server.listen(3000);

// 对：master 进程绑定，worker 共享（Node 内置 cluster 模块自动）
// PM2 cluster 模式下，所有 worker 监听同一端口由内核 SO_REUSEPORT 处理
```

应用代码不用改，只要不在 worker 启动时手动 cluster.fork()。

### 日志爆磁盘

`pm2-logrotate` 没装或没跑：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 conf pm2-logrotate
```

或手动清：

```bash
pm2 flush
> ~/.pm2/logs/myapp-out.log
> ~/.pm2/logs/myapp-error.log
```

### `pm2 reload` 卡住

应用没正确处理 SIGTERM。检查 `kill_timeout`：

```javascript
{
  kill_timeout: 10000,        // 给应用 10 秒 graceful shutdown
}
```

应用里：

```javascript
process.on('SIGTERM', () => server.close(() => process.exit(0)));
```

### Memory leak 检测

```bash
pm2 monit              # 实时看每个 instance 内存
pm2 list               # mem 列

# 配 max_memory_restart 自动 reload 防雪崩
# 配 New Relic / Datadog 等 APM 找根因
```

## 验证

```bash
# 1. PM2 装好
pm2 --version            # 应 5.x.x

# 2. daemon 起来（先跑过任意命令）
pm2 list
ls ~/.pm2/pid/pm2.pid

# 3. 启动测试应用
mkdir /tmp/pm2-test && cd /tmp/pm2-test
echo "console.log('PM2 test ' + new Date()); setInterval(() => {}, 1000);" > app.js
pm2 start app.js --name test
pm2 list                 # 应有 test
pm2 logs test --lines 5
pm2 delete test

# 4. systemd 集成（如启用）
sudo systemctl status pm2-$(whoami)
ls -la ~/.pm2/dump.pm2
```

## 多次运行

`installMode: skip-existing`。`npm install -g pm2` **每次会更新到 npm 仓库最新版**（npm 默认行为）。`pm2 startup` 单元每次重新生成（幂等）。`pm2 save` 不会自动重跑——需手动 + 重启 daemon。

## ⚠️ 敏感性

**review** — PM2 daemon 持有运行用户的所有应用进程。

- **Root 跑 PM2** = 所有应用权限提到 root（**强烈不推荐**）
- 跑 deploy / app 等无 sudo 的专用用户最安全
- pm2 startup 生成的 systemd unit 含路径依赖——切 Node 版本后需 `pm2 unstartup && pm2 startup`

## 隐私说明

- PM2 默认不发遥测
- **PM2 Plus / Keymetrics** 是付费监控服务，需主动注册才会发数据
- 进程日志在 `~/.pm2/logs/`，按用户隔离（权限 0644）
- 应用 stdout/stderr 全捕获——日志里**可能含密码 / token**（业务代码的事，PM2 不脱敏）
- `dump.pm2` 含完整命令行参数（含环境变量名，但不含值）；`ecosystem.config.js` 里的 env 段含明文环境变量——慎放敏感值
