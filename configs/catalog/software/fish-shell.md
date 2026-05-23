# Fish Shell + Starship

Fish 是新一代 shell——**零配置开箱有现代体验**：智能补全（含历史 + 文件系统）、语法高亮、历史搜索、man page 解析自动补全选项。Starship 是跨 shell 提示符工具（fish/bash/zsh 共用），漂亮且快。

> **重要**：Fish **不是** POSIX 兼容 shell——`bash` 脚本在 fish 里跑会出语法错误。**生产建议**：交互式 shell 用 fish，所有脚本写 `#!/bin/bash` shebang，明确用 bash。

## 你将得到什么

- 📦 **fish**（fish 3.x，开箱即用）
- 📦 **starship**（cross-shell prompt）
- ✅ `~/.config/fish/config.fish` 模板（关欢迎信息、加 starship、常用 alias）
- ✅ `~/.config/starship.toml` 推荐预设
- ⚠️ 本 Playbook **不会** `chsh -s fish` —— 需手动切（见下）

## 表单字段说明

### `make_default` — 是否切为默认 shell

打开后跑 `chsh -s $(which fish) <user>`。**警告**：

- 一些脚本默认 bash 行为会出错（`source ./env.sh`、`export FOO=bar` 在 fish 里语法不同）
- root 强烈建议保持 bash（系统脚本 / cron / 救援场景）
- 推荐**仅普通开发账号**切 fish

### `starship_preset` — Starship 预设

| 值 | 适用 |
|---|---|
| `default` | 简单清爽 |
| `nerd-font` | 需要 Nerd Font，图标多 |
| `pastel-powerline` | Powerline 风格 |
| `tokyo-night` | 简洁 dark theme |

预设官方列表：https://starship.rs/presets/

## 配置文件 / 目录速查

```
# Fish
~/.config/fish/
├── config.fish                       # ← 主配置（每次启动 fish 跑）
├── functions/                        # ← 自定义函数（每个文件一个函数，自动加载）
│   ├── ll.fish
│   └── proxy_on.fish
├── completions/                      # 自定义补全
├── conf.d/                           # 自动加载的子配置
└── fish_variables                    # 通用变量持久化（fisher install 后写这里）

# Fisher（fish 包管理器）
~/.config/fish/fish_plugins           # 装的插件列表
~/.local/share/omf/                   # （如用 oh-my-fish 替代 fisher）

# Starship（共用，跨 shell）
~/.config/starship.toml               # 提示符配置

# 系统
/etc/fish/config.fish                 # 系统级
/etc/shells                           # 必须含 fish 路径
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `fish` 包 | 默认仓库 | EPEL（preflight 启用） |
| `starship` 包 | Ubuntu 24+ 默认；老版从 GitHub release 装 | EPEL（preflight 启用） |
| 二进制位置 | `/usr/bin/fish` | `/usr/bin/fish` |

## 常见配置模板

### 模板 A — 推荐 `~/.config/fish/config.fish`

```fish
# 关闭欢迎消息
set -g fish_greeting

# Starship prompt
if type -q starship
    starship init fish | source
end

# Editor
set -gx EDITOR vim
set -gx VISUAL vim

# Locale
set -gx LANG en_US.UTF-8
set -gx LC_ALL en_US.UTF-8

# History（fish 自动）
# fish 不需要 HISTSIZE—— 默认 256000，且按时间衰减

# PATH（fish 用 fish_add_path 而非 export PATH）
fish_add_path $HOME/.local/bin
fish_add_path $HOME/.cargo/bin
fish_add_path /usr/local/go/bin

# Aliases
alias ll='ls -lah'
alias la='ls -la'
alias gst='git status'
alias gco='git checkout'
alias gp='git pull'

# Tools 集成
type -q zoxide && zoxide init fish | source
type -q fzf && fzf --fish | source              # fzf 0.48+
type -q kubectl && kubectl completion fish | source
```

### 模板 B — 推荐 `~/.config/starship.toml`

```toml
# 极简模式
add_newline = false

format = """
$username\
$hostname\
$directory\
$git_branch\
$git_status\
$cmd_duration\
$line_break\
$character"""

[character]
success_symbol = "[➜](bold green)"
error_symbol = "[✗](bold red)"
vimcmd_symbol = "[N](bold green)"

[directory]
truncation_length = 3
truncate_to_repo = false
style = "bold cyan"

[git_branch]
symbol = " "
style = "bold magenta"

[git_status]
conflicted = "⚔️ "
ahead = "🏎️ ${count}"
behind = "🐌 ${count}"
diverged = "🔱 ${count_ahead}/${count_behind}"
modified = "📝${count}"
staged = "[+${count}](green)"
untracked = "🤷 ${count}"
stashed = "📦"
deleted = "🗑️ ${count}"

[cmd_duration]
min_time = 2_000
format = "took [$duration](bold yellow)"

[python]
symbol = "🐍 "
format = '[${symbol}${pyenv_prefix}(${version})(\($virtualenv\))]($style) '

[nodejs]
symbol = "⬢ "

[rust]
symbol = "🦀 "

[golang]
symbol = "🐹 "

[docker_context]
symbol = "🐳 "
format = "via [${symbol}$context](blue bold) "
```

应用：`exec fish` 或重开终端。

### 模板 C — Fisher（fish 包管理器）+ 推荐插件

```fish
# 装 fisher（一次性）
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher

# 推荐插件
fisher install jorgebucaran/autopair.fish        # 自动补全引号 / 括号
fisher install patrickf1/fzf.fish                # fzf 快捷键集成
fisher install jorgebucaran/nvm.fish             # nvm 兼容（fish 原生不支持 nvm）
fisher install gazorby/fish-abbreviation-tips    # 提示已设的 abbr
fisher install meaningful-ooo/sponge             # 自动清理失败命令的历史

# 看装了什么
fisher list

# 升级所有
fisher update
```

### 模板 D — Fish 自定义函数（不用 alias 用 function）

```fish
# ~/.config/fish/functions/mkcd.fish
function mkcd --description 'Create dir and cd into it'
    mkdir -p $argv[1] && cd $argv[1]
end

# ~/.config/fish/functions/proxy_on.fish
function proxy_on --description 'Enable HTTP proxy'
    set -gx http_proxy http://127.0.0.1:7890
    set -gx https_proxy http://127.0.0.1:7890
    set -gx all_proxy socks5://127.0.0.1:7890
    echo "Proxy enabled"
end

function proxy_off --description 'Disable HTTP proxy'
    set -e http_proxy
    set -e https_proxy
    set -e all_proxy
    echo "Proxy disabled"
end
```

无需 source——fish 启动自动扫描 `~/.config/fish/functions/`。

### 模板 E — 缩写（abbr，比 alias 更智能）

```fish
# 在 fish shell 里运行（持久化）
abbr -a g git
abbr -a gst 'git status'
abbr -a gp 'git pull'
abbr -a dco 'docker compose'
abbr -a k 'kubectl'

# 看所有
abbr -l
```

abbr 在你按空格 / Enter 时**展开成完整命令**——比 alias 直观（看到的是真实命令）。

## 关键参数调优速查

### 启动速度

```fish
# 看启动耗时
time fish -i -c exit                  # 应 < 200ms

# 慢的话查谁慢
fish --profile-startup /tmp/fish.prof -i -c exit
sort -k2 -n -r /tmp/fish.prof | head
```

主要慢源：starship（极快）/ fisher 插件（按需禁用）/ shell hook（zoxide / nvm）。

### Bash 兼容性陷阱速查

```fish
# 错误：fish 不支持 export
export FOO=bar              # ❌
# 正确：
set -gx FOO bar             # ✅ -g 全局，-x 导出环境

# 错误：bash 风格 if
if [ "$x" = "1" ]; then     # ❌
# 正确：
if test "$x" = "1"          # ✅
    # ...
end

# 错误：source bash 脚本
source ~/.bashrc            # ❌（语法错误）
# 解决：bass 插件
fisher install edc/bass
bass source ~/.nvm/nvm.sh   # ✅

# 错误：$() 命令替换语法（fish 用括号）
echo $(date)                # ❌
# 正确：
echo (date)                 # ✅
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 | Alpine |
|---|---|---|---|
| `fish` | 默认仓库（Ubuntu 22+） | EPEL ✅ | apk fish |
| `starship` | Ubuntu 24+ 默认；老版本用 install.sh | EPEL ✅ | apk starship |
| `fisher` 装包 | 用户级，全平台一致 | 同 | 同 |

EnvForge preflight 自动启 EPEL，RHEL/Anolis 9 装 fish + starship 无需额外步骤。

## 与其它 catalog 项的配合

- **`zsh-shell`** — 与本 Playbook 互斥：默认 shell 只能一个
- **`rust-cli-tools`** — 模板 A 已集成 zoxide / fzf；fish 自带交互式历史搜索（直接打字过滤），fzf 价值降低但仍能用
- **`tmux-multiplex`** — tmux 启动时按 `~/.config/fish/config.fish` 加载
- **`nodejs-version-mgr`** — fish 不支持 nvm（bash/zsh 才支持）；用 `fisher install jorgebucaran/nvm.fish` 替代，或用 fnm（兼容 fish）

## 排错

### `chsh: shell not authorized`

`/etc/shells` 没含 fish 路径：

```bash
which fish                            # /usr/bin/fish
echo "/usr/bin/fish" | sudo tee -a /etc/shells
chsh -s /usr/bin/fish
```

### SSH 登录卡 1 秒

`config.fish` 加载慢：

```fish
fish --profile-startup /tmp/p -i -c exit
sort -k2 -n -r /tmp/p | head
```

通常 starship + 几个慢插件叠加。临时回退：`mv ~/.config/fish/config.fish ~/.config/fish/config.fish.bak`。

### `bass: command not found`

bass 是 fish 的 bash 兼容层（用来 source 现有 bash 脚本如 nvm.sh）：

```fish
fisher install edc/bass
bass source ~/.nvm/nvm.sh
```

### nvm 在 fish 里不工作

nvm 不支持 fish。解决方案：

```fish
# 方案 1：用 nvm.fish 插件（推荐）
fisher install jorgebucaran/nvm.fish
nvm install 22

# 方案 2：fnm（rust 重写，原生支持 fish）
curl -fsSL https://fnm.vercel.app/install | bash
# 加到 config.fish
fnm env --use-on-cd | source
```

### Tab 补全在某些命令上不工作

fish 解析命令的 man page 自动生成补全。用了发行版没装 man page 的命令：

```bash
sudo apt-get install <pkg>-doc        # 装 man page
fish_update_completions               # 重生成
```

### Starship 显示乱码 / 方块

终端字体不含 powerline 字符。装 [Nerd Font](https://www.nerdfonts.com/font-downloads)：

```bash
# 推荐 MesloLGS NF / FiraCode Nerd Font / JetBrainsMono Nerd Font
# 把字体装到本机后，终端模拟器（iTerm2 / Windows Terminal / WezTerm）选该字体
```

服务器端只看输出文字时（如 SSH 客户端是字符终端），把 starship.toml 改极简模式（不用图标）：

```toml
format = '$directory $git_branch $character'
```

### 切到 fish 后某些 export 没了

bash 用 `export` 写 PATH 等环境，fish 不识别。改写：

```fish
# 在 ~/.config/fish/config.fish
set -gx PATH /usr/local/bin /usr/bin /bin $HOME/.local/bin
fish_add_path $HOME/.cargo/bin       # 推荐方式（去重 + 持久化）
```

或用 fenv 插件读 bash export：

```fish
fisher install oh-my-fish/plugin-foreign-env
fenv source ~/.bash_profile
```

## 验证

```bash
# 1. fish 装好
fish --version

# 2. starship 装好
starship --version

# 3. /etc/shells 含 fish
grep fish /etc/shells

# 4. 启动测试
fish -i -c 'echo Fish OK; status'

# 5. starship init 工作
fish -c 'starship init fish | source; echo Starship OK'
```

## 多次运行

`installMode: skip-existing`。包安装幂等。`~/.config/fish/config.fish` 第一次写入；重跑**不**覆盖（避免毁了用户定制）。要重置：

```bash
rm ~/.config/fish/config.fish
# 然后重跑 Playbook 或手动复制模板 A
```

## ⚠️ 敏感性

**review** — 装 shell 工具本身 safe。但 `chsh -s fish` 改默认 shell 后：

- 远程登录后所有交互命令在 fish 里跑——**你的 bash 脚本 / cron / systemd 不受影响**（这些跑在 sh/bash）
- 但你登录后手敲的脚本如果是 bash 语法会失败——`source` `export` 等
- root 改成 fish 风险较大（救援场景脚本可能假设 bash），强烈建议 root 保持 bash

## 隐私说明

- fish / starship 不发遥测
- fish 历史在 `~/.local/share/fish/fish_history`（明文 yaml-like）
- starship 的 git 状态调用本地 git，不发送到任何地方
- fisher 装插件时从 GitHub 拉取，请求会被 GitHub 看到（含插件名，不含个人信息）
