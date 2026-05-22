# NVM (Node Version Manager)

nvm 让一台机器上能装多个 Node.js 版本，每个项目用不同版本。和系统包管理器装的 Node 完全独立——
装到 `~/.nvm`，不要 sudo。

## 你将得到什么

- ✅ nvm v0.40.x 装到 `~/.nvm`
- ✅ `~/.bashrc` 里加了 nvm 加载逻辑
- ✅ 默认 Node 版本（按表单选择）已安装

## 用法

### 必须重开 shell 后用

nvm install 脚本只改 `~/.bashrc`（或 `~/.zshrc`），当前 shell 看不到。新开 shell 即可：
```bash
nvm --version
node --version    # 等于你设的默认版本
```

### 装更多 Node 版本

```bash
nvm install 18           # 装 Node 18
nvm install 22.5.1       # 装具体版本
nvm install --lts        # 装最新 LTS
nvm ls                   # 已装版本列表
nvm ls-remote            # 所有可装版本
```

### 切换版本（按 shell）

```bash
nvm use 18         # 当前 shell 用 Node 18
nvm use default    # 用默认版本
```

### 项目级自动切换

项目根目录下放 `.nvmrc` 文件：
```
22
```

进入目录后跑 `nvm use` 自动切到 22（或者配置自动 hook 进入目录就切）。

### 别忘了 npm install -g 是按版本隔离的

每个 Node 版本有自己的 npm 全局目录。换 Node 版本后全局工具要重装：
```bash
nvm use 18
npm install -g pm2 yarn pnpm
```

或者用 `nvm reinstall-packages 22`：从版本 22 复制全局包到当前版本。

### 国内速度优化

```bash
# 改 nvm 下载 Node 二进制的源
echo 'export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node' >> ~/.bashrc
source ~/.bashrc
```

## ⚠️ 敏感性

**safe** — 装到用户目录，不污染系统。

## 验证

```bash
nvm --version
nvm ls
node --version
```

## 排错

- **重开 shell 后 `nvm: command not found`** — `~/.bashrc` 没被加载（你用的是 zsh / fish 之类）。手动 source `~/.nvm/nvm.sh`，或把 nvm 那几行加到 `~/.zshrc`。
- **install.sh curl 失败** — 国内服务器到 raw.githubusercontent.com 慢。手动用国内代理或 wget 备用源。
- **跨发行版**：纯 shell 安装，无包管理器差异。但需要 git + curl 已装好。

## 多次运行

`installMode: skip-existing`。已装就跳过 install 脚本，但每次会重新安装默认版本（如果不是已安装的）。

## 隐私说明

nvm 不发遥测。Node 版本是从 https://nodejs.org/dist 下载的官方二进制。
