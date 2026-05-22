# Neovim 编辑器

Neovim 是 Vim 的现代分支——异步插件、内置 LSP、Lua 配置语言、活跃的社区。
比传统 Vim 更适合现代开发。

## 你将得到什么

- 📦 **neovim**（来自系统仓库）
- 📦 经典 vim 兼容（不是 Neovim 而是传统 vim 包，作为 fallback）

服务器场景 Neovim 主要是远程编辑配置文件用，开发还是建议本机用 VSCode/IDE 远程到服务器。

## 用法

### 基本

```bash
nvim foo.txt          # 打开/创建
:q                    # 退出
:wq                   # 保存退出
:q!                   # 不保存退出
i                     # 进入 insert 模式
Esc                   # 回到 normal 模式
:e ~/.bashrc          # 编辑别的文件
:%s/foo/bar/g         # 全文替换 foo 为 bar
```

### 配置（如需）

`~/.config/nvim/init.lua`：

```lua
-- 基础
vim.opt.number = true              -- 行号
vim.opt.relativenumber = true      -- 相对行号
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true           -- 空格替代 tab
vim.opt.smartindent = true
vim.opt.termguicolors = true       -- 真彩色

-- 搜索
vim.opt.ignorecase = true
vim.opt.smartcase = true           -- 含大写时区分大小写
vim.opt.hlsearch = true

-- 文件
vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.undofile = true            -- 持久化撤销历史

-- 状态栏
vim.opt.cursorline = true

-- Mappings
vim.g.mapleader = " "              -- 空格作为 leader 键
vim.keymap.set("n", "<leader>w", ":w<CR>")
vim.keymap.set("n", "<leader>q", ":q<CR>")
```

### 装插件管理器（lazy.nvim）

```bash
git clone --depth 1 https://github.com/folke/lazy.nvim.git ~/.local/share/nvim/lazy/lazy.nvim
```

`~/.config/nvim/init.lua`：
```lua
vim.opt.rtp:prepend("~/.local/share/nvim/lazy/lazy.nvim")
require("lazy").setup({
  -- 主题
  { "folke/tokyonight.nvim", lazy = false, priority = 1000 },

  -- 文件树
  "nvim-tree/nvim-tree.lua",

  -- 模糊查找
  { "nvim-telescope/telescope.nvim", dependencies = "nvim-lua/plenary.nvim" },

  -- LSP
  "neovim/nvim-lspconfig",
  "williamboman/mason.nvim",

  -- Treesitter（语法高亮）
  "nvim-treesitter/nvim-treesitter",
})
```

启动 nvim 后 lazy.nvim 自动装插件。

### 启用 LSP（自动补全、跳转、诊断）

参考 https://github.com/neovim/nvim-lspconfig 配 LSP server（gopls / pyright / typescript-language-server 等）。

或者直接用预制 distro 简化：
- **LazyVim**: https://www.lazyvim.org/ — 开箱即用
- **NvChad**: https://nvchad.com/ — 中文文档全
- **AstroNvim**: https://astronvim.com/ — 优雅默认

## ⚠️ 敏感性

**safe** — 装文本编辑器。

## 验证

```bash
nvim --version
which nvim
```

## 排错

- **包名 `neovim` 找不到** — 老版本发行版仓库没 nvim（如 RHEL 7）。EnvForge preflight 会启用 EPEL，应该能找到。
- **`:checkhealth` 报 Python 缺失** — 装 `pynvim`：`pip install --user pynvim`。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

不发遥测。
