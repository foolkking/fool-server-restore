# Rust 工具链

通过官方 `rustup` 安装 Rust（rustc + cargo + clippy + rustfmt）。装到当前用户的 `~/.cargo`，不污染系统目录。多版本管理 / 升级 / nightly 切换都用 rustup 一条命令。

## 你将得到什么

- ✅ **rustup**（Rust 工具链管理器，等同 nvm 之于 Node）装在 `~/.rustup`
- ✅ **stable** 通道默认 toolchain：`rustc` / `cargo` / `clippy` / `rustfmt`
- ✅ 二进制装到 `~/.cargo/bin/`
- ✅ EnvForge 把 `~/.cargo/bin` 加到 `~/.bashrc` / `~/.zshenv` / fish config（rustup 默认只改 bash）
- ✅ 编译依赖：`build-essential` / `pkg-config` / `libssl-dev`（很多 crate 链接 OpenSSL）

## 配置文件 / 目录速查

```
$HOME/
├── .rustup/                # toolchain 安装位置（多版本共存）
│   ├── toolchains/
│   │   ├── stable-x86_64-unknown-linux-gnu/
│   │   └── nightly-x86_64-unknown-linux-gnu/
│   └── settings.toml       # 默认 toolchain
├── .cargo/
│   ├── bin/                # rustc / cargo / clippy 等命令在这里（PATH 必须包含）
│   ├── env                 # rustup 安装脚本生成的 source 文件
│   ├── config.toml         # ← 用户级 cargo 配置（镜像源 / 编译参数）
│   ├── credentials.toml    # ← cargo login 写入的 crates.io token（敏感）
│   └── registry/           # 依赖缓存（多项目共享）
└── .bashrc / .zshenv       # 末尾被加 source $HOME/.cargo/env

# 项目内
<project>/
├── Cargo.toml              # 依赖声明 + crate 元数据
├── Cargo.lock              # 锁定的依赖版本（lib 不提交，bin 提交）
└── target/                 # 编译产物（gitignore）
    ├── debug/
    └── release/
```

| 路径 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| rustup 安装位置 | `~/.rustup` | 相同（无系统级安装） |
| cargo bin | `~/.cargo/bin` | 相同 |
| 编译依赖包名 | `build-essential` `libssl-dev` `pkg-config` | `gcc` `openssl-devel` `pkgconfig`（PACKAGE_ALIASES 已翻译） |

## 常见配置模板

### 模板 A — 国内镜像 + 编译加速（`~/.cargo/config.toml`）

```toml
# 国内镜像源（rsproxy 比 USTC 更快更稳）
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[source.tuna]
registry = "https://mirrors.tuna.tsinghua.edu.cn/git/crates.io-index.git"

# git 拉取改用 git CLI（解决某些代理环境下 cargo 自带 libgit2 卡死）
[net]
git-fetch-with-cli = true

# 编译并行度（默认 = CPU 核数；CI 限制内存时降到 2）
[build]
jobs = 4

# Linux 用 mold 替代 ld（链接速度提 5-10 倍）
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

需先装 `mold`：
```bash
sudo apt-get install mold        # Ubuntu 24+ / Debian 13+
# 旧版本从源码：https://github.com/rui314/mold/releases
```

### 模板 B — 项目级 toolchain 锁定（`rust-toolchain.toml`）

放项目根目录，团队进入目录自动用对的 Rust 版本：

```toml
[toolchain]
channel = "1.81.0"               # 或 "stable" / "nightly-2025-01-15"
components = ["rustfmt", "clippy", "rust-src"]
targets = ["wasm32-unknown-unknown", "aarch64-unknown-linux-gnu"]
profile = "default"
```

### 模板 C — Release 构建优化（`Cargo.toml` 末尾）

```toml
[profile.release]
opt-level = 3
lto = "fat"             # 链接期优化，编译慢但二进制更小更快
codegen-units = 1       # 单个编译单元最大化 LTO 效果
strip = "symbols"       # 去 symbol，二进制减 30-50%
panic = "abort"         # panic 直接 abort（无 unwind 表，再减 ~10%）

[profile.release-fast]   # 妥协版：快速构建用
inherits = "release"
lto = "thin"
codegen-units = 16
```

调用：`cargo build --release` 或 `cargo build --profile release-fast`。

### 模板 D — systemd 跑 Rust 二进制

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Rust App
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/myapp
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/myapp

[Install]
WantedBy=multi-user.target
```

## 关键参数调优速查

### 编译速度

| 措施 | 收益 | 代价 |
|---|---|---|
| 用 mold 替代 ld | 链接快 5-10× | 装个包 |
| `sccache` 共享缓存 | 重复构建快 5× | 配置复杂 |
| `codegen-units=256` debug 构建 | 快 30% | 二进制略大 |
| `[profile.dev] opt-level=1` | dev 跑得快 | 编译慢 30% |
| ramdisk 装 `target/` | 快 20% | 占内存 |

### Release 二进制大小（hello world 默认 ~3MB）

| 优化 | 大小 |
|---|---|
| 默认 release | 3.0 MB |
| + `strip = "symbols"` | 0.4 MB |
| + `lto = "fat"` | 0.35 MB |
| + `panic = "abort"` | 0.30 MB |
| + `opt-level = "z"` | 0.25 MB |
| + `upx --lzma` | 0.10 MB（启动慢 50ms） |

### 内存占用（编译期）

`cargo build` 同时编译多个 crate 时内存爆。CI 上 OOM 用：

```bash
CARGO_BUILD_JOBS=2 cargo build --release      # 限制并行度
```

或 `~/.cargo/config.toml` 加 `[build] jobs = 2`。

## 跨发行版兼容

rustup 是 shell 安装脚本，不依赖发行版包管理器。所有支持的发行版流程一致。但**编译依赖**包名不同：

| 包 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| C 编译器 | `build-essential` | `gcc` `gcc-c++` `make`（建议用 `dnf groupinstall 'Development Tools'`） |
| OpenSSL 头文件 | `libssl-dev` | `openssl-devel` |
| pkg-config | `pkg-config` | `pkgconfig` |
| zlib 头 | `zlib1g-dev` | `zlib-devel` |
| 静态链接 musl 目标 | `musl-tools` | RHEL 系无官方包，手动编译 |

EnvForge 通过 PACKAGE_ALIASES 自动翻译。本 Playbook 默认装 `build-essential` `pkg-config` `libssl-dev`——已覆盖 90% 第三方 crate 的需求。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 多阶段 Dockerfile + `cargo chef` 缓存依赖层，构建时间从 5 分钟压到 30 秒
- **`git-version-control`** — `cargo install --git` 私有仓库需 SSH key
- **`prometheus-monitoring`** — `metrics` + `metrics-exporter-prometheus` crate 直出指标

## 排错

### 重开 shell 后 `cargo: command not found`

```bash
# 检查 cargo 二进制存在
ls $HOME/.cargo/bin/cargo

# 检查 .bashrc 末尾被加了 source
grep cargo $HOME/.bashrc $HOME/.zshenv 2>/dev/null

# 临时修复
source $HOME/.cargo/env

# 永久（重跑 Playbook 或手动）
echo 'source "$HOME/.cargo/env"' >> ~/.bashrc
```

zsh 用户：rustup 默认只改 `.bashrc` 和 `.profile`，要把 `source $HOME/.cargo/env` 加到 `~/.zshrc` 或 `~/.zshenv`。本 Playbook 已用 `env_path` 模块处理。

### `cargo build` 卡在 `Updating crates.io index`

国内服务器到 `index.crates.io` 经常断流。配镜像（见模板 A）。或临时：

```bash
CARGO_NET_GIT_FETCH_WITH_CLI=true cargo build
```

### 编译 OpenSSL crate 报 `Could not find directory of OpenSSL installation`

`libssl-dev` / `openssl-devel` 没装。重跑 Playbook 即可，或手动：

```bash
sudo apt-get install libssl-dev pkg-config       # Ubuntu/Debian
sudo dnf install openssl-devel pkgconfig          # RHEL/Anolis
```

或在 `Cargo.toml` 改用 `rustls`（纯 Rust 实现）：

```toml
[dependencies]
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls"] }
```

### Linker 错误 `cannot find -lssl`

`libssl-dev` 装了但找不到——通常是交叉编译。检查 `pkg-config --libs openssl`。

### `error: linking with cc failed` + `relocation R_X86_64_32S`

链接库与目标架构不匹配。常见于 Docker 多阶段构建，base 用 alpine 但 build 装的是 glibc 包。统一用 `rust:slim-bookworm`。

### nightly toolchain 行为不稳定

```bash
rustup default stable                  # 切回 stable
rustup show                            # 看当前用哪个
rustup toolchain list                  # 看装了哪些
rustup uninstall nightly               # 卸载
```

## 验证

```bash
# 1. 命令可用（重开 shell 后）
bash -lc 'rustc --version && cargo --version && clippy-driver --version && rustfmt --version'

# 2. 跑 hello world
mkdir -p /tmp/rust-test && cd /tmp/rust-test
cargo init --name test --bin 2>/dev/null
cargo run --release        # 输出 "Hello, world!"
cd / && rm -rf /tmp/rust-test

# 3. cargo install 工具
cargo install --quiet --force ripgrep   # 装个小工具，确认编译链路通
~/.cargo/bin/rg --version
```

## 多次运行

`installMode: skip-existing`。Playbook 用 `creates: $HOME/.cargo/bin/rustc` 守卫——**已装就不会自动升级**。要升级：

```bash
rustup update                  # 升级所有 toolchain
rustup self update             # 升级 rustup 本身
```

不要为了升级 Rust 而重跑 Playbook——重跑会重复修改 PATH 配置文件，虽不致破坏但有冗余。

## ⚠️ 敏感性

**safe** — 装到用户家目录，不动系统配置。

## 隐私说明

- rustup / cargo 默认**不发遥测**
- `cargo build` 第一次会从 `index.crates.io` 拉所有依赖元数据（公开依赖图）
- `cargo login <token>` 把 crates.io API token 写到 `~/.cargo/credentials.toml`（明文，权限 0600）——发布私有库时小心备份
- 私有 crate registry（如公司 Artifactory）走自己的 URL，参考 `~/.cargo/config.toml` `[source.<name>]` 配置
