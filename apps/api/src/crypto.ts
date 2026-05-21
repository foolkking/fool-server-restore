/**
 * crypto.ts — 对称加密敏感字段（SSH 密码、密钥密码）
 *
 * 使用 AES-256-GCM 认证加密：
 * - master key 由 .env 的 ENVFORGE_MASTER_KEY 提供
 * - 如果 .env 中没有，自动生成并写入 data/.master-key（仅开发环境，生产应外部提供）
 * - 密文格式：base64(version:1B || iv:12B || authTag:16B || ciphertext:NB)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveFromRoot } from "./repo.js";

const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = 0x01;

let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. 优先从环境变量读取（生产环境应这样做）
  const fromEnv = process.env.ENVFORGE_MASTER_KEY;
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length !== KEY_LENGTH) {
      throw new Error(`ENVFORGE_MASTER_KEY must be ${KEY_LENGTH} bytes (base64-encoded). Got ${buf.length}.`);
    }
    cachedKey = buf;
    return buf;
  }

  // 2. 否则从 data/.master-key 读取或自动生成（开发场景）
  const keyPath = resolveFromRoot("data/.master-key");
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, "utf8").trim();
    const buf = Buffer.from(raw, "base64");
    if (buf.length === KEY_LENGTH) {
      cachedKey = buf;
      return buf;
    }
  }

  // 自动生成并保存
  const generated = crypto.randomBytes(KEY_LENGTH);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, generated.toString("base64"), { mode: 0o600 });
  cachedKey = generated;
  return generated;
}

/**
 * 加密敏感字符串。返回 base64 编码的密文，带 "enc:v1:" 前缀以便识别。
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([Buffer.from([VERSION]), iv, authTag, encrypted]);
  return `enc:v1:${payload.toString("base64")}`;
}

/**
 * 解密。如果输入不是加密格式（例如旧数据），原样返回。
 */
export function decryptSecret(value: string): string {
  if (!value || !value.startsWith("enc:v1:")) return value;
  const key = getMasterKey();
  const payload = Buffer.from(value.slice("enc:v1:".length), "base64");

  if (payload.length < 1 + IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted payload: too short.");
  }
  const version = payload[0];
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Returns true if the value is in encrypted format. */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith("enc:v1:");
}
