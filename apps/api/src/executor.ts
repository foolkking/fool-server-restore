/**
 * executor.ts — 任务执行器（使用 Playbook 引擎）
 */

import { Client } from "ssh2";
import fs from "node:fs/promises";
import { createId, readRuntimeDatabase, updateRuntimeDatabase, type StoredConnection, type StoredUserProfile, type StoredTaskHistory } from "./runtime-store.js";
import { decryptStoredFields } from "./connections.js";
import { readUserKey } from "./key-store.js";
import { executePlaybook, executeBatchPlaybooks, loadPlaybookFromCatalog, hasPlaybook, parsePlaybook, type BatchItemProgress, type BatchRunOptions } from "./engine/index.js";
import type { TaskExecutionLog } from "./engine/types.js";
import { enqueueTask, cancelQueuedTask, getQueuePosition, isConnectionBusy } from "./task-queue.js";

// ── 任务数据结构 ──────────────────────────────────────────

export interface TaskStep {
  id: string;
  label: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  durationMs: number;
  itemIndex?: number;
}

export interface BatchItem {
  index: number;
  catalogId: string;
  displayName: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  error?: string;
}

export interface ExecutionTask {
  id: string;
  userId: string;
  connectionId: string;
  profileId: string;
  kind: "install-software" | "apply-combo" | "deploy-snapshot" | "batch-install";
  status: "queued" | "pending" | "running" | "succeeded" | "failed" | "cancelled";
  /** 排队中时，前面还有几个任务（0 = 马上轮到） */
  queuePosition?: number;
  steps: TaskStep[];
  items?: BatchItem[];
  dryRun: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

const taskStore = new Map<string, ExecutionTask>();
const taskSubscribers = new Map<string, Array<(task: ExecutionTask) => void>>();
const cancelFlags = new Map<string, boolean>();

// ── Public API ──────────────────────────────────────────

export function registerBatchTask(
  userId: string,
  connectionId: string,
  items: Array<{ catalogId: string; displayName: string }>,
  dryRun: boolean
): string {
  const taskId = createId("task");
  const task: ExecutionTask = {
    id: taskId,
    userId,
    connectionId,
    profileId: items[0]?.catalogId ?? "batch",
    kind: "batch-install",
    status: "pending",
    steps: [],
    items: items.map((item, index) => ({ index, catalogId: item.catalogId, displayName: item.displayName, status: "pending" })),
    dryRun,
    createdAt: new Date().toISOString()
  };
  taskStore.set(taskId, task);
  return taskId;
}

export async function executeBatchCatalogTask(
  userId: string,
  connection: StoredConnection,
  items: Array<{ catalogId: string; displayName: string }>,
  dryRun: boolean,
  taskId?: string
): Promise<ExecutionTask> {
  if (!taskId) taskId = registerBatchTask(userId, connection.id, items, dryRun);
  const task = taskStore.get(taskId)!;

  // Enqueue (per-connection FIFO). If another task is already running on this
  // connection, this one will sit as "queued" until its turn.
  const positionAhead = enqueueTask({
    taskId: task.id,
    userId,
    connectionId: connection.id,
    enqueuedAt: new Date().toISOString(),
    onStart: () => {
      task.status = "running";
      task.queuePosition = undefined;
      task.startedAt = new Date().toISOString();
      notifySubscribers(task.id, task);
    },
    run: async () => {
      try {
        await executeBatchPlaybooks(items, connection, {
          dryRun,
          isCancelled: () => cancelFlags.get(task.id) === true,
          onItemProgress: (progress: BatchItemProgress) => {
            if (!task.items) return;
            const slot = task.items[progress.itemIndex];
            if (slot) { slot.status = progress.status; slot.error = progress.error; }
            notifySubscribers(task.id, task);
          },
          onTaskProgress: (itemIndex, log) => {
            const existing = task.steps.find((s) => s.itemIndex === itemIndex && s.label === log.taskName);
            if (existing) {
              existing.status = mapStatus(log.status);
              existing.stdout = log.result?.stdout || log.result?.msg || "";
              existing.stderr = log.result?.stderr ?? "";
              existing.durationMs = log.durationMs ?? 0;
              existing.exitCode = log.result?.failed ? 1 : 0;
            } else {
              task.steps.push({
                id: createId("step"),
                label: log.taskName,
                command: log.command || log.moduleName,
                stdout: log.result?.stdout || log.result?.msg || "",
                stderr: log.result?.stderr ?? "",
                exitCode: log.result?.failed ? 1 : 0,
                status: mapStatus(log.status),
                durationMs: log.durationMs ?? 0,
                itemIndex
              });
            }
            notifySubscribers(task.id, task);
          }
        });

        const failed = task.items?.filter((i) => i.status === "failed").length ?? 0;
        task.status = cancelFlags.get(task.id) ? "cancelled" : failed > 0 ? "failed" : "succeeded";
        if (failed > 0) task.error = `${failed} of ${task.items?.length ?? 0} items failed`;
      } catch (err) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : "Unknown error";
      } finally {
        cancelFlags.delete(task.id);
      }

      task.completedAt = new Date().toISOString();
      notifySubscribers(task.id, task);
      void persistTaskToHistory(task);
    }
  });

  if (positionAhead > 0) {
    task.status = "queued";
    task.queuePosition = positionAhead;
    notifySubscribers(task.id, task);
  }

  return task;
}

export async function executeCatalogTask(
  userId: string,
  connection: StoredConnection,
  catalogId: string,
  catalogName: string,
  dryRun: boolean,
  taskId?: string
): Promise<ExecutionTask> {
  return executeBatchCatalogTask(userId, connection, [{ catalogId, displayName: catalogName }], dryRun, taskId);
}

/** Execute a raw YAML playbook on a connection */
export async function executePlaybookTask(
  userId: string,
  connection: StoredConnection,
  yamlText: string,
  dryRun: boolean,
  taskId?: string
): Promise<ExecutionTask> {
  if (!taskId) taskId = registerBatchTask(userId, connection.id, [{ catalogId: "playbook", displayName: "Playbook" }], dryRun);
  const task = taskStore.get(taskId)!;

  const positionAhead = enqueueTask({
    taskId: task.id,
    userId,
    connectionId: connection.id,
    enqueuedAt: new Date().toISOString(),
    onStart: () => {
      task.status = "running";
      task.queuePosition = undefined;
      task.startedAt = new Date().toISOString();
      notifySubscribers(task.id, task);
    },
    run: async () => {
      try {
        const result = await executePlaybook(yamlText, connection, {
          dryRun,
          onProgress: (log) => {
            const existing = task.steps.find((s) => s.label === log.taskName);
            if (existing) {
              existing.status = mapStatus(log.status);
              existing.stdout = log.result?.stdout || log.result?.msg || "";
              existing.stderr = log.result?.stderr ?? "";
              existing.durationMs = log.durationMs ?? 0;
            } else {
              task.steps.push({
                id: createId("step"),
                label: log.taskName,
                command: log.command || log.moduleName,
                stdout: log.result?.stdout || log.result?.msg || "",
                stderr: log.result?.stderr ?? "",
                exitCode: log.result?.failed ? 1 : 0,
                status: mapStatus(log.status),
                durationMs: log.durationMs ?? 0,
                itemIndex: 0
              });
            }
            notifySubscribers(task.id, task);
          }
        });
        task.status = result.ok ? "succeeded" : "failed";
        if (!result.ok) task.error = result.error;
        if (task.items?.[0]) { task.items[0].status = result.ok ? "succeeded" : "failed"; task.items[0].error = result.error; }
      } catch (err) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : "Unknown error";
        if (task.items?.[0]) { task.items[0].status = "failed"; task.items[0].error = task.error; }
      }

      task.completedAt = new Date().toISOString();
      notifySubscribers(task.id, task);
      void persistTaskToHistory(task);
    }
  });

  if (positionAhead > 0) {
    task.status = "queued";
    task.queuePosition = positionAhead;
    notifySubscribers(task.id, task);
  }

  return task;
}

export function cancelTask(taskId: string) {
  const task = taskStore.get(taskId);
  if (task && task.status === "queued") {
    // Remove from queue without ever running
    if (cancelQueuedTask(task.connectionId, taskId)) {
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      notifySubscribers(taskId, task);
      void persistTaskToHistory(task);
      return;
    }
  }
  // Otherwise let the running task observe the flag
  cancelFlags.set(taskId, true);
}
export function getTask(taskId: string): ExecutionTask | undefined { return taskStore.get(taskId); }

export function subscribeTask(taskId: string, cb: (task: ExecutionTask) => void): () => void {
  const subs = taskSubscribers.get(taskId) ?? [];
  subs.push(cb);
  taskSubscribers.set(taskId, subs);
  return () => { taskSubscribers.set(taskId, (taskSubscribers.get(taskId) ?? []).filter((s) => s !== cb)); };
}

export function notifySubscribersPublic(taskId: string, task: ExecutionTask) { notifySubscribers(taskId, task); }

// ── Legacy functions (kept for compatibility) ──

export function buildInstallTask(userId: string, connection: StoredConnection, profile: StoredUserProfile, dryRun: boolean): ExecutionTask {
  return { id: createId("task"), userId, connectionId: connection.id, profileId: profile.id, kind: "install-software", status: "pending", steps: [], dryRun, createdAt: new Date().toISOString() };
}

export function buildSnapshotDeployTask(userId: string, connection: StoredConnection, profile: StoredUserProfile, dryRun: boolean): ExecutionTask {
  return { id: createId("task"), userId, connectionId: connection.id, profileId: profile.id, kind: "deploy-snapshot", status: "pending", steps: [], dryRun, createdAt: new Date().toISOString() };
}

export async function executeTask(task: ExecutionTask, _connection: StoredConnection): Promise<ExecutionTask> {
  taskStore.set(task.id, task);
  task.status = "succeeded";
  task.completedAt = new Date().toISOString();
  notifySubscribers(task.id, task);
  return task;
}

export function buildPlaybookFromProfile(profile: StoredUserProfile): string {
  const tasks: string[] = [];
  const pkgs = profile.components.filter((c) => c.type === "software").map((c) => c.label.split(" ")[0]);
  if (pkgs.length > 0) {
    tasks.push(`  - name: Install packages\n    module: package\n    args:\n      name:\n${pkgs.map((p) => `        - ${p}`).join("\n")}\n      state: present`);
  }
  for (const comp of profile.components.filter((c) => c.type === "system-command")) {
    tasks.push(`  - name: ${comp.label}\n    module: shell\n    args:\n      cmd: "${comp.detail}"`);
  }
  return `name: ${profile.name}\nhosts: all\n\ntasks:\n${tasks.join("\n\n")}\n`;
}

// ── Helpers ──

function mapStatus(s: TaskExecutionLog["status"]): TaskStep["status"] {
  if (s === "ok" || s === "changed") return "succeeded";
  if (s === "failed") return "failed";
  if (s === "skipped") return "skipped";
  if (s === "running") return "running";
  return "pending";
}

function notifySubscribers(taskId: string, task: ExecutionTask) {
  for (const sub of taskSubscribers.get(taskId) ?? []) sub(task);
}

// ── Task history persistence ──

async function persistTaskToHistory(task: ExecutionTask): Promise<void> {
  try {
    await updateRuntimeDatabase((db) => {
      if (!db.tasks) db.tasks = [];
      db.tasks.unshift({
        id: task.id,
        userId: task.userId,
        connectionId: task.connectionId,
        source: task.profileId,
        sourceKind: "catalog",
        status: task.status as "running" | "succeeded" | "failed" | "cancelled",
        dryRun: task.dryRun,
        steps: task.steps.map((s) => ({
          name: s.label,
          module: s.command,
          status: s.status === "succeeded" ? "ok" as const : s.status === "failed" ? "failed" as const : s.status === "skipped" ? "skipped" as const : "ok" as const,
          durationMs: s.durationMs,
          msg: s.stdout?.slice(0, 200) || undefined
        })),
        startedAt: task.startedAt ?? task.createdAt,
        completedAt: task.completedAt,
        error: task.error
      });
      // Keep only last 200 tasks
      if (db.tasks.length > 200) db.tasks = db.tasks.slice(0, 200);

      // Increment catalog install counters for any successfully-installed catalog items.
      if (task.status === "succeeded" && !task.dryRun && task.items) {
        if (!db.catalogStats) db.catalogStats = {};
        for (const item of task.items) {
          if (item.status !== "succeeded") continue;
          if (!item.catalogId || item.catalogId === "playbook" || item.catalogId === "uninstall") continue;
          const existing = db.catalogStats[item.catalogId] ?? { installs: 0, lastInstalledAt: "" };
          existing.installs += 1;
          existing.lastInstalledAt = task.completedAt ?? new Date().toISOString();
          db.catalogStats[item.catalogId] = existing;
        }
      }
    });
  } catch { /* ignore persistence errors */ }

  // Fire webhooks (best-effort, non-blocking from caller's perspective).
  try {
    const { fireWebhooks } = await import("./webhooks.js");
    const eventType = task.status === "succeeded" ? "task.completed" : task.status === "failed" ? "task.failed" : null;
    if (eventType) {
      await fireWebhooks(task.userId, eventType, {
        taskId: task.id,
        connectionId: task.connectionId,
        kind: task.kind,
        status: task.status,
        dryRun: task.dryRun,
        durationMs: task.completedAt && task.startedAt
          ? new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
          : undefined,
        items: task.items?.map((i) => ({ catalogId: i.catalogId, status: i.status })) ?? undefined,
        error: task.error
      });
    }
  } catch { /* webhooks are best-effort */ }
}
