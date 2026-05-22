# Go 语言运行时

下载 Go 官方二进制 tarball 安装到 `/usr/local/go`。比发行版仓库的版本（往往落后 1-2 年）新。

## 你将得到什么

- ✅ Go 最新 stable（从 go.dev/VERSION 自动拿版本号）
- ✅ 二进制装到 `/usr/local/go/bin/`
- ✅ `/usr/local/go/bin` 加入 `/etc/profile.d/golang.sh`（全局 PATH）
- ✅ 当前用户的 `~/.bashrc` 加 GOPATH = ~/go

## 用法

### 验证版本

```bash
# 重开终端让 PATH 生效
go version
go env GOPATH        # /home/$USER/go
go env GOROOT        # /usr/local/go
```

### 国内速度优化

```bash
go env -w GOPROXY=https://goproxy.cn,direct
go env -w GOSUMDB=sum.golang.google.cn
```

### 编译一个项目

```bash
mkdir hello && cd hello
go mod init hello
cat > main.go <<'EOF'
package main
import "fmt"
func main() { fmt.Println("Hello, Go!") }
EOF
go run main.go
go build -o hello   # 生成 ./hello 二进制
```

### 升级 Go 版本

重跑此 Playbook，会自动覆盖 `/usr/local/go` 为最新 stable。

### 为非交互 shell（systemd 服务）让 PATH 生效

`/etc/profile.d/golang.sh` 只在交互 shell 加载。systemd 服务里跑 `go` 要写完整路径
（`/usr/local/go/bin/go`）或在 unit 里加 Environment=PATH=...。

## ⚠️ 敏感性

**safe** — 只是个语言工具链。

## 验证

```bash
go version
go env GOROOT
ls /usr/local/go/bin/
```

## 排错

- **`go: command not found`** — PATH 没生效。重开 shell 或 `source /etc/profile.d/golang.sh`。
- **下载失败** — 国内服务器到 go.dev 慢。手动下：
  ```bash
  curl -fsSL https://golang.google.cn/dl/go1.22.x.linux-amd64.tar.gz | sudo tar -C /usr/local -xz
  ```
- **跨发行版**：用官方 tarball，无包管理器差异。

## 多次运行

`installMode: skip-existing`。**注意**：Playbook 写 `creates: /usr/local/go/bin/go`，
所以已装就完全跳过，不会自动升级 Go 版本。要升级请删 `/usr/local/go` 后重跑。

## 隐私说明

Go 默认不发遥测。新版有 `gotelemetry`，可关：`go telemetry off`。
