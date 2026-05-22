# WireGuard VPN

WireGuard 高性能 VPN，内核级加密隧道。

*WireGuard high-performance VPN with kernel-level encryption.*

## 你将得到什么

- 📦 **wireguard** _(WireGuard)_ — 通过 apt

## 自动化步骤

EnvForge 在目标机器上依次执行以下任务：

1. Install WireGuard
2. Enable IP forwarding
3. Apply sysctl changes
4. Generate server keys if not exist
5. Verify WireGuard installation

## ⚠️ 敏感性

此 Playbook 标记为 **privileged**：会修改系统级配置（用户、防火墙、systemd 服务、内核参数等）。建议先用 dry-run 模式预览影响，再执行真实安装。

## 验证安装

```bash
# 检查包是否已安装
dpkg -l | grep wireguard      # Ubuntu/Debian
rpm -q wireguard                # RHEL/CentOS/Anolis

# 检查服务是否运行（如果有 systemd 单元）
systemctl status wireguard --no-pager
```

## 排错

- **包找不到（RHEL/CentOS/Anolis）**：可能需要启用 EPEL 仓库或某个 dnf module stream。EnvForge 在安装时已经主动尝试这两步，看任务日志的 `preflight:` 段落确认结果。
- **服务启动失败**：日志会自动包含 `systemctl status` 和 `journalctl` 摘要；按 🔍 标记的根因提示处理（端口冲突、配置语法错误、SELinux 等）。
- **跨发行版兼容**：从 Ubuntu 捕获的 Playbook 在 RHEL 系统上跑时，部分包名/服务名会自动翻译（如 `apache2 → httpd`），看任务日志末尾的 `[renamed for dnf: ...]` 段落确认。

## 多次运行

Playbook 是幂等的：重复运行不会产生重复安装，已经安装的包/服务/配置会被跳过。`installMode: skip-existing`。

## 隐私说明

此 Playbook 不上传任何凭据或私钥。如果安装内容会生成本地 secret（数据库密码、API token 等），请在目标机器上单独处理，不要提交回市场。
