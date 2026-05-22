import Fastify from "fastify";
import { getConfig } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerStaticWeb } from "./static-web.js";
import { startScheduler } from "./scheduler.js";
import { runMigrations } from "./migrations.js";

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
  // Start the cron-style scheduler (idempotent).
  startScheduler();
  app.log.info("Scheduler started");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
