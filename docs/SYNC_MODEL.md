# 配置同步模型

## Snapshot Manifest

每次采集生成一个 snapshot manifest。manifest 是 GitHub 中最重要的可审计数据。

示例结构：

```json
{
  "schemaVersion": "0.1.0",
  "createdAt": "2026-05-19T00:00:00.000Z",
  "user": "default",
  "machine": {
    "id": "desktop-win",
    "hostname": "unknown",
    "os": "windows",
    "arch": "x64"
  },
  "collectors": {
    "nodeEnv": {
      "node": "v20.13.1",
      "npm": "10.5.2",
      "globalPackages": []
    },
    "git": {
      "version": "2.45.1.windows.1"
    }
  },
  "files": [],
  "redactions": [],
  "restoreHints": []
}
```

## 同步对象分类

### 可以默认同步

- 软件包名称和版本。
- 运行时版本。
- Git 全局配置中的非敏感字段。
- VS Code 扩展列表。
- Shell alias 和函数。
- Docker compose 文件路径和服务名称。
- 环境变量名称。
- 系统服务名称、启动类型、状态。

### 需要用户确认

- 配置文件内容。
- 环境变量值。
- SSH config。
- npm、pip、docker 等 registry 配置。
- 私有仓库地址。
- 系统 hosts 文件。

### 默认禁止进入 GitHub 明文

- 密码。
- API token。
- Cookie。
- SSH 私钥。
- 云厂商凭证。
- 浏览器用户数据。
- 密码管理器数据库。
- `.env` 中的敏感值。

## Policy 文件

同步策略建议放在：

```text
configs/policies/default.policy.json
```

策略内容包括：

- 允许采集的 collector。
- 允许同步的路径白名单。
- 禁止同步的路径黑名单。
- 敏感字段匹配规则。
- 是否允许加密同步。
- GitHub 提交策略。

## 文件保存方式

被允许同步的配置文件应保留原始相对路径映射，但不要直接覆盖仓库根目录。

```text
configs/files/
  users/
    alice/
      machines/
        desktop-win/
          home/
            .gitconfig
            Documents/
              PowerShell/
                Microsoft.PowerShell_profile.ps1
```

## 差异模型

差异分三类展示：

- `missing`：当前机器没有，目标快照有。
- `changed`：两边都有但内容或版本不同。
- `extra`：当前机器有，目标快照没有。

每条差异都需要标注：

- 风险级别。
- 是否需要管理员权限。
- 是否可自动恢复。
- 是否会覆盖现有文件。
- 建议命令或操作。

## 敏感信息处理

建议同时使用多层防护：

- 路径规则：例如 `.ssh/id_*`、`.aws/credentials`、`.env`。
- Key 名规则：例如 `TOKEN`、`SECRET`、`PASSWORD`、`PRIVATE_KEY`。
- 内容规则：例如 JWT、GitHub token、OpenAI key 形态。
- 人工确认：对所有疑似敏感文件要求二次确认。
- 加密存储：确需同步时只保存密文。

## 多服务器协作

一台机器不应该直接覆盖另一台机器的 latest，除非用户明确选择。推荐模型：

```text
user -> machine -> snapshots
```

用户可以从任意机器选择任意快照作为还原目标，但系统必须显示来源机器和创建时间。
