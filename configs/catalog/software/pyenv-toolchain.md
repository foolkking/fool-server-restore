# pyenv (Python 版本管理)

pyenv 让一台机器装多个 Python 版本，每个项目用不同版本。比 NVM 慢——每个 Python 版本要从源码编译（5-15 分钟，CPU 弱的机器更久），但是 Linux 上多版本 Python 的事实标准。开发机推荐；生产机器单版本走 `python-toolchain` 更稳定。

## 你将得到什么

- ✅ pyenv 装到 `~/.pyenv`（用户家目录，不污染系统）
- ✅ 编译 Python 必备的 build 依赖（zlib / openssl / sqlite / readline / bz2 / ffi / lzma）
- ✅ `~/.bashrc`（zsh 用户需手动复制到 `~/.zshrc`）末尾加 pyenv 加载逻辑
- ✅ 默认 Python 版本（按表单选择）已编译并设为 `pyenv global`

## 表单字段说明

### `default_version`

pyenv 装好后立刻编译的 Python 版本。可选：

| 值 | 含义 | EOL |
|---|---|---|
| `3.12.7` | 当前**推荐**生产版本 | 2028-10 |
| `3.13.0` | 最新 stable | 2029-10 |
| `3.11.10` | 老但稳定 | 2027-10 |
| `3.10.15` | 兼容老依赖 | 2026-10 |
| `3.9.20` | 仅维护期 | 2025-10 |
| 空 | 不装默认版本（仅装 pyenv） | – |

## 配置文件 / 目录速查

```
$HOME/.pyenv/
├── bin/
│   └── pyenv                              # 主命令
├── plugins/                               # 插件（pyenv-virtualenv 等）
├── versions/                              # 各 Python 版本独立目录
│   ├── 3.12.7/
│   │   ├── bin/python                     # 此版本独立的解释器
│   │   ├── lib/python3.12/site-packages/  # 此版本独立的包
│   │   └── ...
│   └── 3.11.10/
├── shims/                                 # PATH 里的 stub（拦截 python/pip 调用，转发到当前版本）
├── version                                # 全局默认（pyenv global 写这里）
└── .python-version                        # 当前目录（pyenv local 写这里）

# 用户级
$HOME/.bashrc                              # 末尾加 pyenv init -

# 项目级
<project>/.python-version                  # 进入此目录自动切到指定版本
<project>/venv/                            # 推荐：每个项目独立 venv
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| pyenv 安装 | 用户级 `~/.pyenv` | 相同 |
| build 依赖（核心） | `build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev libffi-dev liblzma-dev` | `gcc make zlib-devel bzip2-devel readline-devel sqlite-devel openssl-devel libffi-devel xz-devel`（PACKAGE_ALIASES 自动翻译） |
| build 依赖（额外） | `libncursesw5-dev tk-dev xz-utils libxml2-dev libxmlsec1-dev` | `ncurses-devel tk-devel libxml2-devel xmlsec1-devel` |
| GCC 版本 | Ubuntu 24 = 13，Ubuntu 22 = 11，Debian 12 = 12 | RHEL 9 / Anolis 9 = 11 |

## 常见配置模板

### 模板 A — 国内编译镜像加速

`pyenv install 3.12.7` 默认从 `python.org/ftp/python/...` 下源码 tarball，国内慢。设镜像：

```bash
# ~/.bashrc 末尾追加
export PYTHON_BUILD_MIRROR_URL="https://cdn.npmmirror.com/binaries/python"
export PYTHON_BUILD_MIRROR_URL_SKIP_CHECKSUM=1

# 重开 shell
source ~/.bashrc

# 测试
pyenv install 3.13.0
```

国内服务器从 `python.org` 下载 ~30 分钟提到 ~3 分钟。

### 模板 B — 项目级版本绑定

```bash
cd /opt/myproject

# 写当前目录用什么版本（写到 .python-version）
pyenv local 3.12.7

# 看效果
cat .python-version            # 3.12.7
python --version               # 进入此目录就是 3.12.7

# 提交到 git，团队成员 cd 进来后自动切
git add .python-version
git commit -m "Pin Python 3.12"
```

进目录后 `python` 自动是 3.12.7（前提是该版本已 `pyenv install`）。

### 模板 C — pyenv-virtualenv 插件（推荐）

直接在 pyenv 里管 venv，比 `python -m venv` 更顺手：

```bash
# 装插件
git clone https://github.com/pyenv/pyenv-virtualenv.git ~/.pyenv/plugins/pyenv-virtualenv

# 加 init 到 .bashrc
echo 'eval "$(pyenv virtualenv-init -)"' >> ~/.bashrc
source ~/.bashrc

# 创建 venv（基于 3.12.7）
pyenv virtualenv 3.12.7 myproject-3.12

# 项目里设默认 venv
cd /opt/myproject
pyenv local myproject-3.12
# 现在进 myproject 自动激活该 venv

# 列所有 venv
pyenv virtualenvs

# 删 venv
pyenv virtualenv-delete myproject-3.12
```

### 模板 D — 多项目并存示例

```bash
# 装多个 Python 版本
pyenv install 3.10.15
pyenv install 3.11.10
pyenv install 3.12.7
pyenv install 3.13.0

# 全局默认（命令行直接 python 用什么）
pyenv global 3.12.7

# 项目级：每个项目一个版本
cd /opt/legacy-django2     && pyenv local 3.10.15
cd /opt/modern-fastapi     && pyenv local 3.13.0
cd /opt/data-pipeline      && pyenv local 3.12.7

# 看 pyenv 选了哪个版本
pyenv version
pyenv versions     # * 标记当前选中
```

## 关键参数调优速查

### 编译速度优化

| 措施 | 效果 |
|---|---|
| 设国内镜像（模板 A） | 下载 10× |
| `MAKE_OPTS='-j$(nproc)'` `pyenv install` | 并行编译 |
| `PYTHON_CONFIGURE_OPTS="--enable-shared"` | 编译动态库（某些 C 扩展需要） |
| `PYTHON_CONFIGURE_OPTS="--enable-optimizations --with-lto"` | PGO + LTO，运行慢 1.5-2× 但编译慢 5× |
| 用预编译版（pyenv-install-pkg-bin 插件） | 跳过编译 |

预编译路线：

```bash
# 用 python-build 直接装 indygreg 预编译版
pyenv install --list | grep "^[[:space:]]*3" | tail -5

# 或用 mise（替代 pyenv，支持预编译二进制）
curl https://mise.run | sh
mise install python@3.12.7      # 秒装，无需编译
```

### 启动延迟

pyenv shim 机制让 `python` 命令首次解析慢 50-100ms（每次 shell 启动也慢）。优化：

```bash
# 方案 1：直接调用具体版本（绕过 shim）
~/.pyenv/versions/3.12.7/bin/python myapp.py

# 方案 2：用 mise 替代 pyenv（go 写的，启动快 10×）

# 方案 3：CI / 脚本里用 PYENV_VERSION 而非 pyenv shell
PYENV_VERSION=3.12.7 python myapp.py
```

### 编译 Python 减小体积（不常用但有时需要）

```bash
PYTHON_CONFIGURE_OPTS="--without-doc-strings --enable-optimizations" pyenv install 3.12.7
```

## 跨发行版兼容

pyenv 是 shell 脚本，依赖发行版的编译工具链。大部分编译失败都是少装了某个 `*-dev` / `*-devel` 包。

完整 build 依赖列表：

```bash
# Ubuntu 22 / 24, Debian 12（本 Playbook 自动装）
sudo apt-get install -y make build-essential libssl-dev zlib1g-dev \
  libbz2-dev libreadline-dev libsqlite3-dev wget curl llvm \
  libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev

# RHEL 9 / Anolis 9（本 Playbook 自动装）
sudo dnf install -y make gcc patch zlib-devel bzip2 bzip2-devel readline-devel \
  sqlite sqlite-devel openssl-devel tk-devel libffi-devel xz-devel
```

**Anolis 9 / RHEL 9 注**：默认 GCC 11 能编 Python 3.9-3.12；编 3.13 需要 GCC 12+，但 RHEL 9 默认就是 11——3.13 仍能编但会有 warning，可忽略。

**Alpine 不被本 Playbook 支持**——musl libc 编译 Python 经常出意外，建议用 `python:3.12-alpine` 容器或 `apk add python3` 系统包。

## 与其它 catalog 项的配合

- **`python-toolchain`** — 系统级 Python（apt/dnf 包）；**和 pyenv 不冲突**——pyenv 通过 PATH 优先级覆盖。卸 pyenv 后系统 Python 仍可用
- **`postgres-profile`** — pyenv 装的 Python 编译时若没装 `libpq-dev` / `postgresql-devel`，后续 `pip install psycopg2` 会编不过；本 Playbook 不装这些（避免污染），按需手动加
- **`docker-host-profile`** — 容器里**不要用 pyenv**！直接 `FROM python:3.12-slim`。pyenv 适合开发机不适合容器
- **`zsh-shell` / `fish-shell`** — pyenv 默认只改 `.bashrc`：
    - zsh 用户：把 `eval "$(pyenv init -)"` 加到 `~/.zshrc` 末尾
    - fish 用户：用 [`pyenv-fish`](https://github.com/pyenv/pyenv/wiki) 或在 `~/.config/fish/config.fish` 加 `pyenv init - | source`

## 排错

### 编译失败 + `Modules/_ssl.c: error: undeclared identifier`

`openssl-devel` / `libssl-dev` 没装。重跑 Playbook 会装。手动：

```bash
sudo apt-get install libssl-dev      # Ubuntu/Debian
sudo dnf install openssl-devel        # RHEL/Anolis
```

注意 RHEL 9 的 OpenSSL 1.1 → 3.0 切换，编 Python 3.9 可能要 OpenSSL 1.1（用 `dnf install openssl11-devel`），3.10+ 都用默认 OpenSSL 3 没问题。

### 编译失败 + `Modules/_ctypes/...: error`

`libffi-dev` / `libffi-devel` 没装。

### 编译失败 + `Modules/zlib.c` 或 `Modules/_bz2module.c`

```bash
# Ubuntu/Debian
sudo apt-get install zlib1g-dev libbz2-dev liblzma-dev

# RHEL/Anolis
sudo dnf install zlib-devel bzip2-devel xz-devel
```

### 编译极慢（20+ 分钟）

正常——Python 是 50 万行 C 代码大项目。优化：

```bash
# 并行编译
MAKE_OPTS='-j$(nproc)' pyenv install 3.12.7

# 或换预编译方案（mise）
```

CPU 1 核 + 1GB 内存的廉价 VPS 经常 OOM 杀编译进程，需先加 swap（`swap-config` Playbook）。

### `pyenv: command not found`

`~/.bashrc` 没被加载或 PATH 没包含 `~/.pyenv/bin`：

```bash
# 检查
grep pyenv ~/.bashrc
echo $PATH | tr ':' '\n' | grep pyenv

# 临时
export PATH="$HOME/.pyenv/bin:$PATH"
eval "$(pyenv init -)"

# 永久（zsh）
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
echo 'eval "$(pyenv init -)"' >> ~/.zshrc
```

### 切版本后 `python` 还是老的

shim 没刷新：

```bash
pyenv rehash               # 重建 shim
hash -r                    # 清 shell 命令缓存
```

或重开 shell。

### `pip install` 报 `error: Microsoft Visual C++ 14.0 is required`

这是 Windows 错误，Linux 上不会出现。如果在 Linux 看到，是包错——清缓存重装：

```bash
pip cache purge
pip install --no-binary :all: <pkg>
```

### 卸载 pyenv

```bash
rm -rf ~/.pyenv
# 删 .bashrc 末尾的 pyenv 加载块
sed -i '/pyenv/d' ~/.bashrc
```

## 验证

```bash
# 1. pyenv 命令可用（新 shell 或 source 后）
bash -lc 'pyenv --version'

# 2. 已装版本列表
bash -lc 'pyenv versions'

# 3. 当前默认 Python 来自 pyenv
bash -lc 'which python && python --version'   # 路径含 ~/.pyenv/shims

# 4. 编译 + 装个测试版本（耗时）
# bash -lc 'pyenv install -v 3.12.7'
```

## 多次运行

`installMode: skip-existing`。Playbook 用 `creates: $HOME/.pyenv/bin/pyenv` 守卫——已装跳过。重跑只会确认默认版本仍存在；默认版本若不存在会重新编译（耗时）。

要升级 pyenv 自身：

```bash
cd ~/.pyenv
git pull
pyenv --version
```

## ⚠️ 敏感性

**safe** — 装到用户家目录。但额外装大量 build 依赖到系统（`-dev`/`-devel` 包），算 review 边界——本 Playbook 取最宽松的 safe 因为这些 dev 包只是头文件和静态库，不增加攻击面也不开端口。

## 隐私说明

- pyenv 不发遥测
- `pyenv install` 从 `python.org/ftp/python/...`（默认）或国内镜像下源码；镜像方能看到你装哪些版本
- 编译过程完全本地，无网络通信
- pip 自身的隐私行为见 `python-toolchain.md`
