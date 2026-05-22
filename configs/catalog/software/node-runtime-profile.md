# Node.js LTS 运行时

通过 NodeSource 官方仓库装 Node.js LTS。比发行版默认仓库的版本新很多
（Ubuntu 22.04 默认 12.x，Anolis 9 默认 18.x — 都已过 LTS）。

## 你将得到什么

- 📦 **nodejs**（含 npm）
- ✅ NodeSource 官方仓库（自动跟进 minor 升级）
- ✅ 可选：配国内 npm registry 加快下载

## 表单字段说明

### Node.js 版本

LTS 偶数版本：
- **20 LTS** (Iron) — 老但稳定，2026-04 EOL
- **22 LTS** (Jod) — **推荐**，2027-04 EOL，性能比 20 强 10-20%
- **24** — 最新但非 LTS（4 月发布，10 月才 LTS 化）

奇数版本（21/23）是开发版本，不要在生产用。

### npm registry

国内服务器（特别是 Aliyun / 腾讯云）npm 装包慢得离谱（连不上 npmjs.com 或速度极慢）。
国内镜像：
- `https://registry.npmmirror.com` (淘宝，最稳)
- `https://mirrors.huaweicloud.com/repository/npm/`
- `https://mirrors.cloud.tencent.com/npm/`

留空 = 用 npm 官方源（如果你用 GitHub Actions / Vercel / 海外 VPS 不需要镜像）。

## 安装后

### 验证

```bash
node --version    # v22.x.x
npm --version     # 10.x 或 11.x（npm 10/11 跟着 Node 22）
```

### 全局工具

PM2 / yarn / pnpm 等是常见全局包：
```bash
sudo npm install -g pm2
sudo npm install -g yarn
sudo npm install -g pnpm

# 或者：用 corepack（npm 自带）启用 yarn/pnpm 不需 sudo
sudo corepack enable
```

### 切换 npm registry

如果安装时没设：
```bash
npm config set registry https://registry.npmmirror.com
npm config get registry
```

### nvm（不同项目用不同版本）

不在本 Playbook 范围（catalog 里有单独的 `nodejs-version-mgr`）。如果你需要在
同一台机器上跑多个 Node 版本（比如旧项目要 16，新项目要 22），用 nvm。

## 验证

```bash
node --version
npm --version
which node    # /usr/bin/node
```

## 排错

- **`node: command not found`** — NodeSource setup 脚本没跑成功（curl 失败或权限不够）。手动跑：
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt-get install -y nodejs
  ```
- **`npm install` 极慢 / timeout** — 设国内 registry。
- **跨发行版**：Playbook 自动选 deb 或 rpm setup 脚本。Anolis 因为是 RHEL 克隆，rpm 脚本工作。

## 多次运行

`installMode: skip-existing`。已装就跳过 setup 脚本，apt/dnf install 会更新到 NodeSource 最新 patch 版本。

## 隐私说明

NodeSource setup 脚本只添加仓库，不发遥测。npm 默认会发匿名安装统计给 npmjs，可以关：
```bash
npm config set send-metrics false
```
