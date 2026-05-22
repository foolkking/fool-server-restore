# Rust 工具链

通过 rustup 装 Rust（rustc + cargo + clippy + rustfmt）。rustup 是 Rust 官方的版本管理器——
能轻松装 stable / beta / nightly 多个版本，工具链升级一条命令搞定。

## 你将得到什么

- ✅ **rustup**（Rust 工具链管理器）
- ✅ Rust stable channel 默认 toolchain
- ✅ rustc / cargo / clippy / rustfmt
- ✅ 装到当前用户的 `~/.cargo/`，PATH 已加到 `~/.bashrc`

## 用法

### 验证

```bash
# 重开终端让 PATH 生效
rustc --version
cargo --version
clippy-driver --version
```

### 切换 toolchain（多版本）

```bash
rustup toolchain list
rustup toolchain install nightly
rustup default nightly
rustup default stable
```

### 国内速度优化

`~/.cargo/config.toml`：
```toml
[source.crates-io]
replace-with = 'rsproxy'

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.ustc]
registry = "git://mirrors.ustc.edu.cn/crates.io-index"

[net]
git-fetch-with-cli = true
```

### 升级 Rust

```bash
rustup update
```

### 第一个项目

```bash
cargo new hello
cd hello
cargo run         # 编译 + 运行 debug 版本
cargo build --release
./target/release/hello
```

## ⚠️ 敏感性

**safe** — 装到用户目录 `~/.cargo`，不污染系统。

## 验证

```bash
rustc --version
cargo --version
```

## 排错

- **重开 shell 后还找不到 cargo** — `~/.cargo/env` 没被 source。检查 `~/.bashrc` 有没有 `source $HOME/.cargo/env` 这一行。
- **国内服务器 `cargo build` 极慢** — 配 rsproxy.cn 镜像（见上）。
- **跨发行版**：rustup 是脚本安装，无包管理器差异。

## 多次运行

`installMode: skip-existing`。rustup 已安装就跳过。要更新 Rust 用 `rustup update` 而不是重跑 Playbook。

## 隐私说明

rustup / cargo 默认不发遥测。
