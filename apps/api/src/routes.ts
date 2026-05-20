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
import { readRuntimeDatabase } from "./runtime-store.js";
import { listSnapshots, persistSnapshot } from "./snapshot-store.js";
import { probeAgent, pingAgent } from "./probe.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    service: "fool-server-restore-api",
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

    const profile = db.userProfiles.find((p) => p.id === body.profileId);
    if (!profile) { reply.code(404); return { error: "Profile not found." }; }

    const dryRun = body.dryRun !== false; // 默认 dry-run

    let task;
    if (profile.kind === "vm-snapshot") {
      task = buildSnapshotDeployTask(user.id, connection, profile, dryRun);
    } else {
      task = buildInstallTask(user.id, connection, profile, dryRun);
    }

    // 异步执行，立即返回 taskId
    void executeTask(task, connection);
    return { taskId: task.id, dryRun, steps: task.steps.map((s) => ({ id: s.id, label: s.label, command: s.command, status: s.status })) };
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

  // SSE：实时推送任务日志
  app.get("/api/tasks/:id/stream", async (request, reply) => {
    const user = await getUserByToken(readBearerToken(request.headers.authorization));
    if (!user) { reply.code(401); return; }
    const { id } = request.params as { id: string };
    const task = getTask(id);
    if (!task || task.userId !== user.id) { reply.code(404); return; }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    const send = (t: typeof task) => {
      reply.raw.write(`data: ${JSON.stringify(t)}\n\n`);
    };

    // 立即发送当前状态
    send(task);

    const unsubscribe = subscribeTask(id, send);
    request.raw.on("close", unsubscribe);
  });

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
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}
