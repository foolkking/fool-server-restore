# 构建与还原流程

## 本地开发流程

```bash
npm install
npm run dev
```

未来 monorepo 成熟后建议脚本：

```bash
npm run dev:api
npm run dev:web
npm run dev:mobile
npm run scan
npm run restore -- --dry-run
```

## 旧服务器同步流程

1. 启动后端和 Web 控制台。
2. 用户登录本地控制台。
3. 后端执行 collector 扫描当前机器。
4. Web UI 展示可同步项目。
5. 用户勾选同步范围。
6. 后端生成 snapshot manifest。
7. 后端按 policy 复制允许同步的配置文件。
8. core 模块执行脱敏和 schema 校验。
9. 后端生成 Git diff 预览。
10. 用户确认提交。
11. 后端提交并推送到 GitHub。

## 新服务器 bootstrap 流程

新服务器没有后端服务时，最小入口必须是仓库本身：

```bash
git clone <repo-url> fool-server-restore
cd fool-server-restore
npm install
npm run bootstrap
```

`bootstrap` 应完成：

1. 检查 Node.js、npm、git 版本。
2. 初始化本地数据目录。
3. 读取 GitHub 仓库中的用户和机器快照。
4. 询问或读取用户身份。
5. 选择目标快照。
6. 生成还原计划。
7. 默认执行 dry-run。
8. 用户确认后分阶段 apply。
9. 启动 API 后端。
10. 打开或提示 Web 控制台地址。

## 还原阶段划分

### Stage 0: Preflight

- 检查 OS、架构、权限。
- 检查磁盘空间。
- 检查网络和 GitHub 访问。
- 检查是否存在冲突文件。

### Stage 1: Runtime

- 安装或提示安装 Node.js、git、包管理器。
- 设置 npm/pnpm/yarn 等工具。

### Stage 2: Packages

- 还原系统软件包。
- 还原开发工具链。
- 还原全局 npm 包。

### Stage 3: Config Files

- 恢复 Shell、Git、编辑器、应用配置。
- 写入前创建本地备份。
- 对冲突文件生成 diff。

### Stage 4: Services

- 恢复服务清单。
- 还原 Docker compose 项目。
- 标记需要管理员或 sudo 的动作。

### Stage 5: Verify

- 重新扫描机器。
- 对比目标快照。
- 输出成功、跳过、失败和需要人工处理的项目。

## GitHub 更新流程

每台服务器都可以继续上传配置：

1. 从 GitHub 拉取最新配置。
2. 扫描当前机器。
3. 与 latest snapshot 比较。
4. Web UI 展示差异。
5. 用户选择是否覆盖、合并或创建新机器快照。
6. 提交到新分支或直接提交到主分支。
7. 可选创建 Pull Request 让用户审查。

## 任务状态模型

```text
queued -> running -> needs_approval -> running -> succeeded
                         |              |
                         |              -> failed
                         -> cancelled
```

## 命令设计草案

```bash
fool scan
fool diff --target latest
fool sync --to github
fool restore --from latest --dry-run
fool restore --from latest --apply
fool server start
```

## Web API 草案

```text
GET    /api/health
GET    /api/machines
GET    /api/snapshots
POST   /api/scan
POST   /api/diff
POST   /api/sync/github
POST   /api/restore/plan
POST   /api/restore/apply
GET    /api/tasks/:id
GET    /api/tasks/:id/logs
```
