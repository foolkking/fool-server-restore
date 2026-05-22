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
