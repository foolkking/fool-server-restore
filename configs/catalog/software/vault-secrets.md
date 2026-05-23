# HashiCorp Vault — 密钥管理

Vault 是企业级 secret 管理系统：集中存储数据库密码 / API key / SSL 证书 / SSH 密钥 / OAuth token，应用通过 API 拿取，**避免把 secret 散落在配置文件里**。还能动态生成短期凭据（如临时 DB 账号 / AWS STS token）、做 PKI 签发、加密即服务（Encryption as a Service）。

## 你将得到什么

- 📦 **vault**（来自 HashiCorp 官方仓库）
- ✅ `/etc/vault.d/vault.hcl` 配置（file storage / 8200 端口 / TLS 关闭 / UI 启用）
- ✅ 数据目录 `/var/lib/vault/data` 创建并设权限
- ✅ `vault.service` 启动并设开机自启
- ⚠️ Vault 启动后处于 **sealed + 未初始化** 状态——**必须手动初始化**

## 必须做的下一步：初始化

```bash
export VAULT_ADDR=http://127.0.0.1:8200
vault operator init
```

输出形如：

```
Unseal Key 1: aBcD...XYZ
Unseal Key 2: 1234...567
Unseal Key 3: !@#$...%^&
Unseal Key 4: zZzZ...
Unseal Key 5: pQrS...

Initial Root Token: hvs.AbCd...

Vault initialized with 5 key shares and a key threshold of 3.
```

> ⚠️ **立刻把这些 key 安全保存**——丢了**无法恢复 vault 里的任何数据**。
>
> 建议：拆给不同管理员（每人一份 unseal key），root token 离线保存（密码管理器 + 硬件 token）。

### 解封（每次重启 Vault 都要做）

```bash
vault operator unseal <Unseal Key 1>
vault operator unseal <Unseal Key 2>
vault operator unseal <Unseal Key 3>
# 输入 3 个 unseal key（threshold）后 Vault 解封
```

### 用 root token 登录

```bash
vault login hvs.AbCd...
```

## 表单字段说明

### `listen_address`

> ⚠️ **默认 127.0.0.1 + tls_disable=1**——明文传输，仅本机访问。改 `0.0.0.0` 之前**务必先配 TLS**——否则 secret 在网络裸传。

### `api_port`

默认 8200。改非标减少扫描可见性。

### `storage_path`

数据持久化目录。生产建议：

- 专用磁盘（避免和 OS 抢空间）
- 频繁备份（Vault 数据是核心机密）
- 文件系统 ext4 / xfs（**不要 NFS**——Vault 文件锁可能出问题）

## 配置文件 / 目录速查

```
/etc/vault.d/
├── vault.hcl                        # ← 主配置
└── vault.env                          # 环境变量

/var/lib/vault/
├── data/                              # ← 数据目录（封装加密的 secrets）
│   └── core/                            # 内部数据
└── tls/                                # TLS 证书（如启用）

/var/log/vault/                       # 日志（按需）

# CLI
/usr/bin/vault                         # 主命令

# systemd
/usr/lib/systemd/system/vault.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `apt.releases.hashicorp.com` | `rpm.releases.hashicorp.com` |
| 包名 | `vault` | `vault` |
| 服务 | `vault` | `vault` |
| 用户 | `vault` | `vault` |

## 常见配置模板

### 模板 A — 推荐 `/etc/vault.d/vault.hcl`（生产基线）

```hcl
ui            = true
disable_mlock = false                   # 生产必须 false（防止 secret swap 到磁盘）
api_addr      = "https://vault.example.com:8200"
cluster_addr  = "https://vault.example.com:8201"

storage "file" {
    path = "/var/lib/vault/data"
}

# 或生产用 raft（HA）
# storage "raft" {
#     path    = "/var/lib/vault/raft"
#     node_id = "vault-node-1"
#     retry_join {
#         leader_api_addr = "https://vault-1.example.com:8200"
#     }
# }

listener "tcp" {
    address       = "0.0.0.0:8200"
    tls_cert_file = "/etc/vault.d/tls/cert.pem"
    tls_key_file  = "/etc/vault.d/tls/key.pem"
    tls_min_version = "tls12"
}

# 开发模式（**仅测试**）
# listener "tcp" {
#     address     = "127.0.0.1:8200"
#     tls_disable = 1
# }

telemetry {
    disable_hostname          = true
    prometheus_retention_time = "24h"
}

# 审计（生产推荐）
# vault audit enable file file_path=/var/log/vault/audit.log
```

### 模板 B — 启用 KV v2 secrets engine

```bash
vault secrets enable -path=secret kv-v2

# 写
vault kv put secret/myapp/db \
    username=app1 \
    password='strong-pass'

# 读
vault kv get secret/myapp/db
vault kv get -format=json secret/myapp/db | jq -r '.data.data.password'

# 历史版本
vault kv get -version=2 secret/myapp/db
vault kv metadata get secret/myapp/db

# 删（保留版本）
vault kv delete secret/myapp/db

# 销毁版本（不可恢复）
vault kv destroy -versions=1 secret/myapp/db

# 列
vault kv list secret/
vault kv list secret/myapp/
```

### 模板 C — 创建受限 policy + token

```bash
# 写 policy
cat > /tmp/myapp-policy.hcl <<EOF
path "secret/data/myapp/*" {
    capabilities = ["read"]
}

path "secret/metadata/myapp/*" {
    capabilities = ["list"]
}

path "auth/token/renew-self" {
    capabilities = ["update"]
}
EOF

vault policy write myapp /tmp/myapp-policy.hcl

# 创建 token（仅此 policy 权限）
vault token create -policy=myapp -ttl=24h -renewable=true
# 输出 token，给应用用

# 列 policy
vault policy list
vault policy read myapp
```

### 模板 D — 应用拿 secret（多种方式）

#### REST API

```bash
TOKEN=hvs.xxxxx
curl -H "X-Vault-Token: $TOKEN" \
    https://vault.example.com:8200/v1/secret/data/myapp/db | jq
```

#### Python（hvac）

```python
import hvac

client = hvac.Client(url='https://vault.example.com:8200', token='hvs.xxx')
assert client.is_authenticated()

secret = client.secrets.kv.v2.read_secret_version(path='myapp/db')
db_pass = secret['data']['data']['password']
```

#### Vault Agent（自动 fetch + render 模板）

```hcl
# /etc/vault-agent.hcl
auto_auth {
    method "approle" {
        config = {
            role_id_file_path = "/etc/vault-agent/role-id"
            secret_id_file_path = "/etc/vault-agent/secret-id"
        }
    }
    sink "file" {
        config = {
            path = "/run/vault-agent/token"
        }
    }
}

template {
    source      = "/etc/vault-agent/db.conf.tmpl"
    destination = "/etc/myapp/db.conf"
    perms       = "0640"
    command     = "systemctl reload myapp"
}
```

`/etc/vault-agent/db.conf.tmpl`:

```hcl
{{ with secret "secret/data/myapp/db" }}
[database]
username = {{ .Data.data.username }}
password = {{ .Data.data.password }}
{{ end }}
```

启动：

```bash
sudo vault agent -config=/etc/vault-agent.hcl
```

### 模板 E — 启用 audit log（生产强烈推荐）

```bash
sudo mkdir -p /var/log/vault
sudo chown vault:vault /var/log/vault
vault audit enable file file_path=/var/log/vault/audit.log
```

audit log 记录**每个 API 请求 / 响应**（自动 hash 敏感字段）——出事时唯一可信查证来源。

### 模板 F — Auto-unseal（避免重启后手动 unseal）

#### Cloud KMS

```hcl
# vault.hcl
seal "awskms" {
    region     = "us-east-1"
    kms_key_id = "alias/vault-unseal"
}
```

或 GCP KMS / Azure Key Vault / Aliyun KMS。

#### Transit unseal（用另一个 Vault）

适合多 Vault 集群场景。

### 模板 G — 数据库动态凭据（Vault 杀手级功能）

```bash
# 启用
vault secrets enable database

# 配 PG connection
vault write database/config/myapp-pg \
    plugin_name=postgresql-database-plugin \
    allowed_roles="readonly,readwrite" \
    connection_url="postgresql://{{username}}:{{password}}@127.0.0.1:5432/myapp" \
    username="vault_admin" \
    password="vault-admin-pass"

# 定义 role（动态生成的临时账号权限）
vault write database/roles/readonly \
    db_name=myapp-pg \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"

# 应用拿临时凭据
vault read database/creds/readonly
# Key                Value
# ---                -----
# lease_id            database/creds/readonly/abc...
# lease_duration      1h
# username            v-token-readonly-xyz...
# password            random-pass-...
```

应用用此账号连 PG，1 小时后凭据自动失效（Vault 自动 DROP USER）。

### 模板 H — Nginx 反代 + HTTPS

```nginx
upstream vault { server 127.0.0.1:8200; }

server {
    listen 443 ssl http2;
    server_name vault.example.com;

    ssl_certificate /etc/letsencrypt/live/vault.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vault.example.com/privkey.pem;

    # 仅特定 IP 能访问（生产）
    allow 10.0.0.0/8;
    deny all;

    location / {
        proxy_pass         http://vault;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }
}
```

### 模板 I — 备份 / 恢复

```bash
# 1. Snapshot（仅 raft / Consul backend；file backend 直接复制目录）
vault operator raft snapshot save /backup/vault-$(date +%F).snap

# 或 file backend
sudo systemctl stop vault
sudo tar czf /backup/vault-data-$(date +%F).tar.gz /var/lib/vault/data
sudo systemctl start vault

# 2. 还原（**严重操作，会覆盖现有数据**）
vault operator raft snapshot restore /backup/vault.snap

# 3. **必须备份 unseal keys**——数据再多没 keys 也解不开
```

## 关键参数调优速查

### Storage backend 选择

| Backend | 适用 | HA |
|---|---|---|
| `file`（默认） | 单机 / 开发 | ❌ |
| `raft`（Integrated Storage） | **生产推荐**——Vault 自管，无外部依赖 | ✅（3 节点） |
| `consul` | 已有 Consul 集群 | ✅ |
| `postgresql` | 已有 PG | ✅（PG 一致性保证） |
| `s3` | 仅审计存档 | ❌ |

### 性能

| 部署 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 单机（< 1k 请求/min） | 256 MB | < 1 vCPU | 1 GB |
| 中型（10k 请求/min） | 1 GB | 1 vCPU | 10 GB |
| 大型 raft 集群 | 4 GB+ | 2 vCPU+/节点 | 50 GB+ |

### 关键参数

| 参数 | 默认 | 推荐 |
|---|---|---|
| `disable_mlock` | false | **false**（生产；阻止 secret swap） |
| `default_lease_ttl` | 768h | 768h（32 天） |
| `max_lease_ttl` | 768h | 8760h（1 年） |
| `cache.use_auto_auth_token` | true | true |

`disable_mlock = false` 需要 capability：

```bash
sudo setcap cap_ipc_lock=+ep $(which vault)
```

EnvForge Playbook 自动处理。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `apt.releases.hashicorp.com` | `rpm.releases.hashicorp.com` |
| 包 | `vault` | `vault` |
| systemd unit | `vault.service` | 同 |
| `mlock` | 需 cap | 同 |

EnvForge 自动添加 HashiCorp 官方仓库。

## 与其它 catalog 项的配合

- **`postgres-profile` / `mysql-server`** — 动态凭据（模板 G）
- **`certbot-ssl`** — 给 Vault 启用 TLS（**生产必须**）
- **`nginx-web-service`** — 反代（模板 H）
- **`prometheus-monitoring`** — Vault 自带 `/v1/sys/metrics?format=prometheus`
- **`ansible-tool`** — Ansible community.hashi_vault collection 拿 secret 跑 playbook

## 排错

### 服务起不来 + `mlock` 错误

```bash
# 方案 1：disable_mlock = true（不推荐，仅开发）
# 方案 2：给 vault 加 cap
sudo setcap cap_ipc_lock=+ep $(which vault)
sudo systemctl restart vault
```

### `Error initializing Vault: server gave HTTP response to HTTPS client`

```bash
# 客户端默认走 https，但配的是 http
export VAULT_ADDR=http://127.0.0.1:8200
vault operator init
```

### `Vault is sealed`

```bash
vault status                                    # 看 sealed 状态
vault operator unseal <KEY1>
vault operator unseal <KEY2>
vault operator unseal <KEY3>
```

### Unseal keys 丢了

**没救**——所有数据永久丢失。务必：

1. 多管理员各持一份 key（threshold 设 3，发 5 份）
2. 离线备份（密码管理器 / 物理保险箱 / 硬件 token）
3. 启用 auto-unseal（模板 F）规避此风险

### Token 过期

```bash
# 看当前 token 信息
vault token lookup

# 续期（如可续）
vault token renew

# Root token 过期（极少）：用 unseal keys 生成新 root token
vault operator generate-root -init
# 跟向导走
```

### 升级后无法 unseal

Vault 升级有时改加密格式。升级前**必须**：

1. 备份数据（模板 I）
2. 看 release notes 是否要 migration
3. 一台一台升级（多节点集群）

### 高频请求被限速 `Code: 429`

```bash
# 看默认 rate limit
vault read sys/rate-limits

# 提高
vault write sys/rate-limit/myapp/db \
    rate=1000 \
    interval=1m
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active vault

# 2. 端口
sudo ss -tlnp | grep 8200

# 3. Health
curl -fsS http://127.0.0.1:8200/v1/sys/health | jq
# {"initialized":false, "sealed":true, "standby":false, ...}

# 4. Vault status
export VAULT_ADDR=http://127.0.0.1:8200
vault status

# 5. 初始化后
vault operator unseal <KEY>
vault status                                    # sealed: false

# 6. 测试 token
vault login hvs.xxx
vault kv put secret/test value=hello
vault kv get secret/test
```

## 多次运行

`installMode: skip-existing`。**已初始化的 Vault 数据不会被动**——但 `vault.hcl` 每次按表单值重写。

要重置（**丢全部数据**）：

```bash
sudo systemctl stop vault
sudo rm -rf /var/lib/vault/data/*
sudo systemctl start vault
vault operator init                              # 重新生成 unseal keys
```

## ⚠️ 敏感性

**privileged** — Vault 是**中央密钥库**，攻破 = 所有 secret 泄露。

强制：

1. **生产必启 TLS**（修改 `vault.hcl` 加 `tls_cert_file` / `tls_key_file`）
2. **离线备份 unseal keys**——丢了无法恢复
3. **频繁备份 storage_path**
4. 限制 root token 使用——日常用受限 policy token
5. 启用 audit log（模板 E）
6. `disable_mlock = false`（生产）
7. 反代 + 防火墙限源 IP（模板 H）

## 隐私说明

- **Unseal keys / root token 只显示一次**——不保存在 EnvForge 任何地方
- Vault 数据用密封密钥加密后存到 storage_path——磁盘上是密文
- `vault.hcl` 含监听地址 / TLS 路径（不含 secret 本身）
- audit log 含每个 API 调用记录（敏感字段自动 hash）
- Vault 默认收集匿名遥测：vault.hcl 加 `disable_clustering=true` 或环境 `VAULT_TELEMETRY_DISABLED=1` 关闭
- 第三方 secrets engine（如 AWS / GCP / Azure）会持有云凭据——按云厂商最小权限原则配
