# Paperless-ngx 文档管理

Paperless-ngx 是**自托管文档管理系统**——扫描 / 拍照 / 上传 PDF → **OCR 全文索引** + AI 标签 + 全文搜索 + 自动归档。**适合**：家庭纸质账单 / 合同 / 收据数字化、企业票据管理、研究论文库。**与 Nextcloud / BookStack 完全不同**——PNG 专做"以文搜文"。**资源中等**（1-2 GB RAM）。

## 你将得到什么

- 📦 **Paperless-ngx 容器**（`ghcr.io/paperless-ngx/paperless-ngx:latest`）
- 📦 **PostgreSQL 16**（专用 DB）
- 📦 **Redis 7**（任务队列）
- 📦 **Tika**（Office 文档解析）
- 📦 **Gotenberg**（PDF 转换）
- ✅ Web UI 监听 `127.0.0.1:8000`
- ✅ Tesseract OCR（默认中英双语）
- ✅ AI 自动分类（标签 / 文档类型 / 通讯方）
- ✅ 全文搜索（Whoosh 索引）
- ✅ Consume 目录（放 PDF 自动入库）
- ✅ 邮件入库（IMAP 拉附件）
- ✅ iOS / Android App 支持

## 表单字段说明

### `pn_admin_user` / `pn_admin_password`

⚠️ **仅首次启动写入**——重跑 Playbook **不会改已存的密码**。改密码用 Web UI（Settings → Users）或：

```bash
docker exec -it paperless ./manage.py changepassword admin
```

### `pn_db_password` / `pn_secret_key`

内部用。Secret key 改了 = 所有 session 失效（用户重登）。

### `pn_data_dir`

```
{data_dir}/
├── data/                 # 索引 + 任务 + 配置
│   └── index/             # 全文搜索索引
├── media/                # **原文档 + OCR 文本**（重要！）
│   ├── documents/originals/   # 原 PDF / 图片
│   ├── documents/archive/     # OCR 处理后的可搜索 PDF
│   └── documents/thumbnails/   # 缩略图
├── consume/              # 放 PDF 这里 → 自动入库
├── export/               # 导出目录
├── postgres-data/         # PG 数据
└── redis-data/            # Redis dump
```

**`media/`** 是核心——**每日 + 异地备份**。

### `pn_ocr_languages`

Tesseract 语言代码（`+` 分隔）。多语言越多 OCR 越慢：

| 代码 | 语言 |
|---|---|
| `eng` | 英文 |
| `chi_sim` | 简体中文 |
| `chi_tra` | 繁体中文 |
| `jpn` | 日文 |
| `kor` | 韩文 |
| `deu` | 德文 |
| `fra` | 法文 |

家庭中文用户：`eng+chi_sim`。多语种用户：`eng+chi_sim+jpn`。

### `pn_timezone`

IANA 时区。影响文档显示时间 + cron。

## 配置文件 / 目录速查

```
docker-compose.yml 内的环境变量是真相之源。
其他配置：
- Web UI Settings → 标签 / 类型 / 通讯方 / 邮件账号 / 自动化规则
- ./manage.py：CLI 工具

# 容器
paperless              # webserver
paperless-db            # PostgreSQL
paperless-redis         # Redis
paperless-tika          # Tika
paperless-gotenberg      # Gotenberg
```

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name docs.example.com;

    ssl_certificate     /etc/letsencrypt/live/docs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/docs.example.com/privkey.pem;

    # 大文件 OCR 上传
    client_max_body_size 100M;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

容器环境变量加：

```yaml
environment:
  PAPERLESS_URL: "https://docs.example.com"
```

### 模板 B — Consume 目录工作流

最常用——把 PDF 放到目录就自动 OCR + 入库：

```bash
# 把任意 PDF / 图片放到 consume 目录
sudo cp ~/Downloads/水电账单.pdf /opt/paperless-ngx/consume/

# 几秒后 Paperless 自动:
# 1. OCR
# 2. 提取关键词 → 自动打标签
# 3. 入库
# 4. 删除 consume 目录的原文件（已转移到 media/）

# Web UI 看处理状态
# Settings → Tasks
```

### 模板 C — Samba / NFS 挂 consume 给手机扫描

```bash
# Samba 把 consume 目录共享出来
# 在 samba-share Playbook 里加：
[paperless-consume]
   path = /opt/paperless-ngx/consume
   guest ok = no
   valid users = alice
   writable = yes
```

iOS Files App / Android 文件管理 → 连 SMB → 把扫描的 PDF 放进去 → 自动入库。

### 模板 D — 邮件入库（IMAP）

```
Web UI → Settings → Mail Accounts → Add
  IMAP Server:    imap.gmail.com
  Port:           993
  SSL:            ✓
  Username:       you@gmail.com
  Password:       <Gmail app password>

→ Mail Rules → Add
  From:           bills@utility.com         (按发件人筛选)
  Subject:        invoice
  Action:         Move to inbox / mark as read / delete
  Document tag:   utility-bill
```

### 模板 E — 自动化规则（按 Title 自动打标签）

```
Web UI → Settings → Document Types
  + Add:  发票（Invoice）

Web UI → Settings → Tags
  + Add:  税务

Web UI → Settings → Workflows
  + New Workflow
  Trigger:    Document added
  Filter:     Title contains "发票"
  Actions:    Assign type = 发票
              Assign tag = 税务
              Assign owner = alice
```

文档进库自动按规则分类——大量文档时极有用。

### 模板 F — 移动 App

iOS / Android 都有：

- **Paperless Mobile**（开源，社区出品）—— iOS / Android
- **PaperlessButler**（iOS）—— 拍照即上传
- 浏览器添加到主屏幕（PWA 也可用）

App 配 URL + token（Web UI → Profile → API token）。

### 模板 G — 备份 / 还原

```bash
#!/bin/bash
# /etc/cron.daily/paperless-backup
DEST=/backup/paperless

# 1. PG 备份
docker exec paperless-db pg_dump -U paperless paperless | gzip > $DEST/pg-$(date +%F).sql.gz

# 2. media/ 增量同步（含原文件）
sudo rsync -az --delete /opt/paperless-ngx/media/ $DEST/media/

# 3. data/ 索引 + 配置
sudo rsync -az --delete /opt/paperless-ngx/data/ $DEST/data/

# 旧 PG 备份保留 30 天
find $DEST -name 'pg-*.sql.gz' -mtime +30 -delete
```

或用内置导出（人类可读 JSON + 原文件）：

```bash
docker exec -it paperless ./manage.py document_exporter -p /usr/src/paperless/export
sudo rsync -az /opt/paperless-ngx/export/ $DEST/export/
```

### 模板 H — OCR 重处理（旧文档加新语言）

```bash
# 改 OCR 语言后，重跑所有文档的 OCR
docker exec -it paperless ./manage.py document_archiver --overwrite

# 或仅特定文档
docker exec -it paperless ./manage.py document_archiver --document <id>
```

## 关键参数调优速查

### 资源占用

| 文档量 | RAM | CPU（OCR 时） | 磁盘 |
|---|---|---|---|
| < 1k | 1.5 GB | 1 vCPU 100%（OCR 时） | 文档量 × 1.5 |
| < 10k | 2 GB | 2 vCPU | – |
| < 100k | 4 GB+ | 4 vCPU | – |

### OCR 速度

| 因素 | 影响 |
|---|---|
| 语言数 | 每多 1 种 +30% 时间 |
| 页数 | 线性 |
| OCR 模式 | skip_noarchive / redo / force（force 最慢） |
| CPU 核心 | 多核基本不并行（Tesseract 是单线程） |

### 加速大量入库

```yaml
# docker-compose.yml
environment:
  PAPERLESS_TASK_WORKERS: 4              # 并发 worker 数（默认 1）
  PAPERLESS_THREADS_PER_WORKER: 2        # 每 worker 线程
```

### Whoosh 索引大

定期 rebuild（解索引膨胀）：

```bash
docker exec -it paperless ./manage.py document_index reindex
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64（树莓派） | ⚠️ 慢（Tesseract OCR CPU 密集） |
| 内存最低 | 1 GB（OCR 时 spike 到 2 GB+） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`samba-share` / `nfs-server`** — 把 consume 目录共享给手机 / 桌面
- **`postgres-profile`** — **不用**（自带 PG 容器）
- **`rsync-tools`** — 备份 media/

## 排错

### 启动慢（5 分钟仍未 ready）

正常——首次启动要：

1. PG schema migration
2. 首次 Whoosh 索引创建
3. 拉 OCR 模型 / Tesseract 语言包

```bash
docker logs -f paperless     # 看进度
```

### Consume 文档不入库

```bash
# 1. 容器内能看到 consume 目录吗？
docker exec paperless ls /usr/src/paperless/consume

# 2. 文件权限对吗？
ls -la /opt/paperless-ngx/consume/
# Paperless 容器 UID 1000，文件应可读

# 3. 看任务状态
# Web UI → Settings → Tasks
```

### OCR 失败 / 中文乱码

```bash
# 1. OCR 语言配了？
docker exec paperless env | grep OCR_LANGUAGE
# 应有 chi_sim

# 2. Tesseract 语言包装了？
docker exec paperless tesseract --list-langs
# 应包含 chi_sim

# 3. PDF 已是文本（不需要 OCR）但 Paperless 重做了？
# 改环境变量
PAPERLESS_OCR_MODE: skip                   # skip = 已有文本就跳过
```

### Web UI 加载慢 / 文档列表卡

```bash
# 1. 索引太大
docker exec -it paperless ./manage.py document_index reindex

# 2. PG 慢
docker exec paperless-db psql -U paperless -c "VACUUM ANALYZE;"

# 3. Redis 满
docker exec paperless-redis redis-cli flushall
```

### 升级失败

```bash
# 备份 PG（必做）
docker exec paperless-db pg_dump -U paperless paperless > /backup/pre-upgrade.sql

# 拉新版
cd /opt/paperless-ngx
docker compose pull
docker compose up -d

# Migration 自动跑
docker logs -f paperless
```

### 大量文档时 worker 阻塞

```yaml
# 加 worker
environment:
  PAPERLESS_TASK_WORKERS: 4
  PAPERLESS_THREADS_PER_WORKER: 2

# 重启
docker compose restart
```

## 验证

```bash
# 1. 5 个容器都跑着
docker ps --filter name=paperless

# 2. PG 健康
docker exec paperless-db pg_isready -U paperless

# 3. API 响应
curl -fsS http://127.0.0.1:8000/api/ -o /dev/null -w '%{http_code}\n'
# 401（要登录）

# 4. Tesseract 语言
docker exec paperless tesseract --list-langs
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 每次按表单值重写——`PAPERLESS_ADMIN_PASSWORD` **仅首次启动有效**。已存的文档 / 标签 / workflow 全部保留（PG + media/）。

## ⚠️ 敏感性

**review** — Paperless 持有**所有重要纸质文档的数字化版**——含税单 / 合同 / 身份证 / 银行账单 / 等。

强制：

1. **公网必须 HTTPS**（建议加 SSO）
2. **每日备份 + 异地** —— `media/` + PG
3. 备份必加密（含敏感扫描件）—— borgbackup + 强密码
4. 公开链接（Share）默认带过期 + 密码
5. admin 强密码 + 启用 2FA（Profile → Security）

## 隐私说明

- **完全本地**——所有文档 + OCR 文本在你服务器
- **零遥测**（开源）
- AI 标签算法**本地运行**（不上传文本到外部 API）
- IMAP 邮件入库：邮箱凭据加密存 PG，**Paperless 主动连 IMAP**（不暴露你的邮箱给第三方）
- iOS App 上传走你的反代 → 服务器（按你 HTTPS 配置）
