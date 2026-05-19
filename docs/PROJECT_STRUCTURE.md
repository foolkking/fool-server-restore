# 项目结构

更新时间：2026-05-19

```text
apps/
  api/       Node.js Fastify 后端
  web/       React + Vite Web 控制台
  mobile/    React Native + Expo 移动端
packages/
  core/      共享类型、manifest、policy、diff、脱敏规则
  collectors/非破坏性系统采集器
  restorers/ 还原计划生成器
  cli/       bootstrap、scan、restore 命令行入口
configs/
  policies/ 默认同步策略
  snapshots/快照 manifest 保存位置
  files/    允许同步的配置文件副本
scripts/
  bootstrap.ps1
  bootstrap.sh
docs/
  持久化设计和实现记录
```

## 当前构建入口

```bash
npm install
npm run build
npm run scan
npm run dev:api
npm run dev:web
```

## 当前 API 能力

```text
GET    /api/health
GET    /api/snapshots
GET    /api/targets
GET    /api/catalog
GET    /api/catalog/:id/guide
GET    /api/me
GET    /api/migration/strategies
POST   /api/scan
POST   /api/diff
POST   /api/restore/plan
```

`POST /api/scan` 支持传入：

```json
{
  "user": "default",
  "persist": true
}
```

当 `persist` 为 `true` 时，后端会把 manifest 写入 `configs/snapshots/users/<user>/machines/<machine>/`，并更新 `latest.json`。

`GET /api/targets` 当前返回目标虚拟机、软件应用和常见系统配置清单的初版数据结构，后续会替换为数据库和真实连接探测。

`GET /api/catalog` 当前返回可加入当前虚拟机的系统软硬件信息、软件、配置模板和安全策略卡片。

`GET /api/me` 当前返回游客身份和用户上传配置资料样例，后续会接入真实注册、登录、个人信息和用户资产管理。

`GET /api/catalog/:id/guide` 返回配置市场条目的 Markdown 说明。

`GET /api/migration/strategies` 返回完整迁移方案，包括 USMT 风格、rsync 风格和声明式配置风格。

## 重要约定

- 每次开始实现前先读相关 `docs/*.md`。
- 每轮实现都要更新至少一个持久化文档。
- CLI 能力优先于 UI，UI 调用同一套 core/collector/restorer 逻辑。
- 采集器只能读取状态，不能修改系统。
- 还原器必须先生成计划和 dry-run，再进入 apply。
