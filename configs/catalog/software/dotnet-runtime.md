# .NET 8 SDK

微软的跨平台 .NET 开发框架。EnvForge 通过 Microsoft 官方仓库装最新 LTS（.NET 8）。

## 你将得到什么

- 📦 **dotnet-sdk-8.0**（含 SDK + runtime）
- ✅ Microsoft 官方源（自动跟进 patch 升级）

## 用法

```bash
dotnet --version
dotnet new console -o hello
cd hello
dotnet run
```

### 国内 NuGet 加速

`~/.nuget/NuGet/NuGet.Config`：
```xml
<configuration>
  <packageSources>
    <add key="nuget.cn" value="https://nuget.cdn.azure.cn/v3/index.json" />
  </packageSources>
</configuration>
```

### 部署 Web 应用（ASP.NET Core）

```bash
dotnet publish -c Release -o /var/www/myapp
# 装 dotnet-runtime 到生产机器（不用 SDK），systemd 跑
sudo systemd-run --user dotnet /var/www/myapp/myapp.dll
```

## ⚠️ 敏感性

**safe** — 只装语言运行时。

## 验证

```bash
dotnet --version
dotnet --list-sdks
```

## 排错

- **包仓库添加失败** — 微软仓库需要先装 `packages-microsoft-prod` 包。Playbook 自动处理。
- **跨发行版**：Microsoft 的 deb / rpm 仓库都覆盖了主流发行版。Anolis 走 RHEL 仓库。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

.NET 默认开启 telemetry（性能数据匿名上报），可关：
```bash
export DOTNET_CLI_TELEMETRY_OPTOUT=1
echo 'export DOTNET_CLI_TELEMETRY_OPTOUT=1' >> ~/.bashrc
```
