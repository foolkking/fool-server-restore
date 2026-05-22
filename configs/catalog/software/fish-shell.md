# Fish Shell + Starship

Fish 是新一代 shell——开箱即用的智能补全、语法高亮、历史搜索，零配置就有现代体验。
配 Starship 跨 shell 提示符（zsh / bash / fish 都能用），漂亮且快。

## 你将得到什么

- 📦 **fish**
- 📦 **starship**（跨 shell 提示符工具）

## 用法

### 切换默认 shell

```bash
chsh -s $(which fish)
```

### 试试 fish 的杀手级特性

```bash
# 输入命令时，fish 自动用历史 + 文件系统建议补全（灰色文字）
git clone <Tab>             # 补全 git clone 子命令 + 选项

# 命令对错实时变色：错的红，对的绿
git statu                   # statu 红色（命令不存在）
git status                  # 绿色

# 历史搜索：直接打字就过滤
↑                           # 反向搜索（无需 Ctrl+R）
```

### Fish 配置

`~/.config/fish/config.fish`：
```fish
# 关闭欢迎消息
set fish_greeting

# 别名
alias ll='ls -lah'
alias gst='git status'

# 启用 starship
starship init fish | source

# 加 PATH
fish_add_path $HOME/.local/bin
```

### Starship 配置

`~/.config/starship.toml`：
```toml
# 极简模式
add_newline = false
[character]
success_symbol = "[➜](green)"
error_symbol = "[➜](red)"

[git_branch]
symbol = "🌱 "

[git_status]
conflicted = "🏳"
ahead = "⇡${count}"
behind = "⇣${count}"
```

更多预设主题：https://starship.rs/presets/

### Fisher（fish 包管理器）

```bash
curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher

fisher install PatrickF1/fzf.fish        # fzf 集成
fisher install jorgebucaran/autopair.fish  # 自动补全引号/括号
```

### Bash 兼容

Fish **不是** POSIX shell——bash 脚本在 fish 里跑可能不工作。建议：
- 写脚本：`#!/bin/bash` shebang，明确用 bash
- 交互式 shell 用 fish
- ssh 远程命令时考虑加 `bash -c '...'` 强制 bash

## ⚠️ 敏感性

**safe** — 但 chsh 改默认 shell 后，依赖系统脚本登录的工具（如某些 cron）可能因 fish 不兼容
而出问题。建议**只给个人账号改默认 shell**，root 保持 bash。

## 验证

```bash
fish --version
starship --version
```

## 排错

- **chsh 失败 "shell not authorized"** — `/etc/shells` 没列 fish。`echo $(which fish) | sudo tee -a /etc/shells`。
- **starship 不工作** — fish/zsh/bash 配置里没 `starship init` 那行。
- **跨发行版**：`fish` 在 Ubuntu/Debian 默认仓库；RHEL 上需要 EPEL（preflight 启用）。`starship` 不在所有发行版仓库，可能要从 cargo 装：`cargo install starship`。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

Fish 和 Starship 默认不发遥测。
