/**
 * key-store.ts — 用户 SSH 私钥的安全存储
 *
 * 安全设计：
 * - 私钥内容用 AES-256-GCM 加密后存储在 data/keys/<userId>/<keyId>.enc
 * - 文件名不含任何私钥信息
 * - 只有 key owner 可以读取（通过 userId 隔离）
 * - 私钥内容不写入 runtime-db.json（避免 JSON 泄露）
 * - 只在 SSH 连接时临时解密到内存，不写入磁盘明文
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { getConfig } from "./config.js";

export interface StoredKeyMeta {
  id: string;
  userId: string;
  label: string;
  fingerprint: string; // SHA256 of public key (if provided), or first 8 chars of key
  createdAt: string;
}

function keysDir(): string {
  return path.join(getConfig().dataDir, "keys");
}

function keyPath(userId: string, keyId: string): string {
  return path.join(keysDir(), userId, `${keyId}.enc`);
}

function metaPath(userId: string): string {
  return path.join(keysDir(), userId, "meta.json");
}

/** 保存用户上传的 SSH 私钥，返回 keyId */
export async function saveUserKey(
  userId: string,
  label: string,
  privateKeyContent: string
): Promise<StoredKeyMeta> {
  // 基本格式验证
  if (!privateKeyContent.includes("PRIVATE KEY")) {
    throw new Error("Invalid SSH private key format. Expected PEM format.");
  }
  if (privateKeyContent.length > 16_384) {
    throw new Error("Private key too large (max 16KB).");
  }

  const keyId = randomUUID().replace(/-/g, "").slice(0, 16);
  const encrypted = encryptSecret(privateKeyContent);
  const fingerprint = privateKeyContent.slice(0, 40).replace(/\s+/g, "").slice(-8);

  const dir = path.join(keysDir(), userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(keyPath(userId, keyId), encrypted, { mode: 0o600 });

  const meta: StoredKeyMeta = {
    id: keyId,
    userId,
    label: label.trim().slice(0, 80) || "Unnamed key",
    fingerprint,
    createdAt: new Date().toISOString()
  };

  // Update meta file
  const existing = await listUserKeys(userId);
  existing.push(meta);
  await fs.writeFile(metaPath(userId), JSON.stringify(existing, null, 2), { mode: 0o600 });

  return meta;
}

/** 列出用户的所有 SSH 密钥元数据（不含私钥内容） */
export async function listUserKeys(userId: string): Promise<StoredKeyMeta[]> {
  try {
    const raw = await fs.readFile(metaPath(userId), "utf8");
    return JSON.parse(raw) as StoredKeyMeta[];
  } catch {
    return [];
  }
}

/** 读取并解密用户的 SSH 私钥内容（仅在 SSH 连接时调用） */
export async function readUserKey(userId: string, keyId: string): Promise<string> {
  // Validate keyId format to prevent path traversal
  if (!/^[a-f0-9]{16}$/.test(keyId)) {
    throw new Error("Invalid key ID format.");
  }
  const encrypted = await fs.readFile(keyPath(userId, keyId), "utf8");
  return decryptSecret(encrypted);
}

/** 删除用户的 SSH 私钥 */
export async function deleteUserKey(userId: string, keyId: string): Promise<boolean> {
  if (!/^[a-f0-9]{16}$/.test(keyId)) return false;
  try {
    await fs.unlink(keyPath(userId, keyId));
    const existing = await listUserKeys(userId);
    const updated = existing.filter((k) => k.id !== keyId);
    await fs.writeFile(metaPath(userId), JSON.stringify(updated, null, 2), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
