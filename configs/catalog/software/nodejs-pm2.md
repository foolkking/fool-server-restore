# PM2 进程管理

Node.js 应用进程管理器。

*Node.js application process manager.*

## 你将得到什么

- ▶ **npm install -g pm2** _(Install PM2)_ — 通过 npm

## 自动化步骤

EnvForge 在目标机器上依次执行以下任务：

1. Ensure Node.js is installed
2. Install PM2 globally
3. Setup PM2 startup
4. Verify PM2

## 验证安装

```bash
# 根据安装内容运行对应的健康检查命令
# 例如查看进程: ps aux | grep <name>
# 例如查看端口: ss -tlnp
```

## 排错

- **包找不到（RHEL/CentOS/Anolis）**：可能需要启用 EPEL 仓库或某个 dnf module stream。EnvForge 在安装时已经主动尝试这两步，看任务日志的 `preflight:` 段落确认结果。
- **服务启动失败**：日志会自动包含 `systemctl status` 和 `journalctl` 摘要；按 🔍 标记的根因提示处理（端口冲突、配置语法错误、SELinux 等）。
- **跨发行版兼容**：从 Ubuntu 捕获的 Playbook 在 RHEL 系统上跑时，部分包名/服务名会自动翻译（如 `apache2 → httpd`），看任务日志末尾的 `[renamed for dnf: ...]` 段落确认。

## 多次运行

Playbook 是幂等的：重复运行不会产生重复安装，已经安装的包/服务/配置会被跳过。`installMode: skip-existing`。

## 隐私说明

此 Playbook 不上传任何凭据或私钥。如果安装内容会生成本地 secret（数据库密码、API token 等），请在目标机器上单独处理，不要提交回市场。
