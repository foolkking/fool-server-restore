# 现代 CLI 工具集

一组用 Rust（部分用 Go）重写的现代 Unix 工具。性能比经典工具快 5-10 倍，体验更现代（颜色 / git 集成 / 智能默认）。装上即用，**不需要 cargo install**——全部走系统包管理器。

## 你将得到什么

- 📦 **bat** — 替代 `cat`（语法高亮 + 行号 + git 修改标记）
- 📦 **fd-find** — 替代 `find`（语法直观，默认尊重 .gitignore）
- 📦 **ripgrep**（命令 `rg`）— 替代 `grep -r`（速度快 5-10 倍）
- 📦 **lsd** — 替代 `ls`（彩色 + 图标 + tree 模式）
- 📦 **zoxide**（命令 `z`）— 替代 `cd`（按访问频率智能跳转）
- 📦 **fzf** — 模糊搜索器（不替代任何东西，但和上面所有工具配合）
- 📦 **tldr** — 替代 `man`（命令例子优先，不是长篇文档）
- 📦 **micro** — 现代化终端编辑器（鼠标支持 + 常规快捷键，比 nano 强、比 vim 友好）

> **历史说明**：本组合最早默认装 `exa`，但 exa 在 2021 年停止维护；之后切到活跃 fork `eza`。但 `eza` 在 RHEL/Anolis 系的 EPEL 里覆盖不全（部分镜像源缺包）。考虑到稳定优先，本 Playbook 改用 **`lsd`**（同样 Rust 写、活跃维护、EPEL/Debian/Ubuntu 全覆盖）。

## 配置文件 / 目录速查

```
# 用户级配置（多数工具自动创建）
~/.config/
├── bat/config                       # bat 全局选项
├── fd/                              # fd 默认 ignore 文件
├── ripgrep/config                   # rg 默认参数
├── lsd/config.yaml                  # lsd 主题 / 图标
├── tealdeer/                        # tldr 缓存（tealdeer 实现）
└── micro/                           # micro 配置 + 主题 + 插件

# fzf
~/.fzf/                              # fzf bindings 安装位置（Ubuntu）
/usr/share/doc/fzf/examples/         # bindings 脚本（Ubuntu）

# zoxide
~/.local/share/zoxide/db.zo          # 访问历史数据库
```

| 工具 | Ubuntu/Debian 包名 | RHEL/Anolis 包名 | 命令名（Ubuntu 特殊点） |
|---|---|---|---|
| bat | `bat` | `bat` | **Ubuntu 命令名是 `batcat`** |
| fd | `fd-find` | `fd-find` | **Ubuntu 命令名是 `fdfind`** |
| ripgrep | `ripgrep` | `ripgrep` | `rg`（一致） |
| lsd | `lsd` | EPEL `lsd` | `lsd` |
| zoxide | `zoxide` | EPEL `zoxide` | `zoxide`（shell 函数 `z`） |
| fzf | `fzf` | EPEL `fzf` | `fzf` |
| tldr | `tldr` | `tealdeer` | `tldr` |
| micro | `micro` | EPEL `micro` | `micro` |

**Ubuntu 包名陷阱**：因为和 Perl `bat` / 老 `fd` 命令冲突，Ubuntu 把命令名改了。本 Playbook 自动加 alias / symlink：

```bash
# 自动写入 ~/.bashrc（如果检测到 Ubuntu/Debian）
alias bat='batcat'
alias fd='fdfind'
# 或
sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd
```

## 常见配置模板

### 模板 A — Shell 别名 + zoxide / fzf 集成（强烈推荐写到 `~/.bashrc`）

```bash
# ~/.bashrc 末尾追加

# ===== Modern CLI replacements =====
# bat / fd 命令名修正（仅 Ubuntu）
if command -v batcat >/dev/null 2>&1 && ! command -v bat >/dev/null 2>&1; then
    alias bat='batcat'
fi
if command -v fdfind >/dev/null 2>&1 && ! command -v fd >/dev/null 2>&1; then
    alias fd='fdfind'
fi

# ls 用 lsd
if command -v lsd >/dev/null 2>&1; then
    alias ls='lsd'
    alias ll='lsd -lah --git'
    alias la='lsd -A'
    alias lt='lsd --tree --depth 2'
    alias l='lsd -l'
fi

# cat 用 bat（保留原 cat 为 \cat）
if command -v bat >/dev/null 2>&1 || command -v batcat >/dev/null 2>&1; then
    alias cat='bat --paging=never'
fi

# 默认编辑器用 micro（仅当存在）
if command -v micro >/dev/null 2>&1; then
    export EDITOR=micro
    export VISUAL=micro
fi

# ===== zoxide（替代 cd）=====
if command -v zoxide >/dev/null 2>&1; then
    eval "$(zoxide init bash)"
    # 用法：z foo  →  跳到含 "foo" 且最近常去的目录
fi

# ===== fzf 集成 =====
# Ctrl+R = 模糊搜索 history
# Ctrl+T = 模糊选文件
# Alt+C  = 模糊选目录 cd
if [ -f /usr/share/doc/fzf/examples/key-bindings.bash ]; then
    source /usr/share/doc/fzf/examples/key-bindings.bash
elif [ -f /usr/share/fzf/key-bindings.bash ]; then
    source /usr/share/fzf/key-bindings.bash
fi
if [ -f /usr/share/doc/fzf/examples/completion.bash ]; then
    source /usr/share/doc/fzf/examples/completion.bash
elif [ -f /usr/share/fzf/completion.bash ]; then
    source /usr/share/fzf/completion.bash
fi

# fzf 默认用 fd（更快 + 尊重 gitignore）
if command -v fdfind >/dev/null 2>&1; then
    export FZF_DEFAULT_COMMAND='fdfind --type f --hidden --follow --exclude .git'
elif command -v fd >/dev/null 2>&1; then
    export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
fi
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border --info=inline'
```

应用：`source ~/.bashrc`。

### 模板 B — `bat` 全局配置

```bash
mkdir -p ~/.config/bat
cat > ~/.config/bat/config <<'EOF'
# 主题
--theme="Monokai Extended"
# 显示行号
--style=numbers,changes,header
# 不分页（短输出直接显示）
--paging=never
# tab 4 空格
--tabs=4
# 显示文件名 header
--map-syntax='*.conf:INI'
--map-syntax='Dockerfile.*:Dockerfile'
EOF

# 主题列表
bat --list-themes | head
# 测试
bat ~/.bashrc
```

### 模板 C — `ripgrep` 全局配置

```bash
mkdir -p ~/.config/ripgrep
cat > ~/.config/ripgrep/config <<'EOF'
--max-columns=200
--max-columns-preview
--smart-case
--hidden
--glob=!.git/
--glob=!node_modules/
--glob=!.venv/
--glob=!__pycache__/
--colors=line:fg:yellow
--colors=line:style:bold
EOF

# 让 rg 找到这个配置
echo 'export RIPGREP_CONFIG_PATH=~/.config/ripgrep/config' >> ~/.bashrc
```

### 模板 D — `lsd` 全局配置

```bash
mkdir -p ~/.config/lsd
cat > ~/.config/lsd/config.yaml <<'EOF'
# 是否显示图标（终端要有 nerd font；纯 SSH 想保险就 'never'）
icons:
  when: auto
  theme: fancy
  separator: " "

# 列布局
layout: grid
date: relative          # "2 hours ago" 而不是绝对时间
sorting:
  column: name
  reverse: false
  dir-grouping: first   # 目录排前面

# 默认参数（不用每次手敲 -l）
# 等同 ls -lh --color=auto
EOF
```

> 没装 nerd font 的远程终端把 `icons.when` 改成 `never`，否则会看到一堆乱码方块。

### 模板 E — 工作流示例（这些工具一起用）

```bash
# 1. 用 fzf 选文件用 bat 预览
bat $(fzf --preview 'bat --color=always {}')

# 2. 用 rg 搜代码 + fzf 选行
rg --line-number . | fzf

# 3. 用 fd 找 PDF + bat-extras 文本搜索
fd '\.pdf$' | xargs -I{} pdftotext {} - | rg "搜索词"

# 4. zoxide + fzf 交互式选目录
zi                     # zi = zoxide interactive

# 5. 替代 watch
while true; do clear; lsd -la; sleep 2; done

# 6. fzf 选文件直接用 micro 打开
micro $(fzf --preview 'bat --color=always {}')
```

### 模板 F — `micro` 编辑器快捷键速查

`micro` 用的是 PC 用户熟悉的快捷键（不是 vim/emacs 的怪门派），打开就能用。

| 快捷键 | 作用 |
|---|---|
| **Ctrl+S** | 保存 |
| **Ctrl+Q** | 退出（未保存会提示） |
| **Ctrl+W** | 关闭当前 tab |
| **Ctrl+Z / Ctrl+Y** | 撤销 / 重做 |
| **Ctrl+C / Ctrl+V / Ctrl+X** | 复制 / 粘贴 / 剪切 |
| **Ctrl+F / Ctrl+N** | 查找 / 查找下一个 |
| **Ctrl+E** | 命令面板（输入 `> set ...` 改设置） |
| **Ctrl+G** | 帮助 |
| **Ctrl+T** | 新 tab；**Alt+,** / **Alt+.** 切换 tab |
| **Ctrl+B** | 调出终端面板（split） |
| **鼠标** | 完全支持点击 / 拖选 / 滚轮 |

#### 常用配置

```bash
mkdir -p ~/.config/micro
cat > ~/.config/micro/settings.json <<'EOF'
{
    "colorscheme": "monokai",
    "tabsize": 4,
    "tabstospaces": true,
    "autosave": 0,
    "softwrap": true,
    "wordwrap": true,
    "syntax": true,
    "ruler": true,
    "savecursor": true,
    "scrollbar": true,
    "mouse": true
}
EOF

# 主题列表（micro 内运行）
# Ctrl+E → 输入 set colorscheme <Tab>
```

#### 装插件

```bash
micro -plugin install editorconfig    # 项目级 .editorconfig 自动生效
micro -plugin install go              # Go 集成
micro -plugin install lsp             # LSP（实验）
micro -plugin install fzf             # fzf 文件 / 命令选取
micro -plugin available               # 看全部可用插件
```

## 关键参数调优速查

### `rg`（ripgrep）常用 flag

```bash
rg "pattern"                       # 默认搜当前目录
rg -i "PATTERN"                    # 忽略大小写
rg -w "word"                       # 全词匹配
rg -F "literal.string"             # 字面字符串（不当 regex）
rg -t py "pattern"                 # 仅搜 .py 文件
rg -T js "pattern"                 # 排除 .js
rg -g '!*.test.ts' "pattern"       # 排除测试文件
rg --hidden -uu "pattern"          # 含隐藏文件 + 不读 .gitignore
rg -A 3 -B 3 "pattern"             # 显示前后 3 行上下文
rg -l "pattern"                    # 仅文件名
rg --type-list                     # 看支持哪些 type
rg -c "pattern"                    # 统计每个文件命中数
rg --json "pattern"                # JSON 输出（脚本用）
```

### `fd` 常用 flag

```bash
fd 'pattern'                       # 当前目录递归搜
fd '\.py$'                         # 用 regex（默认）
fd -e py                           # 简化：按扩展名
fd -t f                            # 仅文件
fd -t d                            # 仅目录
fd -t l                            # 仅符号链接
fd -e log -X rm                    # 找 .log 然后 rm
fd -E node_modules                 # 排除目录
fd -H                              # 含隐藏
fd -I                              # 不读 .gitignore
fd -d 2                            # 仅深度 2 以内
fd '\.bak$' -X mv {} {.}.old       # 重命名
```

### `lsd` 常用 flag

```bash
lsd                                # 简单（彩色 + 图标）
lsd -la                            # 全部 + 详细
lsd -la --git                      # 加 git 状态列
lsd --tree --depth 2               # 树形 + 深度限制
lsd --total-size                   # 显示目录递归大小
lsd -la --sort=size --reverse      # 按大小降序
lsd -la --sort=time                # 按修改时间
lsd --icon=never                   # 终端无 nerd font 时关图标
```

### fzf 高级用法

```bash
# 多选（Tab 选）
fzf -m

# 预览面板（按文件类型）
ls | fzf --preview 'bat --color=always {} 2>/dev/null || ls -la {}'

# 历史命令搜索（替代 Ctrl+R 原生）
history | fzf

# git 分支切换
git branch | fzf | xargs git checkout

# kill 进程
ps aux | fzf -m | awk '{print $2}' | xargs kill -9
```

## 跨发行版兼容

| 工具 | Ubuntu 22+ | Debian 12 | RHEL 9 / Anolis 9 |
|---|---|---|---|
| bat | ✅（命令名 batcat） | ✅（命令名 batcat） | ✅（命令名 bat） |
| fd | ✅（命令名 fdfind） | ✅（命令名 fdfind） | ✅（命令名 fd） |
| ripgrep | ✅ | ✅ | ✅ |
| lsd | ✅ | ✅ | EPEL ✅ |
| zoxide | ✅ | ✅ | EPEL ✅ |
| fzf | ✅ | ✅ | EPEL ✅ |
| tldr | ✅（命令 tldr） | ✅ | EPEL（包名 `tealdeer`，命令 `tldr`） |
| micro | ✅ | ✅ | EPEL ✅ |

> RHEL / Anolis：以上工具大多走 EPEL，本 Playbook 已自动启用 EPEL 并把 `tldr` → `tealdeer` 翻译完成，无需手工调整。

EnvForge preflight 自动启用 EPEL，RHEL/Anolis 上以上工具都能装。

## 与其它 catalog 项的配合

- **`zsh-shell`** — Oh My Zsh 自带 `z` 插件，会与本组的 `zoxide` 冲突；推荐用 zoxide（更快）。在 `.zshrc` plugins 里去掉 `z`，再 `eval "$(zoxide init zsh)"`
- **`fish-shell`** — fish 自带历史搜索（输入字符直接过滤），fzf 价值变小但仍能用
- **`neovim-editor`** — Telescope 插件用 ripgrep 做后端，本 Playbook 装好后 Neovim 不用 cargo install ripgrep
- **`tmux-multiplex`** — fzf 在 tmux 内分屏面板里用得最爽
- **micro vs nano vs vim** — 本组 `micro` 专门给"不想学 vim 但又嫌 nano 简陋"的用户。如果服务器上要做高强度编辑还是上 `neovim-editor`

## 排错

### Ubuntu 上 `bat: command not found` 但已装

包名是 `bat` 但命令是 `batcat`（避免和 Perl 的 bat 冲突）。修：

```bash
alias bat='batcat'                                     # 加到 ~/.bashrc
# 或
sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
```

本 Playbook 已自动处理。

### `fd: command not found`（同上原因）

```bash
alias fd='fdfind'
# 或
sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd
```

### `lsd: command not found`（旧发行版 / EPEL 镜像缺包）

部分 EPEL 镜像（如阿里云 Anolis 同步源）不打 `lsd` 包；本 Playbook 已自动 fallback 到 GitHub release，但如果你想手工补：

```bash
# Ubuntu / Debian — 上游官方 deb：
LSD_VER=1.2.0
ARCH=$(dpkg --print-architecture)        # amd64 / arm64
curl -fsSLo /tmp/lsd.deb \
  https://github.com/lsd-rs/lsd/releases/download/v${LSD_VER}/lsd_${LSD_VER}_${ARCH}.deb
sudo dpkg -i /tmp/lsd.deb && rm -f /tmp/lsd.deb

# RHEL / Anolis — 上游不发 rpm，直接下静态 musl 二进制：
LSD_VER=1.2.0
TAR_ARCH=$(uname -m)                     # x86_64 / aarch64
curl -fsSL \
  https://github.com/lsd-rs/lsd/releases/download/v${LSD_VER}/lsd-v${LSD_VER}-${TAR_ARCH}-unknown-linux-musl.tar.gz \
  | tar -xz -C /tmp
sudo install -m 0755 /tmp/lsd-*/lsd /usr/local/bin/lsd
lsd --version
```

> 上游 `lsd-rs` 不打 `.rpm`——这是项目的发布策略，不是临时疏漏。所以 RHEL 系永远走 musl tarball 这条路。

### `lsd` 显示一堆方块 / 问号

终端没有 nerd font。两条路：

```bash
# 1) 关闭图标（推荐：远程 SSH 时）
echo 'icons:\n  when: never' >> ~/.config/lsd/config.yaml

# 2) 装 nerd font（本地终端，比如 iTerm2 / Windows Terminal）
# https://www.nerdfonts.com/font-downloads
# 装完 → 终端 settings → font 选 "FiraCode Nerd Font" 等
```

### `zoxide` 装好但 `z foo` 不工作

`eval "$(zoxide init bash)"` 没加到 `~/.bashrc`：

```bash
echo 'eval "$(zoxide init bash)"' >> ~/.bashrc
source ~/.bashrc

# zoxide 需要先访问过几次目录才能 z foo
cd /var/log
cd /etc/nginx
cd ~
z log     # 此时能跳回 /var/log
```

### `fzf` Ctrl+R 不工作

Bindings 没加载：

```bash
# Ubuntu / Debian
source /usr/share/doc/fzf/examples/key-bindings.bash

# RHEL / EPEL
source /usr/share/fzf/shell/key-bindings.bash

# 加到 ~/.bashrc 永久生效
```

### `tldr` 报 `cache miss`

第一次需要更新缓存：

```bash
tldr --update
```

国内服务器从 `tldr.sh` CDN 拉缓存可能慢，但缓存只有几 MB，等一次就行。

### `micro` 在终端里 Ctrl+S 没反应

某些终端 emulator 把 `Ctrl+S` 当作 XOFF（停止流），导致 micro 收不到。修：

```bash
# 加到 ~/.bashrc
stty -ixon
source ~/.bashrc
```

或在 micro 里按 `Ctrl+E` 然后输入 `> save`。

### `rg` 比 `grep` 慢（罕见）

通常是某些 binary 文件被错误识别。强制：

```bash
rg --binary "pattern"          # 显式搜 binary
rg -uuu "pattern"              # 三个 -u = 不读任何 ignore，搜所有
```

## 验证

```bash
# 1. 命令可用
command -v bat batcat fd fdfind rg lsd zoxide fzf tldr micro

# 2. 简单试用
echo 'fn main() { println!("hi"); }' | bat -l rust
fd --version
rg --version
lsd --version
zoxide --version
fzf --version
micro --version
tldr --update && tldr tar | head
```

## 多次运行

`installMode: skip-existing`。包安装幂等。重跑不会覆盖 `~/.config/bat/config` 等用户配置（Playbook 不写这些文件，模板只在 md 里给）。

## ⚠️ 敏感性

**safe** — 都是 CLI 工具，只读不写系统。`micro` 会改文件，但只有用户主动保存时才动。

## 隐私说明

- 全部不发遥测
- `tldr` 第一次运行时从 `tldr.sh` 拉缓存（公开 markdown 文件）
- `zoxide` 把你访问过的目录路径存在 `~/.local/share/zoxide/db.zo`（本地、不上传）
- `fzf` history 集成会显示你的 shell history——里面如果有过密码 / token 不会因为本工具增加暴露面
- `bat` / `lsd` 的 git 状态显示需读 `.git/`，不发送到任何地方
- `micro` 装插件时会从官方插件源（`github.com/micro-editor`）拉脚本，自己审一下再用
