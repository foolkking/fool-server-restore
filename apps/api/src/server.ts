import Fastify from "fastify";
import { getConfig } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerStaticWeb } from "./static-web.js";
import { shutdownScheduler, startScheduler } from "./scheduler.js";
import { runMigrations } from "./migrations.js";
import { initializeDatabase, shutdownSqliteDatabase } from "./db-sqlite.js";

const config = getConfig();

const app = Fastify({
  logger: true
});

app.addHook("onRequest", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

await initializeDatabase();

let shuttingDown = false;
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Graceful shutdown started");
  try {
    await shutdownScheduler(5000);
    await app.close();
    await shutdownSqliteDatabase();
    app.log.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGTERM", (signal) => { void gracefulShutdown(signal); });
process.once("SIGINT", (signal) => { void gracefulShutdown(signal); });

await registerRoutes(app);
if (config.serveWeb) {
  registerStaticWeb(app, config.webDistDir);
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API listening on http://${config.host}:${config.port}`);
  if (config.serveWeb) {
    app.log.info(`Serving Web UI from ${config.webDistDir}`);
  }
  // Apply one-shot data migrations (idempotent).
  await runMigrations({
    info: (msg) => app.log.info(msg),
    warn: (msg) => app.log.warn(msg)
  });
  // Self-heal running/queued tasks from last crash/restart.
  const { healTaskStates } = await import("./executor.js");
  await healTaskStates();
  // Start the cron-style scheduler (idempotent).
  startScheduler();
  app.log.info("Scheduler started");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
