# Elasticsearch 搜索引擎

Elasticsearch 8.x 单节点部署，自动启用 TLS + 安全认证（这是 ES 8 的默认行为）。
EnvForge 用 `elasticsearch-reset-password` 把 elastic 用户密码改成你填的值，安装
完成立刻能用确定凭据登录。

## 你将得到什么

- 📦 **elasticsearch** 8.x（来自官方 elastic.co APT/YUM 仓库）
- ✅ TLS 证书自动生成（自签名，仅本机访问够用；公网暴露请加反向代理）
- ✅ elastic 超级用户密码已设（默认 24 位随机，可表单填）
- ✅ JVM 堆大小按表单生效（写到 `/etc/elasticsearch/jvm.options.d/heap.options`）
- ✅ `discovery.type: single-node` — 单机部署，启动不等待集群其他节点
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### elastic 用户密码 `elastic_password`

ES 8 必须有认证，elastic 是内置超级用户。EnvForge 会在 ES 首次启动后用
`elasticsearch-reset-password` 把密码改成你填的值。

留空自动生成 24 位密码（运行结束显示一次）。

### 集群名 `cluster_name` / 节点名 `node_name`

单机部署时不重要，随便起个名字方便识别。多机集群时所有节点要用同一个 cluster_name。

### 监听地址 `bind_host`

**ES 不建议直接公网暴露**。建议方案：
- 应用在同机：`127.0.0.1` 即可
- 跨机访问：前面挂 nginx 做 basic auth，或者防火墙限定来源 IP

### JVM 堆大小 `heap_size`

经验法则：**物理内存的 50%**（其余给 OS file cache，ES 重度依赖它）。
**不要超过 32GB**——超过后 JVM 失去 compressed oops 优化，性能反而下降。

| 物理内存 | 推荐 heap |
|---|---|
| 1-2 GB | 512m |
| 2-4 GB | 1g |
| 4-8 GB | 2g |
| 8-16 GB | 4g |
| 16-32 GB | 8g |
| 30+ GB | 16g（再多没用） |

## 安装后

### 第一次访问（认证 + TLS）

```bash
curl -k -u elastic:你的密码 https://127.0.0.1:9200/
```

`-k` 表示忽略自签证书警告。如果想信任证书：
```bash
sudo cp /etc/elasticsearch/certs/http_ca.crt /usr/local/share/ca-certificates/elastic-ca.crt
sudo update-ca-certificates  # Ubuntu
sudo update-ca-trust         # RHEL
```

### 创建只读用户

```bash
curl -k -u elastic:你的密码 -X POST https://127.0.0.1:9200/_security/user/readonly \
  -H "Content-Type: application/json" \
  -d '{
    "password": "viewonly-pwd",
    "roles": ["viewer"]
  }'
```

### 创建索引 + 写文档

```bash
curl -k -u elastic:... -X POST https://127.0.0.1:9200/myindex/_doc \
  -H "Content-Type: application/json" \
  -d '{"title":"hello","timestamp":"2024-01-01"}'
```

### Kibana 配套（如需）

ES 主要配 Kibana 当 UI。Kibana 也是 elastic 仓库提供的：
```bash
sudo apt-get install kibana    # 或 dnf
sudo systemctl enable --now kibana
# 然后用 elasticsearch-create-enrollment-token 生成 token，配到 Kibana
```

## ⚠️ 敏感性

**review** — Elasticsearch 是历史上数据泄露最频繁的服务之一（默认无认证 +
被搜索引擎 shodan 抓到）。ES 8 默认开认证后情况好多了，但还是建议：
1. **不要 0.0.0.0 暴露**
2. heap 别配太大触发 OOM
3. `vm.max_map_count` 必须 >= 262144（系统级参数）

## 验证安装

```bash
systemctl status elasticsearch --no-pager
curl -k -u elastic:你的密码 https://127.0.0.1:9200/_cluster/health
```

## 排错

- **服务启动失败 + `vm.max_map_count` 报错** — ES 要求这个内核参数 >= 262144。EnvForge 没自动处理（需要 sysctl 模块）。手动：
  ```bash
  sudo sysctl -w vm.max_map_count=262144
  echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.d/99-elasticsearch.conf
  sudo systemctl restart elasticsearch
  ```
- **服务启动后立刻 OOM** — heap_size 配得超过物理内存了，下调一档。
- **`Connection refused`** — ES 启动慢（30-60 秒首次启动），多等一会儿。
- **重置密码失败** — 服务还没起来，等一分钟手动跑 `sudo /usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic`。

## 多次运行

`installMode: skip-existing`。已安装不会重装。但每次会重写 cluster.name / node.name /
network.host / http.port / discovery.type / heap，覆盖手动调整。**密码每次都会
重置**——如果你担心日志里的旧密码被人看到，安装完毕后用 reset-password 工具再改一次。

## 隐私说明

- elastic 密码会在任务日志里出现一次。
- 自签 CA 证书在 `/etc/elasticsearch/certs/`，不会上传或同步。
- 索引数据在 `/var/lib/elasticsearch/`。

## 配置文件速查

ES 8 的核心配置都在 `/etc/elasticsearch/`：

```
/etc/elasticsearch/
├── elasticsearch.yml         # 主配置（cluster/node/network/discovery）
├── jvm.options               # 默认 JVM 参数（不要改这个）
├── jvm.options.d/            # 自定义 JVM 参数（覆盖默认值）
│   └── heap.options          # ← EnvForge 写入 heap_size 的位置
├── log4j2.properties         # 日志级别 + rolling
├── certs/                    # 自签 CA + 节点证书
│   ├── http_ca.crt
│   └── transport.p12 / http.p12
└── users / roles / role_mapping  # File realm（很少用，一般用 Native realm + API）

/var/lib/elasticsearch/        # 数据目录（索引文件）
/var/log/elasticsearch/        # 日志
```

### elasticsearch.yml 关键参数

EnvForge 已经写入 cluster.name / node.name / network.host / discovery.type。
其它常调：

```yaml
# === 节点角色（小集群单机不用改，多机生产环境分角色）===
node.roles: [ master, data, ingest ]   # 单机；大集群把 master / data / coordinating 拆开

# === 内存锁（防止被 swap 出去拉低性能）===
bootstrap.memory_lock: true
# 配合 systemd LimitMEMLOCK=infinity（已默认）

# === 数据目录（生产建议放专用盘）===
path.data:  /var/lib/elasticsearch
path.logs:  /var/log/elasticsearch

# === 安全（ES 8 默认启用，别关）===
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.http.ssl.enabled: true
xpack.security.http.ssl.keystore.path: certs/http.p12

# === 索引默认配置（可被单 index 覆盖）===
action.destructive_requires_name: true   # 防止 DELETE _all 这种操作

# === 慢查询日志（按 index 配置，这里仅示意）===
# index.search.slowlog.threshold.query.warn: 5s
# index.search.slowlog.threshold.fetch.warn: 1s

# === 集群多节点配置（单机部署不用）===
# discovery.seed_hosts:    [ "node1.example.com", "node2.example.com" ]
# cluster.initial_master_nodes: [ "node1", "node2", "node3" ]
```

### jvm.options.d/heap.options（EnvForge 已生成）

EnvForge 写入的内容大致是：
```
-Xms2g
-Xmx2g
```

⚠️ **`-Xms` 和 `-Xmx` 必须相等**（让 JVM 启动就拿到最大堆，避免运行时增长抖动）。
**且不要超过 32GB**（JVM 失去 compressed oops，性能反而下降）。
更多内存全部留给 OS file cache（ES 重度依赖它做 Lucene 段缓存）。

### vm.max_map_count（必改的内核参数）

ES 用 mmap 映射 Lucene 文件，要求每进程能映射的虚拟内存区域足够多：

```bash
# 临时
sudo sysctl -w vm.max_map_count=262144
# 持久化
echo "vm.max_map_count = 262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf
sudo sysctl --system
```

EnvForge 没自动配这个（需要 sysctl 模块）。**ES 启动失败时常见原因排第二**——
仅次于 heap 配置错。

### 常用 API 速查

```bash
# 集群健康
curl -k -u elastic:$PWD https://127.0.0.1:9200/_cluster/health?pretty
# Yellow → 有副本未分配（单机正常）
# Red    → 主分片丢失，要紧急处理
# Green  → 全部健康

# 节点信息
curl -k -u elastic:$PWD https://127.0.0.1:9200/_nodes?pretty | head -50

# 索引列表 + 大小
curl -k -u elastic:$PWD https://127.0.0.1:9200/_cat/indices?v

# 查看某索引 mapping
curl -k -u elastic:$PWD https://127.0.0.1:9200/myindex/_mapping?pretty

# 删除索引（小心！）
curl -k -u elastic:$PWD -X DELETE https://127.0.0.1:9200/myindex

# 强制 flush（落盘 + 释放 translog）
curl -k -u elastic:$PWD -X POST https://127.0.0.1:9200/_flush

# Shard 分配诊断（why a shard is unassigned）
curl -k -u elastic:$PWD https://127.0.0.1:9200/_cluster/allocation/explain?pretty
```

### 索引模板（统一新索引的 mapping / settings）

```bash
curl -k -u elastic:$PWD -X PUT "https://127.0.0.1:9200/_index_template/logs-template" \
  -H "Content-Type: application/json" -d '
{
  "index_patterns": ["logs-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "logs-policy"
    },
    "mappings": {
      "properties": {
        "@timestamp":  { "type": "date" },
        "level":       { "type": "keyword" },
        "message":     { "type": "text" },
        "service":     { "type": "keyword" }
      }
    }
  }
}'
```

### ILM 索引生命周期（自动滚动 + 删除老数据）

```bash
curl -k -u elastic:$PWD -X PUT "https://127.0.0.1:9200/_ilm/policy/logs-policy" \
  -H "Content-Type: application/json" -d '
{
  "policy": {
    "phases": {
      "hot":  { "actions": { "rollover": { "max_size": "30gb", "max_age": "7d" } } },
      "warm": { "min_age": "7d",  "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "cold": { "min_age": "30d", "actions": { "freeze": {} } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}'
```
