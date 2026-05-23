# tmux 终端复用器

tmux 让一个 SSH 连接里**同时跑多个终端会话**——还能 detach 后让会话继续在后台跑（断 SSH 也不杀进程）。**远程服务器工作的必备工具**：本机断网 / 关电脑 / 切咖啡店都不会丢失正在跑的命令。

## 你将得到什么

- 📦 **tmux**（系统仓库版本）
- ✅ 推荐 `~/.tmux.conf` 模板（鼠标支持 / Ctrl+a 前缀 / 大历史缓冲）
- ✅ 一份"30 秒上手"快捷键速记

## 配置文件 / 目录速查

```
# 用户级
~/.tmux.conf                      # ← 主配置
~/.config/tmux/tmux.conf          # ← 替代位置（XDG）
~/.tmux/                          # 插件目录（如 TPM 装这里）
└── plugins/

# 系统级
/etc/tmux.conf                    # 系统默认（一般不存在）

# 运行时（不要改）
/tmp/tmux-1000/                   # socket（per-user，1000 = uid）
└── default                       # 默认 socket 文件
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `tmux` | `tmux` |
| 默认仓库版本 | Ubuntu 22 = 3.2，Ubuntu 24 = 3.4，Debian 12 = 3.3 | RHEL 9 / Anolis 9 = 3.2 |
| 二进制路径 | `/usr/bin/tmux` | `/usr/bin/tmux` |
| 配置语法 | tmux 3.x 一致 | 相同 |

## 30 秒上手速查

### 启动 / 恢复

| 命令 | 作用 |
|---|---|
| `tmux` | 启动新会话（默认名 0/1/2...） |
| `tmux new -s mywork` | 启动并命名 mywork |
| `tmux ls` | 列出现有会话 |
| `tmux attach` / `tmux a` | 接到上次的 |
| `tmux a -t mywork` | 接到指定会话 |
| `tmux kill-session -t mywork` | 杀某会话 |
| `tmux kill-server` | 杀所有 |

### Detach（最重要）

`Ctrl+b` 然后按 `d` —— 离开但会话**继续在后台跑**。SSH 断了不会杀掉会话。下次 ssh 进来 `tmux a` 接回。

### 窗口（windows，类似浏览器 tab）

`Ctrl+b` 然后：

| Key | 作用 |
|---|---|
| `c` | 创建新窗口 |
| `n` / `p` | 下/上一个 |
| `0-9` | 跳转到第 N 个 |
| `,` | 重命名当前 |
| `&` | 关闭当前 |
| `w` | 列表选窗口 |

### 分屏（panes）

`Ctrl+b` 然后：

| Key | 作用 |
|---|---|
| `%` | 左右分屏 |
| `"` | 上下分屏 |
| `←↑↓→` | pane 间切换 |
| `o` | 顺序切换 pane |
| `x` | 关闭当前 pane |
| `z` | 当前 pane 全屏 / 还原（**最常用**） |
| `空格` | 循环切布局 |
| `{` / `}` | 当前 pane 与左/右 pane 互换 |
| `;` | 跳到上次的 pane |

### 滚动查看历史

`Ctrl+b` 然后 `[` —— 进 copy 模式，方向键 / PgUp/PgDn 翻历史 / `q` 退出。

### Copy 模式（复制粘贴）

```
Ctrl+b [           # 进 copy 模式
方向键移动光标
空格               # 开始选择
回车               # 复制选中
Ctrl+b ]           # 粘贴
```

vim 风格选择（推荐）：把模板 A 的 `setw -g mode-keys vi` 写到配置后，可用 `v`（开始选）+ `y`（yank）。

## 常见配置模板

### 模板 A — 推荐 `~/.tmux.conf`（生产基线）

```bash
# ====== 前缀键 ======
# Ctrl+b 太远，改成 Ctrl+a（与 emacs 行首键冲突，但顺手）
unbind C-b
set -g prefix C-a
bind C-a send-prefix                    # Ctrl+a Ctrl+a 仍能传给应用

# ====== 基础 ======
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc"      # 真彩色
set -g mouse on                                       # 鼠标点击 / 滚轮 / 拖拽分屏
set -g history-limit 100000                           # 历史缓冲（默认 2000 太少）
set -g base-index 1                                   # 窗口编号从 1 开始
setw -g pane-base-index 1                             # pane 编号从 1
set -g renumber-windows on                            # 关窗口时自动重编号
set -g set-titles on                                  # 自动改终端窗口标题
set -g focus-events on                                # 让 nvim 等知道焦点切换
set -sg escape-time 0                                 # Esc 不延迟（vim 需要）

# ====== Vi 风格 copy 模式 ======
setw -g mode-keys vi
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi y send -X copy-pipe-and-cancel "xclip -selection clipboard -in"
# 没装 xclip 的话改：
# bind -T copy-mode-vi y send -X copy-selection-and-cancel

# ====== 改 split 快捷键 ======
unbind '"'
unbind %
bind | split-window -h -c '#{pane_current_path}'      # | 左右分屏，新 pane 同目录
bind - split-window -v -c '#{pane_current_path}'      # - 上下分屏，新 pane 同目录

# ====== Pane 间切换（vim 风格）======
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# ====== 大小调节（连续按）======
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# ====== 重载配置 ======
bind r source-file ~/.tmux.conf \; display "Config reloaded!"

# ====== 状态栏样式 ======
set -g status-position bottom
set -g status-bg colour234
set -g status-fg colour137
set -g status-left-length 30
set -g status-left '#[fg=colour232,bg=colour154,bold] #S #[fg=colour154,bg=colour234,nobold]'
set -g status-right '#[fg=colour247] %Y-%m-%d  #[fg=colour252,bold]%H:%M '
set -g status-right-length 50
setw -g window-status-current-format '#[fg=colour234,bg=colour39] #I #W #[fg=colour39,bg=colour234]'
setw -g window-status-format '#[fg=colour244] #I #W '

# ====== 活动通知 ======
setw -g monitor-activity on
set -g visual-activity off
```

应用：`tmux source ~/.tmux.conf`（或 `Ctrl+a r`，由模板的重载键触发）。

### 模板 B — TPM（Tmux Plugin Manager）+ 推荐插件

```bash
# 装 TPM
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

`~/.tmux.conf` 末尾加：

```bash
# 插件
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'              # 通用合理默认
set -g @plugin 'tmux-plugins/tmux-resurrect'             # 保存 / 恢复 session
set -g @plugin 'tmux-plugins/tmux-continuum'             # 自动每 15 分钟保存
set -g @plugin 'tmux-plugins/tmux-yank'                  # 系统剪贴板集成
set -g @plugin 'christoomey/vim-tmux-navigator'          # vim/nvim 与 tmux pane 无缝切换
set -g @plugin 'jimeh/tmux-themepack'                    # 主题包

set -g @themepack 'powerline/default/cyan'

# Resurrect 配置
set -g @resurrect-strategy-vim 'session'
set -g @resurrect-strategy-nvim 'session'
set -g @resurrect-capture-pane-contents 'on'
set -g @continuum-restore 'on'                            # tmux 启动自动恢复

# 必须放最后
run '~/.tmux/plugins/tpm/tpm'
```

应用：

```
Ctrl+a I        # 大写 I，安装所有插件
Ctrl+a U        # 升级
Ctrl+a alt+u    # 卸载移除的
```

### 模板 C — 项目级 tmux 启动脚本（tmuxinator 替代）

不装 ruby/tmuxinator 也能预制 layout。`~/bin/dev-mux`：

```bash
#!/bin/bash
SESSION="dev"
tmux new-session -d -s $SESSION -n editor
tmux send-keys -t $SESSION:editor "cd ~/project && nvim ." C-m

tmux new-window -t $SESSION:2 -n server
tmux send-keys -t $SESSION:server "cd ~/project && npm run dev" C-m

tmux new-window -t $SESSION:3 -n shell
tmux send-keys -t $SESSION:shell "cd ~/project" C-m

tmux split-window -t $SESSION:shell -h
tmux send-keys -t $SESSION:shell.2 "cd ~/project && watch -n 5 git status" C-m

tmux attach -t $SESSION
```

```bash
chmod +x ~/bin/dev-mux
dev-mux
```

### 模板 D — 远程持久会话（生产排错神器）

跑长命令前先开 tmux：

```bash
ssh production-server
tmux new -s deploy
# 现在跑命令
sudo apt-get upgrade -y                # 即使断网也不停
# 或长 build
make all 2>&1 | tee /tmp/build.log

# 断开
Ctrl+a d           # detach（命令继续跑）
exit               # 安全退出 SSH

# 第二天回来
ssh production-server
tmux a -t deploy   # 接回，看进度
```

## 关键参数调优速查

### History 缓冲

```bash
set -g history-limit 100000           # 默认 2000，太少
```

每个 pane 独立缓冲，100k 行 ≈ 50 MB（按字符算）。可调到 500k 不影响实际使用。

### Mouse 模式权衡

```bash
set -g mouse on                        # 启用鼠标点击 / 滚轮 / 拖拽
```

副作用：tmux 内的程序（vim、less）默认会捕获鼠标；按住 Shift + 选中能绕过 tmux 直接选系统剪贴板。

### 真彩色（24-bit color）

老配置常见错：

```bash
# 错（256 色）：
set -g default-terminal "screen-256color"

# 对（24-bit color）：
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc"      # 关键这一行
set -ga terminal-overrides ",alacritty:Tc"            # 用 alacritty 时
```

测试：

```bash
# 在 tmux 里跑
awk 'BEGIN{
    s="/\\/\\/\\/\\/\\"; s=s s s s s s s s;
    for (colnum = 0; colnum<77; colnum++) {
        r = 255-(colnum*255/76);
        g = (colnum*510/76);
        b = (colnum*255/76);
        if (g>255) g = 510-g;
        printf "\033[48;2;%d;%d;%dm", r,g,b;
        printf "\033[38;2;%d;%d;%dm", 255-r,255-g,255-b;
        printf "%s\033[0m", substr(s,colnum+1,1);
    }
    printf "\n";
}'
```

应该是平滑渐变；如果有色阶感，说明仍是 256 色。

### 活动监控

```bash
setw -g monitor-activity on            # 后台 window 有输出时高亮窗口名
set -g visual-activity off              # 但不显示烦人的 "Activity in window 2" 通知
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 | Alpine |
|---|---|---|---|
| `tmux` 包 | 默认仓库 | 默认仓库 | apk tmux |
| 配置语法 | 一致（3.x） | 一致 | 一致 |
| 鼠标支持 | 一致 | 一致 | 一致 |
| `xclip` 系统剪贴板 | 默认仓库 | 默认仓库 | apk xclip |

各平台 tmux 版本：

| 发行版 | 版本 |
|---|---|
| Ubuntu 22.04 | 3.2 |
| Ubuntu 24.04 | 3.4 |
| Debian 12 | 3.3 |
| RHEL 9 / Anolis 9 | 3.2 |
| 最新 | 3.5 |

3.2+ 都支持模板 A 的所有语法。要更新版需从源码编译。

## 与其它 catalog 项的配合

- **`zsh-shell` / `fish-shell`** — tmux 启动 shell 时按用户的 default shell 跑；本机 default shell 是 fish/zsh，tmux 里也是
- **`neovim-editor`** — 配 `vim-tmux-navigator` 让 `<C-h/j/k/l>` 跨 nvim window + tmux pane 无缝切换
- **`htop-tools`** — htop 在 tmux pane 里跑得好好的；可以一个 pane htop 一个 pane 跑命令

## 排错

### `error connecting to /tmp/tmux-1000/default (No such file or directory)`

老 tmux server 已经死了。重启：

```bash
tmux kill-server                    # 清理
rm -rf /tmp/tmux-$(id -u)/*         # 清 socket
tmux                                 # 重新起
```

### `failed to connect to server: Address already in use`

socket 残留。同上清理。

### 鼠标点击不工作

```bash
# 检查
tmux show-options -g | grep mouse
# 应该是 'mouse on'

# 改
tmux set-option -g mouse on
# 或在 ~/.tmux.conf 加 'set -g mouse on' 后
tmux source ~/.tmux.conf
```

### 真彩色失效（颜色看起来"扁平"）

见上方"真彩色（24-bit color）"。`echo $TERM` 检查——tmux 内应是 `tmux-256color` 或 `screen-256color`。

### `set-option -g default-terminal "tmux-256color": unknown terminal`

老系统的 ncurses 里没 tmux-256color terminfo。两个方案：

```bash
# 方案 1：装 tmux-256color terminfo（永久）
infocmp tmux-256color || sudo apt-get install ncurses-term

# 方案 2：用 screen-256color（兼容性好但少功能）
set -g default-terminal "screen-256color"
```

### Copy 模式 `y` 不写到系统剪贴板

需要 `xclip` / `xsel` (X11) 或 `wl-copy` (Wayland)：

```bash
sudo apt-get install xclip                # Ubuntu/Debian
sudo dnf install xclip                    # RHEL/Anolis
```

SSH 远程（无 GUI）时不能用系统剪贴板——除非：

- SSH 开 X11 forwarding（`ssh -X`）
- 或终端模拟器支持 OSC 52（如 alacritty / iTerm2 / WezTerm）：`set -g set-clipboard on`

### 中文乱码 / locale 错

```bash
# 检查
locale
# 缺 UTF-8 时
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=en_US.UTF-8

# tmux 内重设
TERM=tmux-256color LANG=en_US.UTF-8 tmux
```

### 重连后 vim 颜色乱

在 vim 里跑：

```vim
:set termguicolors
:checkhealth
```

或在 ~/.vimrc / init.lua 加 `set termguicolors`。

## 验证

```bash
# 1. 命令存在 + 版本
tmux -V                          # 应 >= 3.2

# 2. 启动会话能成功
tmux new -d -s test
tmux ls                           # 应有 test
tmux send-keys -t test 'echo hello' C-m
sleep 1
tmux capture-pane -p -t test     # 应包含 hello
tmux kill-session -t test

# 3. 配置语法 OK
tmux source ~/.tmux.conf 2>&1 | head     # 无报错

# 4. 真彩色（在 tmux 内）
tmux new -s ttest -d
tmux send-keys -t ttest 'echo $TERM' C-m
tmux capture-pane -p -t ttest             # 应是 tmux-256color 或 screen-256color
tmux kill-session -t ttest
```

## 多次运行

`installMode: skip-existing`。包安装幂等。`~/.tmux.conf` 第一次写入；重跑不覆盖（避免毁了用户定制）。要重置：

```bash
mv ~/.tmux.conf ~/.tmux.conf.bak
# 重跑 Playbook 或手动复制模板 A
```

## ⚠️ 敏感性

**safe** — 装终端工具，不动业务。

## 隐私说明

- tmux 不发遥测
- tmux 缓冲区里的内容（含命令历史 / 输出）保存在内存中，重启 tmux 后丢失
- `tmux-resurrect`（如启用）会把会话状态写到 `~/.tmux/resurrect/`（明文，权限 0644，建议手动 0600）——可能含有过的命令 / pane 内容
- copy 模式 yank 走系统剪贴板时，其它 X11 应用能读到剪贴板内容（OS 级行为，与 tmux 无关）
