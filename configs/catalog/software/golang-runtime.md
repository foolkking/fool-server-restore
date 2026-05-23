# Go 语言运行时

下载 Go 官方二进制 tarball 安装到 `/usr/local/go`。比发行版仓库的版本（Ubuntu 22 默认 1.18，Anolis 9 默认 1.21，都已落后多个 minor）新一年以上，且所有发行版上版本完全一致。

## 你将得到什么

- ✅ Go 最新 stable（自动从 `https://go.dev/VERSION?m=text` 拿版本号）
- ✅ 二进制装到 `/usr/local/go/`，命令在 `/usr/local/go/bin/`
- ✅ `/etc/profile.d/golang.sh` 把 `/usr/local/go/bin` 加入全局 PATH（所有用户登录后生效）
- ✅ 当前用户 `~/.bashrc` / `~/.zshenv` / `~/.config/fish/config.fish` 加 `GOPATH=$HOME/go` + `$GOPATH/bin` 进 PATH
- ✅ verify 阶段用 login shell 启动确认 `go version` 可执行

## 配置文件 / 目录速查

```
/usr/local/go/
├── bin/                    # go / gofmt
├── pkg/                    # 标准库预编译
├── src/                    # 标准库源码
├── api/                    # API 兼容性数据
└── VERSION                 # 当前版本字符串

/etc/profile.d/golang.sh    # 系统级 PATH（EnvForge 写入，登录 shell 自动加载）

$HOME/go/                   # GOPATH，第三方包 + 工具默认装这里
├── bin/                    # go install 装的工具（如 dlv / gopls / staticcheck）
├── pkg/mod/                # 模块缓存（多项目共享）
└── src/                    # 老式 GOPATH 模式（Go 1.16+ 已废弃）

$HOME/.cache/go-build/      # 增量编译缓存，可清空
```

| 文件 / 路径 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| Go 安装位置 | `/usr/local/go` | 相同（官方 tarball 全平台一致） |
| 全局 PATH 配置 | `/etc/profile.d/golang.sh` | 相同 |
| 用户级 PATH | `~/.bashrc` + `~/.profile` | 相同（zsh 用户用 `~/.zshenv`） |
| GOPATH 默认 | `$HOME/go` | 相同 |

不知道路径时：

```bash
which go                  # 看用的是哪个 go
go env GOROOT             # 安装位置（应为 /usr/local/go）
go env GOPATH             # 工作目录（默认 $HOME/go）
go env GOCACHE            # 编译缓存
```

## 常见配置模板

### 模板 A — 国内服务器加速（GOPROXY + GOSUMDB）

```bash
# 持久化写入 go env 配置（~/.config/go/env）
go env -w GOPROXY=https://goproxy.cn,direct
go env -w GOSUMDB=sum.golang.google.cn
go env -w GOPRIVATE=*.gitlab.example.com,*.corp.example.com    # 私有仓库不走公共 proxy
go env -w GOFLAGS='-mod=mod'

# 验证
go env GOPROXY GOSUMDB
```

国内服务器 `go mod download` 速度从 ~50KB/s 提到 ~30MB/s。

### 模板 B — 全局工具栈（开发机推荐）

```bash
# 调试器
go install github.com/go-delve/delve/cmd/dlv@latest

# LSP 服务器（VS Code / Neovim 共用）
go install golang.org/x/tools/gopls@latest

# 代码质量
go install honnef.co/go/tools/cmd/staticcheck@latest
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# 性能分析
go install github.com/google/pprof@latest

# 装到 $GOPATH/bin（已在 PATH 里）
ls $HOME/go/bin/
```

### 模板 C — systemd 服务跑 Go 程序

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Go App
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
# /etc/profile.d 不加载到 systemd，必须显式 PATH 或写完整路径
Environment="PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="GOMAXPROCS=2"
ExecStart=/opt/myapp/bin/myapp
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

应用：`sudo systemctl daemon-reload && sudo systemctl enable --now myapp`。

### 模板 D — 交叉编译（Linux 主机产 Windows / macOS / ARM 二进制）

```bash
# Linux x86_64 → Windows x86_64
GOOS=windows GOARCH=amd64 go build -o myapp.exe ./cmd/myapp

# Linux x86_64 → Linux ARM64（树莓派 4+）
GOOS=linux GOARCH=arm64 go build -o myapp-arm64 ./cmd/myapp

# Linux x86_64 → macOS Apple Silicon
GOOS=darwin GOARCH=arm64 go build -o myapp-mac-arm64 ./cmd/myapp

# 静态链接（CGO 关，无 glibc 依赖，可丢进 alpine 容器）
CGO_ENABLED=0 go build -ldflags='-s -w' -o myapp ./cmd/myapp
```

## 关键参数调优速查

### 编译性能

| 参数 | 默认 | 推荐 | 说明 |
|---|---|---|---|
| `GOMAXPROCS` | CPU 核数 | 容器里设到分配的 CPU 数 | 限制并行 P 数量 |
| `GOGC` | 100 | 50（低延迟）/ 200（高吞吐） | GC 触发阈值；越低越频繁 GC |
| `GOMEMLIMIT` | 无 | 容器里设到内存上限 | Go 1.19+ 软上限，配合 OOM-killer 用 |
| `GOFLAGS=-trimpath` | 无 | 生产构建必加 | 二进制不暴露源码绝对路径 |
| `-ldflags='-s -w'` | 无 | 生产构建推荐 | 去 symbol table，二进制减 30% 大小 |

### 容器环境推荐

```bash
# 1 vCPU + 512MB 容器
GOMAXPROCS=1 GOMEMLIMIT=400MiB GOGC=50 ./myapp
```

`GOMAXPROCS` 不设的话 Go 会读宿主机 CPU 数，导致容器里跑得比预期慢（线程切换开销）。Go 1.25+ 起会自动读 cgroup，旧版本必须手动设。

## 跨发行版兼容

EnvForge 用 Go 官方 tarball（`go.dev/dl/go*.linux-amd64.tar.gz`），所有发行版安装位置和 PATH 写法完全一致。

- ✅ Ubuntu 22 / 24，Debian 12，RHEL 9，Anolis 9，Alma 9，Rocky 9 — 全部走相同流程
- ⚠️ Alpine — 用 `musl-gcc` 而非 `glibc`，CGO 程序需 `CGO_ENABLED=0` 或装 `alpine-sdk`
- ⚠️ ARM64 主机（树莓派 / Oracle Ampere）— Playbook 自动选 `linux-arm64.tar.gz`

发行版自带的 `golang-go` 包**不被本 Playbook 使用**（版本太老）。如果你之前装了，可：

```bash
sudo apt-get remove golang-go            # Ubuntu/Debian
sudo dnf remove golang                   # RHEL/Anolis
which go                                 # 应指向 /usr/local/go/bin/go
```

## 与其它 catalog 项的配合

- **`git-version-control`** — `go install` 私有仓库时用 git 拉取，需先配 SSH key 或 HTTPS 凭据
- **`docker-host-profile`** — 多阶段 Dockerfile 里把 Go 二进制 copy 到 `gcr.io/distroless/static`，体积 ~10MB
- **`prometheus-monitoring` / `grafana-dashboard`** — Go 自带 `expvar` 和 `pprof`，配 prometheus client_golang 直出指标

## 排错

### `go: command not found`（重开 shell 后还找不到）

```bash
# 检查文件存在
ls -l /usr/local/go/bin/go

# 检查 profile 文件被加载
cat /etc/profile.d/golang.sh
echo $PATH | tr ':' '\n' | grep go

# 临时修复（当前 shell）
export PATH=$PATH:/usr/local/go/bin

# 永久修复（重跑 Playbook 或手动 source）
source /etc/profile.d/golang.sh
```

systemd 服务里 `command not found` 通常是因为 `/etc/profile.d/` 不被 systemd 加载——unit 里写 `Environment="PATH=..."` 或用绝对路径。

### `go install` 下载超时

国内服务器到 `proxy.golang.org` 经常断流。设国内代理：

```bash
go env -w GOPROXY=https://goproxy.cn,direct
go env -w GOSUMDB=sum.golang.google.cn
```

私有仓库走自己的 git，不走 proxy：

```bash
go env -w GOPRIVATE=*.corp.example.com
```

### `permission denied` 写入 `/usr/local/go`

升级 Go 版本时 EnvForge 用 `sudo rm -rf /usr/local/go` 再解压，需要 sudo 权限。如果你的执行用户没 sudo NOPASSWD，verify 阶段还能通过但下次升级会失败。

### 编译 CGO 程序报 `gcc: command not found`

```bash
# Ubuntu/Debian
sudo apt-get install build-essential
# RHEL/Anolis
sudo dnf groupinstall 'Development Tools'
```

或在不需要 CGO 的项目里加 `CGO_ENABLED=0`。

### 二进制太大（&gt;20MB 一个 hello world）

```bash
go build -ldflags='-s -w' -trimpath -o myapp ./cmd/myapp
upx --best --lzma myapp                   # 进一步压（可选，启动稍慢）
```

## 验证

```bash
# 1. 二进制就位
ls /usr/local/go/bin/go && /usr/local/go/bin/go version

# 2. PATH 全局生效（重开 shell 测）
bash -lc 'go version'

# 3. 跑个 hello world
mkdir -p /tmp/go-test && cd /tmp/go-test
go mod init test 2>/dev/null
echo 'package main; import "fmt"; func main() { fmt.Println("OK") }' > main.go
go run main.go        # 应输出 OK
cd / && rm -rf /tmp/go-test

# 4. GOPATH 工具能装
go install golang.org/x/example/hello@latest 2>&1 | head -5
ls $HOME/go/bin/      # 应能看到 hello 二进制
```

## 多次运行

`installMode: skip-existing`。Playbook 用 `creates: /usr/local/go/bin/go` 守卫——**已装就不会自动升级 Go 版本**。要升级：

```bash
# 方法 1：删后重跑 Playbook（推荐）
sudo rm -rf /usr/local/go
# 重跑本 Playbook

# 方法 2：手动下新版
GO_VERSION=$(curl -s https://go.dev/VERSION?m=text | head -1)
curl -fsSL "https://go.dev/dl/${GO_VERSION}.linux-amd64.tar.gz" | sudo tar -C /usr/local -xz --transform 's,^go,go-new,'
sudo rm -rf /usr/local/go && sudo mv /usr/local/go-new /usr/local/go
go version
```

## ⚠️ 敏感性

**safe** — 只是装语言运行时和写两个 PATH 配置文件。不开端口、不动数据、不启服务。

## 隐私说明

- Go 默认不发遥测
- Go 1.23+ 引入 `gotelemetry`（默认关闭）：`go telemetry off` 永久禁用
- `go install` 默认走 `proxy.golang.org`（在 `GOPROXY=off` 时直连仓库）；走第三方 proxy 时该 proxy 能看到你的依赖列表，私有代码加 `GOPRIVATE` 屏蔽
