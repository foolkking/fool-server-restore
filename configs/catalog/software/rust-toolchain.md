# Rust 工具链

## 概述

Rust 是一门注重安全性、并发性和性能的系统编程语言。通过 rustup 工具链管理器安装，包含编译器 rustc、包管理器 Cargo 和标准库。

## 安装内容

- `curl` — 下载 rustup 安装脚本
- `build-essential` — C 编译器和链接器（Rust 编译依赖）
- rustup — Rust 工具链管理器
- rustc — Rust 编译器
- cargo — Rust 包管理器

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y curl build-essential
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env
```

## 安装后配置

### 1. 添加到 PATH（如未自动添加）

```bash
echo 'source $HOME/.cargo/env' >> ~/.bashrc
source ~/.bashrc
```

### 2. 安装常用组件

```bash
rustup component add clippy      # 代码检查
rustup component add rustfmt     # 代码格式化
rustup component add rust-src    # 源码（IDE 支持）
```

### 3. 安装常用工具

```bash
cargo install cargo-watch    # 文件变更自动重编译
cargo install cargo-edit     # cargo add/rm 命令
cargo install sccache        # 编译缓存加速
```

### 4. 配置国内镜像（可选）

创建 `~/.cargo/config.toml`：

```toml
[source.crates-io]
replace-with = 'ustc'

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
```

## 验证安装

```bash
rustc --version
cargo --version
rustup show
```

## 常用命令

```bash
cargo new myproject     # 创建项目
cargo build             # 编译
cargo run               # 编译并运行
cargo test              # 运行测试
cargo clippy            # 代码检查
cargo fmt               # 格式化
```

## 隐私说明

Rust 工具链配置不包含敏感信息，可安全同步。
