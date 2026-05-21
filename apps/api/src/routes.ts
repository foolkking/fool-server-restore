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
import { listConfigFiles, readConfigFile, writeConfigFile } from "./config-files.js";

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
    return {
      items: await listCatalogFromDatabase()
    };
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

    const body = (request.body ?? {}) as { connectionId?: string; profileId?: string; dryRun?: boolean };
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
      const taskId = registerBatchTask(user.id, connection.id, [{ catalogId: catalogItem.id, displayName: catalogItem.name }], dryRun);
      void executeCatalogTask(user.id, connection, catalogItem.id, catalogItem.name, dryRun, taskId);
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
      // Connect SSH
      const { Client: SshClient } = await import("ssh2");
      const { decryptStoredFields } = await import("./connections.js");
      const { readUserKey } = await import("./key-store.js");
      const decrypted = decryptStoredFields(conn.fields);
      const client = await new Promise<InstanceType<typeof SshClient>>((resolve, reject) => {
        const c = new SshClient();
        const timer = setTimeout(() => { c.destroy(); reject(new Error("SSH timeout")); }, 10000);
        c.on("ready", () => { clearTimeout(timer); resolve(c); });
        c.on("error", (err: Error) => { clearTimeout(timer); reject(err); });
        const cfg: Record<string, unknown> = { host: decrypted.host, port: parseInt(decrypted.port ?? "22", 10) || 22, username: decrypted.username, readyTimeout: 10000 };
        if (conn.method === "ssh-key") {
          const keyId = decrypted._keyId;
          if (keyId) {
            readUserKey(user.id, keyId).then((pk) => { cfg.privateKey = Buffer.from(pk, "utf8"); if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase; c.connect(cfg as any); }).catch(reject);
          } else if (decrypted.privateKeyPath) {
            import("node:fs/promises").then((fsm) => fsm.readFile(decrypted.privateKeyPath, "utf8")).then((pk) => { cfg.privateKey = pk; c.connect(cfg as any); }).catch(reject);
          } else { clearTimeout(timer); reject(new Error("No SSH key")); }
        } else {
          cfg.password = decrypted._rawPassword;
          if (!cfg.password) { clearTimeout(timer); reject(new Error("No password")); return; }
          c.connect(cfg as any);
        }
      });
      const executor = new Ssh2Executor(client);
      try {
        const result = await captureEnvironment(executor);
        return { playbookYaml: result.playbookYaml, summary: result.summary, connectionId: id, capturedAt: new Date().toISOString() };
      } finally { client.end(); }
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Capture failed" };
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
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}
