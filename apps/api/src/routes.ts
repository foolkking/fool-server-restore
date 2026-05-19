import type { FastifyInstance } from "fastify";
import { collectSnapshotInputs } from "@fool/collectors";
import { createSnapshotManifest, defaultPolicy, diffSnapshots } from "@fool/core";
import { createRestorePlan } from "@fool/restorers";
import { getUserByToken, loginUser, registerUser, toPublicUser, updateUserProfile } from "./auth.js";
import { listCurrentUser } from "./catalog.js";
import { getConfig } from "./config.js";
import { createConnection } from "./connections.js";
import { listCatalogFromDatabase, listMigrationStrategies, readCatalogGuide } from "./database.js";
import { runReadinessChecks } from "./readiness.js";
import { listSnapshots, persistSnapshot } from "./snapshot-store.js";
import { listTargetVirtualMachines } from "./targets.js";
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

  app.get("/api/targets", async () => {
    return {
      targets: listTargetVirtualMachines()
    };
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
