# Admin Catalog Management — 设计与实现计划

更新时间：2026-05-22

## 一、当前状况

### 现有数据布局

```
apps/api/src/catalog.ts              ← 静态硬编码：72 个 catalog 元数据（name/category/rating/components 等）
configs/catalog/playbooks/<id>.yaml  ← 每个 catalog 项对应的 Playbook YAML（真正的执行内容）
configs/catalog/software/<id>.md     ← 安装说明（admin 编写）
configs/catalog/combos/<id>.md       ← 组合说明（用户可写）
configs/catalog/docker/<id>.yaml     ← Docker compose 部署模式片段
configs/database/seed.json           ← 启动时把 catalog.ts 拷入这里（运行时用这份）
runtime-db.json                      ← 用户、连接、playbook、schedules、tokens 等
```

### 当前 admin 能力

- `rbac.ts` 区分 `admin` / `user` / `guest`
- `canUploadKind`：admin 可发布 `software` 类配置，user 只能发布 `combo` / `vm-snapshot`
- **但实际上**：发布 software 的逻辑只调用 `profiles.ts` → 写入 `userProfiles[]`，**不会进入 catalog**
- 即：admin 当前**没有任何路径**去新增/修改/删除真正的 catalog 项

### 问题

「系统管理员能修改和添加配置市场里的功能」**完全没有实现**。

---

## 二、目标

让 admin 通过 Web UI：

1. **新增** catalog 项（含 metadata + Playbook YAML + Markdown 引导）
2. **编辑** 现有 catalog 项（修改任何字段，包括 YAML 内容）
3. **删除** catalog 项
4. **查看 / 编辑** 安装说明的 Markdown
5. 修改后立即生效（无需重启服务器）

非目标：

- 不做版本控制（catalog 项已有 Playbook 编辑器的版本管理可参考；catalog 项的版本管理放到 P2）
- 不做审核流程（admin 信任已经直接落库）

---

## 三、数据模型决策

**核心问题**：catalog 数据放哪里？

### 方案 A：保留静态 + 把"修改"写入 runtime-db 的 overlay 表（推荐）

- `catalog.ts` 的 72 个内置项 = 只读基线
- runtime-db 新增 `catalogOverrides` 字段：
  - 修改基线项 → 写入 `{ baseId: "...", overrides: { name: "...", ... } }`
  - 新增项 → 写入 `{ kind: "user-added", item: {...} }`
  - 删除（隐藏）项 → 写入 `{ baseId: "...", hidden: true }`
- `listCatalogFromDatabase()` 合并基线 + overlay
- Playbook YAML 修改：写入 `data/catalog-overrides/playbooks/<id>.yaml`，读取时优先 override 路径
- Markdown 同理：`data/catalog-overrides/guides/<id>.md`

**优点**：
- 基线代码不动，升级 EnvForge 时新增的 catalog 自然出现
- admin 可以「重置」某项（删除 override 即恢复基线）
- 所有改动集中在 `data/` 目录，备份/迁移容易

**缺点**：
- 合并逻辑稍复杂

### 方案 B：第一次启动把 catalog.ts 全量拷到 runtime-db，之后只用 db

**缺点**：升级时 catalog.ts 新增的项不会自动出现，需要额外迁移代码

### 方案 C：让 admin 直接编辑文件系统的 .ts 文件

**缺点**：要重启服务、要 admin 懂 TypeScript、文件被覆盖风险大。**不可接受**。

**结论**：采用 **方案 A**。

---

## 四、API 设计

所有以下端点需要 `role === "admin"`，否则返回 403。

### 4.1 Catalog item CRUD

```
POST   /api/admin/catalog                创建新 catalog 项
PATCH  /api/admin/catalog/:id            修改 catalog 项
DELETE /api/admin/catalog/:id            隐藏 catalog 项（保留基线）
POST   /api/admin/catalog/:id/reset      移除 override，恢复基线
```

**请求体**（POST/PATCH）：
```typescript
{
  // metadata
  id: string;                  // POST 必填，PATCH 不可改
  kind: "software" | "combo";
  name: string;
  nameEn: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary: string;
  summaryEn: string;
  imageTone: string;
  sensitivity: "safe" | "review" | "privileged";
  rating?: number;
  // execution body
  playbookYaml: string;        // 直接保存为 YAML 文件
  guideMarkdown?: string;      // 安装说明 .md
  components?: CatalogComponent[];   // 可选；若不填，会从 YAML 自动提取
  deployModes?: Array<"system" | "docker">;
}
```

### 4.2 Validation

POST/PATCH 前要校验：
- `id` 只能是 `[a-z0-9-]{1,60}`，避免路径注入
- `playbookYaml` 必须能成功通过 `parsePlaybook()` 解析
- 字段长度上限（name 80、summary 500 等）

---

## 五、文件存储布局

```
data/catalog-overrides/
  meta.json                 ← runtime-db 有更好的并发控制，所以不用文件，meta 直接进 runtime-db
  playbooks/<id>.yaml       ← override Playbook YAML 内容
  guides/<id>.md            ← override Markdown 引导
```

### 加载顺序（修改 `loadPlaybookFromCatalog`）

1. 优先：`data/catalog-overrides/playbooks/<id>.yaml`
2. 其次：`configs/catalog/playbooks/<id>.yaml`（基线）
3. 都没有：404

### 加载顺序（修改 `readCatalogGuide`）

1. 优先：`data/catalog-overrides/guides/<id>.md`
2. 其次：基线 `guidePath`
3. 都没有：返回 catalog item 但 markdown 为空

---

## 六、前端 UI

新增 SettingsPage 第 6 个标签页：「Catalog」（仅 admin 可见）。

**布局**：左侧 catalog 项列表，右侧编辑器。

### 列表
- 显示所有 catalog 项（基线 + overlay 合并后）
- 标记 `[基线]` `[已修改]` `[新增]` `[已隐藏]`
- 点击进入编辑

### 编辑器
- Tab 1：Metadata（name / summary / category / sensitivity / rating ...）
- Tab 2：Playbook YAML（用 textarea，左侧 monaco-style 行号；保存前后端校验）
- Tab 3：Markdown 引导
- Tab 4：Docker compose（如启用 docker 部署模式）

### 操作按钮
- 「保存」→ POST/PATCH
- 「重置为基线」（仅有 override 时）→ DELETE override
- 「隐藏」（仅基线项）→ 标记 hidden=true
- 「删除」（仅 user-added）→ 真删除

---

## 七、实现顺序（子任务）

1. **runtime-store.ts**：新增 `CatalogOverride` 类型 + `catalogOverrides[]` 字段
2. **catalog-overrides.ts**（新文件）：
   - `mergeCatalog(baseline, overrides)` → CatalogItem[]
   - `loadOverrideYaml(id)` / `saveOverrideYaml(id, yaml)` / `deleteOverrideYaml(id)`
   - `loadOverrideMarkdown` / `saveOverrideMarkdown` / `deleteOverrideMarkdown`
3. **engine/index.ts**：修改 `loadPlaybookFromCatalog` 优先读 override 路径
4. **database.ts**：修改 `listCatalogFromDatabase` 调用 `mergeCatalog`、`readCatalogGuide` 优先读 override md
5. **routes.ts**：新增 `/api/admin/catalog/*` 4 个端点（带 admin 权限校验）
6. **api.ts**（前端）：4 个对应 API 函数
7. **CatalogAdminPanel.tsx**（新组件，作为 SettingsPage 的标签页内容）
8. **SettingsPage.tsx**：新增 admin-only 标签页
9. **测试**：
   - `mergeCatalog` 单元测试（baseline-only / override / hidden / user-added）
   - YAML 校验单元测试

---

## 八、风险与缓解

| 风险 | 缓解 |
|------|------|
| admin 写入恶意 YAML（如 `shell: cmd: 'rm -rf /'`） | 信任 admin；提示"只允许信任的 admin 用户"；未来加 review 流程 |
| override 文件被手工删除导致 db 元数据残留 | `mergeCatalog` 优雅处理"override 标记存在但文件不存在"，回退到基线 |
| 路径注入（id 含 `../`） | 严格 id 正则 `[a-z0-9-]{1,60}` |
| 大并发改同一项 | `updateRuntimeDatabase` 已经有写锁，文件写用 `fs.writeFile` 原子写 |
| 前端展示与后端实际不一致 | 编辑后强制刷新 catalog 列表 |

---

## 九、实施完成判定

- [ ] admin 用户登录后看到「Catalog」标签页（普通用户看不到）
- [ ] 可以新建一个 catalog 项，立即出现在配置市场
- [ ] 可以编辑现有项的 metadata + YAML，点安装时执行 override 后的内容
- [ ] 可以隐藏一个基线项（市场不再显示）
- [ ] 可以「重置为基线」恢复
- [ ] 所有变更立即生效，不重启
- [ ] 至少 4 个新单元测试覆盖 mergeCatalog
