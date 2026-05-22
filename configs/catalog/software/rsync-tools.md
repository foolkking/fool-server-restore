# 备份同步工具集

一组数据备份/同步用的 CLI 工具。

## 你将得到什么

- 📦 **rsync** — 增量文件同步（最经典的工具，被所有备份脚本依赖）
- 📦 **rclone** — "rsync for cloud"（同步到 S3 / GCS / Dropbox / OneDrive 等 70+ 云存储）
- 📦 **borgbackup** — 去重 + 加密 + 增量备份（同样数据备份 10 次还是只占 1 倍空间）

## 用法

### rsync —— 本地或 SSH 同步

```bash
# 本地复制（带进度 + 增量）
rsync -avh --progress /src/ /dst/

# SSH 同步到远程
rsync -avh --progress -e ssh /local/data/ user@server:/remote/data/

# 反向：从远程拉
rsync -avh --progress -e ssh user@server:/remote/data/ /local/

# --delete: 让目标和源完全一致（删除源没有的文件）
rsync -avh --delete /src/ /dst/

# 排除某些文件
rsync -avh --exclude='node_modules' --exclude='.git' /src/ /dst/

# 用 ssh 非标端口
rsync -avh -e 'ssh -p 22222' /src/ user@server:/dst/
```

### rclone —— 同步到云

```bash
# 第一次：配 backend
rclone config
# 跟着向导走：选 "n" new remote, 选 type（如 s3 / dropbox / google drive），配凭据

# 同步到云
rclone sync /local/backups/ s3:my-bucket/backups/

# 反向：从云拉
rclone sync s3:my-bucket/backups/ /local/restored/

# --dry-run 预演
rclone sync --dry-run /src/ s3:bucket/dst/

# 加密：先用 crypt remote 包装
rclone config            # 创建 crypt remote 指向某个 storage remote
rclone sync /local/ encrypted-remote:dir
```

### borg —— 去重 + 加密备份

```bash
# 第一次：初始化备份仓库
borg init --encryption=repokey /backup-repo

# 创建一次备份
borg create --stats --progress \
  /backup-repo::"home-{now:%Y-%m-%d-%H%M%S}" \
  /home /etc /var/www \
  --exclude '/home/*/.cache' --exclude '/home/*/node_modules'

# 列出所有备份
borg list /backup-repo

# 看某次备份的内容
borg list /backup-repo::home-2024-01-15-103000

# 还原一个文件
cd /tmp
borg extract /backup-repo::home-2024-01-15-103000 home/alice/important.txt

# 自动清理（保留 7 天 + 4 周 + 6 月）
borg prune --keep-daily 7 --keep-weekly 4 --keep-monthly 6 /backup-repo
```

### 自动定时备份（cron）

`crontab -e`：
```
# 每天凌晨 3 点跑 borg
0 3 * * * /usr/local/bin/borg-backup.sh
```

`/usr/local/bin/borg-backup.sh`:
```bash
#!/bin/bash
export BORG_PASSPHRASE='your-passphrase'
export BORG_REPO='/backup-repo'

borg create --stats --compression lz4 \
  ::"$(date +%Y-%m-%d-%H%M%S)" /home /etc /var/www \
  || echo "borg backup failed" | mail -s "borg failed" admin@example.com

borg prune --keep-daily 7 --keep-weekly 4 --keep-monthly 6
```

## ⚠️ 敏感性

**review** — 备份工具本身 safe，但备份目标如果没加密会泄露所有数据。**强烈建议**：
- borg 用 `--encryption=repokey` 或 `--encryption=keyfile`
- rclone 用 crypt remote 包装
- rsync to cloud 务必启用 SSE 服务端加密

## 验证

```bash
rsync --version
rclone version
borg --version
```

## 排错

- **rsync 报 "permission denied"** — 目标路径权限不够，用 `--rsync-path="sudo rsync"` 让远程跑 sudo（要求远程 sudoers NOPASSWD 配好）。
- **rclone 性能差** — `--transfers 8 --checkers 16` 增加并发；某些云服务（特别是 Google Drive）有 rate limit，调低 transfers 反而快。
- **borg 报 "lock not exclusive"** — 上次备份被强制中断，锁文件还在。`borg break-lock /backup-repo` 解锁。
- **跨发行版**：`rsync` 在两边一致；`rclone` 和 `borg` 在 RHEL/Anolis 上需要 EPEL（preflight 自动启用）。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

这些都是工具，不发遥测。**你的备份数据**安全完全取决于你怎么用它们：
- 备份目标在哪（本地 / NFS / 远程 SSH / 云）
- 是否加密
- 备份凭据怎么管（borg passphrase / rclone config 文件权限）
