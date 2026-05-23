# .NET 8 SDK

微软的跨平台 .NET 开发框架。EnvForge 通过 Microsoft 官方仓库（`packages.microsoft.com`）装最新 LTS（.NET 8）。Linux 上的 ASP.NET Core 性能在 TechEmpower 基准里常年位于第一梯队。

## 你将得到什么

- 📦 **dotnet-sdk-8.0**（含 SDK + ASP.NET Core runtime + 命令行 dotnet）
- ✅ Microsoft 官方 deb / rpm 仓库（自动跟进 patch 升级）
- ✅ `dotnet` 命令全局可用

## .NET 版本选择

LTS（长期支持，3 年）每两年一发：

- **.NET 6** — 2024-11 EOL（**不推荐**，已结束）
- **.NET 8** — 2026-11 EOL（**默认**，当前生产首选）
- **.NET 9** — STS（标准支持，仅 18 月），2026-05 EOL（不建议生产用）
- **.NET 10** — 2025-11 LTS（届时升级）

奇数版（5/7/9）是 STS（短期支持，18 月），偶数版（6/8/10）是 LTS。本 Playbook 默认装 8。

## 配置文件 / 目录速查

```
# SDK 安装
/usr/share/dotnet/                       # 主安装目录（包管理器装时）
├── dotnet                               # 命令二进制
├── sdk/8.0.X/                           # SDK 各 minor
├── shared/Microsoft.NETCore.App/        # runtime
├── shared/Microsoft.AspNetCore.App/     # ASP.NET Core
└── host/fxr/                            # framework resolver

# 用户级
~/.nuget/                                # NuGet 包缓存
├── packages/                            # 全局缓存（多项目共享）
└── NuGet/NuGet.Config                   # 用户级配置（镜像源）

~/.dotnet/                               # CLI 工具 + 配置
├── tools/                               # dotnet tool install -g 装的工具
└── tools/.store/

# 项目级
<project>/
├── *.csproj                             # 项目文件（XML，类似 pom.xml）
├── obj/                                 # 还原 / 编译临时
└── bin/Debug|Release/net8.0/            # 输出
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `dotnet-sdk-8.0` | `dotnet-sdk-8.0` |
| 仓库源 | `packages.microsoft.com/config/{distro}/{ver}/packages-microsoft-prod.deb` | `packages.microsoft.com/config/rhel/{major}/packages-microsoft-prod.rpm` |
| 安装位置 | `/usr/share/dotnet` | `/usr/lib64/dotnet`（部分版本） |
| 仓库文件 | `/etc/apt/sources.list.d/microsoft-prod.list` | `/etc/yum.repos.d/microsoft-prod.repo` |

## 常见配置模板

### 模板 A — 国内 NuGet 镜像（`~/.nuget/NuGet/NuGet.Config`）

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.cn" value="https://nuget.cdn.azure.cn/v3/index.json" />
    <add key="huawei" value="https://repo.huaweicloud.com/repository/nuget/v3/index.json" />
  </packageSources>
  <fallbackPackageFolders>
    <add key="default" value="~/.nuget/packages" />
  </fallbackPackageFolders>
</configuration>
```

国内服务器 `dotnet restore` 速度从 ~200KB/s 提到 ~20MB/s。

> Azure 中国 CDN 镜像了 NuGet 全套包，速度最稳。华为云有少量包不全。

### 模板 B — systemd 跑 ASP.NET Core 应用

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My ASP.NET Core App
After=network.target

[Service]
Type=notify
User=myapp
Group=myapp
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/dotnet /var/www/myapp/MyApp.dll
Restart=on-failure
RestartSec=5
KillSignal=SIGINT
SyslogIdentifier=myapp

# .NET 标准环境变量
Environment="ASPNETCORE_ENVIRONMENT=Production"
Environment="ASPNETCORE_URLS=http://127.0.0.1:5000"
Environment="DOTNET_PRINT_TELEMETRY_MESSAGE=false"
Environment="DOTNET_NOLOGO=true"
Environment="DOTNET_CLI_TELEMETRY_OPTOUT=1"

[Install]
WantedBy=multi-user.target
```

配 nginx 反代到 :5000：

```nginx
location / {
    proxy_pass         http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection keep-alive;
    proxy_set_header   Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

### 模板 C — 发布 Self-Contained 二进制（无 runtime 依赖）

部署机不装 .NET runtime，直接跑：

```bash
# Linux x64 单文件，含 runtime
dotnet publish -c Release \
  -r linux-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:PublishTrimmed=true \
  -o ./publish

# 产物 ~70 MB（trim 后）；丢到目标机器直接 ./publish/MyApp 跑
```

ARM64（树莓派 / Oracle Ampere）：`-r linux-arm64`。Alpine：`-r linux-musl-x64`。

### 模板 D — 多阶段 Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ./*.csproj ./
RUN dotnet restore
COPY ./ ./
RUN dotnet publish -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV DOTNET_RUNNING_IN_CONTAINER=true
ENTRYPOINT ["dotnet", "MyApp.dll"]
```

最终镜像 ~110 MB（aspnet:8.0-alpine）。比 sdk 镜像（~750 MB）小 7 倍。

## 关键参数调优速查

### Garbage Collector

| 模式 | 适用 | 设置 |
|---|---|---|
| Workstation GC | 桌面 / CLI 工具（默认 client） | `<ServerGarbageCollection>false</ServerGarbageCollection>` |
| Server GC | Web / API（多核机器，**生产推荐**） | `<ServerGarbageCollection>true</ServerGarbageCollection>`（默认 server） |
| ConcurrentGC | 减少 STW 暂停 | `<ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>`（默认开） |
| 容器内存限制 | 容器里跑 | `DOTNET_GCHeapHardLimit` 或 .NET 8 自动读 cgroup |

### 关键环境变量

| 变量 | 推荐值 | 说明 |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | 生产必设（影响日志级别 / 错误页详细度） |
| `ASPNETCORE_URLS` | `http://127.0.0.1:5000` | 监听地址，建议本机后接反代 |
| `DOTNET_CLI_TELEMETRY_OPTOUT` | `1` | 关 dotnet CLI 遥测 |
| `DOTNET_NOLOGO` | `true` | 不显示首次运行欢迎信息 |
| `DOTNET_RUNNING_IN_CONTAINER` | `true`（自动） | 容器优化（GC 行为 / 文件句柄） |

### 性能调优起手式

```bash
dotnet run -c Release \
  --environment Production \
  -p:TieredCompilation=true \           # 分层编译（默认开）
  -p:ReadyToRun=true                    # AOT 预编译（首次启动快 30-50%）
```

## 跨发行版兼容

EnvForge Playbook 自动检测发行版并加对的 Microsoft 仓库。

| 发行版 | 仓库添加方式 | 包名 |
|---|---|---|
| Ubuntu 22.04 / 24.04 | `packages-microsoft-prod.deb` | `dotnet-sdk-8.0` |
| Debian 12 | 同上 | 同上 |
| RHEL 9 / Rocky 9 / Alma 9 | `packages-microsoft-prod.rpm` | 同上 |
| **Anolis 9** | 走 `rhel/9` 仓库（RHEL 兼容） | 同上 ✅ 已验证 |
| Alpine | 不支持 | 用 `mcr.microsoft.com/dotnet/sdk:8.0-alpine` 容器 |

**Anolis 9 注**：作为 RHEL 9 二进制兼容发行版，packages.microsoft.com 的 RHEL 9 仓库直接可用。

## 与其它 catalog 项的配合

- **`nginx-web-service`** — ASP.NET Core 标准部署 = Kestrel + nginx 反代（模板 B）
- **`docker-host-profile`** — 多阶段 Dockerfile（模板 D）
- **`postgres-profile`** — Entity Framework Core + Npgsql 是 .NET 主流 PG 驱动
- **`certbot-ssl`** — HTTPS 证书走 nginx 处理，Kestrel 内部 HTTP 即可

## 排错

### `dotnet: command not found`

仓库添加失败或包没装。手动：

```bash
# Ubuntu 24.04
wget https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0

# RHEL 9 / Anolis 9
sudo rpm -Uvh https://packages.microsoft.com/config/rhel/9/packages-microsoft-prod.rpm
sudo dnf install -y dotnet-sdk-8.0
```

### 仓库添加失败 `curl: (6) Could not resolve host: packages.microsoft.com`

DNS / 网络问题。检查：

```bash
nslookup packages.microsoft.com
curl -I https://packages.microsoft.com
```

国内 IDC 偶发超时，重试 2-3 次通常能过。

### 启动报 `Failed to load /usr/share/dotnet/host/fxr/X/libhostfxr.so`

通常是混装了多个 .NET 版本导致 fxr 不一致。重装：

```bash
sudo apt-get purge --auto-remove dotnet-sdk-* dotnet-runtime-* dotnet-host*
sudo rm -rf /usr/share/dotnet
sudo apt-get install dotnet-sdk-8.0
```

### `dotnet restore` 极慢 / timeout

国内 IDC。配 NuGet 镜像（模板 A）。或临时：

```bash
dotnet restore --source https://nuget.cdn.azure.cn/v3/index.json
```

### ASP.NET Core 应用启动后立即退出（systemd）

```bash
sudo journalctl -u myapp -n 100
```

常见原因：

1. `Type=notify` 需要应用调用 `sd_notify`（`Microsoft.AspNetCore.Hosting.WindowsServices` 或 `dotnet add package Microsoft.Extensions.Hosting.Systemd`）
2. 端口被占：`ss -tlnp | grep :5000`
3. `appsettings.Production.json` 缺失或解析失败

把 `Type=notify` 改 `Type=simple` 先排除 systemd 集成问题。

### 容器里 OOM Killed

`-Xmx` 概念在 .NET 里是 `DOTNET_GCHeapHardLimit`。.NET 8+ 自动读 cgroup 设上限。旧版本：

```bash
docker run -e DOTNET_GCHeapHardLimit=400000000 ...      # 400MB heap
```

## 验证

```bash
# 1. 命令存在
dotnet --version                     # 应输出 8.0.x

# 2. 列出装的 SDK
dotnet --list-sdks

# 3. 列出 runtime
dotnet --list-runtimes               # 应同时有 NETCore.App 和 AspNetCore.App

# 4. 跑 hello world
mkdir /tmp/dnet && cd /tmp/dnet
dotnet new console -o hello -n Hello
cd hello && dotnet run               # 应输出 "Hello, World!"
cd / && rm -rf /tmp/dnet
```

## 多次运行

`installMode: skip-existing`。仓库添加任务有 `creates` 守卫；包安装任务幂等。重跑安全。

要升级到 patch 版（如 8.0.10 → 8.0.11）：`sudo apt-get update && sudo apt-get upgrade dotnet-sdk-8.0`。

要升级到下一 LTS（8 → 10），改本 Playbook 里的版本号或新增 task。

## ⚠️ 敏感性

**safe** — 装语言运行时和 Microsoft 官方仓库。不开端口、不动数据。

## 隐私说明

- **dotnet CLI 默认开启 telemetry**——发送匿名性能数据（命令使用频率、机器类型）给微软
- 关闭：`export DOTNET_CLI_TELEMETRY_OPTOUT=1`，建议持久化到 `~/.bashrc` 或 systemd unit Environment
- ASP.NET Core 不发遥测；Application Insights 是可选 SDK，要主动加
- NuGet restore 时 User-Agent 含 .NET 版本和 OS 信息（不含个人信息）
- 用国内镜像后请求会发到镜像运营方
