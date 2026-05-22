# 现代 CLI 工具集（Rust 写的更好的版本）

一组替代经典 Unix 工具的现代版本，全部用 Rust 重写，性能和体验都更好。
都通过系统包管理器装（不需要 cargo install）。

## 你将得到什么

- 📦 **bat** — 替代 cat（语法高亮 + 行号 + git 集成）
- 📦 **fd-find** — 替代 find（语法直观 100 倍）
- 📦 **ripgrep**（命令 `rg`） — 替代 grep（速度快 5-10 倍）
- 📦 **zoxide** — 替代 cd（按访问频率智能跳转）
- 📦 **fzf** — 模糊搜索器（搭配各种工具）
- 📦 **eza** — 替代 ls（含 git 状态、tree 模式）
- 📦 **tldr** — 简化版 man 页（命令例子第一）

## 用法

### bat（替代 cat）

```bash
bat README.md           # 带语法高亮 + 行号
bat -A bin              # 显示二进制文件不会乱码
alias cat='bat'
```

### fd（替代 find）

```bash
# 老 find 写法：
find . -type f -name "*.py" -not -path "*/node_modules/*"
# 新 fd：
fd '\.py$' --type f --exclude node_modules
```

### rg（ripgrep, 替代 grep）

```bash
# 老 grep:
grep -rn "TODO" --include="*.py" .
# 新 rg:
rg "TODO" --type py
```
默认就尊重 `.gitignore`，不会搜 `node_modules`。

### zoxide（替代 cd）

```bash
# 添加 ~/.bashrc / ~/.zshrc:
eval "$(zoxide init bash)"

# 用 z 跳转（按访问频率排序）
z proj                  # 跳到最近访问的含 "proj" 的目录
zi                      # 用 fzf 交互式选择
```

### fzf（模糊搜索神器）

```bash
fzf                     # 交互式从 stdin 选一个
vim $(fzf)              # 选个文件用 vim 打开

# 在 ~/.bashrc 里：
source /usr/share/doc/fzf/examples/key-bindings.bash
# 然后 Ctrl+R 用 fzf 搜历史，Ctrl+T 选文件
```

### eza（替代 ls）

```bash
eza -la --git           # 类似 ls -la 但带 git 状态
eza --tree --level=2    # tree 风格
alias ls='eza'
alias ll='eza -la --git'
alias tree='eza --tree'
```

### tldr（简化版 man）

```bash
tldr tar
# 显示 tar 最常用的几个命令例子（不是 man 那种长篇大论）
tldr docker
tldr ssh
```

## ⚠️ 敏感性

**safe** — 都是 CLI 工具。

## 验证

```bash
command -v bat fd rg zoxide fzf eza tldr
```

## 排错

- **`bat` 命令找不到（Ubuntu/Debian）** — Ubuntu 把 bat 包名叫 `batcat`，需 `alias bat='batcat'` 或 `sudo ln -s /usr/bin/batcat /usr/local/bin/bat`。EnvForge 的 PACKAGE_ALIASES 已经处理。
- **`fd` 找不到** — 同上，Ubuntu 上是 `fdfind` 命令。
- **eza 不在仓库** — 旧版本发行版没 eza（Ubuntu 22.04 没有）。可以换 `exa`（旧名）或 `cargo install eza`。
- **跨发行版**：很多包在 RHEL/Anolis 需要 EPEL（preflight 自动启用）。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

不发遥测。
