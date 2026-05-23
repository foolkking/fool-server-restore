# Git 版本控制

装 Git + Git LFS + 配置全局 `user.name` / `user.email` / 默认分支名 / 常用别名。每个 commit 都要带身份信息（GitHub / GitLab 用 email 匹配账号头像），所以这一步不可省。

## 你将得到什么

- 📦 **git**（最新发行版仓库版本）
- 📦 **git-lfs**（大文件存储扩展，处理 100MB+ 资源文件用）
- ✅ 全局 `user.name` / `user.email`（按表单填）
- ✅ 全局默认分支名（main / master / trunk）
- ✅ 可选别名：`git st` / `co` / `br` / `lg` / `last` / `unstage`
- ✅ `pull.rebase = false`（默认 merge，新手友好；老手可改）
- ✅ `init.defaultBranch` 与默认分支配置一致

## 表单字段说明

### `user_name` — 用户名

每次 commit 的作者名。可以是真名或英文 ID，公开仓库时所有人能看到。

### `user_email` — 邮箱

**关键**：与 GitHub / GitLab 账号绑定的邮箱**完全一致**，否则 commit 不会算到你头上（profile 不显示绿格子）。

GitHub 推荐用 noreply 邮箱（`<id>+<username>@users.noreply.github.com`），可在 https://github.com/settings/emails 拿到。

### `default_branch` — 默认分支名

| 值 | 适用 |
|---|---|
| `main` | **当前事实标准**（GitHub 2020-10 起默认） |
| `master` | 老仓库（仍广泛使用） |
| `trunk` | 少数项目（特别是 SVN 迁移过来的） |

**已存在的仓库不会被改**——只影响 `git init` 新建的仓库。

### `enable_aliases` — 是否启用别名

打开后 `~/.gitconfig` 加：

| Alias | 等价命令 |
|---|---|
| `git st` | `status` |
| `git co` | `checkout` |
| `git br` | `branch` |
| `git lg` | `log --oneline --graph --decorate --all` |
| `git last` | `log -1 HEAD` |
| `git unstage` | `reset HEAD --` |

## 配置文件 / 目录速查

```
# 系统级（很少用）
/etc/gitconfig                    # git config --system

# 用户级（最常用，本 Playbook 写这里）
~/.gitconfig                      # git config --global
~/.git-credentials                # HTTPS 凭据缓存（明文！权限自动 0600）
~/.ssh/                           # SSH key（推荐方案）
├── id_ed25519                    # 私钥（敏感）
├── id_ed25519.pub                # 公钥（贴到 GitHub/GitLab）
├── known_hosts                   # 服务器指纹缓存
└── config                        # 多账号 / 多仓库分流

# 仓库级
<repo>/.git/config                # git config --local
<repo>/.git/hooks/                # client-side hooks
<repo>/.gitignore                 # 排除规则
<repo>/.gitattributes             # 行尾 / LFS / merge driver
```

| 配置项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `git` 包名 | `git` | `git`（默认仓库已含） |
| `git-lfs` 包名 | `git-lfs` | `git-lfs`（在 EPEL，preflight 自动启用） |
| 默认安装版本 | Ubuntu 24 = 2.43，Ubuntu 22 = 2.34，Debian 12 = 2.39 | RHEL 9 / Anolis 9 = 2.43 |
| 装最新版方法 | git-core PPA / `add-apt-repository ppa:git-core/ppa` | 默认仓库够用；要更新走 IUS |

## 常见配置模板

### 模板 A — 高质量全局 `~/.gitconfig`（团队推荐基线）

```ini
[user]
    name = Your Name
    email = you@example.com
    signingkey = <GPG_KEY_ID>             # 可选：commit 签名

[init]
    defaultBranch = main

[core]
    editor = vim                          # 改 commit message 用的编辑器
    autocrlf = input                      # Linux/Mac：保 LF；Windows 用 'true'
    excludesfile = ~/.gitignore_global    # 全局忽略
    pager = less -F -X                    # less 短输出不分页

[pull]
    rebase = false                        # pull = merge（新手友好）
    # rebase = true                       # 高手用：保持线性历史

[push]
    default = current                     # push 默认到同名远程分支
    autoSetupRemote = true                # 第一次 push 自动 -u 设 upstream
    followTags = true                     # 推 commit 同时推 annotated tags

[fetch]
    prune = true                          # fetch 自动清理已删的远程分支

[merge]
    conflictstyle = zdiff3                # 冲突显示更清晰（含 base 版本）
    ff = false                            # merge 总是产生 merge commit

[diff]
    algorithm = histogram                 # 比 myers 算法对代码更友好
    renames = copies                      # 检测重命名

[rerere]
    enabled = true                        # 记住冲突解决，下次自动应用

[color "ui"]
    auto = true

[commit]
    gpgsign = true                        # 启用 GPG 签名（要 signingkey）
    template = ~/.gitmessage              # commit message 模板

[credential]
    helper = cache --timeout=3600         # HTTPS 凭据缓存 1 小时

# 重写常用命令为别名
[alias]
    st = status
    co = checkout
    br = branch
    ci = commit
    lg = log --oneline --graph --decorate --all
    last = log -1 HEAD --stat
    unstage = reset HEAD --
    aliases = config --get-regexp ^alias\\.
```

### 模板 B — 全局 `.gitignore_global`（不每个项目重复写）

```bash
git config --global core.excludesFile ~/.gitignore_global

cat > ~/.gitignore_global <<'EOF'
# OS
.DS_Store
Thumbs.db
desktop.ini

# Editor
*.swp
*.swo
*~
.idea/
.vscode/settings.json
.vscode/launch.json
*.code-workspace

# Logs
*.log
*.log.*

# Secrets（防误提交）
.env.local
.env.*.local
*.pem
*.key

# Python
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Node
node_modules/
.npm/
.yarn/
.pnpm-store/

# 系统
.cache/
.tmp/
EOF
```

### 模板 C — `.gitmessage` 模板（commit message 规范）

```bash
git config --global commit.template ~/.gitmessage

cat > ~/.gitmessage <<'EOF'
# <type>(<scope>): <subject>
#
# 例：feat(auth): add OAuth2 login flow
#     fix(api): correct timezone in /events endpoint
#     docs(readme): update install steps
#
# Type: feat / fix / docs / style / refactor / test / chore / perf / ci
# Scope: 受影响的模块（api/web/db/...）
# Subject: 50 字以内，祈使语气，无句号
#
# Body（可选）：
# - 描述 *what* 和 *why*，不写 how（代码自解释）
# - 一行 72 字内
#
# Footer（可选）：
# Refs: #123
# Closes: #456
# BREAKING CHANGE: 描述破坏性变更
EOF
```

### 模板 D — SSH 多账号分流（如同时用 GitHub 公司+个人）

`~/.ssh/config`：

```
# 公司 GitHub
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work
    IdentitiesOnly yes

# 个人 GitHub
Host github-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes
```

clone 时用别名：

```bash
git clone git@github-work:company/private-repo.git
git clone git@github-personal:me/my-side-project.git

# 仓库级别覆盖 user.email
cd private-repo
git config user.email "me@company.com"
```

### 模板 E — Git LFS 配置（大文件项目）

```bash
# 安装（Playbook 已装包，但仍需在仓库里 init 一次）
git lfs install                       # 全局 hooks

cd myrepo
git lfs track "*.psd"                 # PSD 文件用 LFS
git lfs track "*.mp4" "*.mov"         # 视频
git lfs track "models/**"             # 整个目录
git add .gitattributes
git commit -m "track binary assets via LFS"

# 推送 LFS 内容
git push origin main                  # git 推指针 + LFS 推大文件

# 看 LFS 文件
git lfs ls-files

# 限制 LFS 带宽（避免吞光带宽）
git config --global lfs.transfer.maxRetries 5
git config --global lfs.activitytimeout 60
```

## 关键参数调优速查

### Performance

| 参数 | 推荐 | 说明 |
|---|---|---|
| `core.preloadIndex` | `true`（默认） | 大仓库加速 status |
| `core.fsmonitor` | `true` | Git 2.37+ 文件系统监视器，几万文件仓库快 10× |
| `core.untrackedCache` | `true` | 缓存未跟踪文件状态 |
| `feature.manyFiles` | `true` | 自动开多个性能选项（Git 2.31+） |
| `pack.threads` | CPU 核数 | gc / repack 并行 |
| `protocol.version` | `2`（默认） | 网络协议 v2 比 v1 快得多 |

### 大仓库优化

```bash
# 浅克隆（不要全部历史）
git clone --depth=1 https://github.com/torvalds/linux.git

# 部分克隆（按需下载 blob）
git clone --filter=blob:none https://github.com/torvalds/linux.git

# 单分支克隆
git clone --single-branch --branch=main ...

# 已有仓库压缩 / 清理
git gc --aggressive --prune=now
git repack -a -d --depth=250 --window=250
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `git` 装哪 | 默认仓库 | 默认仓库 |
| `git-lfs` 装哪 | 默认仓库 | EPEL（preflight 启用） |
| 配置文件位置 | `~/.gitconfig` | 相同 |
| credential helper | `cache` / `store` / `libsecret` | 相同（GUI 环境用 `libsecret`） |

EnvForge preflight 自动在 RHEL/Anolis 启用 EPEL，git-lfs 包能找到。

## 与其它 catalog 项的配合

- **`gitea-server`** — 自托管 Git 服务，本机 git 客户端可直接 clone/push
- **`gitlab-runner`** — Runner 用 git 拉代码跑 CI，需先装 git
- **`zsh-shell` / `fish-shell`** — Oh My Zsh 自带 git 插件（git status / git lg 别名），与本 Playbook 别名重叠时后者覆盖前者
- **`code-server`** — Web VS Code 的 Source Control 面板用本机 git

## 排错

### `fatal: empty ident name (for <user@host>) not allowed`

`user.name` 没设。重跑 Playbook 填表单，或：

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### `Permission denied (publickey)` 推 GitHub/GitLab

SSH key 没加到平台或没生成：

```bash
# 看公钥
cat ~/.ssh/id_ed25519.pub

# 没有就生成
ssh-keygen -t ed25519 -C "you@example.com"

# 把公钥贴到 https://github.com/settings/keys

# 测试
ssh -T git@github.com    # 应输出 "Hi <user>! ..."
```

### `unable to access 'https://github.com/...': Couldn't connect to server`

国内服务器到 github.com 偶发不稳定。两种应对：

```bash
# 方案 1：改用 SSH（22 端口）
git remote set-url origin git@github.com:user/repo.git

# 方案 2：强制走 HTTPS 443（绕过 22）
git config --global url."https://github.com/".insteadOf "git://github.com/"

# 方案 3：用国内镜像（如 ghproxy）
git clone https://ghproxy.com/https://github.com/user/repo.git
```

### `error: refusing to merge unrelated histories`

`git pull` 老仓库初始化时冲突。临时解：

```bash
git pull --allow-unrelated-histories
```

### Git LFS push 失败 `batch response: ...`

LFS 配额用完（GitHub 免费 1GB 存储 + 1GB/月 带宽）或网络问题：

```bash
# 看 LFS 状态
git lfs status
git lfs env

# 重传
git lfs push --all origin main
```

### 很大仓库 `git status` 极慢

```bash
# Git 2.37+
git config core.fsmonitor true
git config core.untrackedCache true

# 旧版本
git config feature.manyFiles true
```

或用 `git status -uno`（不查未跟踪文件）。

### `error: GPG signing failed: secret key not available`

GPG signing 开了但没 key：

```bash
# 关 signing
git config --global commit.gpgsign false

# 或装 key（详细见 GitHub docs）
gpg --full-generate-key
gpg --list-secret-keys --keyid-format=long
git config --global user.signingkey <KEY_ID>
```

### Windows 编辑过的文件 commit 后 diff 全红

CRLF / LF 行尾问题。Linux 服务器：

```bash
git config --global core.autocrlf input
```

修旧仓库：

```bash
git rm --cached -r .
git reset --hard
```

## 验证

```bash
# 1. 命令存在
git --version
git lfs version

# 2. 全局配置生效
git config --global user.name
git config --global user.email
git config --global init.defaultBranch

# 3. 列所有别名
git config --get-regexp ^alias\.

# 4. 创建临时仓库测试 commit 能成功
mkdir /tmp/git-test && cd /tmp/git-test
git init -q
echo hello > test.txt
git add test.txt
git commit -m "test" -q
git log --oneline
cd / && rm -rf /tmp/git-test
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`git config --global ...` 每次会按表单值覆盖**——所以重跑不会丢失你的别名（Playbook 不删别名只加），但会按最新表单值更新 user.name / user.email / defaultBranch。

如果你手动改过 `~/.gitconfig` 添加了别的配置，重跑 Playbook 不会破坏（`git config` 是逐键更新，不是全文重写）。

## ⚠️ 敏感性

**safe** — 装 git 客户端 + 写 `~/.gitconfig`。不开端口、不动数据。

## 隐私说明

- `user.name` 和 `user.email` 出现在**每个 commit 里**，公开仓库时所有人能看到。建议公开项目用 noreply 邮箱
- 不发遥测
- HTTPS 凭据走 `credential.helper`：
    - `cache`（默认，内存里 1 小时）
    - `store`（明文写 `~/.git-credentials`，权限 0600）
    - `libsecret`（GUI 环境用 keyring，最安全）
- SSH key 私钥不会被本 Playbook 读取或上传
- Playbook 任务日志不含密码，但**含 user.email**（review 时可见）
