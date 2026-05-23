# Python 工具链

装系统 Python 3 + pip + venv + 编译依赖。让 `pip install` 那些带 C 扩展的包（`cryptography` / `psycopg2` / `numpy` / `pillow` / `lxml` 等）能顺利编过。**用系统 Python**——单版本就够用 + 重启不丢。要多版本走 `pyenv-toolchain`。

## 你将得到什么

- 📦 **python3** + **python3-pip** + **python3-venv**
- 📦 **python3-dev**（Ubuntu/Debian）/ **python3-devel**（RHEL/Anolis）— `Python.h` 头文件
- 📦 **build-essential** / `Development Tools` 组（gcc / make / 等）
- ✅ EnvForge 验证 `python3 -m venv` 能创建虚拟环境

注意：本 Playbook **不动**系统 pip 镜像源也**不**装 poetry/ruff/mypy 等工具——避免影响其它项目。镜像源和工具按项目级别配。

## 配置文件 / 目录速查

```
/usr/bin/python3                  # 系统 Python 命令（指向具体版本如 python3.12）
/usr/lib/python3.X/               # 标准库
/usr/lib/python3/dist-packages/   # apt 装的 Python 包（Debian/Ubuntu）
/usr/lib/python3.X/site-packages/ # pip 装的系统级包（RHEL/Anolis）

# 用户级（不要 sudo pip 装！）
$HOME/.local/lib/python3.X/site-packages/    # pip install --user
$HOME/.local/bin/                            # 用户级脚本（PATH 需含）

# 项目级（最佳实践）
<project>/venv/                              # python3 -m venv venv
├── bin/python                               # 隔离的解释器
├── bin/pip
└── lib/python3.X/site-packages/             # 项目专属依赖

# pip 配置
~/.pip/pip.conf                              # 用户级（旧路径）
~/.config/pip/pip.conf                       # 用户级（新路径，XDG）
/etc/pip.conf                                # 系统级
```

| 路径 / 包名 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| Python 主命令 | `python3` (默认) | `python3` (默认 3.9) |
| 头文件包 | `python3-dev` | `python3-devel` |
| venv 模块 | 单独包 `python3-venv` | 内置在 `python3` 里 |
| 编译工具 | `build-essential` | `@development-tools` 组 |
| `python` 命令是否存在 | 默认 ❌ 没有 | 默认 ❌ 没有（要 `alternatives --set python /usr/bin/python3`） |
| pip 默认源 | pypi.org | pypi.org |
| 默认 Python 版本 | Ubuntu 22 = 3.10，Ubuntu 24 = 3.12，Debian 12 = 3.11 | RHEL 9 / Anolis 9 = 3.9（也可装 `python3.11` `python3.12`） |

## 常见配置模板

### 模板 A — 项目级虚拟环境（强烈推荐）

```bash
cd /opt/myapp                 # 或 /var/www/myapp、~/myapp 等
python3 -m venv venv          # 创建（一次性，几秒）
source venv/bin/activate      # 激活当前 shell
pip install --upgrade pip wheel setuptools
pip install -r requirements.txt
python myapp.py
deactivate                    # 退出
```

`venv/` 目录可加进 `.gitignore`，不入版本控制。`requirements.txt` 入版本控制。

### 模板 B — pip 国内镜像（用户级）

```bash
mkdir -p ~/.config/pip
cat > ~/.config/pip/pip.conf <<'EOF'
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
extra-index-url =
    https://mirrors.aliyun.com/pypi/simple/
trusted-host =
    pypi.tuna.tsinghua.edu.cn
    mirrors.aliyun.com
timeout = 60
EOF
```

国内服务器 `pip install torch` 速度从 ~100KB/s 提到 ~30MB/s。

镜像源对比：

| 源 | 速度 | 同步频率 |
|---|---|---|
| 清华 TUNA | 快 | 5 分钟 |
| 阿里云 | 快 | 30 分钟 |
| 腾讯云 | 中 | 1 小时 |
| 华为云 | 中 | 不定 |
| 中科大 | 中 | 不定 |

### 模板 C — 系统级 pip 包管理（用 pipx）

不要 `sudo pip install`！用 [pipx](https://pipx.pypa.io/) 隔离每个 CLI 工具：

```bash
# 装 pipx 本身（用户级）
python3 -m pip install --user pipx
python3 -m pipx ensurepath
exec $SHELL                         # 重载 shell PATH

# 装工具（每个工具独立 venv）
pipx install poetry
pipx install ruff
pipx install black
pipx install mypy
pipx install pre-commit
pipx install httpie
pipx list                            # 看装了什么
```

### 模板 D — systemd 服务跑 Python 应用

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Python App
After=network.target

[Service]
Type=simple
User=myapp
WorkingDirectory=/opt/myapp
# 必须用 venv 里的 python（不要 /usr/bin/python3）
ExecStart=/opt/myapp/venv/bin/python /opt/myapp/main.py
# 或对 web 应用：
# ExecStart=/opt/myapp/venv/bin/gunicorn -w 4 -b 127.0.0.1:8000 myapp.wsgi:application
Restart=on-failure
RestartSec=5
Environment="PYTHONUNBUFFERED=1"
Environment="PYTHONDONTWRITEBYTECODE=1"

[Install]
WantedBy=multi-user.target
```

## 关键参数调优速查

### Python 性能

| 参数 | 推荐值 | 说明 |
|---|---|---|
| `PYTHONUNBUFFERED=1` | 永远开 | 服务下日志立即输出（不缓冲） |
| `PYTHONDONTWRITEBYTECODE=1` | 容器/只读环境 | 不生成 `.pyc`（避免污染只读目录） |
| `PYTHONHASHSEED` | 测试时设固定值 | 复现 dict 顺序敏感的 bug |
| `PYTHONOPTIMIZE=1` | 生产 | 等价 `python -O`，跳过 assert |

### pip 安装稳定性

| 参数 | 推荐 | 说明 |
|---|---|---|
| `--no-cache-dir` | CI / Docker | 不缓存，减小镜像 |
| `--prefer-binary` | 慢机 | 优先 wheel（已编译），避免源码编译 |
| `--require-hashes` | 生产 | 校验依赖哈希，防供应链攻击 |
| `--upgrade-strategy=only-if-needed` | `pip install --upgrade` 时 | 不升级已满足的依赖 |

### Web 应用并发模型（gunicorn）

| 模式 | 适用 | workers |
|---|---|---|
| sync (默认) | CPU 密集，无外部 IO | `2 × CPU + 1` |
| gthread | 混合负载 | workers ≈ CPU，threads = 2-4 |
| gevent / eventlet | 大量 IO 等待 | workers ≈ CPU，每 worker 1000+ 协程 |
| uvicorn workers | ASGI / asyncio | workers ≈ CPU |

## 跨发行版兼容

EnvForge 通过 PACKAGE_ALIASES 自动处理：

| Playbook 里写 | Ubuntu/Debian 实际装 | RHEL/Anolis 实际装 |
|---|---|---|
| `python3` | `python3` | `python3` |
| `python3-pip` | `python3-pip` | `python3-pip` |
| `python3-venv` | `python3-venv` | （包含在 python3，无单独包） |
| `python3-dev` | `python3-dev` | `python3-devel` |
| `build-essential` | `build-essential` | `@development-tools` 包组 |

**注意 RHEL/Anolis 9 默认 Python 是 3.9**——很多新项目要 3.11+。手动装：

```bash
# Anolis 9 / RHEL 9
sudo dnf install python3.11 python3.11-pip python3.11-devel
sudo dnf install python3.12 python3.12-pip python3.12-devel        # AppStream

# 用 alternatives 切默认（影响系统脚本，慎用）
sudo alternatives --set python3 /usr/bin/python3.11

# 或在项目里直接：
python3.11 -m venv venv
```

要更灵活的多版本管理，用 `pyenv-toolchain`。

## 与其它 catalog 项的配合

- **`pyenv-toolchain`** — 多 Python 版本切换；和系统 Python 不冲突
- **`postgres-profile` / `mysql-server`** — Python 连数据库需 `psycopg2-binary` / `pymysql`，前者编译依赖已被本 Playbook 装好
- **`docker-host-profile`** — `python:3.12-slim` 基础镜像 + `pip install --no-cache-dir` 是标准 Dockerfile 模式
- **`nginx-web-service`** — gunicorn + nginx 反代是 Django/Flask 标准生产部署

## 排错

### `No module named 'venv'`（仅 Ubuntu/Debian）

```bash
sudo apt-get install python3-venv
```

为什么会缺：Debian 系把 venv 拆成单独包以减小最小安装体积。重跑 Playbook 即可。

### 编译 C 扩展报 `fatal error: Python.h: No such file or directory`

```bash
# Ubuntu/Debian
sudo apt-get install python3-dev

# RHEL/Anolis
sudo dnf install python3-devel
```

如果是装 `python3.11` 的扩展，对应 `python3.11-dev` / `python3.11-devel`。

### 编译 cryptography / pycurl 报 `error: command 'gcc' failed`

`build-essential` 没装。重跑 Playbook，或：

```bash
sudo apt-get install build-essential libssl-dev libffi-dev      # Ubuntu/Debian
sudo dnf groupinstall 'Development Tools'                        # RHEL/Anolis
sudo dnf install openssl-devel libffi-devel
```

### `pip install` 提示 `error: externally-managed-environment` (Ubuntu 23.04+)

PEP 668 默认禁止 `pip install` 改系统 Python（避免和 apt 冲突）。三种应对：

```bash
# 1. 用 venv（推荐）
python3 -m venv venv && source venv/bin/activate && pip install ...

# 2. 用 pipx（CLI 工具）
pipx install <tool>

# 3. 强制（不推荐）
pip install --break-system-packages <pkg>
```

### `pip install` 极慢 / timeout

设国内镜像（模板 B）。或临时：

```bash
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple <pkg>
```

### `python` 命令不存在（只有 `python3`）

Ubuntu/RHEL 都默认只装 `python3`。两种方案：

```bash
# 方案 1（Ubuntu）
sudo apt-get install python-is-python3

# 方案 2（通用）
sudo ln -s /usr/bin/python3 /usr/local/bin/python
```

注意：脚本里写 `#!/usr/bin/env python` 会因此影响。生产建议 `python3` 显式。

### `pip` 装的工具找不到（如 `black: command not found`）

`pip install --user` 装到 `~/.local/bin`，需在 PATH。

```bash
echo 'export PATH=$PATH:$HOME/.local/bin' >> ~/.bashrc
source ~/.bashrc
```

或用 `pipx`（自动处理 PATH）。

## 验证

```bash
# 1. 基础命令
python3 --version
python3 -m pip --version
gcc --version

# 2. venv 能创建
python3 -m venv /tmp/.envforge-test-venv && \
  /tmp/.envforge-test-venv/bin/python --version && \
  rm -rf /tmp/.envforge-test-venv

# 3. C 扩展能编译（最常见的几个）
python3 -m venv /tmp/test-compile && source /tmp/test-compile/bin/activate
pip install --quiet cryptography || echo "❌ cryptography 编译失败"
pip install --quiet psycopg2-binary || echo "❌ psycopg2-binary 装失败"
deactivate && rm -rf /tmp/test-compile
```

## 多次运行

`installMode: skip-existing`。各包用 apt/dnf 的幂等行为——已装跳过，未装才装。重跑安全。

## ⚠️ 敏感性

**safe** — 装语言运行时和编译依赖，不开端口、不动业务数据。

## 隐私说明

- pip 默认**不发遥测**
- `pip install` 时会发 User-Agent 给 PyPI（含 Python 版本、OS 类型），不含个人信息
- 用国内镜像后，请求会发到镜像运营方（清华 / 阿里云等）
- `~/.config/pip/pip.conf` 如果配了私有源凭据（如 `https://user:pass@artifactory/...`），权限自动 0644——建议手动改 0600
