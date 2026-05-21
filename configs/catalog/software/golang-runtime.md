# Go 语言运行时

## 概述

Go（Golang）是 Google 开发的开源编程语言，以简洁、高效和强大的并发支持著称。广泛用于云原生开发、微服务、CLI 工具和网络编程。

## 安装内容

- `golang-go` — Go 编译器和标准库
- GOPATH 环境变量配置
- Go 模块代理设置

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y golang-go
echo 'export GOPATH="$HOME/go"' >> ~/.bashrc
echo 'export PATH="$PATH:$GOPATH/bin"' >> ~/.bashrc
source ~/.bashrc
```

> 注意：apt 仓库中的 Go 版本可能不是最新的。如需最新版本，建议从官网下载。

### 安装最新版本（可选）

```bash
# 下载最新版（以 1.22 为例）
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH="$PATH:/usr/local/go/bin"' >> ~/.bashrc
source ~/.bashrc
```

## 安装后配置

### 1. 设置模块代理（中国用户推荐）

```bash
go env -w GOPROXY=https://goproxy.cn,direct
```

### 2. 创建工作目录

```bash
mkdir -p $HOME/go/{bin,src,pkg}
```

### 3. 安装常用工具

```bash
go install golang.org/x/tools/gopls@latest
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

## 验证安装

```bash
go version
go env GOPATH
```

## 常用命令

```bash
go mod init myproject    # 初始化模块
go build ./...           # 编译
go test ./...            # 测试
go run main.go           # 运行
go fmt ./...             # 格式化
```

## 隐私说明

Go 环境配置不包含敏感信息，可安全同步。私有仓库的 GOPRIVATE 设置可能包含内部域名。
