import type { FastifyInstance } from "fastify";
import { collectSnapshotInputs } from "@fool/collectors";
import { createSnapshotManifest, defaultPolicy, diffSnapshots } from "@fool/core";
import { createRestorePlan } from "@fool/restorers";
import { getUserByToken, loginUser, registerUser, toPublicUser, updateUserProfile } from "./auth.js";
import { listCurrentUser } from "./catalog.js";
import { getConfig } from "./config.js";
import { createConnection, reprobeConnection, listUserConnections } from "./connections.js";
import { createUserProfile, listUserProfiles, getUserProfile, updateUserProfile as updateProfile, deleteUserProfile, listAllPublicProfilesAsCatalog, createVmSnapshot } from "./profiles.js";
import { buildInstallTask, buildSnapshotDeployTask, executeTask, getTask, subscribeTask } from "./executor.js";
import { listCatalogFromDatabase, listMigrationStrategies, readCatalogGuide } from "./database.js";
import { runReadinessChecks } from "./readiness.js";
import { readRuntimeDatabase, updateRuntimeDatabase, createId } from "./runtime-store.js";
import { listSnapshots, persistSnapshot } from "./snapshot-store.js";
import { probeAgent, pingAgent } from "./probe.js";
import { listConfigFiles, readConfigFile, writeConfigFile, readConfigFileWithBackup } from "./config-files.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    service: "envforge-api",
    version: "0.1.0",
    env: getConfig().nodeEnv
  }));

  app.get("/api/ready", async (request, reply) => {
    const result = await runReadinessChecks(getConfig());
    if (!result.ok) reply.code(503);
    return result;
  });

  app.post("/api/scan", async (request) => {
    const body = (request.body ?? {}) as { user?: string; persist?: boolean };
    const inputs = await collectSnapshotInputs(defaultPolicy);
    const manifest = createSnapshotManifest({
      user: body.user ?? "default",
      machine: inputs.machine,
      collectors: inputs.collectors,
      redactions: inputs.redactions
    });

    if (!body.persist) {
      return { manifest, persisted: false };
    }

    const paths = await persistSnapshot(manifest);
    return { manifest, persisted: true, paths };
  });

  app.get("/api/snapshots", async () => {
    return {
      snapshots: await listSnapshots()
    };
  });

  // 列出当前用户的已连接机器（从数据库读取，不再返回静态样例）
  app.get("/api/targets", async (request) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) {
      // 未登录时返回空列表
      return { targets: [] };
    }
    const db = await readRuntimeDatabase();
    const connections = db.connections.filter((c) => c.userId === user.id);
    return { targets: connections };
  });

  // 探测目标 agent，返回真实系统信息
  // agentUrl 示例：http://127.0.0.1:4001
  app.post("/api/targets/probe", async (request, reply) => {
    const body = (request.body ?? {}) as { agentUrl?: string };
    if (!body.agentUrl) {
      reply.code(400);
      return { error: "agentUrl is required. Example: http://127.0.0.1:4001" };
    }

    // 只允许 http/https，防止 SSRF 到内部协议
    let parsed: URL;
    try {
      parsed = new URL(body.agentUrl);
    } catch {
      reply.code(400);
      return { error: "agentUrl is not a valid URL." };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      reply.code(400);
      return { error: "agentUrl must use http or https." };
    }

    const result = await probeAgent(body.agentUrl);
    if (!result.reachable) {
      reply.code(502);
    }
    return result;
  });

  // 仅 ping agent，检查是否在线
  app.post("/api/targets/ping", async (request, reply) => {
    const body = (request.body ?? {}) as { agentUrl?: string };
    if (!body.agentUrl) {
      reply.code(400);
      return { error: "agentUrl is required." };
    }
    const online = await pingAgent(body.agentUrl);
    return { online, agentUrl: body.agentUrl };
  });

  app.get("/api/catalog", async () => {
    const [items, db] = await Promise.all([listCatalogFromDatabase(), readRuntimeDatabase()]);
    const stats = db.catalogStats ?? {};
    // Overlay real install counts onto static catalog items so cards show live data.
    const enriched = items.map((item) => {
      const real = stats[item.id]?.installs ?? 0;
      if (real > 0) {
        return { ...item, installs: formatInstallCount(real), realInstalls: real };
      }
      return item;
    });
    return { items: enriched };
  });

  app.get("/api/catalog/:id/guide", async (request, reply) => {
    const params = request.params as { id: string };
    try {
      return await readCatalogGuide(params.id);
    } catch (error) {
      reply.code(404);
      return { error: error instanceof Error ? error.message : "Guide not found" };
    }
  });

  /**
   * GET /api/catalog/:id/vars-schema
   *
   * Returns the configurable-vars schema for a Playbook (admin-defined form
   * fields the UI renders on the right side of the configure-and-run pane).
   * Returns { schema: null } when the Playbook has no schema, in which case
   * the UI falls back to the simple "run with defaults" button.
   *
   * Public endpoint — anyone who can see the catalog can see the form shape.
   */
  app.get("/api/catalog/:id/vars-schema", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isValidCatalogId } = await import("./catalog-overrides.js");
    if (!isValidCatalogId(id)) {
      reply.code(400);
      return { error: "Invalid catalog id" };
    }
    try {
      const { loadVarsSchema } = await import("./catalog-vars-schema.js");
      const schema = await loadVarsSchema(id);
      return { schema };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Failed to load schema" };
    }
  });

  /**
   * POST /api/catalog/:id/vars-schema (admin only)
   *
   * Save an override schema for a Playbook. Validated server-side before write
   * so we can never persist a broken schema that would break the form UI.
   */
  app.post("/api/catalog/:id/vars-schema", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { id } = request.params as { id: string };
    const body = request.body as { schema?: unknown };
    if (!body?.schema) { reply.code(400); return { error: "schema is required" }; }
    try {
      // saveOverrideSchema runs validateSchema internally and throws on any
      // structural issue, so an invalid submission ends up here with a
      // descriptive Error.message — surfaced to the admin as 400.
      const { saveOverrideSchema } = await import("./catalog-vars-schema.js");
      await saveOverrideSchema(id, body.schema as Parameters<typeof saveOverrideSchema>[1]);
      return { ok: true };
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : "Invalid schema" };
    }
  });

  /**
   * DELETE /api/catalog/:id/vars-schema (admin only) — revert to baseline.
   */
  app.delete("/api/catalog/:id/vars-schema", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { id } = request.params as { id: string };
    const { isValidCatalogId } = await import("./catalog-overrides.js");
    if (!isValidCatalogId(id)) { reply.code(400); return { error: "Invalid catalog id" }; }
    const { deleteOverrideSchema } = await import("./catalog-vars-schema.js");
    await deleteOverrideSchema(id);
    return { ok: true };
  });

  /**
   * POST /api/catalog/:id/preview
   *
   * Pre-apply preview: 给定用户在表单里填的 vars，返回完整的 "如果点 Run 会发生什么"
   * 报告 — 渲染后的 YAML、每个任务的最终参数、会被写入的文件路径、影响范围。
   *
   * 不连远端 SSH，纯本地计算（schema 验证 + var 替换）。安全：vars 经过 schema
   * 校验，避免随意值被模板进 shell 命令。schema 不存在的 Playbook 也支持，但只能
   * 看到原始 YAML 的渲染结果，没有 fieldErrors 校验。
   */
  app.post("/api/catalog/:id/preview", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const { isValidCatalogId } = await import("./catalog-overrides.js");
    if (!isValidCatalogId(id)) { reply.code(400); return { error: "Invalid catalog id" }; }

    const body = (request.body ?? {}) as { vars?: Record<string, unknown> };
    try {
      const { buildPlaybookPreview } = await import("./catalog-preview.js");
      const preview = await buildPlaybookPreview(id, body.vars ?? {});
      return { preview };
    } catch (err) {
      // schema 校验失败时附带 fieldErrors
      const e = err as Error & { fieldErrors?: Record<string, string> };
      reply.code(400);
      return {
        error: e.message ?? "Preview failed",
        ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {})
      };
    }
  });

  app.get("/api/migration/strategies", async () => {
    return {
      strategies: await listMigrationStrategies()
    };
  });

  app.get("/api/me", async () => {
    return listCurrentUser();
  });

  app.post("/api/auth/register", async (request, reply) => {
    try {
      return await registerUser(request.body as { name?: string; email?: string; password?: string });
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Registration failed" };
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    try {
      return await loginUser(request.body as { email?: string; password?: string });
    } catch (error) {
      reply.code(401);
      return { error: error instanceof Error ? error.message : "Login failed" };
    }
  });

  app.get("/api/auth/session", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) {
      reply.code(401);
      return { error: "Session is missing or expired." };
    }

    return { user: toPublicUser(user) };
  });

  app.patch("/api/auth/profile", async (request, reply) => {
    try {
      const user = await updateUserProfile(
        readBearerToken(request.headers.authorization),
        request.body as { name?: string; defaultSshUser?: string }
      );
      if (!user) {
        reply.code(401);
        return { error: "Session is missing or expired." };
      }
      return { user };
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Profile update failed" };
    }
  });

  app.post("/api/connections/connect", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) {
      reply.code(401);
      return { error: "Login is required before saving a server connection." };
    }

    try {
      return await createConnection(user.id, request.body as Parameters<typeof createConnection>[1]);
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Connection validation failed" };
    }
  });

  // 对已保存的连接重新探测，刷新 probeSnapshot
  app.post("/api/connections/:id/reprobe", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) {
      reply.code(401);
      return { error: "Login required." };
    }
    const { id } = request.params as { id: string };
    const updated = await reprobeConnection(id, user.id);
    if (!updated) {
      reply.code(404);
      return { error: "Connection not found or has no agentUrl." };
    }
    return { connection: updated };
  });

  // 列出当前用户所有连接档案
  app.get("/api/connections", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) {
      reply.code(401);
      return { error: "Login required." };
    }
    const connections = await listUserConnections(user.id);
    return { connections };
  });

  // 删除连接档案
  app.delete("/api/connections/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const deleted = await updateRuntimeDatabase((db) => {
      const index = db.connections.findIndex((c) => c.id === id && c.userId === user.id);
      if (index === -1) return false;
      db.connections.splice(index, 1);
      return true;
    });
    if (!deleted) { reply.code(404); return { error: "Connection not found." }; }
    return { ok: true };
  });

  // 更新连接档案（标签、agentUrl）
  app.patch("/api/connections/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { label?: string; agentUrl?: string };
    const updated = await updateRuntimeDatabase((db) => {
      const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
      if (!conn) return null;
      if (body.label?.trim()) conn.label = body.label.trim().slice(0, 100);
      if (body.agentUrl !== undefined) conn.agentUrl = body.agentUrl.trim() || undefined;
      conn.updatedAt = new Date().toISOString();
      return conn;
    });
    if (!updated) { reply.code(404); return { error: "Connection not found." }; }
    return { connection: updated };
  });

  // ── 用户配置组合 CRUD ──────────────────────────────────────

  // 创建配置组合（权限由 profiles.ts 内部校验）
  app.post("/api/profiles", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    try {
      const profile = await createUserProfile(user, request.body as Parameters<typeof createUserProfile>[1]);
      return { profile };
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Failed to create profile." };
    }
  });

  // 从已连接机器快速生成私有运行环境快照
  app.post("/api/connections/:id/upload-snapshot", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    try {
      const profile = await createVmSnapshot(user, id, request.body as Parameters<typeof createVmSnapshot>[2]);
      return { profile };
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Failed to create snapshot." };
    }
  });

  // 列出当前用户可见的配置组合（自己的 private + 所有 public）
  app.get("/api/profiles", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const profiles = await listUserProfiles(user);
    return { profiles };
  });

  // 获取单个配置组合
  app.get("/api/profiles/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const profile = await getUserProfile(user, id);
    if (!profile) { reply.code(404); return { error: "Profile not found." }; }
    return { profile };
  });

  // 更新配置组合
  app.patch("/api/profiles/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    try {
      const profile = await updateProfile(user, id, request.body as Parameters<typeof updateProfile>[2]);
      if (!profile) { reply.code(404); return { error: "Profile not found." }; }
      return { profile };
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Failed to update profile." };
    }
  });

  // 删除配置组合
  app.delete("/api/profiles/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const deleted = await deleteUserProfile(user, id);
    if (!deleted) { reply.code(404); return { error: "Profile not found." }; }
    return { ok: true };
  });

  // 配置市场：官方 catalog + 用户公开发布的配置组合
  app.get("/api/catalog/all", async () => {
    const [official, userUploaded] = await Promise.all([
      listCatalogFromDatabase(),
      listAllPublicProfilesAsCatalog()
    ]);
    return { items: [...official, ...userUploaded] };
  });

  // ── 任务执行 ──────────────────────────────────────────────

  // 对已连接机器执行配置安装/应用（dry-run 或真实执行）
  app.post("/api/execute", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }

    const body = (request.body ?? {}) as {
      connectionId?: string;
      profileId?: string;
      dryRun?: boolean;
      /**
       * Optional user-supplied vars from the configurable Playbook form.
       * Validated against the catalog item's vars.schema.json before being
       * passed to the runner. Ignored for items without a schema.
       */
      vars?: Record<string, unknown>;
    };
    if (!body.connectionId || !body.profileId) {
      reply.code(400);
      return { error: "connectionId and profileId are required." };
    }

    const db = await readRuntimeDatabase();
    const connection = db.connections.find((c) => c.id === body.connectionId && c.userId === user.id);
    if (!connection) { reply.code(404); return { error: "Connection not found." }; }

    const dryRun = body.dryRun !== false;
    const { registerBatchTask, executeCatalogTask, executePlaybookTask, getTask: gt } = await import("./executor.js");

    // Try catalog item first
    const catalogItems = await listCatalogFromDatabase();
    const catalogItem = catalogItems.find((c) => c.id === body.profileId);
    if (catalogItem) {
      // Validate user vars against the schema (if any). A vars schema makes the
      // form explicit; if user submits something the schema rejects, we fail
      // loudly here rather than silently feeding bad values to the runner.
      let normalizedVars: Record<string, unknown> | undefined;
      if (body.vars && Object.keys(body.vars).length > 0) {
        const { loadVarsSchema, validateAndNormalise } = await import("./catalog-vars-schema.js");
        const schema = await loadVarsSchema(catalogItem.id);
        if (schema) {
          const result = validateAndNormalise(schema, body.vars);
          if (!result.ok) {
            reply.code(400);
            return { error: "Invalid vars", fieldErrors: result.errors };
          }
          normalizedVars = result.values;
        } else {
          // No schema for this item — user vars are silently ignored to avoid
          // letting arbitrary template data reach the runner unchecked.
        }
      }

      const taskId = registerBatchTask(user.id, connection.id, [{ catalogId: catalogItem.id, displayName: catalogItem.name }], dryRun);
      void executeCatalogTask(user.id, connection, catalogItem.id, catalogItem.name, dryRun, taskId, normalizedVars);
      const task = gt(taskId);
      return { taskId, dryRun, steps: task?.steps ?? [] };
    }

    // Try user profile
    const profile = db.userProfiles.find((p) => p.id === body.profileId);
    if (profile) {
      const { buildPlaybookFromProfile } = await import("./executor.js");
      const yaml = buildPlaybookFromProfile(profile);
      const taskId = registerBatchTask(user.id, connection.id, [{ catalogId: profile.id, displayName: profile.name }], dryRun);
      void executePlaybookTask(user.id, connection, yaml, dryRun, taskId);
      const task = gt(taskId);
      return { taskId, dryRun, steps: task?.steps ?? [] };
    }

    reply.code(404);
    return { error: "Profile or catalog item not found." };
  });

  // ── 影响范围预估 ────────────────────────────────────────

  app.get("/api/catalog/:id/impact", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { hasPlaybook, loadPlaybookFromCatalog, parsePlaybook } = await import("./engine/index.js");
      const { estimateImpact } = await import("./engine/impact.js");
      if (!(await hasPlaybook(id))) { reply.code(404); return { error: "Playbook not found." }; }
      const yaml = await loadPlaybookFromCatalog(id);
      const playbook = parsePlaybook(yaml);
      const impact = estimateImpact(playbook);
      return { impact };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Impact estimation failed" };
    }
  });

  app.post("/api/impact/batch", async (request, reply) => {
    const body = (request.body ?? {}) as { catalogIds?: string[] };
    if (!Array.isArray(body.catalogIds) || body.catalogIds.length === 0) {
      reply.code(400); return { error: "catalogIds[] is required." };
    }
    try {
      const { hasPlaybook, loadPlaybookFromCatalog, parsePlaybook } = await import("./engine/index.js");
      const { estimateImpact } = await import("./engine/impact.js");
      const catalogItems = await listCatalogFromDatabase();
      const reports: Array<{ catalogId: string; name: string; impact: any }> = [];
      let totalDisk = 0, totalSeconds = 0, maxRisk: "low" | "medium" | "high" = "low";
      let needsSudo = false;

      for (const cid of body.catalogIds) {
        const item = catalogItems.find((c) => c.id === cid);
        if (!item) continue;
        if (!(await hasPlaybook(cid))) continue;
        const yaml = await loadPlaybookFromCatalog(cid);
        const playbook = parsePlaybook(yaml);
        const impact = estimateImpact(playbook);
        reports.push({ catalogId: cid, name: item.name, impact });
        totalDisk += impact.totalDiskDeltaMb;
        totalSeconds += impact.estimatedSeconds;
        if (impact.needsSudo) needsSudo = true;
        if (impact.maxRisk === "high") maxRisk = "high";
        else if (impact.maxRisk === "medium" && maxRisk !== "high") maxRisk = "medium";
      }

      return {
        reports,
        totals: {
          diskDeltaMb: totalDisk,
          estimatedSeconds: totalSeconds,
          needsSudo,
          maxRisk,
          summaryZh: `共 ${reports.length} 项，预计磁盘 +${totalDisk}MB，耗时 ~${totalSeconds}s`,
          summaryEn: `${reports.length} items, disk +${totalDisk}MB, ~${totalSeconds}s`
        }
      };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Batch impact failed" };
    }
  });

  // ── 软件卸载 ─────────────────────────────────────────────

  app.post("/api/connections/:id/uninstall", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { packages?: string[]; source?: string; dryRun?: boolean };
    if (!body.packages || body.packages.length === 0) {
      reply.code(400); return { error: "packages[] is required." };
    }
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }

    const dryRun = body.dryRun !== false;
    const source = body.source ?? "apt";
    const pkgNames = body.packages;

    // Generate uninstall playbook based on source
    let yaml: string;
    if (source === "apt" || source === "apt-manual" || source === "rpm") {
      yaml = `name: Uninstall packages\nhosts: all\ntasks:\n  - name: Remove ${pkgNames.join(", ")}\n    module: package\n    args:\n      name:\n${pkgNames.map((p) => `        - ${p}`).join("\n")}\n      state: absent\n`;
    } else if (source === "npm") {
      yaml = `name: Uninstall npm packages\nhosts: all\ntasks:\n${pkgNames.map((p) => `  - name: Remove npm ${p}\n    module: shell\n    args:\n      cmd: "sudo npm uninstall -g ${p}"\n`).join("")}`;
    } else if (source === "pip") {
      yaml = `name: Uninstall pip packages\nhosts: all\ntasks:\n${pkgNames.map((p) => `  - name: Remove pip ${p}\n    module: shell\n    args:\n      cmd: "pip3 uninstall -y ${p}"\n`).join("")}`;
    } else if (source === "snap") {
      yaml = `name: Uninstall snap packages\nhosts: all\ntasks:\n${pkgNames.map((p) => `  - name: Remove snap ${p}\n    module: shell\n    args:\n      cmd: "sudo snap remove ${p}"\n`).join("")}`;
    } else {
      yaml = `name: Remove packages\nhosts: all\ntasks:\n${pkgNames.map((p) => `  - name: Remove ${p}\n    module: shell\n    args:\n      cmd: "sudo rm -rf /usr/local/bin/${p} /opt/${p} ~/.local/bin/${p}"\n`).join("")}`;
    }

    const { registerBatchTask, executePlaybookTask, getTask: gt } = await import("./executor.js");
    const taskId = registerBatchTask(user.id, conn.id, [{ catalogId: "uninstall", displayName: `Uninstall ${pkgNames.join(", ")}` }], dryRun);
    void executePlaybookTask(user.id, conn, yaml, dryRun, taskId);
    const task = gt(taskId);
    return { taskId, dryRun, packages: pkgNames, steps: task?.steps ?? [] };
  });

  // ── Docker Compose 部署模式 ─────────────────────────────

  app.get("/api/catalog/:id/docker-compose", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { resolveFromRoot } = await import("./repo.js");
      const path = await import("node:path");
      const fs = await import("node:fs/promises");
      const composePath = resolveFromRoot(path.join("configs/catalog/docker", `${id}.yaml`));
      const content = await fs.readFile(composePath, "utf8");
      reply.type("text/yaml");
      return content;
    } catch {
      reply.code(404);
      return { error: `No Docker Compose file for ${id}` };
    }
  });

  // ── vm-snapshot 四阶段部署 ────────────────────────────────

  app.get("/api/profiles/:id/staged-playbooks", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const profile = await getUserProfile(user, id);
    if (!profile) { reply.code(404); return { error: "Profile not found." }; }
    if (profile.kind !== "vm-snapshot") {
      reply.code(400);
      return { error: "Staged deployment is only supported for vm-snapshot profiles." };
    }
    const { buildStagedPlaybooks } = await import("./snapshot-deploy.js");
    return { stages: buildStagedPlaybooks(profile) };
  });

  app.post("/api/profiles/:id/deploy-stage", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      connectionId?: string;
      stage?: "software" | "configs" | "env" | "services";
      dryRun?: boolean;
    };
    if (!body.connectionId || !body.stage) {
      reply.code(400);
      return { error: "connectionId and stage are required." };
    }
    const profile = await getUserProfile(user, id);
    if (!profile || profile.kind !== "vm-snapshot") {
      reply.code(404);
      return { error: "vm-snapshot profile not found." };
    }
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === body.connectionId && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }

    const { buildStagedPlaybooks } = await import("./snapshot-deploy.js");
    const stages = buildStagedPlaybooks(profile);
    const yamlText = stages[body.stage];
    const dryRun = body.dryRun !== false;
    const { registerBatchTask, executePlaybookTask, getTask: gt } = await import("./executor.js");
    const taskId = registerBatchTask(
      user.id,
      conn.id,
      [{ catalogId: `${profile.id}-${body.stage}`, displayName: `${profile.name} · ${body.stage}` }],
      dryRun
    );
    void executePlaybookTask(user.id, conn, yamlText, dryRun, taskId);
    const task = gt(taskId);
    return { taskId, dryRun, stage: body.stage, steps: task?.steps ?? [] };
  });

  // 获取任务状态
  app.get("/api/tasks/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const task = getTask(id);
    if (!task || task.userId !== user.id) { reply.code(404); return { error: "Task not found." }; }
    return { task };
  });

  // Queue snapshot — admin only (for monitoring concurrency)
  app.get("/api/admin/queues", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { getQueueSnapshot } = await import("./task-queue.js");
    return { queues: getQueueSnapshot() };
  });

  // (SSE stream moved to bottom with query token auth support)

  // 从当前连接的 probeSnapshot 提取热门组合草稿
  app.get("/api/connections/:id/extract-combo", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    if (!conn.probeSnapshot) { reply.code(400); return { error: "No probe data. Please connect first." }; }

    const snap = conn.probeSnapshot;
    const components = [
      ...snap.software.map((s) => ({
        type: "software" as const,
        label: `${s.name} ${s.version}`,
        labelEn: `${s.name} ${s.version}`,
        detail: s.source
      })),
      ...snap.configChecklist.map((c) => ({
        type: "system-config" as const,
        label: c.label,
        labelEn: c.label,
        detail: c.category
      }))
    ];

    return {
      draft: {
        kind: "combo",
        name: `${snap.system.hostname} 配置组合`,
        nameEn: `${snap.system.hostname} combo`,
        category: "runtime",
        summary: `从 ${snap.system.hostname} 提取的配置组合，采集于 ${snap.collectedAt.slice(0, 10)}`,
        summaryEn: `Combo extracted from ${snap.system.hostname} on ${snap.collectedAt.slice(0, 10)}`,
        sensitivity: "review",
        components,
        installMode: "skip-existing"
      }
    };
  });

  app.post("/api/diff", async (request) => {
    const body = request.body as {
      current: Parameters<typeof diffSnapshots>[0];
      target: Parameters<typeof diffSnapshots>[1];
    };

    return {
      items: diffSnapshots(body.current, body.target)
    };
  });

  app.post("/api/restore/plan", async (request) => {
    const body = request.body as {
      snapshot: Parameters<typeof createRestorePlan>[0];
      targetSnapshotPath?: string;
    };

    return createRestorePlan(body.snapshot, body.targetSnapshotPath);
  });

  // ── SSH Key 管理 ────────────────────────────────────────

  app.post("/api/keys", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as { label?: string; privateKey?: string };
    if (!body.privateKey) { reply.code(400); return { error: "privateKey is required." }; }
    const { saveUserKey } = await import("./key-store.js");
    const meta = await saveUserKey(user.id, body.label || "My key", body.privateKey);
    return { key: meta };
  });

  app.get("/api/keys", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { listUserKeys } = await import("./key-store.js");
    const keys = await listUserKeys(user.id);
    return { keys };
  });

  app.delete("/api/keys/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const { deleteUserKey } = await import("./key-store.js");
    await deleteUserKey(user.id, id);
    return { ok: true };
  });

  // ── 环境保留 (Capture) ──────────────────────────────────

  app.get("/api/connections/:id/capture", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { captureEnvironment } = await import("./capture.js");
      const { Ssh2Executor } = await import("./engine/ssh-executor.js");
      const client = await connectSshForUser(conn, user.id);
      const executor = new Ssh2Executor(client);
      try {
        const result = await captureEnvironment(executor);
        return {
          playbookYaml: result.playbookYaml,
          summary: result.summary,
          redactions: result.redactions,
          skippedPaths: result.skippedPaths,
          connectionId: id,
          capturedAt: new Date().toISOString()
        };
      } finally { client.end(); }
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Capture failed" };
    }
  });

  // Preflight: read-only checks before running a Playbook
  app.get("/api/connections/:id/preflight", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { runPreflight } = await import("./preflight.js");
      const { Ssh2Executor } = await import("./engine/ssh-executor.js");
      const client = await connectSshForUser(conn, user.id);
      const executor = new Ssh2Executor(client);
      try {
        const report = await runPreflight(executor);
        return { report };
      } finally { client.end(); }
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Preflight failed" };
    }
  });

  /**
   * GET /api/connections/:id/distro
   * 探测目标机器的发行版信息（仅 SSH 连一次跑 cat /etc/os-release + 检测 PM）。
   * 用途：Market 页让用户在选目标机器后立刻看到目标的 distro，并对照 catalog item 的
   * compatibility 字段标出每个 Playbook 的兼容性级别。
   */
  app.get("/api/connections/:id/distro", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { detectDistroInfo } = await import("./distro-compat.js");
      const { Ssh2Executor } = await import("./engine/ssh-executor.js");
      const client = await connectSshForUser(conn, user.id);
      const executor = new Ssh2Executor(client);
      try {
        const distro = await detectDistroInfo(executor);
        return { distro };
      } finally { client.end(); }
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Distro detection failed" };
    }
  });

  /**
   * POST /api/compatibility/check
   * 给定 connectionId + 一组 catalogIds，返回每个 catalog item 的兼容性级别。
   * 不像上面的端点是单纯 distro 探测，这个会真正对照 Playbook 的 compatibility 声明。
   *
   * Body: { connectionId, catalogIds: string[] }
   * Response: {
   *   distro: DistroInfo,
   *   results: Array<{
   *     catalogId: string;
   *     level: "verified" | "compatible" | "untested" | "unsupported";
   *     reasonZh: string; reasonEn: string;
   *   }>
   * }
   */
  app.post("/api/compatibility/check", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as { connectionId?: string; catalogIds?: string[] };
    if (!body.connectionId || !Array.isArray(body.catalogIds)) {
      reply.code(400);
      return { error: "connectionId and catalogIds[] are required." };
    }
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === body.connectionId && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { detectDistroInfo, evaluateCompatibility } = await import("./distro-compat.js");
      const { Ssh2Executor } = await import("./engine/ssh-executor.js");
      const items = await listCatalogFromDatabase();
      const client = await connectSshForUser(conn, user.id);
      const executor = new Ssh2Executor(client);
      try {
        const distro = await detectDistroInfo(executor);
        const results = body.catalogIds.map((cid) => {
          const item = items.find((c) => c.id === cid);
          const evalResult = evaluateCompatibility(item?.compatibility, distro);
          return { catalogId: cid, ...evalResult };
        });
        return { distro, results };
      } finally { client.end(); }
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Compatibility check failed" };
    }
  });

  // Verify: re-probe target after a task completes; meant to be paired with task-history diff
  app.post("/api/connections/:id/verify", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { beforeProbe?: unknown };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { reprobeConnection } = await import("./connections.js");
      const updated = await reprobeConnection(id, user.id);
      const beforeSoftware = (body.beforeProbe as { software?: Array<{ name: string; version: string; source: string }> } | undefined)?.software ?? [];
      const afterSoftware = updated?.probeSnapshot?.software ?? [];
      const beforeKeys = new Set(beforeSoftware.map((s) => `${s.source}::${s.name}`));
      const afterKeys = new Set(afterSoftware.map((s) => `${s.source}::${s.name}`));
      const added = afterSoftware.filter((s) => !beforeKeys.has(`${s.source}::${s.name}`));
      const removed = beforeSoftware.filter((s) => !afterKeys.has(`${s.source}::${s.name}`));
      return {
        verifiedAt: new Date().toISOString(),
        addedSoftware: added,
        removedSoftware: removed,
        connection: updated
      };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Verify failed" };
    }
  });

  // ── 任务历史 ────────────────────────────────────────────

  app.get("/api/tasks", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const db = await readRuntimeDatabase();
    const tasks = (db.tasks ?? []).filter((t) => t.userId === user.id).slice(0, 50);
    return { tasks };
  });

  // ── Batch execute (Market 一键安装) ──────────────────────

  app.post("/api/batch-execute", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as { connectionId?: string; catalogIds?: string[]; dryRun?: boolean };
    if (!body.connectionId || !Array.isArray(body.catalogIds) || body.catalogIds.length === 0) {
      reply.code(400); return { error: "connectionId and catalogIds[] are required." };
    }
    const db = await readRuntimeDatabase();
    const connection = db.connections.find((c) => c.id === body.connectionId && c.userId === user.id);
    if (!connection) { reply.code(404); return { error: "Connection not found." }; }
    const catalogItems = await listCatalogFromDatabase();
    const items = body.catalogIds.map((id) => { const item = catalogItems.find((c) => c.id === id); return item ? { catalogId: item.id, displayName: item.name } : null; }).filter((x): x is { catalogId: string; displayName: string } => x !== null);
    if (items.length === 0) { reply.code(400); return { error: "None of the provided catalogIds were found." }; }
    const dryRun = body.dryRun !== false;
    const { registerBatchTask, executeBatchCatalogTask, getTask: gt } = await import("./executor.js");
    const taskId = registerBatchTask(user.id, connection.id, items, dryRun);
    void executeBatchCatalogTask(user.id, connection, items, dryRun, taskId);
    const task = gt(taskId);
    return { taskId, dryRun, totalItems: items.length, items: task?.items ?? [] };
  });

  // ── Multi-execute (Playbook 多目标执行) ─────────────────

  app.post("/api/multi-execute", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as { yaml?: string; playbookId?: string; connectionIds?: string[]; tags?: string[]; dryRun?: boolean };
    let yamlText = body.yaml ?? "";
    if (!yamlText && body.playbookId) {
      const db = await readRuntimeDatabase();
      const pb = (db.playbooks ?? []).find((p) => p.id === body.playbookId && p.userId === user.id);
      if (pb) yamlText = pb.yaml;
    }
    if (!yamlText) { reply.code(400); return { error: "yaml or playbookId is required." }; }
    const db = await readRuntimeDatabase();
    let targetConns = db.connections.filter((c) => c.userId === user.id);
    if (body.connectionIds?.length) targetConns = targetConns.filter((c) => body.connectionIds!.includes(c.id));
    else if (body.tags?.length) targetConns = targetConns.filter((c) => c.tags?.some((t) => body.tags!.includes(t)));
    if (targetConns.length === 0) { reply.code(400); return { error: "No matching connections found." }; }
    const dryRun = body.dryRun !== false;
    const { registerBatchTask, executePlaybookTask, getTask: gt } = await import("./executor.js");
    const taskIds: Array<{ connectionId: string; label: string; taskId: string }> = [];
    for (const conn of targetConns) {
      const taskId = registerBatchTask(user.id, conn.id, [{ catalogId: "playbook", displayName: conn.label }], dryRun);
      taskIds.push({ connectionId: conn.id, label: conn.label, taskId });
      void executePlaybookTask(user.id, conn, yamlText, dryRun, taskId);
    }
    return { targets: taskIds, dryRun, totalTargets: targetConns.length, message: `Launched on ${targetConns.length} target(s)` };
  });

  // ── Task SSE stream ─────────────────────────────────────

  app.get("/api/tasks/:id/stream", async (request, reply) => {
    const queryToken = (request.query as Record<string, string>)?.token;
    const headerToken = readBearerToken(request.headers.authorization);
    const user = await getUserByToken(headerToken ?? queryToken);
    if (!user) { reply.code(401); return; }
    const { id } = request.params as { id: string };
    const { getTask: gt, subscribeTask: sub } = await import("./executor.js");
    const task = gt(id);
    if (!task || task.userId !== user.id) { reply.code(404); return; }
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    reply.raw.write(`data: ${JSON.stringify(task)}\n\n`);
    if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") { reply.raw.end(); return; }
    const unsub = sub(id, (updated) => {
      try { reply.raw.write(`data: ${JSON.stringify(updated)}\n\n`); } catch { unsub(); }
      if (updated.status === "succeeded" || updated.status === "failed" || updated.status === "cancelled") { unsub(); reply.raw.end(); }
    });
    request.raw.on("close", unsub);
  });

  // ── Task cancel ─────────────────────────────────────────

  app.post("/api/tasks/:id/cancel", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const { cancelTask } = await import("./executor.js");
    cancelTask(id);
    return { ok: true };
  });

  // ── Playbook CRUD ────────────────────────────────────────

  app.get("/api/playbooks", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const db = await readRuntimeDatabase();
    const playbooks = (db.playbooks ?? []).filter((p) => p.userId === user.id);
    return { playbooks };
  });

  app.get("/api/playbooks/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const playbook = (db.playbooks ?? []).find((p) => p.id === id && p.userId === user.id);
    if (!playbook) { reply.code(404); return { error: "Not found." }; }
    return { playbook };
  });

  app.post("/api/playbooks", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as { name?: string; description?: string; yaml?: string; sourceKind?: string; sourceId?: string; comment?: string };
    if (!body.yaml) { reply.code(400); return { error: "yaml is required." }; }
    const playbook = { id: createId("pb"), userId: user.id, name: body.name || "Untitled", description: body.description, version: 1, yaml: body.yaml, history: [{ version: 1, yaml: body.yaml, savedAt: new Date().toISOString(), comment: body.comment }], sourceKind: (body.sourceKind ?? "user") as "catalog" | "capture" | "user", sourceId: body.sourceId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await updateRuntimeDatabase((db) => { if (!db.playbooks) db.playbooks = []; db.playbooks.push(playbook); });
    return { playbook };
  });

  app.patch("/api/playbooks/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { name?: string; description?: string; yaml?: string; comment?: string };
    const result = await updateRuntimeDatabase((db) => {
      const pb = (db.playbooks ?? []).find((p) => p.id === id && p.userId === user.id);
      if (!pb) return null;
      if (body.name !== undefined) pb.name = body.name;
      if (body.description !== undefined) pb.description = body.description;
      if (body.yaml !== undefined && body.yaml !== pb.yaml) {
        pb.version++;
        pb.yaml = body.yaml;
        if (!pb.history) pb.history = [];
        pb.history.push({ version: pb.version, yaml: body.yaml, savedAt: new Date().toISOString(), comment: body.comment });
        if (pb.history.length > 20) pb.history = pb.history.slice(-20);
      }
      pb.updatedAt = new Date().toISOString();
      return pb;
    });
    if (!result) { reply.code(404); return { error: "Not found." }; }
    return { playbook: result };
  });

  app.delete("/api/playbooks/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    await updateRuntimeDatabase((db) => { db.playbooks = (db.playbooks ?? []).filter((p) => !(p.id === id && p.userId === user.id)); });
    return { ok: true };
  });

  app.post("/api/playbooks/:id/restore/:version", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id, version } = request.params as { id: string; version: string };
    const ver = parseInt(version, 10);
    const result = await updateRuntimeDatabase((db) => {
      const pb = (db.playbooks ?? []).find((p) => p.id === id && p.userId === user.id);
      if (!pb) return null;
      const hist = pb.history?.find((h) => h.version === ver);
      if (!hist) return null;
      pb.version++;
      pb.yaml = hist.yaml;
      pb.history?.push({ version: pb.version, yaml: hist.yaml, savedAt: new Date().toISOString(), comment: `Restored from v${ver}` });
      pb.updatedAt = new Date().toISOString();
      return pb;
    });
    if (!result) { reply.code(404); return { error: "Not found or version not found." }; }
    return { playbook: result };
  });

  // ── Config files API ────────────────────────────────────

  app.get("/api/connections/:id/configs", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const softwareNames = conn.probeSnapshot?.software?.map((s) => s.name) ?? [];
      const files = await listConfigFiles(conn, softwareNames);
      return { files };
    } catch (err) { reply.code(500); return { error: err instanceof Error ? err.message : "Failed" }; }
  });

  app.get("/api/connections/:id/configs/read", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const { path: filePath } = request.query as { path?: string };
    if (!filePath) { reply.code(400); return { error: "path query parameter is required." }; }
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try { return await readConfigFile(conn, filePath); }
    catch (err) { reply.code(500); return { error: err instanceof Error ? err.message : "Failed" }; }
  });

  app.post("/api/connections/:id/configs/write", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { path?: string; content?: string; backup?: boolean };
    if (!body.path || body.content === undefined) { reply.code(400); return { error: "path and content are required." }; }
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try { return await writeConfigFile(conn, body.path, body.content, body.backup !== false); }
    catch (err) { reply.code(500); return { error: err instanceof Error ? err.message : "Failed" }; }
  });

  // Diff: current file vs the .envforge.bak created on first write
  app.get("/api/connections/:id/configs/diff", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const { path: filePath } = request.query as { path?: string };
    if (!filePath) { reply.code(400); return { error: "path query parameter is required." }; }
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try { return await readConfigFileWithBackup(conn, filePath); }
    catch (err) { reply.code(500); return { error: err instanceof Error ? err.message : "Failed" }; }
  });

  // ── Schedules (cron) ────────────────────────────────────

  app.get("/api/schedules", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const db = await readRuntimeDatabase();
    return { schedules: (db.schedules ?? []).filter((s) => s.userId === user.id) };
  });

  app.post("/api/schedules", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { validateScheduleInput } = await import("./scheduler.js");
    const { nextRunAfter } = await import("./cron.js");
    const body = (request.body ?? {}) as Partial<import("./runtime-store.js").StoredSchedule>;
    const err = validateScheduleInput(body);
    if (err) { reply.code(400); return { error: err }; }
    const now = new Date();
    const next = nextRunAfter(body.cron!, now);
    const created = await updateRuntimeDatabase((db) => {
      if (!db.schedules) db.schedules = [];
      const sch: import("./runtime-store.js").StoredSchedule = {
        id: createId("sched"),
        userId: user.id,
        name: body.name!.trim(),
        playbookId: body.playbookId,
        catalogId: body.catalogId,
        connectionIds: body.connectionIds ?? [],
        tags: body.tags ?? [],
        cron: body.cron!.trim(),
        dryRun: body.dryRun ?? false,
        enabled: body.enabled ?? true,
        nextRunAt: next ? next.toISOString() : undefined,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      db.schedules.push(sch);
      return sch;
    });
    return { schedule: created };
  });

  app.patch("/api/schedules/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Partial<import("./runtime-store.js").StoredSchedule>;
    const { validateCron, nextRunAfter } = await import("./cron.js");
    if (body.cron !== undefined) {
      const cronErr = validateCron(body.cron);
      if (cronErr) { reply.code(400); return { error: cronErr }; }
    }
    const updated = await updateRuntimeDatabase((db) => {
      const sch = (db.schedules ?? []).find((s) => s.id === id && s.userId === user.id);
      if (!sch) return null;
      if (body.name !== undefined) sch.name = body.name.trim();
      if (body.cron !== undefined) {
        sch.cron = body.cron.trim();
        const next = nextRunAfter(sch.cron, new Date());
        sch.nextRunAt = next ? next.toISOString() : undefined;
      }
      if (body.connectionIds !== undefined) sch.connectionIds = body.connectionIds;
      if (body.tags !== undefined) sch.tags = body.tags;
      if (body.dryRun !== undefined) sch.dryRun = body.dryRun;
      if (body.enabled !== undefined) sch.enabled = body.enabled;
      sch.updatedAt = new Date().toISOString();
      return sch;
    });
    if (!updated) { reply.code(404); return { error: "Schedule not found." }; }
    return { schedule: updated };
  });

  app.delete("/api/schedules/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const removed = await updateRuntimeDatabase((db) => {
      const before = db.schedules?.length ?? 0;
      db.schedules = (db.schedules ?? []).filter((s) => !(s.id === id && s.userId === user.id));
      return before !== (db.schedules?.length ?? 0);
    });
    if (!removed) { reply.code(404); return { error: "Schedule not found." }; }
    return { ok: true };
  });

  // ── Drift detection ─────────────────────────────────────

  app.post("/api/connections/:id/drift/baseline", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { setBaseline } = await import("./drift.js");
      const baseline = await setBaseline(user.id, conn);
      return { baseline };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Failed to set baseline" };
    }
  });

  app.get("/api/connections/:id/drift", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const conn = db.connections.find((c) => c.id === id && c.userId === user.id);
    if (!conn) { reply.code(404); return { error: "Connection not found." }; }
    try {
      const { runDriftCheck } = await import("./drift.js");
      const report = await runDriftCheck(user.id, conn);
      if (!report) { reply.code(400); return { error: "No baseline set for this connection. Set one first." }; }
      return { report };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Drift check failed" };
    }
  });

  // ── Webhooks ────────────────────────────────────────────

  app.get("/api/webhooks", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const db = await readRuntimeDatabase();
    return { webhooks: (db.webhooks ?? []).filter((w) => w.userId === user.id) };
  });

  app.post("/api/webhooks", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as Partial<import("./runtime-store.js").StoredWebhook>;
    if (!body.label?.trim() || !body.url?.trim()) {
      reply.code(400); return { error: "label and url are required." };
    }
    try {
      const u = new URL(body.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs allowed");
    } catch {
      reply.code(400); return { error: "Invalid URL." };
    }
    const events = (body.events ?? ["task.completed", "task.failed", "drift.detected", "schedule.fired"])
      .filter((e): e is "task.completed" | "task.failed" | "drift.detected" | "schedule.fired" =>
        ["task.completed", "task.failed", "drift.detected", "schedule.fired"].includes(e));
    const created = await updateRuntimeDatabase((db) => {
      if (!db.webhooks) db.webhooks = [];
      const hook: import("./runtime-store.js").StoredWebhook = {
        id: createId("hook"),
        userId: user.id,
        label: body.label!.trim(),
        url: body.url!.trim(),
        secret: body.secret?.trim() || undefined,
        events,
        enabled: body.enabled ?? true,
        createdAt: new Date().toISOString()
      };
      db.webhooks.push(hook);
      return hook;
    });
    return { webhook: created };
  });

  app.patch("/api/webhooks/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Partial<import("./runtime-store.js").StoredWebhook>;
    const updated = await updateRuntimeDatabase((db) => {
      const hook = (db.webhooks ?? []).find((w) => w.id === id && w.userId === user.id);
      if (!hook) return null;
      if (body.label !== undefined) hook.label = body.label.trim();
      if (body.url !== undefined) hook.url = body.url.trim();
      if (body.secret !== undefined) hook.secret = body.secret.trim() || undefined;
      if (body.events !== undefined) hook.events = body.events;
      if (body.enabled !== undefined) hook.enabled = body.enabled;
      return hook;
    });
    if (!updated) { reply.code(404); return { error: "Webhook not found." }; }
    return { webhook: updated };
  });

  app.delete("/api/webhooks/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const removed = await updateRuntimeDatabase((db) => {
      const before = db.webhooks?.length ?? 0;
      db.webhooks = (db.webhooks ?? []).filter((w) => !(w.id === id && w.userId === user.id));
      return before !== (db.webhooks?.length ?? 0);
    });
    if (!removed) { reply.code(404); return { error: "Webhook not found." }; }
    return { ok: true };
  });

  app.post("/api/webhooks/:id/test", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const db = await readRuntimeDatabase();
    const hook = (db.webhooks ?? []).find((w) => w.id === id && w.userId === user.id);
    if (!hook) { reply.code(404); return { error: "Webhook not found." }; }
    const { fireWebhooks } = await import("./webhooks.js");
    // Pick one event the hook is subscribed to (fall back to task.completed)
    const evtType = hook.events[0] ?? "task.completed";
    await fireWebhooks(user.id, evtType, { test: true, message: "EnvForge webhook test" });
    // Re-read to surface delivery status
    const after = (await readRuntimeDatabase()).webhooks?.find((w) => w.id === id);
    return { delivered: after?.lastDeliveryStatus, error: after?.lastDeliveryError };
  });

  // ── Module documentation (for editor + onboarding) ──────

  app.get("/api/modules/docs", async () => {
    const { MODULE_DOCS } = await import("./engine/module-docs.js");
    return { modules: MODULE_DOCS };
  });

  // ── API tokens ──────────────────────────────────────────

  app.get("/api/tokens", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const db = await readRuntimeDatabase();
    return {
      tokens: (db.apiTokens ?? [])
        .filter((t) => t.userId === user.id)
        .map((t) => ({
          id: t.id,
          label: t.label,
          tokenPrefix: t.tokenPrefix,
          createdAt: t.createdAt,
          lastUsedAt: t.lastUsedAt,
          expiresAt: t.expiresAt
        }))
    };
  });

  app.post("/api/tokens", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const body = (request.body ?? {}) as { label?: string; expiresInDays?: number };
    if (!body.label?.trim()) { reply.code(400); return { error: "label is required." }; }
    const { randomBytes, createHash } = await import("node:crypto");
    const raw = `envf_${randomBytes(24).toString("base64url")}`;
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const expiresAt = body.expiresInDays && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    const created = await updateRuntimeDatabase((db) => {
      if (!db.apiTokens) db.apiTokens = [];
      const tok: import("./runtime-store.js").StoredApiToken = {
        id: createId("token"),
        userId: user.id,
        label: body.label!.trim(),
        tokenHash,
        tokenPrefix: raw.slice(0, 12),
        createdAt: new Date().toISOString(),
        expiresAt
      };
      db.apiTokens.push(tok);
      return tok;
    });
    // Return the raw token ONCE
    return {
      token: raw,
      id: created.id,
      label: created.label,
      tokenPrefix: created.tokenPrefix,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt
    };
  });

  app.delete("/api/tokens/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return { error: "Login required." }; }
    const { id } = request.params as { id: string };
    const removed = await updateRuntimeDatabase((db) => {
      const before = db.apiTokens?.length ?? 0;
      db.apiTokens = (db.apiTokens ?? []).filter((t) => !(t.id === id && t.userId === user.id));
      return before !== (db.apiTokens?.length ?? 0);
    });
    if (!removed) { reply.code(404); return { error: "Token not found." }; }
    return { ok: true };
  });

  // ── Admin: catalog management ──────────────────────────

  // List all catalog items (merged baseline + overrides) plus a status map
  app.get("/api/admin/catalog", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { readDatabase } = await import("./database.js");
    const { mergeCatalog, annotateOverrides } = await import("./catalog-overrides.js");
    const db = await readRuntimeDatabase();
    const baseline = (await readDatabase()).catalog;
    const merged = mergeCatalog(baseline, db.catalogOverrides);
    const status = Object.fromEntries(annotateOverrides(baseline, db.catalogOverrides));
    return { items: merged, status };
  });

  // Get a single catalog item with its YAML and Markdown body for editing
  app.get("/api/admin/catalog/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { id } = request.params as { id: string };
    const { isValidCatalogId, loadOverrideYaml, loadOverrideMarkdown, resolvePlaybookYaml, hasResolvedPlaybook } = await import("./catalog-overrides.js");
    if (!isValidCatalogId(id)) { reply.code(400); return { error: "Invalid catalog id." }; }
    const { readDatabase } = await import("./database.js");
    const { mergeCatalog } = await import("./catalog-overrides.js");
    const db = await readRuntimeDatabase();
    const baseline = (await readDatabase()).catalog;
    const merged = mergeCatalog(baseline, db.catalogOverrides);
    const item = merged.find((c) => c.id === id);
    if (!item) { reply.code(404); return { error: "Catalog item not found." }; }
    // Pull YAML (override or baseline)
    let yaml = "";
    try {
      if (await hasResolvedPlaybook(id)) yaml = await resolvePlaybookYaml(id);
    } catch { /* ignore */ }
    // Pull markdown (override first, then baseline)
    let markdown = "";
    const overrideMd = await loadOverrideMarkdown(id);
    if (overrideMd !== null) markdown = overrideMd;
    else {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const { resolveFromRoot } = await import("./repo.js");
        markdown = await fs.readFile(resolveFromRoot(path.join(item.guidePath)), "utf8");
      } catch { /* no baseline guide */ }
    }
    const yamlOverride = await loadOverrideYaml(id);
    const overrideStatus = (db.catalogOverrides ?? []).find((o) => (o.baseId ?? o.id) === id);

    // Pull vars schema (override first, then baseline). Returns null when neither exists.
    let varsSchema: unknown = null;
    let hasSchemaOverride = false;
    try {
      const { loadVarsSchema } = await import("./catalog-vars-schema.js");
      varsSchema = await loadVarsSchema(id);
      // Detect override-vs-baseline by reading override path directly
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const overridePath = path.join(getConfig().dataDir, "catalog-overrides", "schemas", `${id}.vars.json`);
      try { await fs.access(overridePath); hasSchemaOverride = true; } catch { /* no override */ }
    } catch { /* schema loader threw — schema invalid; surface as null */ }

    return {
      item,
      yaml,
      markdown,
      varsSchema,
      hasYamlOverride: yamlOverride !== null,
      hasMarkdownOverride: overrideMd !== null,
      hasSchemaOverride,
      isUserAdded: overrideStatus ? !overrideStatus.baseId : false
    };
  });

  // Create a new catalog item (admin-only)
  app.post("/api/admin/catalog", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const body = (request.body ?? {}) as {
      id?: string;
      kind?: "software" | "combo";
      name?: string;
      nameEn?: string;
      category?: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
      summary?: string;
      summaryEn?: string;
      imageTone?: string;
      sensitivity?: "safe" | "review" | "privileged";
      rating?: number;
      playbookYaml?: string;
      guideMarkdown?: string;
      components?: Array<{ type: "software" | "system-command" | "system-config"; label: string; labelEn: string; detail: string }>;
      deployModes?: Array<"system" | "docker">;
    };
    const { isValidCatalogId, saveOverrideYaml, saveOverrideMarkdown } = await import("./catalog-overrides.js");
    if (!body.id || !isValidCatalogId(body.id)) {
      reply.code(400); return { error: "id is required and must match [a-z0-9-]{1,60}" };
    }
    if (!body.name?.trim()) { reply.code(400); return { error: "name is required" }; }
    if (!body.playbookYaml?.trim()) { reply.code(400); return { error: "playbookYaml is required" }; }
    // Validate YAML by attempting to parse it
    try {
      const { parsePlaybook } = await import("./engine/index.js");
      parsePlaybook(body.playbookYaml);
    } catch (err) {
      reply.code(400);
      return { error: `Invalid playbook YAML: ${err instanceof Error ? err.message : err}` };
    }
    // Make sure the id isn't already in use (baseline OR another override)
    const { readDatabase } = await import("./database.js");
    const { mergeCatalog } = await import("./catalog-overrides.js");
    const db = await readRuntimeDatabase();
    const baseline = (await readDatabase()).catalog;
    const merged = mergeCatalog(baseline, db.catalogOverrides);
    if (merged.some((m) => m.id === body.id)) {
      reply.code(400); return { error: `Catalog id already exists: ${body.id}` };
    }
    const now = new Date().toISOString();
    await updateRuntimeDatabase((rdb) => {
      if (!rdb.catalogOverrides) rdb.catalogOverrides = [];
      rdb.catalogOverrides.push({
        id: body.id!,
        // No baseId → user-added
        overrides: {
          kind: body.kind ?? "software",
          name: body.name!,
          nameEn: body.nameEn ?? body.name!,
          category: body.category ?? "service",
          summary: body.summary ?? "",
          summaryEn: body.summaryEn ?? body.summary ?? "",
          imageTone: body.imageTone ?? "slate",
          sensitivity: body.sensitivity ?? "safe",
          rating: body.rating ?? 0,
          components: body.components ?? [],
          deployModes: body.deployModes ?? ["system"]
        },
        createdAt: now,
        updatedAt: now,
        modifiedBy: user.id
      });
    });
    await saveOverrideYaml(body.id, body.playbookYaml);
    if (body.guideMarkdown) await saveOverrideMarkdown(body.id, body.guideMarkdown);
    return { ok: true, id: body.id };
  });

  // Update a catalog item (creates an override on a baseline item, or edits a user-added one)
  app.patch("/api/admin/catalog/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      kind?: "software" | "combo";
      name?: string;
      nameEn?: string;
      category?: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
      summary?: string;
      summaryEn?: string;
      imageTone?: string;
      sensitivity?: "safe" | "review" | "privileged";
      rating?: number;
      playbookYaml?: string;
      guideMarkdown?: string;
      /**
       * Optional vars schema override. `null` means "delete the override (revert to baseline)".
       * Object means "save as override". Undefined means "don't touch".
       */
      varsSchema?: unknown;
      components?: Array<{ type: "software" | "system-command" | "system-config"; label: string; labelEn: string; detail: string }>;
      deployModes?: Array<"system" | "docker">;
      hidden?: boolean;
    };
    const { isValidCatalogId, saveOverrideYaml, saveOverrideMarkdown } = await import("./catalog-overrides.js");
    if (!isValidCatalogId(id)) { reply.code(400); return { error: "Invalid catalog id." }; }

    // Validate YAML if provided
    if (body.playbookYaml) {
      try {
        const { parsePlaybook } = await import("./engine/index.js");
        parsePlaybook(body.playbookYaml);
      } catch (err) {
        reply.code(400);
        return { error: `Invalid playbook YAML: ${err instanceof Error ? err.message : err}` };
      }
    }

    const { readDatabase } = await import("./database.js");
    const baseline = (await readDatabase()).catalog;
    const baselineHas = baseline.some((b) => b.id === id);

    const now = new Date().toISOString();
    const result = await updateRuntimeDatabase((rdb) => {
      if (!rdb.catalogOverrides) rdb.catalogOverrides = [];
      // Find existing override
      let ov = rdb.catalogOverrides.find((o) => (o.baseId ?? o.id) === id);
      if (!ov) {
        // First time editing a baseline item
        if (baselineHas) {
          ov = {
            id,
            baseId: id,
            overrides: {},
            createdAt: now,
            updatedAt: now,
            modifiedBy: user.id
          };
          rdb.catalogOverrides.push(ov);
        } else {
          return { error: "Catalog item not found" } as { error: string };
        }
      }
      // Apply field updates
      if (body.hidden !== undefined) ov.hidden = body.hidden;
      ov.overrides = ov.overrides ?? {};
      if (body.kind !== undefined) ov.overrides.kind = body.kind;
      if (body.name !== undefined) ov.overrides.name = body.name;
      if (body.nameEn !== undefined) ov.overrides.nameEn = body.nameEn;
      if (body.category !== undefined) ov.overrides.category = body.category;
      if (body.summary !== undefined) ov.overrides.summary = body.summary;
      if (body.summaryEn !== undefined) ov.overrides.summaryEn = body.summaryEn;
      if (body.imageTone !== undefined) ov.overrides.imageTone = body.imageTone;
      if (body.sensitivity !== undefined) ov.overrides.sensitivity = body.sensitivity;
      if (body.rating !== undefined) ov.overrides.rating = body.rating;
      if (body.components !== undefined) ov.overrides.components = body.components;
      if (body.deployModes !== undefined) ov.overrides.deployModes = body.deployModes;
      ov.updatedAt = now;
      ov.modifiedBy = user.id;
      return { ok: true };
    });
    if ("error" in result) { reply.code(404); return result; }
    if (body.playbookYaml) await saveOverrideYaml(id, body.playbookYaml);
    if (body.guideMarkdown !== undefined) await saveOverrideMarkdown(id, body.guideMarkdown);
    // varsSchema: null → delete override; object → save override; undefined → no change
    if (body.varsSchema !== undefined) {
      const { saveOverrideSchema, deleteOverrideSchema } = await import("./catalog-vars-schema.js");
      if (body.varsSchema === null) {
        await deleteOverrideSchema(id);
      } else {
        try {
          await saveOverrideSchema(id, body.varsSchema as Parameters<typeof saveOverrideSchema>[1]);
        } catch (err) {
          reply.code(400);
          return { error: `Invalid vars schema: ${err instanceof Error ? err.message : err}` };
        }
      }
    }
    return { ok: true };
  });

  // Delete: hide a baseline item OR fully remove a user-added one
  app.delete("/api/admin/catalog/:id", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { id } = request.params as { id: string };
    const { deleteOverrideYaml, deleteOverrideMarkdown } = await import("./catalog-overrides.js");
    const { readDatabase } = await import("./database.js");
    const baseline = (await readDatabase()).catalog;
    const baselineHas = baseline.some((b) => b.id === id);

    const now = new Date().toISOString();
    await updateRuntimeDatabase((rdb) => {
      if (!rdb.catalogOverrides) rdb.catalogOverrides = [];
      if (baselineHas) {
        // Hide the baseline item via override
        const existing = rdb.catalogOverrides.find((o) => o.baseId === id);
        if (existing) {
          existing.hidden = true;
          existing.updatedAt = now;
          existing.modifiedBy = user.id;
        } else {
          rdb.catalogOverrides.push({
            id,
            baseId: id,
            hidden: true,
            createdAt: now,
            updatedAt: now,
            modifiedBy: user.id
          });
        }
      } else {
        // Remove user-added entry entirely
        rdb.catalogOverrides = rdb.catalogOverrides.filter((o) => o.id !== id);
      }
    });
    if (!baselineHas) {
      // Drop body files for user-added items
      await deleteOverrideYaml(id);
      await deleteOverrideMarkdown(id);
    }
    return { ok: true };
  });

  // Reset: drop the override entirely so the baseline shines through again
  app.post("/api/admin/catalog/:id/reset", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user || user.role !== "admin") { reply.code(403); return { error: "Admin only." }; }
    const { id } = request.params as { id: string };
    const { deleteOverrideYaml, deleteOverrideMarkdown } = await import("./catalog-overrides.js");
    const { deleteOverrideSchema } = await import("./catalog-vars-schema.js");
    const { readDatabase } = await import("./database.js");
    const baseline = (await readDatabase()).catalog;
    const baselineHas = baseline.some((b) => b.id === id);
    if (!baselineHas) { reply.code(400); return { error: "Reset only applies to baseline items. Delete user-added items instead." }; }
    await updateRuntimeDatabase((rdb) => {
      rdb.catalogOverrides = (rdb.catalogOverrides ?? []).filter((o) => o.baseId !== id);
    });
    await deleteOverrideYaml(id);
    await deleteOverrideMarkdown(id);
    await deleteOverrideSchema(id);
    return { ok: true };
  });
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

/** Open an SSH connection for the given stored connection profile (handles password / key). */
async function connectSshForUser(
  conn: { method: string; userId: string; fields: Record<string, string> },
  userId: string
): Promise<import("ssh2").Client> {
  const { Client: SshClient } = await import("ssh2");
  const { decryptStoredFields } = await import("./connections.js");
  const { readUserKey } = await import("./key-store.js");
  const decrypted = decryptStoredFields(conn.fields);
  return new Promise<import("ssh2").Client>((resolve, reject) => {
    const c = new SshClient();
    const timer = setTimeout(() => { c.destroy(); reject(new Error("SSH timeout")); }, 10000);
    c.on("ready", () => { clearTimeout(timer); resolve(c); });
    c.on("error", (err: Error) => { clearTimeout(timer); reject(err); });
    const cfg: Record<string, unknown> = {
      host: decrypted.host,
      port: parseInt(decrypted.port ?? "22", 10) || 22,
      username: decrypted.username,
      readyTimeout: 10000,
      keepaliveInterval: 30000,
      keepaliveCountMax: 3
    };
    if (conn.method === "ssh-key") {
      const keyId = decrypted._keyId;
      if (keyId) {
        readUserKey(userId, keyId).then((pk) => {
          cfg.privateKey = Buffer.from(pk, "utf8");
          if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
          c.connect(cfg as any);
        }).catch((err: Error) => { clearTimeout(timer); reject(err); });
      } else if (decrypted.privateKeyPath) {
        import("node:fs/promises").then((fsm) => fsm.readFile(decrypted.privateKeyPath, "utf8")).then((pk) => {
          cfg.privateKey = pk;
          c.connect(cfg as any);
        }).catch((err: Error) => { clearTimeout(timer); reject(err); });
      } else {
        clearTimeout(timer);
        reject(new Error("No SSH key configured"));
      }
    } else {
      cfg.password = decrypted._rawPassword;
      if (!cfg.password) { clearTimeout(timer); reject(new Error("No password")); return; }
      c.connect(cfg as any);
    }
  });
}


/** Format raw install count for display (e.g. 1234 → "1.2k"). */
function formatInstallCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}
