# Node.js LTS 运行时

通过 NodeSource 官方仓库装 Node.js LTS（22.x 默认）。比发行版仓库的版本新得多——Ubuntu 22 默认 12.x（已 EOL 多年），Anolis 9 默认 18.x（已 EOL）。NodeSource 官方仓库有 deb / rpm 双格式，跨发行版兼容。

## 你将得到什么

- 📦 **nodejs**（含 npm，单一包）
- ✅ NodeSource 官方仓库（自动跟进 minor 升级）
- ✅ 可选：自动配国内 npm registry（淘宝镜像）加快装包

## 表单字段说明

### `node_version` — Node.js 版本

| 值 | 含义 | EOL | 推荐 |
|---|---|---|---|
| `20` | LTS（Iron） | 2026-04 | 兼容老依赖时选 |
| `22` | LTS（Jod，**默认**） | 2027-04 | 性能比 20 强 10-20% |
| `24` | 最新（非 LTS） | 2025-10 转 LTS | 仅尝鲜，**不要在生产用** |

奇数版（21/23/25）是开发版本——一般 6 月寿命，**绝不在生产使用**。

### `npm_registry` — npm registry（可选）

国内服务器（特别是 Aliyun / 腾讯云）连 `registry.npmjs.org` 经常超时。建议设：

| URL | 运营方 | 同步频率 |
|---|---|---|
| `https://registry.npmmirror.com` | 阿里 / 淘宝 | 10 分钟 |
| `https://mirrors.huaweicloud.com/repository/npm/` | 华为云 | 1 小时 |
| `https://mirrors.cloud.tencent.com/npm/` | 腾讯云 | 不定 |

留空 = 用 npmjs.org 官方源。海外 VPS / GitHub Actions runner 不需要镜像。

## 配置文件 / 目录速查

```
# Node.js + npm 主二进制
/usr/bin/node                        # 命令链接
/usr/bin/npm
/usr/lib/node_modules/               # 系统级全局包（npm install -g 装这里）
├── npm/                             # npm 自身
├── corepack/                        # corepack（管 yarn / pnpm）
└── <package>/                       # sudo npm i -g 装的工具

# NodeSource 仓库文件
/etc/apt/sources.list.d/nodesource.list           # Ubuntu/Debian
/etc/apt/keyrings/nodesource.gpg                  # GPG 公钥
/etc/yum.repos.d/nodesource-nodejs.repo           # RHEL/Anolis

# 用户级
~/.npm/                              # npm 缓存（GB 级）
~/.npmrc                             # 用户 npm 配置（registry / token / cafile）
~/.config/configstore/               # update-notifier 等数据

# 项目级
<project>/
├── package.json                     # 依赖声明
├── package-lock.json                # 锁定（npm）
├── pnpm-lock.yaml                   # 锁定（pnpm）
├── yarn.lock                        # 锁定（yarn）
└── node_modules/                    # 装在项目里（10 万 + 文件）
```

| 项 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| 包名 | `nodejs`（来自 NodeSource） | 相同 |
| 仓库类型 | apt | yum/dnf |
| GPG 公钥位置 | `/etc/apt/keyrings/nodesource.gpg` | RPM 自带签名 |
| 安装位置 | `/usr/bin/node` | `/usr/bin/node` |

## 常见配置模板

### 模板 A — 用户级 `.npmrc`（国内服务器推荐）

```ini
# ~/.npmrc
registry=https://registry.npmmirror.com/
fund=false
audit=false
loglevel=error

# 不让 npm install 后弹 funding 提示
prefer-offline=false

# CA / proxy（如有内网代理）
# cafile=/etc/ssl/certs/internal-ca.pem
# proxy=http://proxy.corp.example.com:8080
```

### 模板 B — 用 corepack 管 yarn / pnpm（**推荐替代 sudo npm i -g**）

```bash
# 启用 corepack（Node 22 内置）
sudo corepack enable

# 在项目里指定包管理器版本（写到 package.json）
corepack use yarn@4.5.0
corepack use pnpm@9.12.0

# corepack 会按需下载对应版本，不污染全局
yarn --version
pnpm --version
```

### 模板 C — systemd 跑 Node.js 应用

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js App
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/node /opt/myapp/dist/server.js
Restart=on-failure
RestartSec=5

# Node.js 推荐环境变量
Environment="NODE_ENV=production"
Environment="NODE_OPTIONS=--max-old-space-size=2048"

# 文件描述符（处理高并发 socket）
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

复杂场景用 PM2（catalog 里有 `nodejs-pm2`）替代直接 systemd。

### 模板 D — Dockerfile 多阶段构建

```dockerfile
# Build 阶段
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# 运行阶段
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

最终镜像 ~150 MB（alpine），常规 `node:22` 的 ~1.1 GB。

## 关键参数调优速查

### V8 heap 大小

| 内存 | `--max-old-space-size` | 说明 |
|---|---|---|
| 1 GB | `512` | 别太满 |
| 2 GB | `1024` | 标准 web 服务 |
| 4 GB | `2048` | 复杂业务 |
| 8 GB | `4096` | 数据处理 |
| 16 GB | `8192` | 不要超过物理内存 80% |

设法：

```bash
# 命令行
node --max-old-space-size=2048 server.js

# 环境变量（systemd 推荐）
NODE_OPTIONS="--max-old-space-size=2048" node server.js
```

V8 默认 1.5GB，超过会 `JavaScript heap out of memory` 崩溃。

### 关键环境变量

| 变量 | 推荐值 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | 影响 Express 错误页、依赖加载方式 |
| `NODE_OPTIONS` | `--max-old-space-size=...` | V8 选项（推荐写这里） |
| `UV_THREADPOOL_SIZE` | `4`（默认） | libuv 线程池（fs / dns / crypto 用） |
| `NODE_NO_WARNINGS` | `1` | 关 deprecation warning（生产） |
| `NPM_CONFIG_PRODUCTION` | `true` | `npm install` 不装 devDependencies |

### 集群 / 负载均衡

Node 单线程，CPU 密集任务卡。多核机器：

```js
// cluster 模块（Node 内置）
const cluster = require('cluster');
const os = require('os');
if (cluster.isMaster) {
    for (let i = 0; i < os.cpus().length; i++) cluster.fork();
} else {
    require('./server.js');
}
```

或用 PM2 cluster mode：`pm2 start server.js -i max`（catalog 里 `nodejs-pm2`）。

## 跨发行版兼容

NodeSource 官方仓库覆盖：

| 发行版 | 状态 |
|---|---|
| Ubuntu 22.04 / 24.04 | ✅ 主要支持目标 |
| Debian 12 | ✅ |
| RHEL 9 / Rocky 9 / Alma 9 | ✅ |
| **Anolis 9** | ✅（走 RHEL 9 仓库，已验证） |
| Alpine | ❌（用 docker `node:22-alpine`） |

Playbook 通过 `command -v apt-get` / `command -v dnf` 自动选 setup 脚本：

- Debian 系：`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -`
- RHEL 系：`curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -`

发行版自带的老 nodejs 包会被 NodeSource 仓库 priority 覆盖（更新优先用 NodeSource 版本）。如果之前 `apt-get install nodejs` 装了发行版老版本：

```bash
sudo apt-get purge nodejs npm
sudo apt-get autoremove
# 然后重跑本 Playbook
```

## 与其它 catalog 项的配合

- **`nodejs-pm2`** — PM2 进程管理器，多实例 / 自动重启 / 日志聚合（强烈推荐生产用）
- **`nodejs-version-mgr`** — NVM，开发机多版本切换。本 Playbook 装系统级，nvm 装用户级，不冲突
- **`nginx-web-service`** — nginx 反代到 Node.js（标准生产架构）
- **`docker-host-profile`** — 用 `node:22-alpine` 容器化部署（模板 D）
- **`pyenv-toolchain` 同理**——本 Playbook 装系统级，pyenv 装用户级，相安无事

## 排错

### `node: command not found`

NodeSource setup 脚本失败或 apt-get install 没跑。手动：

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# RHEL/Anolis
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
sudo dnf install -y nodejs
```

### setup 脚本卡住 / 401 Unauthorized

国内服务器到 deb.nodesource.com 偶发 GFW 干扰。换镜像：

```bash
# 用清华 TUNA 镜像
echo "deb https://mirrors.tuna.tsinghua.edu.cn/nodesource/deb/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://mirrors.tuna.tsinghua.edu.cn/nodesource/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
sudo apt-get update && sudo apt-get install nodejs
```

### `npm install` 卡死

```bash
# 1. 检查 registry
npm config get registry

# 2. 设国内镜像
npm config set registry https://registry.npmmirror.com

# 3. 清缓存（损坏时）
npm cache clean --force

# 4. 删 lockfile + node_modules 重装
rm -rf node_modules package-lock.json && npm install
```

### `Cannot find module ...` 但依赖在 package.json

```bash
# 删 node_modules 重装
rm -rf node_modules
npm ci          # 严格按 lockfile 装（推荐 CI 用）
# 或 npm install
```

### EACCES 错误（`sudo npm install -g` 不需要 sudo）

```bash
# 改 npm 全局目录到用户家
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 然后无 sudo
npm install -g pm2
```

或用 `corepack`（管 yarn/pnpm）/`pipx` 思路的 `npx`（一次性运行）。

### V8 OOM `JavaScript heap out of memory`

提高 heap：

```bash
NODE_OPTIONS="--max-old-space-size=4096" node server.js
```

如果是构建时 OOM（`npm run build`）：

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### npm warn deprecated <pkg>@<ver>

老依赖包被弃用。一般可忽略——除非看到 critical security advisory。可用 `npm audit fix`。

## 验证

```bash
# 1. 命令存在 + 版本对
node --version                       # v22.x.x
npm --version                        # 10.x 或 11.x

# 2. PATH 含 node
which node                           # /usr/bin/node

# 3. 跑 hello world
echo 'console.log("Node OK")' | node

# 4. npm 能装包
mkdir /tmp/ntest && cd /tmp/ntest
npm init -y > /dev/null
npm install --silent left-pad
node -e "console.log(require('left-pad')('hi', 5, '*'))"   # 应输出 ***hi
cd / && rm -rf /tmp/ntest
```

## 多次运行

`installMode: skip-existing`。NodeSource setup 脚本有 `creates` 守卫，已添加仓库就跳过。`apt-get install nodejs` 幂等——已装就跳过，可手动 `apt-get upgrade nodejs` 升级到 minor 内最新 patch。

要升级 major（22 → 24）：改表单的 `node_version` 重跑 Playbook。NodeSource 不同 major 是不同仓库，会自动覆盖旧的。

## ⚠️ 敏感性

**review** — 加 NodeSource 第三方 apt/yum 仓库；普通用户 npm install 不需 sudo，但全局工具装在 `/usr/lib/node_modules` 会要 sudo。

## 隐私说明

- **NodeSource setup 脚本只添加仓库**，不发遥测
- **npm 默认收集匿名安装统计**（包名 + 版本，不含个人信息）发给 npmjs。可关：
  ```bash
  npm config set send-metrics false
  ```
- 全球或国内 npm registry 都能看到你**装了什么包**——私有依赖走自己的 registry（如 Verdaccio / GitHub Packages）
- 第三方包可能有自己的遥测（如 `next.js` 的 telemetry，可 `next telemetry disable`）
