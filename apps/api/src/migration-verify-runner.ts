import { Client } from "ssh2";
import type { StoredConnection } from "./runtime-store.js";
import type { MigrationVerificationCheck, MigrationVerificationPreview } from "./migration-verify.js";
import { decryptStoredFields } from "./connections.js";
import { readUserKey } from "./key-store.js";

export interface MigrationVerificationRunResult {
  sourceHost: string;
  generatedAt: string;
  ok: boolean;
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  };
  checks: Array<MigrationVerificationCheck & {
    status: "passed" | "failed" | "skipped";
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
  }>;
}

export async function runMigrationVerificationPreview(
  userId: string,
  connection: StoredConnection,
  preview: MigrationVerificationPreview
): Promise<MigrationVerificationRunResult> {
  const executable = preview.checks.filter((check) => check.command);
  const manual = preview.checks.filter((check) => !check.command);
  const client = await connect(connection, userId);
  const results: MigrationVerificationRunResult["checks"] = [];
  try {
    for (const check of executable) {
      const start = Date.now();
      const result = await exec(client, check.command!);
      results.push({
        ...check,
        status: result.exitCode === 0 ? "passed" : "failed",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - start
      });
    }
  } finally {
    client.end();
  }
  for (const check of manual) {
    results.push({ ...check, status: "skipped", stdout: "", stderr: "", exitCode: null, durationMs: 0 });
  }
  const summary = {
    passed: results.filter((check) => check.status === "passed").length,
    failed: results.filter((check) => check.status === "failed").length,
    skipped: results.filter((check) => check.status === "skipped").length,
    total: results.length
  };
  return {
    sourceHost: preview.sourceHost,
    generatedAt: new Date().toISOString(),
    ok: summary.failed === 0,
    summary,
    checks: results
  };
}

async function connect(connection: StoredConnection, userId: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => { client.destroy(); reject(new Error("SSH timeout")); }, 10000);
    client.on("ready", () => { clearTimeout(timer); resolve(client); });
    client.on("error", (err) => { clearTimeout(timer); reject(err); });

    const decrypted = decryptStoredFields(connection.fields);
    const cfg: Record<string, unknown> = {
      host: decrypted.host,
      port: parseInt(decrypted.port ?? "22", 10) || 22,
      username: decrypted.username,
      readyTimeout: 10000,
      keepaliveInterval: 30000,
      keepaliveCountMax: 3
    };

    if (connection.method === "ssh-key") {
      const keyId = decrypted._keyId;
      if (keyId) {
        readUserKey(userId, keyId)
          .then((key) => {
            cfg.privateKey = Buffer.from(key, "utf8");
            if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
            client.connect(cfg as any);
          })
          .catch((err) => { clearTimeout(timer); reject(err); });
        return;
      }
      reject(new Error("No uploaded SSH key is available for verification."));
      return;
    }

    const password = decrypted._rawPassword;
    if (!password) {
      clearTimeout(timer);
      reject(new Error("No SSH password is available for verification."));
      return;
    }
    cfg.password = password;
    client.connect(cfg as any);
  });
}

function exec(client: Client, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) { reject(err); return; }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        stream.destroy();
        resolve({ stdout, stderr: `${stderr}\nCommand timed out`.trim(), exitCode: 124 });
      }, 15000);
      stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      stream.on("close", (code: number) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  });
}
