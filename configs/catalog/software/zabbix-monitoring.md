# Zabbix Agent

Zabbix 企业级监控 Agent。

*Zabbix enterprise monitoring agent.*

## 你将得到什么

- 📦 **zabbix-agent** _(Zabbix Agent)_ — 通过 apt

## 自动化步骤

EnvForge 在目标机器上依次执行以下任务：

1. Add Zabbix repository
2. Install Zabbix Agent
3. Enable Zabbix Agent

## ⚠️ 敏感性

此 Playbook 标记为 **review**：会安装系统服务并改动配置文件。如果对该机器有现有依赖，请先确认不会冲突。

## 验证安装

```bash
# 检查包是否已安装
dpkg -l | grep zabbix-agent      # Ubuntu/Debian
rpm -q zabbix-agent                # RHEL/CentOS/Anolis

# 检查服务是否运行（如果有 systemd 单元）
systemctl status zabbix-agent --no-pager
```

## 排错

- **包找不到（RHEL/CentOS/Anolis）**：可能需要启用 EPEL 仓库或某个 dnf module stream。EnvForge 在安装时已经主动尝试这两步，看任务日志的 `preflight:` 段落确认结果。
- **服务启动失败**：日志会自动包含 `systemctl status` 和 `journalctl` 摘要；按 🔍 标记的根因提示处理（端口冲突、配置语法错误、SELinux 等）。
- **跨发行版兼容**：从 Ubuntu 捕获的 Playbook 在 RHEL 系统上跑时，部分包名/服务名会自动翻译（如 `apache2 → httpd`），看任务日志末尾的 `[renamed for dnf: ...]` 段落确认。

## 多次运行

Playbook 是幂等的：重复运行不会产生重复安装，已经安装的包/服务/配置会被跳过。`installMode: skip-existing`。

## 隐私说明

此 Playbook 不上传任何凭据或私钥。如果安装内容会生成本地 secret（数据库密码、API token 等），请在目标机器上单独处理，不要提交回市场。
