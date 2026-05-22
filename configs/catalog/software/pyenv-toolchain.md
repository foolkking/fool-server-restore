# pyenv (Python 版本管理)

pyenv 让一台机器装多个 Python 版本，每个项目用不同版本。比 nvm 慢（要从源码编译每个 Python 版本，
首次 5-15 分钟），但是装多版本 Python 的标准方案。

## 你将得到什么

- ✅ pyenv 装到 `~/.pyenv`
- ✅ 编译 Python 需要的所有 build 依赖（zlib / openssl / sqlite / readline / 等）
- ✅ 默认 Python 版本（按表单选择）

## 用法

### 必须重开 shell

pyenv 改 `~/.bashrc`，新开 shell 后才生效：
```bash
pyenv versions      # 已装版本
python --version    # 当前默认版本
```

### 装更多版本

```bash
pyenv install --list           # 所有可装版本
pyenv install 3.11.10
pyenv install 3.13.0
pyenv versions                 # 看已装
```

每次都从源码编译，5-15 分钟一个版本（取决于 CPU）。

### 切换版本

```bash
pyenv global 3.12.7   # 全局默认
pyenv local 3.11.10    # 当前目录（写到 .python-version 文件）
pyenv shell 3.10.15    # 仅当前 shell
```

`.python-version` 文件可以提交到 git，团队成员 `pyenv install` 后自动用对的版本。

### 配 venv（推荐用 pyenv 内置的）

```bash
# pyenv-virtualenv 插件
git clone https://github.com/pyenv/pyenv-virtualenv.git ~/.pyenv/plugins/pyenv-virtualenv

# 在 ~/.bashrc 加
echo 'eval "$(pyenv virtualenv-init -)"' >> ~/.bashrc

# 创建 venv
pyenv virtualenv 3.12.7 myproject-3.12
pyenv activate myproject-3.12
pip install ...
```

### 国内编译加速

`pyenv install` 从 python.org 下载源码，国内慢。设镜像：
```bash
echo 'export PYTHON_BUILD_MIRROR_URL="https://cdn.npmmirror.com/binaries/python"' >> ~/.bashrc
echo 'export PYTHON_BUILD_MIRROR_URL_SKIP_CHECKSUM=1' >> ~/.bashrc
```

## ⚠️ 敏感性

**safe** — 装到用户目录。但需要装一堆 build 依赖（gcc / openssl-dev 等），属于 `build-essential` 范畴。

## 验证

```bash
pyenv --version
pyenv versions
python --version
```

## 排错

- **编译失败 + `Modules/_ssl.c: error`** — `openssl-dev` 没装。重跑 Playbook 应该会装。
- **编译失败 + `Modules/_ctypes/...: error`** — `libffi-dev` 没装。
- **编译极慢** — 这是正常的（Python 是大项目）。CPU 弱的机器（1 vCPU）20+ 分钟。
- **`pyenv: command not found`** — `~/.bashrc` 没被加载或 PATH 没设。检查 ~/.bashrc 末尾应该有 `export PATH="$HOME/.pyenv/bin:$PATH"`。
- **跨发行版**：build 依赖包名差异极大，EnvForge 已经分别处理 Ubuntu/Debian 和 RHEL/Anolis。

## 多次运行

`installMode: skip-existing`。pyenv 已装就跳过，但默认 Python 版本如果不存在会重新装。

## 隐私说明

不发遥测。从 python.org 下载官方源码包。
