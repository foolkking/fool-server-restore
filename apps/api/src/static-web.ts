import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

export function registerStaticWeb(app: FastifyInstance, webDistDir: string): void {
  app.get("/*", async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404);
      return { error: "API route not found." };
    }

    return serveStaticAsset(request, reply, webDistDir);
  });
}

async function serveStaticAsset(request: FastifyRequest, reply: FastifyReply, webDistDir: string): Promise<FastifyReply> {
  const url = new URL(request.url, "http://localhost");
  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const candidate = path.resolve(webDistDir, safePath);
  const root = path.resolve(webDistDir);
  const assetPath = candidate.startsWith(root) ? candidate : path.join(root, "index.html");

  try {
    const data = await fs.readFile(assetPath);
    reply.header("Content-Type", contentTypes[path.extname(assetPath)] ?? "application/octet-stream");
    if (assetPath !== path.join(root, "index.html")) {
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
    }
    return reply.send(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const html = await fs.readFile(path.join(root, "index.html"));
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  }
}
