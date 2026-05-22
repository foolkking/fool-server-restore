# tmux 终端复用器

tmux 让一个 SSH 连接里同时跑多个终端会话——还能 detach 后继续在后台跑（断 SSH 也不会
让你的命令终止）。是远程服务器工作的必备工具。

## 你将得到什么

- 📦 **tmux**

## 速查

### 启动 / 恢复

```bash
tmux                       # 启动新会话
tmux new -s mywork         # 启动并命名
tmux ls                    # 列出现有会话
tmux attach -t mywork      # 接到 mywork 会话
tmux attach                # 接到上次的
tmux kill-session -t mywork
```

### Detach（最重要的功能）

`Ctrl+b` 然后按 `d` — 离开但会话继续在后台跑。
SSH 断了也没事，下次 ssh 进来 `tmux attach` 接回。

### 窗口（windows，类似浏览器 tab）

`Ctrl+b` 触发然后：
- `c` — 新窗口
- `n` — 下一个窗口
- `p` — 上一个
- `0-9` — 跳转到第 N 个
- `,` — 重命名当前窗口
- `&` — 关闭当前窗口

### 分屏（panes）

`Ctrl+b` 然后：
- `%` — 左右分屏
- `"` — 上下分屏
- 方向键 — 在 panes 间切换
- `o` — 顺序切换
- `x` — 关闭当前 pane
- `z` — 当前 pane 全屏 / 还原
- `空格` — 循环切布局

### 滚动查看历史

`Ctrl+b` 然后 `[` — 进入 copy 模式，用方向键 / PgUp/PgDn 翻历史。`q` 退出。

## 配置（推荐）

`~/.tmux.conf`：

```bash
# 用 Ctrl+a 替代 Ctrl+b（更顺手）
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# 鼠标支持
set -g mouse on

# 状态栏在底部 + 显示日期
set -g status-position bottom
set -g status-right '%Y-%m-%d %H:%M'

# 历史缓冲区调大
set -g history-limit 100000

# 窗口编号从 1 开始
set -g base-index 1
setw -g pane-base-index 1

# 改 pane split 快捷键
bind | split-window -h
bind - split-window -v
```

```bash
# 重新加载配置（在 tmux 内）
Ctrl+a r
```

或者用 [TPM (Tmux Plugin Manager)](https://github.com/tmux-plugins/tpm) + 一系列 plugin（resurrect / continuum 自动保存恢复 session）。

## ⚠️ 敏感性

**safe** — 装终端工具。

## 验证

```bash
tmux -V
```

## 排错

- **`error connecting to /tmp/tmux-1000/default` (Address already in use)** — 旧的 tmux server 还在但坏了。`tmux kill-server` 重启。
- **跨发行版**：`tmux` 在两边一致，无差异。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

不发遥测。
