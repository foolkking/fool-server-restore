/**
 * ssh-pool.ts — single SSH client construction helper.
 *
 * For now this is a thin wrapper around the connection logic that was duplicated across
 * routes.ts, capture.ts, config-files.ts. A future enhancement would be a real keepalive
 * pool (connection reuse with a 5-minute idle TTL) — see ARCHITECTURE.md.
 */

import { Client } from "ssh2";
import fs from "node:fs/promises";
import { decryptStoredFields } from "./connections.js";
import { readUserKey } from "./key-store.js";
import type { StoredConnection } from "./runtime-store.js";

const READY_TIMEOUT_MS = 10_000;

export async function connectSshForConnection(conn: StoredConnection, userId: string): Promise<Client> {
  const decrypted = decryptStoredFields(conn.fields);
  return new Promise<Client>((resolve, reject) => {
    const c = new Client();
    const timer = setTimeout(() => { c.destroy(); reject(new Error("SSH timeout")); }, READY_TIMEOUT_MS);
    c.on("ready", () => { clearTimeout(timer); resolve(c); });
    c.on("error", (err) => { clearTimeout(timer); reject(err); });

    const cfg: Record<string, unknown> = {
      host: decrypted.host,
      port: parseInt(decrypted.port ?? "22", 10) || 22,
      username: decrypted.username,
      readyTimeout: READY_TIMEOUT_MS,
      keepaliveInterval: 30_000,
      keepaliveCountMax: 3
    };

    if (conn.method === "ssh-key") {
      const keyId = decrypted._keyId;
      if (keyId) {
        readUserKey(userId, keyId).then((pk) => {
          cfg.privateKey = Buffer.from(pk, "utf8");
          if (decrypted._rawPassphrase) cfg.passphrase = decrypted._rawPassphrase;
          c.connect(cfg as Parameters<Client["connect"]>[0]);
        }).catch((err: Error) => { clearTimeout(timer); reject(err); });
      } else if (decrypted.privateKeyPath) {
        fs.readFile(decrypted.privateKeyPath, "utf8").then((pk) => {
          cfg.privateKey = pk;
          c.connect(cfg as Parameters<Client["connect"]>[0]);
        }).catch((err: Error) => { clearTimeout(timer); reject(err); });
      } else {
        clearTimeout(timer);
        reject(new Error("No SSH key configured"));
      }
    } else {
      cfg.password = decrypted._rawPassword;
      if (!cfg.password) { clearTimeout(timer); reject(new Error("No password")); return; }
      c.connect(cfg as Parameters<Client["connect"]>[0]);
    }
  });
}
