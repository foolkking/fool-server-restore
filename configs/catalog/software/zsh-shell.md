# Zsh + Oh My Zsh

Zsh 是更智能的 shell——比 Bash 强大的 tab 补全 / 主题 / 插件。Oh My Zsh 是 Zsh 的"框架"，提供主题和插件管理。macOS 默认 shell。本 Playbook 装 zsh + Oh My Zsh + 推荐的 4 个核心插件，并将 `~/.zshrc` 配为开箱可用。

## 你将得到什么

- 📦 **zsh**（系统包）
- ✅ Oh My Zsh 装到 `~/.oh-my-zsh`
- ✅ 4 个核心插件克隆到 `~/.oh-my-zsh/custom/plugins/`：
    - `zsh-autosuggestions` — 输入时灰字建议（按 → 接受）
    - `zsh-syntax-highlighting` — 实时上色（红 = 错，绿 = 对）
    - `zsh-completions` — 增强补全
    - `you-should-use` — 提醒"这条命令你已设过 alias"
- ✅ `~/.zshrc` 模板（默认 robbyrussell 主题，git/sudo/z/colored-man-pages/extract 插件）
- ⚠️ 本 Playbook **不会** `chsh -s zsh`（避免破坏远程登录）——需手动切

## 表单字段说明

### `make_default` — 是否切换为默认 shell

打开后跑 `chsh -s $(which zsh) <user>`。建议**仅普通用户**开启，**root 保持 bash**（系统脚本依赖）。

### `theme` — 主题

| 值 | 特点 |
|---|---|
| `robbyrussell`（默认） | 极简，启动快 |
| `agnoster` | Powerline 风格，需 powerline 字体 |
| `bira` | 多行 prompt，git 信息完整 |
| `powerlevel10k` | **最流行**，需手动从 GitHub clone（不在 OMZ 自带主题里），首次跑 `p10k configure` |

## 配置文件 / 目录速查

```
~/.oh-my-zsh/                              # OMZ 主目录（git 仓库）
├── oh-my-zsh.sh                           # 加载入口（被 .zshrc source）
├── plugins/                               # 自带插件（不要改）
├── themes/                                # 自带主题（不要改）
├── tools/                                 # uninstall 脚本
└── custom/                                # ← 用户自定义放这里
    ├── plugins/                           # 第三方插件
    │   ├── zsh-autosuggestions/
    │   └── zsh-syntax-highlighting/
    ├── themes/                            # 第三方主题
    │   └── powerlevel10k/
    └── *.zsh                              # 自定义 alias / function（自动加载）

~/.zshrc                                   # 用户配置入口（最重要）
~/.zsh_history                             # 命令历史
~/.p10k.zsh                                # powerlevel10k 配置（运行 p10k configure 后生成）

# 系统级
/etc/zsh/                                  # zsh 系统配置
/etc/shells                                # 允许的 shell 列表（chsh 用）
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `zsh` 包 | 默认仓库 | 默认仓库 |
| OMZ 安装 | 用户级 git 克隆 | 相同 |
| 默认 shell 切换 | `chsh -s $(which zsh)` | 相同；`/etc/shells` 必须含 zsh |

## 常见配置模板

### 模板 A — 推荐 `~/.zshrc`（核心配置）

```bash
# ~/.zshrc
export ZSH="$HOME/.oh-my-zsh"

# 主题
ZSH_THEME="robbyrussell"
# ZSH_THEME="powerlevel10k/powerlevel10k"      # 用 p10k 时启用

# 插件（顺序很重要：syntax-highlighting 必须最后）
plugins=(
    git                                          # OMZ 自带：git 别名 + branch 显示
    sudo                                         # OMZ 自带：双 Esc 自动 prepend sudo
    z                                            # OMZ 自带：cd 历史跳转（与 zoxide 二选一）
    extract                                      # OMZ 自带：x file.tar.gz 自动选解压命令
    colored-man-pages                            # OMZ 自带：man 页彩色
    command-not-found                            # OMZ 自带：命令拼错时建议
    you-should-use                               # 第三方：提醒已设的 alias
    zsh-autosuggestions                          # 第三方：灰字建议（必装）
    zsh-completions                              # 第三方：补全增强
    zsh-syntax-highlighting                      # 第三方：实时着色（必须最后！）
)

source $ZSH/oh-my-zsh.sh

# History
HISTSIZE=50000
SAVEHIST=50000
HISTFILE=~/.zsh_history
setopt HIST_IGNORE_DUPS                          # 不重复连续相同命令
setopt HIST_IGNORE_SPACE                         # 空格开头不入历史（写敏感命令时）
setopt HIST_REDUCE_BLANKS                        # 整理多余空格
setopt SHARE_HISTORY                             # 多窗口共享历史
setopt EXTENDED_HISTORY                          # 含时间戳

# 补全
zstyle ':completion:*' menu select               # tab 后再 tab 高亮选择
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'   # 大小写不敏感

# Locale（解决某些 RHEL 系上 Unicode 乱码）
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Editor
export EDITOR='vim'

# Aliases
alias ll='ls -lah'
alias gst='git status'
alias gco='git checkout'
alias gp='git pull'

# tools 集成（如装了 catalog 里的 rust-cli-tools）
[ -x "$(command -v zoxide)" ] && eval "$(zoxide init zsh)"
[ -x "$(command -v starship)" ] && eval "$(starship init zsh)"
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
[ -d "$HOME/.cargo" ] && source "$HOME/.cargo/env"

# powerlevel10k 配置（如启用）
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
```

### 模板 B — 装 Powerlevel10k（最流行的主题）

```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git \
    ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k

# 改 ~/.zshrc
sed -i 's/ZSH_THEME="robbyrussell"/ZSH_THEME="powerlevel10k\/powerlevel10k"/' ~/.zshrc

# 重开 zsh 后跑配置向导
exec zsh
p10k configure         # 一步步选样式
```

需要 [Nerd Font](https://www.nerdfonts.com/font-downloads)（推荐 MesloLGS NF）才能正确显示图标——本机终端字体也要换。

### 模板 C — 自定义 alias / function 不改 .zshrc

`~/.oh-my-zsh/custom/*.zsh` 文件会被 OMZ 自动加载：

```bash
mkdir -p ~/.oh-my-zsh/custom

cat > ~/.oh-my-zsh/custom/aliases.zsh <<'EOF'
# 我的别名
alias k='kubectl'
alias d='docker'
alias dc='docker compose'
alias mux='tmuxinator'

# 常用 ssh 主机（结合 ssh config）
alias ssh-prod='ssh prod-bastion'
alias ssh-stg='ssh staging-bastion'
EOF

cat > ~/.oh-my-zsh/custom/functions.zsh <<'EOF'
# 创建目录后立即 cd
mkcd() { mkdir -p "$1" && cd "$1"; }

# 解压万能函数
extract() {
    case "$1" in
        *.tar.gz|*.tgz)  tar xzf "$1" ;;
        *.tar.bz2|*.tbz) tar xjf "$1" ;;
        *.zip)           unzip "$1" ;;
        *.rar)           unrar x "$1" ;;
        *)               echo "Unknown archive: $1" ;;
    esac
}
EOF
```

### 模板 D — 多机器同步配置（用 git）

```bash
# 把 ~/.zshrc + ~/.oh-my-zsh/custom/ 放到 git 仓库
mkdir -p ~/dotfiles
cd ~/dotfiles
git init

# 软链
ln -s ~/dotfiles/zshrc ~/.zshrc
ln -s ~/dotfiles/zsh-custom ~/.oh-my-zsh/custom

git add .
git commit -m "init dotfiles"
git remote add origin git@github.com:me/dotfiles.git
git push -u origin main

# 新机器
git clone git@github.com:me/dotfiles.git ~/dotfiles
ln -s ~/dotfiles/zshrc ~/.zshrc
ln -s ~/dotfiles/zsh-custom ~/.oh-my-zsh/custom
```

## 关键参数调优速查

### 启动速度

OMZ + 多插件容易让 zsh 启动慢（500ms-1s）。优化：

```bash
# 看启动耗时
zsh -i -c 'zprof' | head -20      # 需 ~/.zshrc 顶部加 zmodload zsh/zprof

# 减少插件数量（最有效）
plugins=(git sudo)               # 极简版

# 用 zinit 替代 OMZ（懒加载，启动快 5×）
# https://github.com/zdharma-continuum/zinit

# 缓存补全
autoload -Uz compinit
if [[ -n ~/.zcompdump(#qN.mh+24) ]]; then
    compinit                      # 24 小时刷新一次
else
    compinit -C
fi
```

### 历史搜索绑定

```bash
# 原生：Ctrl+R = bck-i-search（弱）
# 推荐：用 fzf
[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ] && source /usr/share/doc/fzf/examples/key-bindings.zsh

# 或装 zsh-history-substring-search
git clone https://github.com/zsh-users/zsh-history-substring-search ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-history-substring-search
# plugins+=(zsh-history-substring-search)
# bindkey '^[[A' history-substring-search-up
# bindkey '^[[B' history-substring-search-down
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `zsh` 包 | 默认仓库 | 默认仓库 |
| `git`（OMZ 安装依赖） | 默认 | 默认 |
| `curl`（OMZ install.sh 用） | 默认 | 默认 |
| `chsh` | 默认（passwd 包） | 默认（util-linux-user 包，RHEL 9 需手动 `dnf install util-linux-user`） |
| `/etc/shells` 含 zsh | 自动 | 自动 |

**RHEL/Anolis 9 注**：`chsh` 不在默认安装里，需 `sudo dnf install util-linux-user`。本 Playbook 自动处理。

## 与其它 catalog 项的配合

- **`fish-shell`** — 装两个互斥：默认 shell 只能一个
- **`rust-cli-tools`** — zsh + zoxide + fzf 是经典组合，注意 OMZ 自带 `z` 插件与 zoxide 冲突，二选一
- **`tmux-multiplex`** — tmux 启动 shell 时按 `~/.zshrc` 加载，配置一次到处用
- **`nodejs-version-mgr`** / **`pyenv-toolchain`** — nvm / pyenv 默认只改 `.bashrc`，需手动加到 `.zshrc`：
    ```bash
    # 加到 ~/.zshrc 末尾
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    export PYENV_ROOT="$HOME/.pyenv"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init -)"
    ```

## 排错

### `chsh: ... is not in /etc/shells`

```bash
# Ubuntu/Debian — 通常已含
echo $(which zsh) | sudo tee -a /etc/shells

# RHEL/Anolis — 手动加
which zsh                         # /usr/bin/zsh
echo "/usr/bin/zsh" | sudo tee -a /etc/shells

# 然后
chsh -s $(which zsh)
```

### Oh My Zsh 安装脚本失败 `curl: (7) Failed to connect to raw.githubusercontent.com`

国内服务器到 raw.githubusercontent.com 偶发 GFW。手动 git clone：

```bash
git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git ~/.oh-my-zsh
cp ~/.oh-my-zsh/templates/zshrc.zsh-template ~/.zshrc

# 国内镜像
git clone --depth=1 https://gitee.com/mirrors/oh-my-zsh.git ~/.oh-my-zsh
```

### 切了 zsh 后 SSH 登录卡 1 秒

`~/.zshrc` 加载慢。看哪些插件慢：

```bash
# ~/.zshrc 第一行加
zmodload zsh/zprof
# 末尾加
zprof | head -20

zsh -i -c exit
```

按耗时排序后剔除最慢的插件。

### 切了 zsh 后某些命令找不到

PATH 没继承。zsh 启动文件链：

```
/etc/zsh/zshenv         # 所有 shell（系统）
~/.zshenv               # 所有 shell（用户）—— PATH 推荐写这里
/etc/zsh/zprofile       # 仅 login shell
~/.zprofile             # 仅 login shell
/etc/zsh/zshrc          # 仅 interactive
~/.zshrc                # 仅 interactive
/etc/zsh/zlogin         # 仅 login + interactive
~/.zlogin               # 同
```

systemd 服务里跑命令属于非交互非登录——**`.zshrc` 不会被加载**。把 PATH 改写到 `.zshenv` 或 systemd unit Environment。

### 颜色乱 / 图标变方块

终端字体不支持 powerline 字符。下载 [MesloLGS NF](https://github.com/romkatv/powerlevel10k#manual-font-installation)，本机终端设置该字体。

### `zsh: command not found: <alias>` 但 alias 已设

OMZ 加载顺序：`source $ZSH/oh-my-zsh.sh` 之**后**才执行你写的 alias 才生效。检查 `~/.zshrc` 里 alias 在 source 之后。

### 自动补全慢

```bash
# 关用不上的插件（特别是 npm / docker / kubectl 这种补全数据巨多的）
plugins=(git sudo)
```

或换 zinit 用 turbo mode 异步加载。

## 验证

```bash
# 1. zsh 已装
zsh --version

# 2. /etc/shells 含 zsh
grep zsh /etc/shells

# 3. OMZ 已装
ls ~/.oh-my-zsh/oh-my-zsh.sh

# 4. 进入 zsh（如果还没切默认）
zsh -i -c 'echo $ZSH'           # 应输出 ~/.oh-my-zsh

# 5. 主题 / 插件加载（看 prompt）
zsh -i -c 'echo $ZSH_THEME && echo ${plugins[@]}'
```

## 多次运行

`installMode: skip-existing`。zsh 包安装幂等，OMZ 安装有 `creates: ~/.oh-my-zsh/oh-my-zsh.sh` 守卫——已装跳过。`~/.zshrc` 第一次安装时由 Playbook 写入；**重跑不会覆盖**用户已修改的 `.zshrc`（Playbook 检测文件存在就跳过）。

要重置 `.zshrc`：

```bash
mv ~/.zshrc ~/.zshrc.bak
cp ~/.oh-my-zsh/templates/zshrc.zsh-template ~/.zshrc
```

## ⚠️ 敏感性

**safe** — 装 shell 工具，不影响业务。但 `chsh -s` 改默认 shell 后：

- 系统脚本（cron / systemd / login script）用 sh（dash / bash），**不**用 zsh，所以不影响
- 但用户登录后某些工具假设 bash 行为可能略有差异（`source` / `[[ ]]` 等基本一致）

## 隐私说明

- zsh / Oh My Zsh 不发遥测
- OMZ 默认每周自动检查更新（`omz update`），会对 `github.com` 发请求
- 关自动更新：`~/.zshrc` 加 `zstyle ':omz:update' mode disabled`
- `~/.zsh_history` 保存所有命令——含密码 / API token 时其它有 root 的人能看到
- `setopt HIST_IGNORE_SPACE`（已配置）：以空格开头的命令不入历史（用来写敏感命令）
