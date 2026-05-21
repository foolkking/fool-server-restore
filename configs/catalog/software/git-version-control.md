# Git 版本控制

## 概述

Git 是分布式版本控制系统，是现代软件开发的基础工具。几乎所有开发项目都使用 Git 进行代码管理和协作。

## 安装内容

- `git` — Git 核心
- `git-lfs` — Git Large File Storage（大文件支持）

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y git git-lfs
git lfs install
```

## 安装后配置

### 1. 全局用户信息

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2. 推荐全局配置

```bash
# 默认分支名
git config --global init.defaultBranch main

# 自动处理换行符
git config --global core.autocrlf input

# 彩色输出
git config --global color.ui auto

# 推送策略
git config --global push.default current

# 拉取策略（rebase 优先）
git config --global pull.rebase true
```

### 3. 常用 alias

```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.lg "log --oneline --graph --all"
git config --global alias.last "log -1 HEAD"
```

### 4. 凭据管理

```bash
# 使用凭据缓存（15 分钟）
git config --global credential.helper cache

# 或使用凭据存储（明文，注意安全）
git config --global credential.helper store
```

### 5. SSH 密钥配置（推荐）

```bash
ssh-keygen -t ed25519 -C "your.email@example.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
# 将公钥添加到 GitHub/GitLab
```

## 验证安装

```bash
git --version
git config --list
```

## 隐私说明

Git 全局配置中的邮箱地址可能属于个人信息。SSH 私钥绝不会被同步。
