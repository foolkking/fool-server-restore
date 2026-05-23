# NVM (Node Version Manager)

nvm 让一台机器装多个 Node.js 版本，每个项目用不同版本。装到 **`~/.nvm`（用户家目录）**——和系统包管理器装的 Node 完全独立。开发机推荐；生产机器单版本走 `node-runtime-profile` 更稳定。

## 你将得到什么

- ✅ nvm v0.40.x 装到 `~/.nvm`
- ✅ `~/.bashrc`（或 `~/.zshrc`）末尾加了 nvm 加载逻辑
- ✅ 默认 Node.js 版本（按表单选择）已安装并设为 `default` alias

## 表单字段说明

### `default_version`

nvm 装好后立刻装的 Node 版本。可选：

| 值 | 含义 |
|---|---|
| `--lts` | 最新 LTS（推荐，目前 22） |
| `lts/jod` | Node 22 LTS |
| `lts/iron` | Node 20 LTS |
| `22` / `20` / `18` | 具体 major 的最新 patch |
| 空 | 不装默认版本（仅装 nvm 本身） |

## 配置文件 / 目录速查

```
$HOME/.nvm/                                  # nvm 主目录
├── nvm.sh                                   # ← 加载脚本（被 .bashrc source）
├── bash_completion                          # tab 补全
├── alias/                                   # 版本别名（lts/jod、lts/iron 等）
├── versions/node/                           # 各 Node 版本独立目录
│   ├── v22.10.0/
│   │   ├── bin/                             # node / npm / npx / corepack
│   │   ├── lib/node_modules/                # 此版本独立的全局包
│   │   └── include/node/
│   └── v20.18.0/
│       └── ...
└── .cache/                                  # 下载缓存

$HOME/.nvmrc                                 # 当前用户默认（可选）

# Shell 集成
$HOME/.bashrc                                # 末尾加 export NVM_DIR + source nvm.sh
$HOME/.zshrc                                 # zsh 用户需手动加

# 项目级
<project>/.nvmrc                             # 一行写版本号，如 "22"
```

| 项 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| 安装位置 | `~/.nvm`（用户级） | 相同 |
| 依赖 | `curl` `git` | `curl` `git` |
| Shell 启动文件 | `~/.bashrc`（默认） | 相同；zsh 用户加到 `~/.zshrc` |

## 常见配置模板

### 模板 A — 从国内镜像装 Node 二进制

`~/.nvmrc` 不影响 nvm 自身的下载源。要让 `nvm install` 从国内拉 Node，设环境变量：

```bash
# ~/.bashrc 末尾追加
export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
export NVM_IOJS_ORG_MIRROR=https://npmmirror.com/mirrors/iojs

# 重开 shell 或 source ~/.bashrc
```

国内服务器 `nvm install 22` 速度从 ~50KB/s 提到 ~30MB/s。

### 模板 B — 项目级版本锁定（团队协作）

项目根目录加 `.nvmrc`：

```
22
```

或写具体 patch：

```
v22.10.0
```

进入项目目录后 `nvm use` 自动切换：

```bash
cd myproject
nvm use                # 读 .nvmrc，切到对应版本
nvm install            # 没装就装
```

### 模板 C — 进入目录自动切换（auto-switch）

加到 `~/.bashrc` 末尾（在 nvm 加载之后）：

```bash
# 进入有 .nvmrc 的目录自动 nvm use
cdnvm() {
    command cd "$@" || return $?
    if [ -f .nvmrc ] && [ -r .nvmrc ]; then
        local desired_node_version=$(cat .nvmrc | tr -d '[:space:]v')
        local current_node_version=$(node -v 2>/dev/null | tr -d 'v')
        if [ "$desired_node_version" != "$current_node_version" ]; then
            nvm use 2>/dev/null || nvm install
        fi
    fi
}
alias cd='cdnvm'
```

或用第三方工具 `direnv`（更通用）。

### 模板 D — 把全局包从老版本搬到新版本

```bash
# 看老版本装了什么
nvm use 20
npm list -g --depth=0

# 在新版本里装相同列表
nvm install 22 --reinstall-packages-from=20
```

## 关键参数调优速查

### nvm 性能 / 启动延迟

nvm 加载会让 shell 启动慢 200-500ms（因为它检查 PATH / 加载补全）。优化：

```bash
# 方案 1：lazy load（仅在需要时加载 nvm）
# ~/.bashrc 末尾
export NVM_DIR="$HOME/.nvm"
nvm() {
    unset -f nvm
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    nvm "$@"
}
node() {
    unset -f node
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    node "$@"
}
npm() {
    unset -f npm
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    npm "$@"
}

# 方案 2：换更快的工具——fnm（Rust 写的 nvm 兼容）
curl -fsSL https://fnm.vercel.app/install | bash
# fnm 启动快 5-10 倍，且 .nvmrc 兼容
```

### 版本切换粒度

```bash
nvm use 22                # 当前 shell 切到 22.x.x（latest patch）
nvm use 22.10.0           # 切到具体 patch
nvm use lts/jod           # 切到 LTS alias
nvm alias my-prod 22.10   # 给版本起别名
nvm use my-prod
nvm unalias my-prod
nvm uninstall 18          # 删某版本（释放 ~150MB）
```

### 默认版本设置

```bash
nvm alias default 22                # 新 shell 启动时用 22
nvm alias default lts/jod           # 跟 LTS 走，每次新 LTS 出来 nvm install 后自动切
```

## 跨发行版兼容

nvm 是纯 shell 脚本（依赖 bash + curl + git + tar），所有支持的发行版上行为一致。

| 项 | Ubuntu/Debian | RHEL/Anolis 9 | Alpine |
|---|---|---|---|
| 依赖 | `curl` `git` | `curl` `git` | `curl` `git` `bash` |
| 兼容性 | ✅ | ✅ | ⚠️ Node 二进制需 musl 版本，nvm 默认拉 glibc 版会跑不起来 |

Alpine 上不推荐 nvm，用 `node:22-alpine` Docker 镜像或 `apk add nodejs` 更直接。

## 与其它 catalog 项的配合

- **`node-runtime-profile`** — 系统级 Node（NodeSource 仓库）；和 nvm 装的用户级 Node **不冲突**——但 PATH 顺序决定哪个生效。nvm 加载后会把 `~/.nvm/versions/node/<ver>/bin` 加到 PATH 前面
- **`zsh-shell` / `fish-shell`** — nvm 默认只改 `.bashrc`：
    - **zsh**：手动复制 `.bashrc` 末尾的 nvm 加载块到 `~/.zshrc`
    - **fish**：nvm 不支持 fish，用 [`nvm.fish`](https://github.com/jorgebucaran/nvm.fish) 或 [`fnm`](https://github.com/Schniz/fnm)
- **`nodejs-pm2`** — PM2 装在哪个 Node 版本下，systemd 集成（pm2 startup）会写死那个版本路径——切版本后 PM2 不会自动跟着切

## 排错

### 重开 shell 后 `nvm: command not found`

通常是 shell 不是 bash 或 .bashrc 不被加载。

```bash
# 检查 nvm 文件
ls $HOME/.nvm/nvm.sh

# 检查启动文件含 nvm 加载逻辑
grep -A2 NVM_DIR ~/.bashrc

# 临时
source $HOME/.nvm/nvm.sh

# 永久（zsh 用户）
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.zshrc
```

### `nvm install` 卡在 `Downloading https://nodejs.org/dist/...`

国内 IDC 到 nodejs.org 慢。设国内镜像：

```bash
echo 'export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node' >> ~/.bashrc
source ~/.bashrc
nvm install 22                    # 重试，会从 npmmirror 拉
```

### `nvm install --lts` 失败 `Failed to retrieve LTS list`

需要先更新 nvm 自身：

```bash
cd $NVM_DIR
git fetch --tags origin
git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
. $NVM_DIR/nvm.sh
```

或重跑本 Playbook（会装最新 nvm）。

### 装某老版本 Node 报 `GLIBC_2.X not found`

老 Node 二进制依赖较新 glibc，目标系统 glibc 太旧。两种方案：

```bash
# 方案 1：用更老的 Node 版本（兼容老 glibc）
nvm install --lts/dubnium       # Node 10
nvm install --lts/erbium        # Node 12

# 方案 2：让 nvm 编译 Node（慢但兼容）
nvm install --shared-zlib --shared-openssl 16
```

或干脆升级系统。

### 切到某版本后 `npm: command not found`

很罕见，通常是该版本目录损坏。重装：

```bash
nvm uninstall 22
nvm install 22
```

### `nvm use` 在每个 shell 都要重跑

这是预期行为——`nvm use` 仅当前 shell 生效。要持久化：

```bash
nvm alias default 22
```

新开 shell 自动用 22。

### 全局包跟随版本一起被删

```bash
nvm uninstall 22         # 22 下装的全局包也消失
```

如果换 major 版本要保留全局包，先备份：

```bash
nvm use 22 && npm list -g --depth=0 > /tmp/global-pkgs.txt
nvm install 24
npm install -g $(cat /tmp/global-pkgs.txt | tail -n +2 | awk '{print $2}' | sed 's/@.*//')
```

或直接用 `--reinstall-packages-from`（模板 D）。

## 验证

```bash
# 1. nvm 命令可用（必须在新 shell 或 source 后）
bash -lc 'nvm --version'

# 2. 装的版本列表
bash -lc 'nvm ls'

# 3. node 命令对应到 nvm 装的版本
bash -lc 'which node'      # 应是 ~/.nvm/versions/node/...

# 4. 装个版本测试（如果之前没装）
bash -lc 'nvm install 22 && nvm use 22 && node --version'
```

## 多次运行

`installMode: skip-existing`。Playbook 用 `creates: $HOME/.nvm/nvm.sh` 守卫——已装就跳过。重跑只会确认默认版本仍存在。

要升级 nvm 自身：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

或在 `~/.nvm` 目录里 `git pull`。

## ⚠️ 敏感性

**safe** — 装到用户家目录。不污染系统、不需 sudo。

## 隐私说明

- nvm 本身不发遥测
- `nvm install` 从 `nodejs.org/dist`（默认）或国内镜像下二进制；镜像方能看到你装了哪些版本
- nvm 是 shell 脚本，所有逻辑可读：`cat $NVM_DIR/nvm.sh`
- Node 自身的 `npm` 仍按 `node-runtime-profile.md` 隐私说明工作
