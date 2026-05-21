/**
 * config-files.ts — 远程配置文件管理
 *
 * 功能：
 * - 根据已安装软件列出关联的配置文件（路径 + 大小 + 修改时间）
 * - 读取指定配置文件内容（sudo cat）
 * - 写入配置文件（sudo tee）
 * - 用户级 dotfiles 采集
 */

import { Client } from "ssh2";
import type { StoredConnection } from "./runtime-store.js";
import { decryptStoredFields } from "./connections.js";
import { readUserKey } from "./key-store.js";
import fs from "node:fs/promises";

/** 软件名 → 关联配置文件路径 */
const SOFTWARE_CONFIG_MAP: Record<string, string[]> = {
  nginx: ["/etc/nginx/nginx.conf", "/etc/nginx/sites-enabled/default"],
  redis: ["/etc/redis/redis.conf"],
  "redis-server": ["/etc/redis/redis.conf"],
  mysql: ["/etc/mysql/mysql.conf.d/mysqld.cnf", "/etc/mysql/my.cnf"],
  "mysql-server": ["/etc/mysql/mysql.conf.d/mysqld.cnf", "/etc/mysql/my.cnf"],
  postgresql: ["/etc/postgresql/*/main/postgresql.conf", "/etc/postgresql/*/main/pg_hba.conf"],
  postgres: ["/etc/postgresql/*/main/postgresql.conf", "/etc/postgresql/*/main/pg_hba.conf"],
  ssh: ["/etc/ssh/sshd_config"],
  "openssh-server": ["/etc/ssh/sshd_config"],
  sshd: ["/etc/ssh/sshd_config"],
  docker: ["/etc/docker/daemon.json"],
  "docker-ce": ["/etc/docker/daemon.json"],
  fail2ban: ["/etc/fail2ban/jail.local", "/etc/fail2ban/jail.conf"],
  ufw: ["/etc/ufw/user.rules", "/etc/ufw/user6.rules"],
  caddy: ["/etc/caddy/Caddyfile"],
  prometheus: ["/etc/prometheus/prometheus.yml"],
  grafana: ["/etc/grafana/grafana.ini"],
  "x-ui": ["/usr/local/x-ui/config.json", "/etc/x-ui/x-ui.db"],
};

/** 通用系统配置文件（始终采集） */
const SYSTEM_CONFIGS = [
  "/etc/hosts",
  "/etc/sysctl.conf",
  "/etc/fstab",
  "/etc/crontab",
  "/etc/environment",
  "/etc/security/limits.conf",
];

/** 用户级 dotfiles（始终采集） */
const USER_DOTFILES = [
  "~/.bashrc",
  "~/.bash_profile",
  "~/.bash_aliases",
  "~/.profile",
  "~/.zshrc",
  "~/.gitconfig",
  "~/.gitignore_global",
  "~/.vimrc",
  "~/.tmux.conf",
  "~/.npmrc",
  "~/.ssh/config",
  "~/.config/pip/pip.conf",
  "~/.config/nvim/init.vim",
  "~/.cargo/config.toml",
  "~/.docker/config.json",
];

/** 排除的路径（安全考虑） */
const EXCLUDED_PATHS = [
  "/etc/shadow", "/etc/gshadow", "/etc/ssl/private",
  "/etc/pki/", "/etc/machine-id",
];

export interface ConfigFileInfo {
  path: string;
  size: number;
  modifiedAt: string;
  category: "system" | "user" | "app";
  associatedSoftware?: string;
}

export interface ConfigFileContent {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
  encoding: "utf8";
}

/**
 * 列出连接对应 VM 上的所有可管理配置文件
 */
export async function listConfigFiles(
  connection: StoredConnection,
  installedSoftware: string[]
): Promise<ConfigFileInfo[]> {
  const client = await connectForConfig(connection);
  try {
    // Build list of paths to check
    const pathsToCheck: Array<{ path: string; category: "system" | "user" | "app"; software?: string }> = [];

    // System configs
    for (const p of SYSTEM_CONFIGS) {
      pathsToCheck.push({ path: p, category: "system" });
    }

    // User dotfiles
    for (const p of USER_DOTFILES) {
      pathsToCheck.push({ path: p, category: "user" });
    }

    // Software-specific configs
    for (const sw of installedSoftware) {
      const paths = SOFTWARE_CONFIG_MAP[sw.toLowerCase()];
      if (paths) {
        for (const p of paths) {
          pathsToCheck.push({ path: p, category: "app", software: sw });
        }
      }
    }

    // Build a single SSH command to stat all files
    const statScript = pathsToCheck.map(({ path }) => {
      const expanded = path.startsWith("~") ? path : path;
      // Handle glob patterns
      if (path.includes("*")) {
        return `for f in ${expanded}; do [ -f "$f" ] && stat --format='%n|%s|%Y' "$f" 2>/dev/null; done`;
      }
      return `[ -f ${expanded} ] && stat --format='%n|%s|%Y' ${expanded} 2>/dev/null || true`;
    }).join("\n");

    // Also find modified package config files using dpkg-query
    const dpkgScript = `dpkg-query -W -f='\${Conffiles}\\n' '*' 2>/dev/null | awk 'OFS=" "{print $2,$1}' | md5sum -c 2>/dev/null | awk -F: '$2!~ /OK/{print $1}' | head -30`;

    const script = `HOME_DIR=$(echo ~)\n${statScript.replace(/~/g, '$HOME_DIR')}\necho "===MODIFIED==="\n${dpkgScript}`;
    const { stdout } = await execOnClient(client, script);

    const results: ConfigFileInfo[] = [];
    const [mainOutput, modifiedOutput] = stdout.split("===MODIFIED===");

    for (const line of (mainOutput ?? "").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("|")) continue;
      const parts = trimmed.split("|");
      if (parts.length < 3) continue;
      const filePath = parts[0];
      const size = parseInt(parts[1], 10) || 0;
      const mtime = parseInt(parts[2], 10) || 0;

      // Skip excluded paths
      if (EXCLUDED_PATHS.some((ex) => filePath.startsWith(ex))) continue;
      // Skip files > 50KB
      if (size > 50 * 1024) continue;

      // Find category and software
      const match = pathsToCheck.find((p) => {
        if (p.path.includes("*")) {
          const prefix = p.path.split("*")[0];
          return filePath.startsWith(prefix.replace("~", ""));
        }
        return filePath === p.path.replace("~", "") || filePath.endsWith(p.path.replace("~/", ""));
      });

      results.push({
        path: filePath,
        size,
        modifiedAt: new Date(mtime * 1000).toISOString(),
        category: match?.category ?? "system",
        associatedSoftware: match?.software,
      });
    }

    // Add modified package config files (from dpkg-query)
    for (const line of (modifiedOutput ?? "").split("\n")) {
      const filePath = line.trim();
      if (!filePath || !filePath.startsWith("/")) continue;
      if (EXCLUDED_PATHS.some((ex) => filePath.startsWith(ex))) continue;
      if (results.find((r) => r.path === filePath)) continue; // already listed
      results.push({
        path: filePath,
        size: 0,
        modifiedAt: new Date().toISOString(),
        category: "system",
        associatedSoftware: undefined,
      });
    }

    return results;
  } finally {
    client.end();
  }
}

/**
 * 读取指定配置文件内容
 */
export async function readConfigFile(
  connection: StoredConnection,
  filePath: string
): Promise<ConfigFileContent> {
  // Security check
  if (EXCLUDED_PATHS.some((ex) => filePath.startsWith(ex))) {
    throw new Error(`Access denied: ${filePath}`);
  }
  if (!filePath.startsWith("/") && !filePath.startsWith("~")) {
    throw new Error(`Invalid path: ${filePath}`);
  }

  const client = await connectForConfig(connection);
  try {
    const expandedPath = filePath.startsWith("~")
      ? filePath  // will be expanded in script
      : filePath;

    const script = filePath.startsWith("~")
      ? `HOME_DIR=$(echo ~); cat "$HOME_DIR${filePath.slice(1)}" 2>/dev/null`
      : `sudo cat "${expandedPath}" 2>/dev/null`;

    const { stdout, exitCode } = await execOnClient(client, script);
    if (exitCode !== 0 && !stdout) {
      throw new Error(`Cannot read ${filePath}: file not found or permission denied`);
    }

    // Get file info
    const statScript = filePath.startsWith("~")
      ? `HOME_DIR=$(echo ~); stat --format='%s|%Y' "$HOME_DIR${filePath.slice(1)}" 2>/dev/null`
      : `sudo stat --format='%s|%Y' "${expandedPath}" 2>/dev/null`;
    const { stdout: statOut } = await execOnClient(client, statScript);
    const [sizeStr, mtimeStr] = (statOut.trim()).split("|");

    return {
      path: filePath,
      content: stdout,
      size: parseInt(sizeStr ?? "0", 10) || stdout.length,
      modifiedAt: new Date((parseInt(mtimeStr ?? "0", 10) || 0) * 1000).toISOString(),
      encoding: "utf8",
    };
  } finally {
    client.end();
  }
}

/**
 * 写入配置文件内容（支持 sudo）
 */
export async function writeConfigFile(
  connection: StoredConnection,
  filePath: string,
  content: string,
  backup = true
): Promise<{ success: boolean; message: string }> {
  // Security check
  if (EXCLUDED_PATHS.some((ex) => filePath.startsWith(ex))) {
    throw new Error(`Access denied: ${filePath}`);
  }

  const client = await connectForConfig(connection);
  try {
    const needsSudo = filePath.startsWith("/etc/") || filePath.startsWith("/usr/") || filePath.startsWith("/var/");

    // Backup if requested
    if (backup) {
      const backupCmd = needsSudo
        ? `sudo cp "${filePath}" "${filePath}.bak" 2>/dev/null || true`
        : `cp "${filePath}" "${filePath}.bak" 2>/dev/null || true`;
      await execOnClient(client, backupCmd);
    }

    // Write content using base64 to avoid escaping issues
    const b64 = Buffer.from(content, "utf8").toString("base64");
    const writeCmd = needsSudo
      ? `echo '${b64}' | base64 -d | sudo tee "${filePath}" > /dev/null`
      : `echo '${b64}' | base64 -d > "${filePath}"`;

    const { exitCode, stderr } = await execOnClient(client, writeCmd);
    if (exitCode !== 0) {
      throw new Error(`Write failed: ${stderr || "permission denied"}`);
    }

    return { success: true, message: `Written ${content.length} bytes to ${filePath}` };
  } finally {
    client.end();
  }
}

// ── SSH helpers ──

async function connectForConfig(connection: StoredConnection): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => { client.destroy(); reject(new Error("SSH timeout")); }, 10000);

    client.on("ready", () => { clearTimeout(timer); resolve(client); });
    client.on("error", (err) => { clearTimeout(timer); reject(err); });

    const decrypted = decryptStoredFields(connection.fields);
    const host = decrypted.host;
    const port = parseInt(decrypted.port ?? "22", 10) || 22;
    const username = decrypted.username;

    const cfg: Record<string, unknown> = { host, port, username, readyTimeout: 10000 };

    if (connection.method === "ssh-key") {
      const keyId = decrypted._keyId;
      if (keyId) {
        readUserKey(connection.userId, keyId).then((key) => {
          cfg.privateKey = Buffer.from(key, "utf8");
          if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
          client.connect(cfg as any);
        }).catch((err) => { clearTimeout(timer); reject(err); });
        return;
      }
      const keyPath = decrypted.privateKeyPath;
      if (keyPath) {
        fs.readFile(keyPath, "utf8").then((key) => {
          cfg.privateKey = key;
          if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
          client.connect(cfg as any);
        }).catch((err) => { clearTimeout(timer); reject(err); });
        return;
      }
      clearTimeout(timer);
      reject(new Error("No SSH key configured"));
    } else {
      const password = decrypted._rawPassword;
      if (!password) { clearTimeout(timer); reject(new Error("No password")); return; }
      cfg.password = password;
      client.connect(cfg as any);
    }
  });
}

function execOnClient(client: Client, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) { reject(err); return; }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { stream.destroy(); resolve({ stdout, stderr, exitCode: -1 }); }, 30000);
      stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      stream.on("close", (code: number) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? 0 }); });
    });
  });
}
