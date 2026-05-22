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

## /etc/mongod.conf 完整示例（生产参考）

MongoDB 配置是 YAML 格式（缩进敏感）。下面是一份常用配置，按需复制到 `/etc/mongod.conf`：

```yaml
# === 存储 ===
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true               # WAL，掉电不丢数据
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1.5          # 物理内存的 50% 减去 1GB（默认是 (RAM-1GB)/2）
      journalCompressor: snappy
    collectionConfig:
      blockCompressor: snappy   # 数据块压缩，节省磁盘 + IO（snappy 兼顾速度/压缩比）
    indexConfig:
      prefixCompression: true

# === 系统日志 ===
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
  logRotate: reopen             # 配合 logrotate 切割

# === 进程管理 ===
processManagement:
  fork: false                   # systemd 管理模式下保持 false
  pidFilePath: /var/run/mongodb/mongod.pid
  timeZoneInfo: /usr/share/zoneinfo

# === 网络 ===
net:
  port: 27017
  bindIp: 127.0.0.1             # 改 0.0.0.0 之前务必先开 authorization
  maxIncomingConnections: 1000
  # tls:                        # 公网/跨机部署务必开 TLS
  #   mode: requireTLS
  #   certificateKeyFile: /etc/mongo/mongo.pem
  #   CAFile: /etc/mongo/ca.pem

# === 安全 ===
security:
  authorization: enabled        # 创建管理员账号后必开！
  # keyFile: /etc/mongo/keyfile  # 副本集成员之间认证用

# === 慢查询 ===
operationProfiling:
  mode: slowOp                  # off / slowOp / all
  slowOpThresholdMs: 100        # 超过 100ms 记录到 system.profile
  slowOpSampleRate: 1.0

# === 副本集（高可用，单机可不写）===
# replication:
#   replSetName: rs0

# === 分片（水平扩容，单机可不写）===
# sharding:
#   clusterRole: shardsvr
```

应用配置：
```bash
sudo systemctl restart mongod
sudo journalctl -u mongod -n 30 --no-pager
```

### 创建管理员（authorization 启用前的最后一步）

启用 authorization 之前先创建好账号，否则 enabled 之后就连不进去了。
完整流程参见前面 "创建管理员账号" 一节。

### 副本集快速搭建（3 节点最小集群）

`mongod.conf` 在三台机器都加：
```yaml
replication:
  replSetName: rs0
```

任意一台启动后：
```javascript
mongosh
> rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "node1.example.com:27017" },
      { _id: 1, host: "node2.example.com:27017" },
      { _id: 2, host: "node3.example.com:27017" }
    ]
  })
> rs.status()       // 等几秒，观察 PRIMARY/SECONDARY 角色就绪
```

应用连接串改成 SRV / multi-host 形式：
```
mongodb://node1,node2,node3/?replicaSet=rs0&readPreference=secondaryPreferred
```

### 备份 / 恢复速查

```bash
# 完整备份（dump 整库）
mongodump --uri="mongodb://admin:pwd@localhost" -o /var/backups/mongo/$(date +%F)

# 单库备份
mongodump --uri="mongodb://admin:pwd@localhost/myapp" -o /backup/

# 还原
mongorestore --uri="mongodb://admin:pwd@localhost" /var/backups/mongo/2024-01-15/

# 副本集场景：在线物理备份（更快）
sudo cp -al /var/lib/mongodb /var/backups/mongo-physical
# 但要先 db.fsyncLock() 锁定写入；副本集集群推荐用 mongodump --oplog
```
