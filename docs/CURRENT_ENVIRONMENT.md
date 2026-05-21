<!--
 * @Author: fool
 * @Date: 2026-05-19 17:08:02
 * @LastEditors: fool
 * @LastEditTime: 2026-05-21 13:08:37
 * @FilePath: \EnvForge\docs\CURRENT_ENVIRONMENT.md
 * @Description:  
 * @Note:  
-->
# 当前环境记录

记录时间：2026-05-19

工作目录：

```text
E:\1project\EnvForge
```

## 已确认工具

```text
Node.js: v20.13.1
npm: 10.5.2
git: 2.45.1.windows.1
PowerShell: 5.1.19041.6456
```

## 当前仓库状态

初始检查时，该目录不是 Git 仓库，且没有发现已有项目文件。

## 系统信息探测结果

尝试通过 PowerShell `Get-ComputerInfo` 获取 OS、CPU、内存、主机等信息时，关键字段没有返回有效值。

尝试通过 CIM 查询：

```powershell
Get-CimInstance Win32_OperatingSystem
Get-CimInstance Win32_ComputerSystem
Get-CimInstance Win32_Processor
Get-CimInstance Win32_LogicalDisk
```

结果为拒绝访问。因此当前文档只记录已经成功读取到的开发工具信息，不把失败探测作为项目阻塞点。后续实现 collector 时需要：

- 对 Windows CIM/WMI 权限失败做降级处理。
- 尝试使用 Node.js `os` 模块读取基础信息。
- 将需要管理员权限的 collector 标记为可选。
- 在 Web UI 中提示权限不足，而不是让整个扫描失败。

## 包管理器探测结果

当前尝试结果：

```text
winget: 运行失败，系统无法访问 winget.exe
scoop: 未发现
choco: 未发现
pnpm: 未发现
yarn: 未发现
npm: 可用
```

这说明首版实现应优先支持 npm 和 git，然后再扩展 winget/scoop/choco 等 Windows 包管理器。

## 对项目实现的影响

- 当前环境适合使用 Node.js 20 作为后端和 CLI 开发基础。
- 需要把权限不足作为正常场景设计，而不是异常场景。
- 新服务器 bootstrap 必须先检查依赖，再引导用户安装缺失工具。
- Windows 支持应从非管理员可读信息开始，管理员级别采集和还原放到可选阶段。
