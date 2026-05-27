# EnvForge

EnvForge 是一个 Linux VM 环境迁移与重建工具。

它通过 SSH 分析旧服务器，提取真正重要的软件能力、配置文件、服务状态、语言运行时、容器工作负载和数据依赖，并生成可审查、可回放、可验证、可回滚的迁移计划，用于在新 VM 上重建环境。

```text
旧 VM -> 环境快照 -> 迁移计划 -> 新 VM
```

EnvForge 不再定位为宝塔、1Panel、Cockpit 这类通用服务器管理面板，也不直接和它们竞争。它的核心价值不是“在服务器上点按钮安装软件”，而是“理解旧机器，并把旧机器中真正有迁移价值的环境变成可重建计划”。

## 产品原则

- 自动发现，谨慎迁移，人机协同确认。
- 已安装包不等于用户想迁移的包，必须使用 Package Intent Score 多信号评分。
- 配置市场不是普通应用市场，而是迁移规则库 / Capability Catalog。
- 所有高风险操作必须先生成 plan，再由用户确认。
- secret 默认不迁移，必须脱敏、提示、确认。
- 数据目录不盲目 rsync，数据库优先 dump/restore。
- 未知软件不直接忽略，也不默认迁移，进入 Review Queue。
- SSH 配置修改必须特殊保护，避免用户被锁出服务器。

## 核心能力

- **SSH 只读发现**：采集旧 VM 的 OS、包、服务、端口、配置、容器、语言生态和手工安装痕迹。
- **机器快照模型**：用 HostSnapshot 统一描述旧机器状态。
- **Package Intent Score**：区分高置信迁移候选、需要确认项、低价值依赖和系统基础包。
- **配置治理**：配置归属、默认配置判断、用户修改判断、secret 检测、安全读取、diff、备份和验证钩子。
- **Capability Catalog**：用规则描述软件如何识别、迁移配置、处理数据、验证、回滚和跨发行版映射。
- **迁移计划引擎**：生成 action graph、风险评分、完整度评分、dry run 和用户审查决策。
- **执行 / 验证 / 回滚**：通过 SSH executor、安全 sudo 写入、文件备份、服务状态恢复和验证命令完成闭环。
- **社区共建生态**：评论、建议、审核、站内信和邮件通知，帮助 catalog 长期演化。

## 文档地图

| 文档 | 用途 |
| :-- | :-- |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | 产品定位、边界、用户角色、非目标和路线图 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 六阶段架构和模块边界 |
| [docs/MIGRATION_SYSTEM.md](./docs/MIGRATION_SYSTEM.md) | 机器快照、包意图评分、Review Queue、计划引擎、数据策略、验证和回滚 |
| [docs/CATALOG_SYSTEM.md](./docs/CATALOG_SYSTEM.md) | Capability Catalog、支持级别、schema v2、编写规范、LLM prompt、跨发行版映射 |
| [docs/CONFIG_AND_SECURITY.md](./docs/CONFIG_AND_SECURITY.md) | 配置归属、默认判断、secret、安全编辑、审计和 SSH 保护 |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | 分阶段实现路线与长期扩展计划 |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | 部署指南 |
| [docs/DEPLOY_SELF.md](./docs/DEPLOY_SELF.md) | 自托管与 bootstrap 部署说明 |

## 技术栈

- 前端：React 18、TypeScript、Vite、lucide-react
- 后端：Fastify、TypeScript、ssh2
- 存储：SQLite hybrid document/relational persistence
- 执行：TypeScript 原生 playbook 与 SSH 执行模块
- 安全：scrypt 密码哈希、AES-256-GCM 凭据加密

## 构建

```bash
npm run build:server
npm run build --workspace @fool/web
```

## License

MIT
