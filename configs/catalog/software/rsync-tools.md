# 备份同步工具集

一组数据备份 / 同步用的 CLI 工具——本地复制、SSH 远程同步、云存储推送、加密去重备份全覆盖。

## 你将得到什么

- 📦 **rsync** — 增量文件同步（最经典，所有备份脚本依赖它）
- 📦 **rclone** — "rsync for cloud"（同步到 70+ 云存储：S3 / GCS / Dropbox / OneDrive / Google Drive / pCloud / WebDAV / SFTP / ...）
- 📦 **borgbackup** — 去重 + 加密 + 增量备份（同样数据备份 100 次仍只占 1 倍空间）
- 📦 **restic**（如可装）— 现代加密备份（替代 borg，支持云 backend）

## 配置文件 / 目录速查

```
# rsync
~/.ssh/config                            # SSH 配置（rsync 走 SSH 时读）
/etc/rsyncd.conf                          # rsync daemon 模式配置（少用）

# rclone
~/.config/rclone/rclone.conf             # ← 主配置（含 backend 凭据）
~/.config/rclone/                        # 缓存

# borg
$BORG_REPO                               # 环境变量指向仓库（如 /backup/repo）
$BORG_PASSPHRASE                         # 加密密码
~/.config/borg/                          # 默认 cache + key
~/.cache/borg/                           # 仓库 cache（重建前可删）

# restic（如装）
~/.cache/restic/                         # 缓存
$RESTIC_REPOSITORY                       # 仓库路径
$RESTIC_PASSWORD_FILE                    # 密码文件
```

| 工具 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| `rsync` | 默认仓库 | 默认仓库 |
| `rclone` | 默认仓库（Ubuntu 22+） | EPEL（preflight 启用） |
| `borgbackup` | 默认仓库 | EPEL（preflight 启用） |
| `restic` | 默认仓库（Ubuntu 22+） | EPEL ✅ |

EnvForge preflight 自动启用 EPEL，RHEL 系无需额外步骤。

## 常见配置模板

### 模板 A — rsync 常用模式

```bash
# ====== 本地复制（带进度 + 增量）======
rsync -avh --progress /src/ /dst/
# -a = -rlptgoD（递归 + 保留链接 / 权限 / 时间 / 用户 / 设备文件）
# -v 详细 -h 人类可读

# ====== SSH 同步到远程 ======
rsync -avh --progress -e ssh /local/data/ user@server:/remote/data/

# 反向：从远程拉
rsync -avh --progress -e ssh user@server:/remote/data/ /local/

# 用 SSH 非标端口
rsync -avh -e 'ssh -p 22222' /src/ user@server:/dst/

# 用 SSH key + 跳过 known_hosts 检查（CI 用）
rsync -avh -e 'ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=no' \
  /src/ user@server:/dst/

# ====== 完全镜像（删目标多余文件）======
rsync -avh --delete /src/ /dst/

# ====== 排除规则 ======
rsync -avh \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude-from=/etc/backup-excludes.txt \
  /src/ /dst/

# ====== 限速（避免吞带宽）======
rsync -avh --bwlimit=5000 /src/ user@server:/dst/      # 5 MB/s

# ====== 仅传新增 / 更改的（备份场景）======
rsync -avh --update /src/ /dst/                         # 不覆盖目标更新的

# ====== Hard link 增量备份（节省空间）======
rsync -avh --link-dest=/backup/yesterday/ /src/ /backup/today/
# /backup/today/ 中未变文件硬链到 yesterday，仅新文件占空间

# ====== Dry run（预演不实际执行）======
rsync -avhn /src/ /dst/                                 # -n = --dry-run
```

### 模板 B — rclone 配置 + 同步

```bash
# ====== 第一次：交互式配 backend ======
rclone config
# 跟向导：选 "n" new remote, type（s3/dropbox/gdrive/etc.），配凭据

# ====== 配 S3 兼容（含 MinIO / 阿里云 OSS / 腾讯云 COS / 七牛等）======
# ~/.config/rclone/rclone.conf
cat > ~/.config/rclone/rclone.conf <<'EOF'
[s3-aws]
type = s3
provider = AWS
access_key_id = AKIA...
secret_access_key = xxxxx
region = us-east-1
storage_class = STANDARD_IA

[oss-aliyun]
type = s3
provider = Alibaba
access_key_id = LTAI...
secret_access_key = xxxxx
endpoint = oss-cn-hangzhou.aliyuncs.com
acl = private

[minio-local]
type = s3
provider = Minio
access_key_id = minio
secret_access_key = xxxxx
endpoint = http://127.0.0.1:9000
acl = private

[gdrive]
type = drive
client_id = ...
client_secret = ...
scope = drive
token = {"access_token":...}
EOF
chmod 600 ~/.config/rclone/rclone.conf       # 含凭据，必须 0600

# ====== 同步 ======
rclone sync /local/data/ s3-aws:my-bucket/backup/
rclone sync /local/data/ oss-aliyun:my-bucket/backup/

# 反向：拉
rclone sync s3-aws:my-bucket/backup/ /local/restored/

# ====== 加密 backend（包装其他 backend）======
rclone config
# 选 n new remote, type = "crypt"
# remote = s3-aws:my-bucket/encrypted
# 设两个密码（password / salt password）
# 之后用 crypt-remote 跟用普通 remote 一样，但所有数据透明加密

rclone sync /local/sensitive/ crypt-remote:

# ====== 性能调优 ======
rclone sync \
  --transfers 8 \                  # 并发文件数
  --checkers 16 \                   # 并发 size/mtime 检查
  --bwlimit 50M \                    # 带宽限制 50 MB/s
  --fast-list \                       # 一次列完目录（云 API 有 list 限制时）
  --progress \
  /local/ remote:bucket/

# ====== 仅传新增（不删除）======
rclone copy /src remote:bucket/

# ====== 检查差异 ======
rclone check /src remote:bucket/

# ====== 看大小 ======
rclone size remote:bucket/
```

### 模板 C — borg 加密去重备份（推荐方案）

```bash
# ====== 1. 初始化仓库（一次性）======
export BORG_REPO=/mnt/backup-disk/borg-repo
export BORG_PASSPHRASE='strong-passphrase-keep-safe'

borg init --encryption=repokey-blake2 $BORG_REPO
# repokey: 密钥存仓库内（用 PASSPHRASE 解锁）
# keyfile: 密钥存本地文件，仓库丢了也不能解（但本地丢了也不能解，要备份 key）

# ====== 2. 创建备份 ======
borg create --stats --progress \
  --compression lz4 \                              # zstd / lz4 / lzma
  --exclude '/home/*/.cache' \
  --exclude '/home/*/node_modules' \
  --exclude '*.tmp' \
  --exclude-caches \                                 # 跳过含 CACHEDIR.TAG 的目录
  $BORG_REPO::"home-{now:%Y-%m-%d-%H%M%S}" \
  /home /etc /var/www

# ====== 3. 列备份 ======
borg list $BORG_REPO

# ====== 4. 看某次备份内容 ======
borg list $BORG_REPO::home-2026-05-23-103000 | head

# ====== 5. 还原 ======
cd /tmp/restore
borg extract $BORG_REPO::home-2026-05-23-103000
# 还原全部到当前目录

# 或仅还原某文件
borg extract $BORG_REPO::home-2026-05-23-103000 home/alice/important.txt

# ====== 6. 挂载浏览（只读）======
mkdir /mnt/borg-mount
borg mount $BORG_REPO::home-2026-05-23-103000 /mnt/borg-mount
ls /mnt/borg-mount/home/alice/
borg umount /mnt/borg-mount

# ====== 7. 清理（保留 7 天 + 4 周 + 6 月）======
borg prune --stats --keep-daily 7 --keep-weekly 4 --keep-monthly 6 $BORG_REPO

# ====== 8. 校验完整性 ======
borg check --verify-data $BORG_REPO

# ====== 9. 看仓库大小 ======
borg info $BORG_REPO
```

### 模板 D — 自动定时备份（cron）

`/usr/local/bin/borg-backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

# 凭据
export BORG_REPO='/mnt/backup-disk/borg-repo'
export BORG_PASSPHRASE_FILE='/root/.config/borg/passphrase'   # 0600 权限文件
export BORG_PASSPHRASE=$(cat "$BORG_PASSPHRASE_FILE")

LOG=/var/log/borg-backup.log
exec >> "$LOG" 2>&1
echo "===== $(date) Starting backup ====="

# 创建
borg create --stats --compression zstd,3 \
  --exclude '/home/*/.cache' \
  --exclude '/home/*/.local/share/Trash' \
  --exclude '/var/cache' \
  --exclude '/var/log/journal' \
  ::"system-{now:%Y-%m-%d-%H%M%S}" \
  /home /etc /var/www /var/lib/postgresql

BACKUP_EXIT=$?

# 清理（旧策略）
borg prune --stats \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 \
  --keep-yearly 2

PRUNE_EXIT=$?

# Compact（实际释放空间）
borg compact

if [ $BACKUP_EXIT -ne 0 ] || [ $PRUNE_EXIT -ne 0 ]; then
    echo "Backup failed with exit codes: backup=$BACKUP_EXIT prune=$PRUNE_EXIT" | \
      mail -s "borg backup FAILED on $(hostname)" admin@example.com
    exit 1
fi

echo "===== $(date) Backup OK ====="
```

```bash
sudo chmod 700 /usr/local/bin/borg-backup.sh
sudo chmod 600 /root/.config/borg/passphrase

# crontab -e (root)
0 3 * * * /usr/local/bin/borg-backup.sh
```

或用 systemd timer（推荐）：

```ini
# /etc/systemd/system/borg-backup.service
[Unit]
Description=Borg backup
Documentation=man:borg(1)
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/borg-backup.sh
Nice=19                  # 低 CPU 优先级
IOSchedulingClass=idle    # 低磁盘 IO 优先级

# /etc/systemd/system/borg-backup.timer
[Unit]
Description=Daily borg backup

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true            # 错过的也会跑（开机后追跑）

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now borg-backup.timer
sudo systemctl list-timers | grep borg
```

### 模板 E — restic 替代方案

restic 类似 borg 但支持云 backend（S3 / B2 / Azure / Swift / GCS）：

```bash
export RESTIC_REPOSITORY="s3:s3.amazonaws.com/my-backup-bucket/restic"
export RESTIC_PASSWORD_FILE=/root/.config/restic/password
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

# 初始化（一次性）
restic init

# 备份
restic backup /home /etc /var/www \
  --exclude='/home/*/.cache' \
  --exclude='*.log'

# 列 snapshot
restic snapshots

# 还原
restic restore latest --target /tmp/restore

# 清理
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

# 校验
restic check
```

borg vs restic：

| 项 | borg | restic |
|---|---|---|
| 后端 | 本地 / SSH | 本地 / SFTP / S3 / B2 / GCS / ... |
| 加密 | 默认（多算法可选） | 默认 |
| 去重 | 是 | 是 |
| 性能 | 略快 | 略慢但更通用 |
| 成熟度 | 自 2010 | 自 2014 |

## 关键参数调优速查

### rsync 性能

| 参数 | 适用 |
|---|---|
| `-z` | 压缩（慢网络好；快网络反而慢） |
| `--whole-file` (`-W`) | 同机器盘到盘（不用增量算法，更快） |
| `--inplace` | 大文件原地更新（适合 VM 镜像） |
| `--info=progress2` | rsync 3+ 全局进度（替代 `--progress`） |
| `--numeric-ids` | 备份场景用 uid/gid 数字（避免目标用户名映射不一致） |

### rclone 性能

| 参数 | 默认 | 调高场景 |
|---|---|---|
| `--transfers` | 4 | 大量小文件（设 16-32） |
| `--checkers` | 8 | size/mtime 检查并发（设 32） |
| `--multi-thread-streams` | 4 | 大文件并行下载（云 API 限速时降） |
| `--bwlimit` | 不限 | 防吞带宽：`50M` |
| `--fast-list` | 关 | 一次性列完目录（API 限速时反慢） |

### borg 压缩

| 算法 | 速度 | 压缩率 |
|---|---|---|
| `none` | 最快 | 0% |
| `lz4`（默认） | 极快 | 中等 |
| `zstd,1` | 快 | 好 |
| `zstd,3` | 中 | 较好 |
| `zstd,22` | 慢 | 最好 |
| `lzma,9` | 极慢 | 最好 |

日常备份 `lz4` 或 `zstd,3`；归档冷存 `lzma`。

## 跨发行版兼容

| 工具 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| rsync | 默认 | 默认 |
| rclone | Ubuntu 22+ 默认；老版从 GitHub release 装 | EPEL ✅ |
| borgbackup | 默认 | EPEL ✅ |
| restic | 默认 | EPEL ✅ |

## 与其它 catalog 项的配合

- **`postgres-profile`** — 用 `pg_dumpall` + borg 备份数据库（先 dump，borg 去重 SQL）；或 PG 物理备份（pg_basebackup）+ borg
- **`mysql-server`** — `mysqldump` + borg 同理
- **`docker-host-profile`** — 备份 `/var/lib/docker/volumes/` + 容器配置
- **`minio-storage`** — rclone 推 borg 仓库到 MinIO（双层加密：borg + S3 SSE）
- **`samba-share`** — rsync 同步到 SMB 挂载点

## 排错

### rsync `Permission denied` 远程

```bash
# 让远程用 sudo
rsync -avh -e ssh --rsync-path="sudo rsync" /src/ user@server:/dst/
# 要求远程 sudoers 配 NOPASSWD: ALL 给 user

# 或换用户
rsync -avh -e 'ssh -l root' /src/ server:/dst/
```

### rsync 中断后重试速度慢

加 `--partial` 保留半传文件，下次续传：

```bash
rsync -avh --partial --append-verify /src/ /dst/
```

### rclone "Failed to authenticate" 大文件

S3 单次 PUT 限制 5GB。强制 multipart：

```bash
rclone copy --s3-chunk-size 64M --s3-upload-concurrency 4 ...
```

### rclone Google Drive rate limited

```bash
rclone copy --transfers 2 --tpslimit 8 ...     # 降并发
```

### borg "Mountpoint may not exist or be busy"

```bash
borg umount /mnt/borg-mount
fusermount -u /mnt/borg-mount       # 强制
```

### borg "lock not exclusive"

上次操作被强制中断，锁文件残留：

```bash
borg break-lock $BORG_REPO
```

注意：仅当**确认**没有其他备份在跑时用，否则会损坏仓库。

### borg 备份巨慢（首次后）

可能是 cache 损坏：

```bash
rm -rf ~/.cache/borg/<REPO_HASH>/
borg create ...               # 会重建 cache（首次会慢）
```

或仓库损坏（罕见）：

```bash
borg check --repair $BORG_REPO       # **慢，但能修**
```

### restic "snapshot already exists"

S3 list 一致性偶发。重试通常解决；持续问题清 cache：

```bash
rm -rf ~/.cache/restic
restic snapshots
```

### 备份脚本 cron 跑不起来但手动 OK

`crontab` 环境变量缺失（特别是 `BORG_PASSPHRASE` `AWS_ACCESS_KEY_ID`）。脚本内显式 source：

```bash
#!/bin/bash
source /root/.config/borg/env       # 含 export BORG_*
borg create ...
```

## 验证

```bash
# 1. 命令存在
rsync --version
rclone version
borg --version
restic version 2>/dev/null || echo "restic optional"

# 2. rsync 跑个测试
mkdir /tmp/rsync-{src,dst}
echo "hello" > /tmp/rsync-src/test.txt
rsync -avh /tmp/rsync-src/ /tmp/rsync-dst/
ls /tmp/rsync-dst/test.txt
rm -rf /tmp/rsync-{src,dst}

# 3. rclone 配置（如已配）
rclone listremotes

# 4. borg 仓库存在
test -d $BORG_REPO 2>/dev/null && borg info $BORG_REPO || echo "no borg repo set"
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**不创建** rclone / borg 配置——这些含凭据，由用户手动配。

## ⚠️ 敏感性

**review** — 工具本身 safe，但**备份目标**如果没加密会泄露所有数据：

1. **本地备份盘**：物理隔离风险
2. **NFS / SMB 备份**：需文件系统权限保护
3. **云备份**：必须服务端加密（S3 SSE）+ 客户端加密（rclone crypt 或 borg/restic 自带）
4. **备份凭据**：rclone.conf / borg passphrase 文件必须 0600

## 隐私说明

- 工具自身不发遥测
- rclone 走 HTTPS 与云 backend 通信（凭据在 header）
- borg / restic 默认客户端加密——即使云 provider 也看不到内容（仅看到加密块）
- rclone.conf 含云凭据**明文**（除非用 `rclone config password`）；建议用 IAM 临时凭据 + STS
- 备份内容本身可能含密码 / token / 用户数据 / 数据库——**任何备份都默认敏感**
- borg passphrase 一旦丢失，**所有备份永久无法解密**——务必多份备份 passphrase（密码管理器 / 物理保险箱）
