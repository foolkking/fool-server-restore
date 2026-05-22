# Git 版本控制

装 Git + 配置全局 `user.name` / `user.email` / 默认分支名 / 常用别名。

## 你将得到什么

- 📦 **git** + **git-lfs**（大文件存储扩展）
- ✅ 全局 user.name / user.email（按表单填）
- ✅ 默认分支名（main / master / trunk）
- ✅ 可选：常用别名（git st / co / lg 等）
- ✅ pull.rebase = false（默认 merge 而不是 rebase）

## 表单字段说明

### user.name / user.email

每个 commit 都会带上这两个字段。**GitHub/GitLab 用 email 匹配你的账号头像**——
所以填和你 GitHub 账号绑定的同一个邮箱。

### 默认分支名

`git init` 时新仓库的默认分支：
- **main**：GitHub 在 2020 年改的默认值，现在的事实标准
- **master**：传统名字，老仓库还用
- **trunk**：少数项目（特别是从 SVN 迁来的）习惯

### 启用别名

打开后会加这些别名：
- `git st` → status
- `git co` → checkout
- `git br` → branch
- `git lg` → log --oneline --graph --decorate --all（漂亮的提交图）
- `git last` → log -1 HEAD
- `git unstage` → reset HEAD --

## 用法

### 基本工作流

```bash
git clone https://github.com/me/myrepo.git
cd myrepo
git st                # alias: status
git checkout -b feature/x
# ... 改文件 ...
git add .
git commit -m "add feature x"
git push -u origin feature/x
```

### SSH 配置（无需密码 push）

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
cat ~/.ssh/id_ed25519.pub
# 把这个公钥贴到 GitHub Settings → SSH keys

# 测试
ssh -T git@github.com
```

### Git LFS（大文件）

如果项目里有大文件（视频、模型权重 100MB+），用 LFS：
```bash
git lfs track "*.mp4"
git add .gitattributes
git add big-video.mp4   # LFS 追踪，git 仓库只存指针
git commit -m "add video"
```

### 全局 .gitignore

不想每个项目重复写 `.DS_Store / *.log / node_modules` 之类：
```bash
git config --global core.excludesFile ~/.gitignore_global
cat > ~/.gitignore_global <<EOF
.DS_Store
Thumbs.db
*.swp
*.log
.idea/
.vscode/settings.json
node_modules/
__pycache__/
EOF
```

### Tower-style commit message templates

```bash
git config --global commit.template ~/.gitmessage
cat > ~/.gitmessage <<'EOF'
# <type>(<scope>): <subject>
#
# Body: 解释 *what* 和 *why*（不要 how）
#
# Refs: #issue-number
EOF
```

## ⚠️ 敏感性

**safe** — 装 git 不动业务数据。但 `user.email` 会出现在每个 commit 里，公开仓库时所有人能看到。

## 验证

```bash
git --version
git config --global --list
```

## 排错

- **`fatal: empty ident name`** — `user.name` 没设。重跑 Playbook 填表单，或手动 `git config --global user.name "name"`。
- **`Permission denied (publickey)` 推 GitHub** — SSH key 没加到 GitHub。
- **跨发行版**：包名 `git` 一致。`git-lfs` 在 RHEL 上可能需要 EPEL（preflight 已自动启用）。

## 多次运行

`installMode: skip-existing`。包不重装，但 git config 每次会按表单值覆盖。

## 隐私说明

- user.name / user.email 出现在任务日志和 git commit 里。
- 不发任何遥测。
