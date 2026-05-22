/**
 * 引擎入口：执行 Playbook 并通过回调推送进度
 */

import fs from "node:fs/promises";
import { Client } from "ssh2";
import path from "node:path";
import { resolveFromRoot } from "../repo.js";
import { decryptStoredFields } from "../connections.js";
import type { StoredConnection } from "../runtime-store.js";
import { Ssh2Executor } from "./ssh-executor.js";
import { parsePlaybook, runPlaybook, type RunOptions, type RunResult } from "./runner.js";
import { readUserKey } from "../key-store.js";

export type { Playbook, Task, ModuleResult, TaskExecutionLog } from "./types.js";
export type { RunOptions, RunResult };
export { parsePlaybook, runPlaybook };

/** 读取 catalog 中的 playbook YAML 文件（优先 admin override，回退到基线） */
export async function loadPlaybookFromCatalog(playbookId: string): Promise<string> {
  const { resolvePlaybookYaml } = await import("../catalog-overrides.js");
  return await resolvePlaybookYaml(playbookId);
}

/** 检查 catalog 中是否存在对应的 playbook（含 override） */
export async function hasPlaybook(playbookId: string): Promise<boolean> {
  const { hasResolvedPlaybook } = await import("../catalog-overrides.js");
  return await hasResolvedPlaybook(playbookId);
}

/** 通过已保存的连接执行 Playbook YAML */
export async function executePlaybook(
  yamlText: string,
  connection: StoredConnection,
  options: RunOptions
): Promise<RunResult> {
  const playbook = parsePlaybook(yamlText);

  const client = await connectSsh(connection);
  try {
    const executor = new Ssh2Executor(client);
    return await runPlaybook(playbook, executor, options);
  } finally {
    client.end();
  }
}

/**
 * 批量执行多个 Playbook，复用同一个 SSH 连接（高性能 + 减少 sudo 提示）
 *
 * @param items 要顺序执行的 playbook 列表，每项含 catalogId 和 displayName
 * @param connection 已保存的 SSH 连接
 * @param options dryRun 标志和进度回调（每个 item 开始/结束时触发，每个 task 也会触发）
 */
export interface BatchItemProgress {
  itemIndex: number;
  itemId: string;
  itemName: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  ok_count: number;
  changed: number;
  failed: number;
  error?: string;
}

export interface BatchRunOptions {
  dryRun: boolean;
  /** 每个 item 状态变化时触发 */
  onItemProgress?: (progress: BatchItemProgress) => void;
  /** 每个 item 内的 task 进度（与单 playbook 相同） */
  onTaskProgress?: (itemIndex: number, log: import("./types.js").TaskExecutionLog) => void;
  /** 检查取消标志 */
  isCancelled?: () => boolean;
}

export interface BatchRunResult {
  ok: boolean;
  totalItems: number;
  succeededItems: number;
  failedItems: number;
  itemResults: BatchItemProgress[];
}

export async function executeBatchPlaybooks(
  items: Array<{ catalogId: string; displayName: string }>,
  connection: StoredConnection,
  options: BatchRunOptions
): Promise<BatchRunResult> {
  const itemResults: BatchItemProgress[] = items.map((item, index) => ({
    itemIndex: index,
    itemId: item.catalogId,
    itemName: item.displayName,
    status: "pending",
    ok_count: 0,
    changed: 0,
    failed: 0
  }));

  // 一次 SSH 连接复用所有 item
  let client: Client;
  try {
    client = await connectSsh(connection);
  } catch (err) {
    // 连接失败：所有 item 标记为失败
    for (const result of itemResults) {
      result.status = "failed";
      result.error = err instanceof Error ? err.message : "SSH connect failed";
      options.onItemProgress?.(result);
    }
    return { ok: false, totalItems: items.length, succeededItems: 0, failedItems: items.length, itemResults };
  }

  const executor = new Ssh2Executor(client);

  try {
    for (let i = 0; i < items.length; i++) {
      // 检查取消
      if (options.isCancelled?.()) {
        for (let j = i; j < itemResults.length; j++) {
          itemResults[j].status = "skipped";
          options.onItemProgress?.(itemResults[j]);
        }
        break;
      }

      const item = items[i];
      const result = itemResults[i];
      result.status = "running";
      options.onItemProgress?.(result);

      try {
        if (!(await hasPlaybook(item.catalogId))) {
          result.status = "failed";
          result.error = `Playbook not found: ${item.catalogId}`;
          options.onItemProgress?.(result);
          continue;
        }

        const yamlText = await loadPlaybookFromCatalog(item.catalogId);
        const playbook = parsePlaybook(yamlText);

        const runResult = await runPlaybook(playbook, executor, {
          dryRun: options.dryRun,
          onProgress: (log) => options.onTaskProgress?.(i, log)
        });

        result.ok_count = runResult.ok_count;
        result.changed = runResult.changed;
        result.failed = runResult.failed;

        if (runResult.ok) {
          result.status = "succeeded";
        } else {
          result.status = "failed";
          result.error = runResult.error;
        }
        options.onItemProgress?.(result);
      } catch (err) {
        result.status = "failed";
        result.error = err instanceof Error ? err.message : "Unknown error";
        options.onItemProgress?.(result);
      }
    }
  } finally {
    client.end();
  }

  const succeededItems = itemResults.filter((r) => r.status === "succeeded").length;
  const failedItems = itemResults.filter((r) => r.status === "failed").length;

  return {
    ok: failedItems === 0,
    totalItems: items.length,
    succeededItems,
    failedItems,
    itemResults
  };
}

async function connectSsh(connection: StoredConnection): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => { client.destroy(); reject(new Error("SSH connection timed out (10s)")); }, 10000);

    client.on("ready", () => { clearTimeout(timer); resolve(client); });
    client.on("error", (err) => { clearTimeout(timer); reject(err); });

    const decrypted = decryptStoredFields(connection.fields);
    const host = decrypted.host;
    const port = parseInt(decrypted.port ?? "22", 10) || 22;
    const username = decrypted.username;

    const connectConfig: Record<string, unknown> = { host, port, username };

    if (connection.method === "ssh-key") {
      const keyId = decrypted._keyId;
      if (keyId) {
        // Use Web-uploaded key from key-store
        readUserKey(connection.userId, keyId).then((privateKey) => {
          connectConfig.privateKey = Buffer.from(privateKey, "utf8");
          const passphrase = decrypted._rawPassphrase;
          if (passphrase) connectConfig.passphrase = passphrase;
          client.connect(connectConfig as Parameters<Client["connect"]>[0]);
        }).catch((err) => {
          clearTimeout(timer);
          reject(new Error(`Failed to load SSH key: ${err instanceof Error ? err.message : err}`));
        });
        return;
      }
      const keyPath = decrypted.privateKeyPath;
      if (!keyPath) {
        clearTimeout(timer);
        reject(new Error("SSH key path not configured"));
        return;
      }
      fs.readFile(keyPath, "utf8").then((privateKey) => {
        connectConfig.privateKey = privateKey;
        const passphrase = decrypted._rawPassphrase;
        if (passphrase) connectConfig.passphrase = passphrase;
        client.connect(connectConfig as Parameters<Client["connect"]>[0]);
      }).catch((err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to read SSH key: ${err.message}`));
      });
    } else {
      const password = decrypted._rawPassword;
      if (!password) {
        clearTimeout(timer);
        reject(new Error("No stored password (please reconnect)"));
        return;
      }
      connectConfig.password = password;
      client.connect(connectConfig as Parameters<Client["connect"]>[0]);
    }
  });
}
