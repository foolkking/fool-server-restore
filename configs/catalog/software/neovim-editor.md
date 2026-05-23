# Neovim 编辑器

Neovim 是 Vim 的现代分支——异步插件、Lua 配置、内置 LSP、Tree-sitter 语法解析。比传统 Vim 快、可扩展性强、社区活跃。**服务器场景**主要是远程编辑配置文件用；开发工作建议本机用 VSCode/JetBrains 远程到服务器，Neovim 留给真正的命令行场景。

## 你将得到什么

- 📦 **neovim**（系统仓库版本）
- 📦 **vim**（fallback，传统 vim 命令仍可用）
- 📦 **xclip / xsel**（可选；让 vim 与系统剪贴板互通，仅 GUI 环境有意义）

可选（非默认）：

- ⚙️ 创建 `~/.config/nvim/init.lua` 模板（不覆盖已存在的）

## 表单字段说明

### `bootstrap_config` — 是否生成基础 init.lua

打开后：若 `~/.config/nvim/init.lua` 不存在，写入一份 ~50 行的 sane defaults（行号 / tab=2 / 搜索 / undo 文件 / leader=空格 等）。**已存在则跳过**——绝不覆盖。

### `install_lazy_nvim` — 装插件管理器

打开后克隆 [lazy.nvim](https://github.com/folke/lazy.nvim) 到 `~/.local/share/nvim/lazy/lazy.nvim`，但**不**装具体插件——你按需在 init.lua 里 `require("lazy").setup({...})`。

## 配置文件 / 目录速查

```
# Neovim 配置（XDG）
~/.config/nvim/
├── init.lua                            # ← 主入口（推荐）
├── init.vim                            # ← 主入口（旧式 vimscript，二选一）
├── lua/                                # 模块化配置
│   ├── plugins.lua
│   ├── keymaps.lua
│   └── lsp.lua
└── after/                              # 插件加载后再跑

# 数据 / 状态
~/.local/share/nvim/
├── lazy/                                # lazy.nvim 装的插件
├── mason/                               # mason 管理的 LSP server / formatter
├── site/                                # 老式 packpath
├── shada/                               # session 数据（registers / marks / search history）
└── undo/                                # 持久化 undo 历史

~/.cache/nvim/                          # 编辑临时（swap / log）

# 老版 vim 兼容
~/.vimrc                                 # 老 vim 配置（neovim 不读）
~/.vim/                                  # 老 vim 数据（neovim 不读）
```

| 项 | Ubuntu 22 | Ubuntu 24 | Debian 12 | RHEL/Anolis 9 |
|---|---|---|---|---|
| `neovim` 包名 | `neovim` | `neovim` | `neovim` | `neovim`（EPEL） |
| 仓库版本 | 0.6 ⚠️老 | 0.9 | 0.7 ⚠️老 | 0.10 |
| 二进制路径 | `/usr/bin/nvim` | `/usr/bin/nvim` | `/usr/bin/nvim` | `/usr/bin/nvim` |

**老版本警告**：Ubuntu 22.04 的 nvim 0.6 不支持现代插件（如 LazyVim 要 0.9+）。装最新版：

```bash
# 方案 1：snap（Ubuntu / Debian）
sudo snap install nvim --classic

# 方案 2：unstable PPA
sudo add-apt-repository ppa:neovim-ppa/unstable
sudo apt-get update && sudo apt-get install neovim

# 方案 3：AppImage（最稳，全发行版通用）
curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
chmod u+x nvim.appimage
sudo mv nvim.appimage /usr/local/bin/nvim
```

## 常见配置模板

### 模板 A — 极简 sane-defaults `init.lua`（无插件，开箱可用）

```lua
-- ~/.config/nvim/init.lua
-- ====== 基础选项 ======
local opt = vim.opt

opt.number = true               -- 行号
opt.relativenumber = true       -- 相对行号（j/k 跳转方便）
opt.cursorline = true           -- 当前行高亮
opt.scrolloff = 8               -- 滚动时上下保留 8 行
opt.sidescrolloff = 8           -- 水平同理

-- 缩进
opt.expandtab = true            -- 空格替代 tab
opt.tabstop = 2                 -- tab 显示宽度
opt.shiftwidth = 2              -- 自动缩进宽度
opt.smartindent = true
opt.autoindent = true

-- 搜索
opt.ignorecase = true
opt.smartcase = true            -- 含大写时区分大小写
opt.hlsearch = true             -- 高亮匹配
opt.incsearch = true            -- 边输入边搜

-- 文件管理
opt.swapfile = false
opt.backup = false
opt.undofile = true             -- 持久化 undo
opt.undodir = vim.fn.expand("~/.local/share/nvim/undo")

-- 显示
opt.termguicolors = true        -- 真彩色
opt.signcolumn = "yes"          -- 始终显示 sign 列（git diff 标记）
opt.wrap = false                -- 默认不换行
opt.list = true                 -- 显示空白字符
opt.listchars = { tab = '→ ', trail = '·', extends = '⟩', precedes = '⟨', nbsp = '␣' }

-- 性能
opt.updatetime = 250
opt.timeoutlen = 300            -- mapping 等待时间

-- 系统剪贴板（需要 xclip/xsel）
opt.clipboard = 'unnamedplus'

-- ====== 键位 ======
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

local map = vim.keymap.set
map('n', '<leader>w', ':w<CR>', { desc = 'Save' })
map('n', '<leader>q', ':q<CR>', { desc = 'Quit' })
map('n', '<leader>x', ':x<CR>', { desc = 'Save & Quit' })
map('n', '<Esc>', ':nohlsearch<CR>', { silent = true })

-- 不复制到剪贴板的删除
map({ 'n', 'v' }, '<leader>d', '"_d', { desc = 'Delete (no yank)' })

-- 移动选中行
map('v', 'J', ":m '>+1<CR>gv=gv")
map('v', 'K', ":m '<-2<CR>gv=gv")

-- 窗口切换
map('n', '<C-h>', '<C-w>h')
map('n', '<C-j>', '<C-w>j')
map('n', '<C-k>', '<C-w>k')
map('n', '<C-l>', '<C-w>l')
```

### 模板 B — lazy.nvim 起手式（带几个核心插件）

```bash
# 装 lazy.nvim（一次性）
git clone --filter=blob:none --branch=stable \
  https://github.com/folke/lazy.nvim.git \
  ~/.local/share/nvim/lazy/lazy.nvim
```

```lua
-- 在 init.lua 末尾追加
vim.opt.rtp:prepend(vim.fn.stdpath("data") .. "/lazy/lazy.nvim")

require("lazy").setup({
    -- 主题
    {
        "folke/tokyonight.nvim",
        lazy = false,
        priority = 1000,
        config = function() vim.cmd.colorscheme("tokyonight-night") end,
    },

    -- 模糊查找（fzf 替代）
    {
        "nvim-telescope/telescope.nvim",
        tag = "0.1.8",
        dependencies = { "nvim-lua/plenary.nvim" },
        keys = {
            { "<leader>ff", "<cmd>Telescope find_files<cr>", desc = "Find files" },
            { "<leader>fg", "<cmd>Telescope live_grep<cr>", desc = "Live grep (rg)" },
            { "<leader>fb", "<cmd>Telescope buffers<cr>", desc = "Buffers" },
            { "<leader>fh", "<cmd>Telescope help_tags<cr>", desc = "Help tags" },
        },
    },

    -- Treesitter（语法高亮 + 代码导航）
    {
        "nvim-treesitter/nvim-treesitter",
        build = ":TSUpdate",
        config = function()
            require("nvim-treesitter.configs").setup({
                ensure_installed = { "lua", "python", "go", "rust", "typescript", "yaml", "json" },
                highlight = { enable = true },
                indent = { enable = true },
            })
        end,
    },

    -- 文件树
    {
        "nvim-tree/nvim-tree.lua",
        keys = { { "<leader>e", "<cmd>NvimTreeToggle<cr>", desc = "Tree" } },
        config = function() require("nvim-tree").setup() end,
    },

    -- LSP（用 mason 自动管理 server）
    {
        "neovim/nvim-lspconfig",
        dependencies = { "williamboman/mason.nvim", "williamboman/mason-lspconfig.nvim" },
        config = function()
            require("mason").setup()
            require("mason-lspconfig").setup({
                ensure_installed = { "lua_ls", "pyright", "gopls", "rust_analyzer", "ts_ls" },
            })
            local lspconfig = require("lspconfig")
            for _, server in ipairs({ "lua_ls", "pyright", "gopls", "rust_analyzer", "ts_ls" }) do
                lspconfig[server].setup({})
            end

            vim.api.nvim_create_autocmd("LspAttach", {
                callback = function(ev)
                    local opts = { buffer = ev.buf }
                    vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
                    vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
                    vim.keymap.set("n", "<leader>r", vim.lsp.buf.rename, opts)
                    vim.keymap.set("n", "<leader>a", vim.lsp.buf.code_action, opts)
                end,
            })
        end,
    },

    -- 自动补全
    {
        "hrsh7th/nvim-cmp",
        dependencies = { "hrsh7th/cmp-nvim-lsp", "hrsh7th/cmp-buffer", "hrsh7th/cmp-path" },
        config = function()
            local cmp = require("cmp")
            cmp.setup({
                sources = { { name = "nvim_lsp" }, { name = "buffer" }, { name = "path" } },
                mapping = cmp.mapping.preset.insert({
                    ["<C-Space>"] = cmp.mapping.complete(),
                    ["<CR>"] = cmp.mapping.confirm({ select = true }),
                }),
            })
        end,
    },
})
```

### 模板 C — 直接用预制 distro（最快上手）

适合不想维护配置的人：

| Distro | 特点 |
|---|---|
| [LazyVim](https://www.lazyvim.org/) | 最流行，模块化，文档完整 |
| [NvChad](https://nvchad.com/) | 漂亮，启动快，中文社区活跃 |
| [AstroNvim](https://astronvim.com/) | 功能最全，复杂度也最高 |
| [kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim) | 单文件起步模板，自己定制基础 |

LazyVim 安装：

```bash
mv ~/.config/nvim ~/.config/nvim.bak             # 备份原配置
git clone https://github.com/LazyVim/starter ~/.config/nvim
rm -rf ~/.config/nvim/.git
nvim                                             # 启动后 lazy.nvim 自动装 90+ 插件
```

## 关键参数调优速查

### 启动速度

```bash
# 看启动耗时
nvim --startuptime /tmp/nvim.log
sort -k2 -n /tmp/nvim.log | tail -20
```

慢源排查：

| 慢源 | 解决 |
|---|---|
| 同步加载所有插件 | lazy.nvim 默认懒加载，按 keys / cmd / event 触发 |
| 大量 vimscript 插件 | 改用 lua 替代品（vim-airline → lualine.nvim） |
| 启动时全量 LSP 启动 | 用 `event = "BufReadPre"` 延迟 |
| `~/.local/share/nvim` 巨大 | 清空 `nvim --headless +"Lazy clean" +qa` |

### 远程编辑场景（轻量配置）

服务器上不开 LSP / treesitter（占内存 + CPU），仅 syntax + 简单插件：

```lua
-- 仅启用必需的：
vim.opt.syntax = "on"
vim.opt.number = true
-- 不要 lazy.nvim / 不要插件
```

### 内存占用

| 配置 | 内存 |
|---|---|
| 极简（模板 A） | ~30 MB |
| 模板 B（带 LSP / treesitter） | 200-400 MB（每个 LSP server 占 100 MB） |
| LazyVim 完整 | 400-800 MB |

低配 VPS（512 MB）建议用模板 A，不开 LSP。

## 跨发行版兼容

| 项 | Ubuntu 22 | Ubuntu 24 | Debian 12 | RHEL/Anolis 9 |
|---|---|---|---|---|
| 默认仓库 nvim 版本 | 0.6 ⚠️ | 0.9 ✅ | 0.7 ⚠️ | 0.10 ✅ |
| 推荐安装方式 | PPA / AppImage | 默认仓库 | unstable / AppImage | EPEL ✅ |
| EPEL 启用 | – | – | – | EnvForge preflight 自动 |

老版本（0.6/0.7）会让现代插件 distro 报错；本 Playbook 装系统包版本满足最低要求。要最新版手动走 AppImage / snap 路线。

## 与其它 catalog 项的配合

- **`git-version-control`** — vim-fugitive / gitsigns 等 git 集成插件依赖系统 git
- **`rust-cli-tools`** — Telescope live_grep 用 ripgrep 后端，本机有 rg 才跑得快
- **`tmux-multiplex`** — vim-tmux-navigator 让 `<C-h/j/k/l>` 跨 tmux pane / nvim window 切换
- **`zsh-shell`** — 在 zsh 里 `EDITOR=nvim` 让 `git commit` 用 nvim 写 commit message

## 排错

### `nvim: command not found`

```bash
which nvim                            # 确认
ls /usr/bin/nvim /usr/local/bin/nvim
echo $PATH

# Ubuntu 22 老版本可能装到 /usr/share/nvim/...，未在 PATH
sudo apt-get install --reinstall neovim
```

### `:checkhealth` 报 Python provider 缺失

```bash
pip install --user pynvim         # 系统 Python
# 或在 venv 里
python -m venv ~/.local/nvim-venv
~/.local/nvim-venv/bin/pip install pynvim
# 然后 init.lua 加：
# vim.g.python3_host_prog = vim.fn.expand("~/.local/nvim-venv/bin/python")
```

### LSP 装好但 `gd` 不工作 / 没补全

```vim
:LspInfo                          " 看 server 是否 attached 到当前 buffer
:Mason                            " 看 LSP server 是否真装上了
:checkhealth lsp
```

常见原因：

1. 文件类型识别错（`:set filetype?`）
2. LSP server 二进制不在 PATH（mason 装的在 `~/.local/share/nvim/mason/bin/`）
3. 项目根目录识别失败（创建一个 `.git/` 或语言特定的标记文件）

### Treesitter 高亮挂掉 / 语法高亮变全白

```vim
:TSUpdate                         " 重装 parser
:TSInstallInfo                    " 看哪些装了
```

或某语言 parser 编译失败（需要 C 编译器 + `tree-sitter-cli`）：

```bash
sudo apt-get install build-essential       # Ubuntu
sudo dnf groupinstall 'Development Tools'  # RHEL
npm install -g tree-sitter-cli
```

### 启动 nvim 时 `:Lazy install` 卡住

国内服务器到 GitHub 慢。改 lazy.nvim 用 git 镜像：

```lua
require("lazy").setup({
    ...,
}, {
    git = {
        url_format = "https://gitee.com/mirrors/%s.git",   -- 不是所有插件都有镜像
    },
})
```

或全局 git 配置 GitHub 镜像（影响 lazy.nvim）：

```bash
git config --global url."https://ghproxy.com/https://github.com/".insteadOf "https://github.com/"
```

### `:set clipboard=unnamedplus` 后 yank 不进系统剪贴板

需要 `xclip` 或 `xsel`（X11）/ `wl-copy`（Wayland）：

```bash
sudo apt-get install xclip xsel
```

SSH 进服务器（无 GUI）时**不能**用系统剪贴板——除非 SSH 开 X11 转发或用 `set clipboard^=unnamedplus,unnamed` + 终端的 OSC 52 支持。

### 想退出但忘了怎么退

```
Esc Esc :q!<Enter>             # 强制退出不保存
Esc Esc ZZ                      # 保存退出
Esc Esc ZQ                      # 不保存退出
```

## 验证

```bash
# 1. 命令存在 + 版本
nvim --version | head -1            # 应 >= 0.7

# 2. 能启动并退出
nvim -c 'q'

# 3. 配置不报错
nvim --headless -c 'echo "OK"' -c 'q'

# 4. checkhealth 有用 OK
nvim --headless -c 'checkhealth' -c 'q' 2>&1 | head -30

# 5. 编辑文件
echo "test" > /tmp/nvim-test.txt
nvim /tmp/nvim-test.txt -c ':wq'
cat /tmp/nvim-test.txt
rm /tmp/nvim-test.txt
```

## 多次运行

`installMode: skip-existing`。包安装幂等。`init.lua` 仅在不存在时写入——重跑不覆盖用户定制。lazy.nvim 安装有 `creates` 守卫。

要升级 nvim 自身：

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get upgrade neovim

# RHEL / Anolis
sudo dnf upgrade neovim

# AppImage 方式
curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
chmod u+x nvim.appimage && sudo mv nvim.appimage /usr/local/bin/nvim
```

## ⚠️ 敏感性

**safe** — 装文本编辑器。

## 隐私说明

- Neovim 不发遥测
- 插件安装时从 GitHub 拉源码（公开请求）
- LSP server 通常本地跑，不上传代码——但**部分托管 LSP 例外**（如 Tabnine / GitHub Copilot），慎用
- Mason 装 LSP 时下载二进制到本地，不发送代码
- `~/.local/share/nvim/shada` 含搜索历史 / 寄存器内容（含 yank 过的文本），权限 0600
