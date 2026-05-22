# Zsh + Oh My Zsh

Zsh 是 macOS 默认 shell，比 Bash 强大得多——更智能的补全、git 集成、主题、插件生态。
Oh My Zsh 是 Zsh 的"框架"，提供主题和插件管理。

## 你将得到什么

- 📦 **zsh**（系统 shell）
- ✅ Oh My Zsh 装到 `~/.oh-my-zsh`
- ✅ `~/.zshrc` 模板（默认 robbyrussell 主题，git + sudo 等基础插件）

## 用法

### 切换默认 shell

```bash
chsh -s $(which zsh)
# 重新登录后生效
```

### 试试基础功能

```bash
# 进 git 仓库目录，prompt 自动显示分支
cd /path/to/repo
# (main) $

# tab 补全（比 bash 强大）
sudo systemctl <Tab>     # 列出所有服务
git ch<Tab>              # checkout / cherry-pick

# 历史搜索
Ctrl+R    # 反向搜索（zsh-history-substring-search 更强）
```

### 装更多插件

`~/.zshrc` 找到 `plugins=(...)` 这行：
```bash
plugins=(
  git
  sudo                  # 按两次 Esc 自动加 sudo 到行首
  z                     # cd 到最近用过的目录（z foo 而不是 cd /full/path/foo）
  command-not-found     # 命令拼错时建议正确命令
)
```

### 装 zsh-autosuggestions（强烈推荐）

输入命令时灰色显示历史中的命令建议，按 → 接受：
```bash
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
# ~/.zshrc 的 plugins 加上 zsh-autosuggestions
```

### 装 zsh-syntax-highlighting

实时给命令行上色（红色 = 命令不存在，绿色 = OK）：
```bash
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
# ~/.zshrc plugins 加上 zsh-syntax-highlighting （要放最后！）
```

### 换主题（Powerlevel10k 是最流行的）

```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
# ~/.zshrc 改 ZSH_THEME="powerlevel10k/powerlevel10k"
# 重开 shell, 跑配置向导
p10k configure
```

## ⚠️ 敏感性

**safe** — 装 shell 工具，不影响业务。但 `chsh -s` 改默认 shell 是用户级操作，root 可能想保持 bash 以便系统脚本兼容。

## 验证

```bash
zsh --version
ls ~/.oh-my-zsh
```

## 排错

- **Oh My Zsh install 失败** — 国内服务器到 raw.githubusercontent.com 慢。手动 git clone：
  ```bash
  git clone https://github.com/ohmyzsh/ohmyzsh.git ~/.oh-my-zsh
  cp ~/.oh-my-zsh/templates/zshrc.zsh-template ~/.zshrc
  ```
- **chsh: "shell not authorized"** — `/etc/shells` 里没有 zsh 路径。`echo $(which zsh) | sudo tee -a /etc/shells`。
- **跨发行版**：`zsh` 包在两边都是默认仓库提供。

## 多次运行

`installMode: skip-existing`。已装就跳过 oh-my-zsh 安装。`.zshrc` 也不会被覆盖（保留你的定制）。

## 隐私说明

不发遥测。
