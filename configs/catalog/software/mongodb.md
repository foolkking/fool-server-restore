# MongoDB 文档数据库

MongoDB 7.0 社区版一键安装。从官方仓库添加 GPG 密钥和 apt 源，安装 `mongodb-org` 元包，启动 systemd 服务。

## 你将得到什么

- 📦 **mongodb-org** — Community Edition 7.0
- 📦 **mongosh** — 现代 mongo shell（取代旧 `mongo` 命令）
- ✅ 默认监听 `127.0.0.1:27017`（**仅本机访问**，不暴露到公网）
- ✅ 数据目录 `/var/lib/mongodb`，日志 `/var/log/mongodb/mongod.log`
- ✅ 配置文件 `/etc/mongod.conf`
- ✅ systemd 单元 `mongod.service`，已设开机自启

## 自动化步骤

EnvForge 在目标机器上依次执行：

1. 安装 `gnupg` 和 `curl` 前置依赖（mongo 仓库签名校验需要）
2. 下载 MongoDB 7.0 GPG 公钥到 `/usr/share/keyrings/`
3. 写入 `/etc/apt/sources.list.d/mongodb-org-7.0.list` 并 `apt-get update`
4. 安装 `mongodb-org` 元包（含 server / shell / tools / mongos）
5. `systemctl enable --now mongod`
6. 用 `mongosh --eval 'db.runCommand({ping:1})'` 验证

## 安装后

### 创建管理员账号（强烈建议）

默认 mongod 没有启用认证，本机连接是开放的：

```bash
mongosh
> use admin
> db.createUser({
    user: "admin",
    pwd: passwordPrompt(),
    roles: [{ role: "root", db: "admin" }]
  })
> exit
```

然后启用认证：编辑 `/etc/mongod.conf`，找到 `security:` 段（如不存在请加上）：

```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod
mongosh -u admin --authenticationDatabase admin
```

### 远程访问（仅在确认账号已设置后）

只有在你已经创建了管理员账号 + 启用了 `authorization: enabled` 之后，才修改绑定地址：

```yaml
# /etc/mongod.conf
net:
  bindIp: 0.0.0.0   # 慎用！务必先做认证
  port: 27017
```

并在防火墙开放 27017：`sudo ufw allow from <你的IP> to any port 27017` 或 firewalld 的等价命令。

## ⚠️ 敏感性

**review** — MongoDB 默认开放本机所有访问，是历史上数据泄露事件最多的数据库之一。先认证、再暴露端口、再做反向代理。

## 验证安装

```bash
# 检查包是否已安装
dpkg -l | grep mongodb-org    # Ubuntu/Debian
rpm -q mongodb-org            # RHEL/CentOS/Anolis

# 检查服务是否运行
systemctl status mongod --no-pager

# 检查能否连接
mongosh --eval "db.runCommand({ping:1})"
```

## 排错

- **`Failed to start mongod.service`** — 通常是数据目录权限问题，运行 `sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb`。
- **`mongosh: command not found`（旧版 mongo shell 找不到）** — `mongosh` 在 v6+ 取代 `mongo`，旧脚本要替换。
- **跨发行版**：上面的 apt 源步骤在 RHEL/CentOS/Anolis 上不会工作；这种情况 EnvForge 会跳过 apt 步骤、提示你手动跑官方 yum 仓库步骤。
- **服务启动失败** — 任务日志的 `🔧 Failed: ...` 部分会附带 `systemctl status` 和 `journalctl` 输出，按提示处理。

## 多次运行

`installMode: skip-existing` — 已经安装的会跳过；想升级到 7.x 新次版本，先 `sudo apt-get install mongodb-org=<目标版本>` 后重启。

## 隐私说明

不上传任何数据库内容。配置文件 `/etc/mongod.conf` 由 mongodb 包安装，EnvForge 不会替换。如需自定义配置，建议放到 `/etc/mongod.conf.d/`（mongo 7+ 支持）保留升级时的兼容性。
