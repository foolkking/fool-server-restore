# Python 工具链

装系统 Python 3 + pip + venv + 编译依赖（让 `pip install <C 扩展>` 能编过，
比如 cryptography、psycopg2、numpy 这种带原生代码的包）。

## 你将得到什么

- 📦 **python3**（系统 Python，Ubuntu 24 是 3.12，Anolis 9 是 3.9）
- 📦 **python3-pip** — pip 包管理器
- 📦 **python3-venv** — 虚拟环境模块
- 📦 **python3-dev** — Python.h 头文件（编译 C 扩展用）
- 📦 **build-essential** — gcc / make 等编译工具

## 用法

### 创建虚拟环境（强烈推荐）

```bash
cd /var/www/myapp
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**永远不要 `sudo pip install`**——会污染系统 Python，apt/dnf 也管不了，后续升级出 bug。

### 切换 PyPI 镜像（国内速度）

```bash
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
# 或者
pip config set global.index-url https://mirrors.aliyun.com/pypi/simple
```

### Python 版本管理（多版本）

如果需要在同一台机器上跑多个 Python 版本（项目 A 要 3.9，项目 B 要 3.12），
用 `pyenv`（catalog 里单独的 Playbook）。**不要**用 `update-alternatives` 或编译多个 Python——
会把系统包管理器搞乱。

### 推荐工具栈

```bash
# 项目依赖管理
pip install poetry           # 类似 npm 的依赖管理 + 虚拟环境一体
# 或
pip install pipenv           # 老一点但仍流行

# 代码格式化 / lint
pip install ruff             # 取代 black + flake8 + isort，快 100 倍
pip install mypy             # 静态类型检查

# 测试
pip install pytest pytest-cov

# Web 框架（项目级安装）
pip install fastapi uvicorn[standard]
pip install django gunicorn
```

## ⚠️ 敏感性

**safe** — 只是装语言运行时和编译依赖。不动业务数据。

## 验证

```bash
python3 --version
python3 -m pip --version
python3 -m venv /tmp/test-venv && rm -rf /tmp/test-venv && echo "venv OK"
gcc --version
```

## 排错

- **`No module named 'venv'`** — Ubuntu/Debian 上 venv 单独打包成 `python3-venv`，没装。重跑 Playbook。
- **`error: Python.h: No such file`** — 编译某 C 扩展时报错，意味 python3-dev 没装。重跑 Playbook。
- **`error: Microsoft Visual C++ 14.0 is required`** — 这是 Windows 的错，Linux 上不会出现。
- **跨发行版**：包名有差异（Ubuntu `python3-dev` vs RHEL `python3-devel`），EnvForge 已通过 PACKAGE_ALIASES 自动翻译。`build-essential` 在 RHEL 上没这个名字，会被翻译为 `@development-tools` 包组。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

不装任何上传/同步组件。pip 默认不发遥测。
