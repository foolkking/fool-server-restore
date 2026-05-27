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
import { getConfigDiscoveryRules, ruleSecretPatterns, type CatalogDetectionRule } from "./catalog-rules.js";

export class ConfigConnectionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "ConfigConnectionError";
    this.statusCode = statusCode;
  }
}

/** 软件名 → 关联配置文件路径 */
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
  discovery?: ConfigDiscoveryInfo;
}

export interface ConfigFileContent {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
  encoding: "utf8";
  secretScan?: SecretScanResult;
}

export interface ConfigDiscoveryInfo {
  source: "catalog-rule" | "system-default" | "user-dotfile" | "package-manager-modified";
  ruleId?: string;
  ruleName?: string;
  reasons: string[];
  sensitivity: "safe" | "review" | "secret";
  secretPatterns?: string[];
}

export interface SecretScanResult {
  hasSecrets: boolean;
  hits: Array<{ pattern: string; line: number }>;
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
    const pathsToCheck: Array<{
      path: string;
      category: "system" | "user" | "app";
      software?: string;
      source: ConfigDiscoveryInfo["source"];
      rule?: CatalogDetectionRule;
      isGlob?: boolean;
    }> = [];

    // System configs
    for (const p of SYSTEM_CONFIGS) {
      pathsToCheck.push({ path: p, category: "system", source: "system-default" });
    }

    // User dotfiles
    for (const p of USER_DOTFILES) {
      pathsToCheck.push({ path: p, category: "user", source: "user-dotfile" });
    }

    // Catalog-driven software configs. TypeScript executes rules; the catalog explains software.
    for (const item of getConfigDiscoveryRules(installedSoftware)) {
      pathsToCheck.push({
        path: item.path,
        category: item.category,
        software: item.rule.displayName,
        source: "catalog-rule",
        rule: item.rule,
        isGlob: item.isGlob
      });
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
      // Find category and software
      const match = pathsToCheck.find((p) => {
        if (p.path.includes("*")) {
          const prefix = p.path.split("*")[0];
          return filePath.startsWith(prefix.replace("~", ""));
        }
        return filePath === p.path.replace("~", "") || filePath.endsWith(p.path.replace("~/", ""));
      });
      if (match?.rule?.config?.exclude?.some((ex) => pathMatchesRule(filePath, ex))) continue;
      const maxSizeKb = match?.rule?.config?.maxSizeKB ?? 50;
      if (size > maxSizeKb * 1024) continue;

      results.push({
        path: filePath,
        size,
        modifiedAt: new Date(mtime * 1000).toISOString(),
        category: match?.category ?? "system",
        associatedSoftware: match?.software,
        discovery: buildDiscovery(match, filePath),
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
        discovery: {
          source: "package-manager-modified",
          reasons: ["Package manager reports this conffile differs from the installed default."],
          sensitivity: "review"
        },
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
      secretScan: scanConfigSecrets(stdout),
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

    // Backup if requested — uses stable .envforge.bak suffix, only writes if not already there.
    if (backup) {
      const bakPath = `${filePath}.envforge.bak`;
      const checkCmd = needsSudo
        ? `sudo test -f "${bakPath}" && echo yes`
        : `test -f "${bakPath}" && echo yes`;
      const { exitCode: bakExists } = await execOnClient(client, checkCmd);
      if (bakExists !== 0) {
        const backupCmd = needsSudo
          ? `sudo cp -p "${filePath}" "${bakPath}" 2>/dev/null || true`
          : `cp -p "${filePath}" "${bakPath}" 2>/dev/null || true`;
        await execOnClient(client, backupCmd);
      }
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

/**
 * Read the current file and the EnvForge backup side-by-side so the UI can show a diff
 * between "before EnvForge first wrote" and "current state".
 */
export async function readConfigFileWithBackup(
  connection: StoredConnection,
  filePath: string
): Promise<{
  current: ConfigFileContent;
  backup?: ConfigFileContent & { backupPath: string };
}> {
  const current = await readConfigFile(connection, filePath);
  const bakPath = `${filePath}.envforge.bak`;
  try {
    const backup = await readConfigFile(connection, bakPath);
    return { current, backup: { ...backup, backupPath: bakPath } };
  } catch {
    return { current };
  }
}

// ── SSH helpers ──

export async function getConfigRollbackPreview(
  connection: StoredConnection,
  filePath: string
): Promise<{
  path: string;
  backupPath: string;
  rollbackAvailable: boolean;
  validationHint?: string;
}> {
  const bakPath = `${filePath}.envforge.bak`;
  try {
    await readConfigFile(connection, bakPath);
    return {
      path: filePath,
      backupPath: bakPath,
      rollbackAvailable: true,
      validationHint: validationHintForPath(filePath)
    };
  } catch {
    return {
      path: filePath,
      backupPath: bakPath,
      rollbackAvailable: false,
      validationHint: validationHintForPath(filePath)
    };
  }
}

function validationHintForPath(filePath: string): string | undefined {
  if (filePath.includes("/etc/nginx/")) return "nginx -t";
  if (filePath.includes("/etc/ssh/")) return "sshd -t";
  if (filePath.includes("/etc/redis/")) return "redis-server --test-memory 2";
  if (filePath.includes("/etc/postgresql/")) return "systemctl is-active postgresql";
  if (filePath.includes("/etc/mysql/") || filePath.includes("/etc/mariadb/")) return "mysql --version";
  return undefined;
}

function buildDiscovery(
  match: {
    path: string;
    category: "system" | "user" | "app";
    software?: string;
    source: ConfigDiscoveryInfo["source"];
    rule?: CatalogDetectionRule;
  } | undefined,
  filePath: string
): ConfigDiscoveryInfo {
  if (!match) {
    return {
      source: "system-default",
      reasons: [`${filePath} was discovered by a generic config scan.`],
      sensitivity: "review"
    };
  }
  if (match.rule) {
    return {
      source: "catalog-rule",
      ruleId: match.rule.id,
      ruleName: match.rule.displayName,
      reasons: [
        `Discovered by the ${match.rule.displayName} catalog rule.`,
        "The matched software is present in the latest host inventory.",
        "Migration should follow this rule's validate and restart guidance."
      ],
      sensitivity: match.rule.config?.secretPatterns?.length ? "review" : "safe",
      secretPatterns: ruleSecretPatterns(match.rule)
    };
  }
  if (match.source === "user-dotfile") {
    return {
      source: "user-dotfile",
      reasons: ["Common user-level configuration file, useful for dotfile migration."],
      sensitivity: filePath.includes(".ssh") || filePath.endsWith(".npmrc") ? "review" : "safe",
      secretPatterns: ruleSecretPatterns()
    };
  }
  return {
    source: "system-default",
    reasons: ["Common system configuration file; review before migrating to another host."],
    sensitivity: "review",
    secretPatterns: ruleSecretPatterns()
  };
}

export function scanConfigSecrets(content: string, patterns = ruleSecretPatterns()): SecretScanResult {
  const hits: SecretScanResult["hits"] = [];
  const lines = content.split(/\r?\n/);
  const normalizedPatterns = [...new Set(patterns.filter(Boolean))];
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    for (const pattern of normalizedPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        hits.push({ pattern, line: index + 1 });
      }
    }
  });
  return { hasSecrets: hits.length > 0, hits: hits.slice(0, 50) };
}

function pathMatchesRule(filePath: string, rulePath: string): boolean {
  if (rulePath.includes("*")) {
    const [prefix, suffix = ""] = rulePath.split("*");
    return filePath.startsWith(prefix) && filePath.endsWith(suffix);
  }
  return filePath === rulePath || filePath.startsWith(rulePath);
}

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

    const cfg: Record<string, unknown> = { host, port, username, readyTimeout: 10000, keepaliveInterval: 30000, keepaliveCountMax: 3 };

    if (connection.method === "ssh-key") {
      const keyId = decrypted._keyId;
      if (keyId) {
        readUserKey(connection.userId, keyId).then((key) => {
          cfg.privateKey = Buffer.from(key, "utf8");
          if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
          client.connect(cfg as any);
        }).catch((err) => {
          clearTimeout(timer);
          reject(new ConfigConnectionError(err instanceof Error ? err.message : String(err)));
        });
        return;
      }
      const keyPath = decrypted.privateKeyPath;
      if (keyPath) {
        fs.readFile(keyPath, "utf8").then((key) => {
          cfg.privateKey = key;
          if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
          client.connect(cfg as any);
        }).catch((err) => {
          clearTimeout(timer);
          reject(new ConfigConnectionError(
            `SSH private key path is not readable: ${keyPath}. Re-upload the key or edit the connection.`
          ));
        });
        return;
      }
      clearTimeout(timer);
      reject(new ConfigConnectionError("No SSH key configured. Re-upload the key or edit the connection."));
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
