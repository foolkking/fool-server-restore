# HashiCorp Vault — 密钥管理

Vault 是企业级 secret 管理系统：集中存储数据库密码、API key、SSL 证书、SSH 密钥，
应用通过 API 拿取，避免把 secret 散落在配置文件里。还能动态生成短期凭据（如临时
DB 账号）。

## 你将得到什么

- 📦 **vault**（来自 HashiCorp 官方仓库）
- ✅ `/etc/vault.d/vault.hcl` 配置（file storage，本机 8200 端口，TLS 关闭，UI 启用）
- ✅ 数据目录 `/var/lib/vault/data` 创建并设权限
- ✅ `vault.service` 启动并设开机自启
- ⚠️ Vault 启动后处于 **sealed + 未初始化** 状态——**接下来你必须手动初始化**

## 必须做的下一步：初始化 Vault

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

**立刻把这些 key 安全保存**——丢了就**无法恢复 vault 里的任何数据**。
建议：拆分发给不同管理员（每人一份 unseal key），root token 离线保存。

### 解封（每次重启 Vault 都要做）

```bash
vault operator unseal <Unseal Key 1>
vault operator unseal <Unseal Key 2>
vault operator unseal <Unseal Key 3>
# 输入 3 个 unseal key（threshold）后 Vault 解封，可以正常使用
```

### 用 root token 登录

```bash
vault login hvs.AbCd...
# 之后所有 vault 命令都以 root 身份运行
```

## 表单字段说明

### 监听地址 `listen_address`

**默认 127.0.0.1（仅本机）**。Vault 这个 Playbook 用 `tls_disable=1` 明文传输，
改成 0.0.0.0 之前**务必先配 TLS 证书**——否则 secret 在网络上裸传。

### API 端口 `api_port`

默认 8200。改非标端口减少扫描可见性。

### 存储路径 `storage_path`

数据持久化目录。生产环境建议：
- 放在专用磁盘（避免和 OS 抢空间）
- 频繁备份（Vault 数据是核心机密，丢了就全没了）

## 安装后

### 启用 KV secrets engine

```bash
vault secrets enable -path=secret kv-v2
```

### 写入 / 读取 secret

```bash
# 写
vault kv put secret/myapp \
  db_password=mypass123 \
  api_key=sk-live-...

# 读
vault kv get secret/myapp
```

### 应用怎么拿 secret

```bash
# 用 token
curl -H "X-Vault-Token: hvs.xxx" \
  http://127.0.0.1:8200/v1/secret/data/myapp
```

### 创建受限的应用 token

```bash
# 写 policy 文件
cat > app-policy.hcl <<EOF
path "secret/data/myapp/*" {
  capabilities = ["read"]
}
EOF
vault policy write myapp app-policy.hcl

# 创建 token，只有这个 policy 的权限
vault token create -policy=myapp
```

### Web UI

打开 `http://server:8200/ui`，输入 root token 登录。

## ⚠️ 敏感性

**privileged** — Vault 是中央密钥库，**它出问题或被攻破等于所有 secret 都泄露**。
建议：
1. 生产环境**必须启用 TLS**（修改 vault.hcl 加 `tls_cert_file` / `tls_key_file`）
2. **离线安全保存 unseal keys**——丢了无法恢复
3. **频繁备份 storage_path**
4. 限制 root token 使用范围，应用用受限 policy token

## 验证

```bash
systemctl status vault --no-pager
curl http://127.0.0.1:8200/v1/sys/seal-status
# 应返回 {"sealed":true,"initialized":false,...}
```

## 排错

- **服务启动失败 + `mlock` 错误** — 我们的配置已经 `disable_mlock = true`（开发/小机器友好），如果你想启用 mlock 需要 `setcap cap_ipc_lock=+ep $(which vault)`。
- **`Error initializing Vault: server gave HTTP response to HTTPS client`** — 客户端默认走 https，但我们配的是 http。`export VAULT_ADDR=http://127.0.0.1:8200` 后再 init。
- **跨发行版**：`vault` 包不在默认仓库，需要 HashiCorp 官方源（Playbook 已自动添加）。

## 多次运行

`installMode: skip-existing`。**已初始化过的 Vault 数据不会被动**——但 vault.hcl 每次重写。

## 隐私说明

- **unseal keys 和 root token 只显示一次**——不会保存在 EnvForge 任何地方。
- Vault 数据用密封密钥加密后存到 storage_path，磁盘上看到的是密文。
