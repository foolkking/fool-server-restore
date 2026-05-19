/**
 * mock-agent — 模拟"目标虚拟机"的轻量 HTTP agent
 * 跑在 4001 端口，暴露真实本机系统信息供主服务（4000）查询
 * 不依赖任何 npm 包，纯 Node.js 内置模块
 */

import http from "node:http";
import os from "node:os";
import { execSync } from "node:child_process";

const PORT = process.env.MOCK_AGENT_PORT ? Number(process.env.MOCK_AGENT_PORT) : 4001;
const AGENT_ID = process.env.MOCK_AGENT_ID ?? "mock-agent-local";

// ── 采集函数 ──────────────────────────────────────────────

function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptime: Math.floor(os.uptime()),
    cpu: {
      model: cpus[0]?.model ?? "unknown",
      cores: cpus.length,
      speedMhz: cpus[0]?.speed ?? 0
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: totalMem - freeMem,
      totalGb: (totalMem / 1024 ** 3).toFixed(1),
      freeGb: (freeMem / 1024 ** 3).toFixed(1)
    }
  };
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { timeout: 3000, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getSoftwareVersions() {
  const items = [];

  const node = tryExec("node --version");
  if (node) items.push({ name: "node", version: node.replace(/^v/, ""), source: "runtime", status: "synced" });

  const npm = tryExec("npm --version");
  if (npm) items.push({ name: "npm", version: npm, source: "runtime", status: "synced" });

  const git = tryExec("git --version");
  if (git) items.push({ name: "git", version: git.replace("git version ", ""), source: "system", status: "synced" });

  const docker = tryExec("docker --version");
  if (docker) {
    const match = docker.match(/[\d.]+/);
    items.push({ name: "docker", version: match ? match[0] : docker, source: "system", status: "synced" });
  }

  const python = tryExec("python --version") ?? tryExec("python3 --version");
  if (python) items.push({ name: "python", version: python.replace(/^Python /, ""), source: "system", status: "synced" });

  const pm2 = tryExec("pm2 --version");
  if (pm2) items.push({ name: "pm2", version: pm2, source: "npm", status: "synced" });

  return items;
}

function getConfigChecklist() {
  const items = [];

  // SSH 服务检测（Linux）
  const sshd = tryExec("systemctl is-active sshd 2>/dev/null || sc query sshd 2>nul");
  items.push({
    id: "ssh",
    label: "SSH service",
    category: "security",
    status: sshd && sshd.includes("active") ? "healthy" : "warning",
    lastChanged: new Date().toISOString().slice(0, 10)
  });

  // 环境变量数量
  const envCount = Object.keys(process.env).length;
  items.push({
    id: "env-vars",
    label: `Environment variables (${envCount} set)`,
    category: "runtime",
    status: "healthy",
    lastChanged: new Date().toISOString().slice(0, 10)
  });

  // Node.js 版本检查
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split(".").map(Number);
  items.push({
    id: "node-version",
    label: `Node.js v${nodeVersion}`,
    category: "runtime",
    status: major >= 20 ? "healthy" : "warning",
    lastChanged: new Date().toISOString().slice(0, 10)
  });

  // 磁盘（仅做简单标记）
  items.push({
    id: "disk",
    label: "Disk space",
    category: "service",
    status: "healthy",
    lastChanged: new Date().toISOString().slice(0, 10)
  });

  return items;
}

// ── HTTP 路由 ─────────────────────────────────────────────

function respond(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(json);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /agent/health
  if (url.pathname === "/agent/health") {
    respond(res, 200, { ok: true, agentId: AGENT_ID, port: PORT, time: new Date().toISOString() });
    return;
  }

  // GET /agent/info  — 完整系统快照
  if (url.pathname === "/agent/info") {
    const system = getSystemInfo();
    const software = getSoftwareVersions();
    const configChecklist = getConfigChecklist();
    respond(res, 200, {
      agentId: AGENT_ID,
      collectedAt: new Date().toISOString(),
      system,
      software,
      configChecklist
    });
    return;
  }

  // GET /agent/system
  if (url.pathname === "/agent/system") {
    respond(res, 200, { agentId: AGENT_ID, system: getSystemInfo() });
    return;
  }

  // GET /agent/software
  if (url.pathname === "/agent/software") {
    respond(res, 200, { agentId: AGENT_ID, software: getSoftwareVersions() });
    return;
  }

  // GET /agent/config
  if (url.pathname === "/agent/config") {
    respond(res, 200, { agentId: AGENT_ID, configChecklist: getConfigChecklist() });
    return;
  }

  respond(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-agent] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-agent] Agent ID: ${AGENT_ID}`);
  console.log(`[mock-agent] Endpoints:`);
  console.log(`  GET http://127.0.0.1:${PORT}/agent/health`);
  console.log(`  GET http://127.0.0.1:${PORT}/agent/info`);
  console.log(`  GET http://127.0.0.1:${PORT}/agent/system`);
  console.log(`  GET http://127.0.0.1:${PORT}/agent/software`);
  console.log(`  GET http://127.0.0.1:${PORT}/agent/config`);
});
