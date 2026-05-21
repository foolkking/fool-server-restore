/**
 * task-queue.ts — 按 connectionId 互斥的任务队列
 *
 * 规则：
 * - 一个 connectionId 同时只允许一个任务在 running
 * - 多个任务针对同一 connectionId → FIFO 排队
 * - 不同 connectionId 完全并行（一个用户对多个 VM 跑同一 Playbook 不互相阻塞）
 * - 用户跨用户也按 connectionId 互斥（避免两个用户同时改一台机器）
 */

interface QueueEntry {
  taskId: string;
  userId: string;
  connectionId: string;
  enqueuedAt: string;
  run: () => Promise<void>;
  /** 通知前端任务从 queued → running 的回调（可选） */
  onStart?: () => void;
}

// 每个 connectionId 的等待队列
const queues = new Map<string, QueueEntry[]>();
// 每个 connectionId 是否正在 drain
const draining = new Map<string, boolean>();
// taskId → 取消标志（用于队列中尚未运行的任务）
const cancelledQueued = new Set<string>();

/** 把任务加入对应 connectionId 的队列；返回入队前的位置（0=马上跑，N=前面有 N 个等待） */
export function enqueueTask(entry: QueueEntry): number {
  const list = queues.get(entry.connectionId) ?? [];
  const isRunningOrDraining = draining.get(entry.connectionId) === true;
  const positionAhead = list.length + (isRunningOrDraining ? 1 : 0);
  list.push(entry);
  queues.set(entry.connectionId, list);
  // 异步开始 drain
  void drain(entry.connectionId);
  return positionAhead;
}

async function drain(connectionId: string): Promise<void> {
  if (draining.get(connectionId)) return;
  draining.set(connectionId, true);
  try {
    while (true) {
      const list = queues.get(connectionId) ?? [];
      const next = list.shift();
      if (!next) break;
      queues.set(connectionId, list);

      // 跳过已取消的排队任务
      if (cancelledQueued.has(next.taskId)) {
        cancelledQueued.delete(next.taskId);
        continue;
      }

      try {
        next.onStart?.();
        await next.run();
      } catch {
        // run() 内部应已捕获错误并写入 task 状态；这里再吞一层防止队列卡死
      }
    }
    queues.delete(connectionId);
  } finally {
    draining.set(connectionId, false);
  }
}

/** 当前 taskId 在队列里的位置（0-based）；-1 表示已经在跑或不在队列 */
export function getQueuePosition(connectionId: string, taskId: string): number {
  const list = queues.get(connectionId) ?? [];
  const idx = list.findIndex((e) => e.taskId === taskId);
  return idx;
}

/** 当前 connectionId 上是否有任务在跑 */
export function isConnectionBusy(connectionId: string): boolean {
  return draining.get(connectionId) === true;
}

/** 标记排队中的任务为已取消；如果任务已经开始 running，调用方应另用 cancelTask 设 cancelFlag */
export function cancelQueuedTask(connectionId: string, taskId: string): boolean {
  const list = queues.get(connectionId) ?? [];
  const idx = list.findIndex((e) => e.taskId === taskId);
  if (idx >= 0) {
    list.splice(idx, 1);
    queues.set(connectionId, list);
    cancelledQueued.add(taskId);
    return true;
  }
  return false;
}

/** 调试 / 监控：返回所有连接的队列概要 */
export function getQueueSnapshot(): Array<{ connectionId: string; running: boolean; queued: number }> {
  const out: Array<{ connectionId: string; running: boolean; queued: number }> = [];
  const allKeys = new Set<string>([...queues.keys(), ...draining.keys()]);
  for (const cid of allKeys) {
    out.push({
      connectionId: cid,
      running: draining.get(cid) === true,
      queued: queues.get(cid)?.length ?? 0
    });
  }
  return out;
}
