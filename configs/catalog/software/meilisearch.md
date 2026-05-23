# Meilisearch 全文搜索引擎

Meilisearch 是 Rust 写的**轻量级搜索引擎**——开箱即用、亚毫秒响应、错字容忍。**比 Elasticsearch 内存少 100×、启动 1 秒**，但仅适合中等数据量（< 10M 文档）。完美的应用内全文搜索方案（电商商品 / 文档站 / 笔记搜索）。

## 你将得到什么

- 📦 **meilisearch** 二进制装到 `/usr/local/bin/meilisearch`
- ✅ 专用 `meilisearch` 用户 + 数据目录 `/var/lib/meilisearch`
- ✅ HTTP API 监听 `127.0.0.1:7700`
- ✅ Master Key 自动生成（32 位）
- ✅ Production 模式（强制 key）
- ✅ Telemetry 已禁用
- ✅ systemd 服务 + 开机自启

## 表单字段说明

### `meili_master_key`

主密钥。所有 API 请求必须带 `Authorization: Bearer <key>`。留空 = 自动生成 32 位。

### `meili_port`

API 端口。默认 7700，仅 127.0.0.1。

### `meili_data_dir`

索引存储位置。

### `meili_env`

`production`（强制 master key + 优化） / `development`（不强制 key）。

## 配置文件 / 目录速查

```
/usr/local/bin/meilisearch                   # 二进制
/etc/systemd/system/meilisearch.service       # systemd unit
/var/lib/meilisearch/                          # 数据
├── data.ms/                                    # 主索引存储
└── dumps/                                       # 备份 dumps
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | 二进制下载（curl install.meilisearch.com） |
| 服务名 | `meilisearch` |
| 用户 | `meilisearch` |
| 端口 | 7700（自定义） |
| 默认 bind | `127.0.0.1`（仅本机） |

## 常见配置模板

### 模板 A — 创建索引 + 添加文档

```bash
KEY="your-master-key"

# 创建索引（隐式：第一次添加文档时自动建）
curl -X POST -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    --data '[
        {"id": 1, "title": "Quick Brown Fox", "category": "animals"},
        {"id": 2, "title": "Lazy Dog", "category": "animals"}
    ]' \
    http://127.0.0.1:7700/indexes/posts/documents

# 搜
curl -H "Authorization: Bearer $KEY" \
    "http://127.0.0.1:7700/indexes/posts/search?q=fox"
# {
#   "hits": [{"id": 1, "title": "Quick Brown Fox", ...}],
#   "estimatedTotalHits": 1,
#   "processingTimeMs": 1
# }
```

### 模板 B — 配置可搜索 / 可过滤字段

```bash
# 只搜索 title 字段
curl -X PUT -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    --data '["title", "tags"]' \
    http://127.0.0.1:7700/indexes/posts/settings/searchable-attributes

# 过滤字段（filter）
curl -X PUT -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    --data '["category", "price", "in_stock"]' \
    http://127.0.0.1:7700/indexes/posts/settings/filterable-attributes

# 排序字段
curl -X PUT -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    --data '["price", "date"]' \
    http://127.0.0.1:7700/indexes/posts/settings/sortable-attributes

# 同义词
curl -X PUT -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    --data '{"phone":["mobile","cell"]}' \
    http://127.0.0.1:7700/indexes/posts/settings/synonyms
```

### 模板 C — JS 客户端（meilisearch-js）

```javascript
import { MeiliSearch } from 'meilisearch'

const client = new MeiliSearch({
    host: 'http://127.0.0.1:7700',
    apiKey: 'master-key'
})

const index = client.index('posts')

// 添加 / 更新
await index.addDocuments([{ id: 1, title: 'Hello' }])

// 搜
const result = await index.search('hello', {
    filter: 'category = "blog" AND price < 100',
    sort: ['date:desc'],
    limit: 20,
    attributesToHighlight: ['title']
})
```

### 模板 D — 创建受限 API key

```bash
curl -X POST -H "Authorization: Bearer $MASTER_KEY" \
    -H "Content-Type: application/json" \
    --data '{
        "description": "Search-only key for frontend",
        "actions": ["search"],
        "indexes": ["posts"],
        "expiresAt": "2026-12-31T00:00:00Z"
    }' \
    http://127.0.0.1:7700/keys
```

返回的 `key` 给前端用——只能搜不能改。Master key 只在后端用。

### 模板 E — Nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name search.example.com;

    location / {
        proxy_pass http://127.0.0.1:7700;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 F — 备份（dump）

```bash
# 创建 dump
curl -X POST -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/dumps

# 看 dump 状态
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/tasks

# Dump 文件在 /var/lib/meilisearch/dumps/
ls /var/lib/meilisearch/dumps/

# 还原（启动时指定）
sudo systemctl stop meilisearch
sudo -u meilisearch /usr/local/bin/meilisearch --import-dump /var/lib/meilisearch/dumps/<id>.dump
```

## 关键参数调优速查

### 资源占用

| 文档数 | RAM | 磁盘 |
|---|---|---|
| 10k | 50 MB | 10 MB |
| 100k | 100 MB | 100 MB |
| 1M | 500 MB | 1 GB |
| 10M | 4 GB | 10 GB |
| > 50M | **考虑用 Elasticsearch** | – |

### 性能

| 项 | 默认 |
|---|---|
| 搜索响应 | < 50ms（< 1M docs） |
| 索引速率 | 50k docs/s |
| 错字容忍 | 自动（"Damerau-Levenshtein 距离"） |

## 跨发行版兼容

二进制安装跨发行版一致。

| 发行版 | 状态 |
|---|---|
| Ubuntu 22 / 24 / Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅ |
| ARM64 | ✅ |

## 与其它 catalog 项的配合

- **`postgres-profile` / `mysql-server`** — 主存储 + Meilisearch 索引派生
- **`elasticsearch`** — 互斥替代（数据量大时换 ES）
- **`nginx-web-service`** — 反代 + auth（生产）
- **`certbot-ssl`** — HTTPS

## 排错

### 服务起不来

```bash
sudo journalctl -u meilisearch -n 50
# 常见
# 1. 端口被占
# 2. 数据目录权限
sudo chown -R meilisearch:meilisearch /var/lib/meilisearch
```

### 搜索结果空

```bash
# 索引存在？
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/indexes

# 文档已加？
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/indexes/posts/stats

# searchableAttributes 配对了？
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/indexes/posts/settings
```

### Master key 忘了

```bash
sudo grep MEILI_MASTER_KEY /etc/systemd/system/meilisearch.service
```

### 内存吃光

```bash
# Meilisearch 把热数据放内存。文档巨多时降低 search payload size 或换 ES
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/indexes/posts/stats
# 看 numberOfDocuments / averageDocumentSize
```

## 验证

```bash
systemctl is-active meilisearch
sudo ss -tlnp | grep 7700
curl http://127.0.0.1:7700/health                     # 应返回 {"status":"available"}
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7700/version
```

## 多次运行

`installMode: skip-existing`。已装跳过。Master key 每次按表单值更新。**索引数据保留**。

## ⚠️ 敏感性

**review** — Meilisearch 索引含**业务数据全文**，搜索 API 暴露 = 数据库暴露。

强制：

1. 公网 0.0.0.0 = 必须配 master key + nginx + IP 白名单
2. 前端用受限 search-only key（模板 D），master key 仅后端用
3. 每应用一个 key（按 index 隔离）

## 隐私说明

- Telemetry 已禁用（`MEILI_NO_ANALYTICS=true`）
- 数据本地存储 `/var/lib/meilisearch/`
- API key 存 systemd unit Environment（明文，权限 0644——可改 0640 root:meilisearch）
- 索引中的文档全文存盘——业务敏感数据按合规处理
