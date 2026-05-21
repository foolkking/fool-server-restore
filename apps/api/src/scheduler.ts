/**
 * scheduler.ts — Cron-style Playbook scheduler
 *
 * On startup, kicks off a 30-second tick. On each tick:
 *   - For each enabled schedule whose nextRunAt has passed:
 *     - Build the target connection list
 *     - Fire executePlaybookTask (or executeBatchCatalogTask for catalog ids)
 *     - Update lastRunAt / lastStatus / nextRunAt
 *
 * We keep granularity at 1 minute; cron expressions support sub-hour steps but the 30s tick
 * plus nextRunAfter() ensures every minute boundary is checked at least once.
 *
 * Stored in runtime-db so schedules survive restart.
 */

import { nextRunAfter, validateCron } from "./cron.js";
import { readRuntimeDatabase, updateRuntimeDatabase, type StoredSchedule } from "./runtime-store.js";
import { fireWebhooks } from "./webhooks.js";

const TICK_INTERVAL_MS = 30_000;
let tickerHandle: NodeJS.Timeout | null = null;

/** Start the scheduler. Idempotent. */
export function startScheduler(): void {
  if (tickerHandle) return;
  // Initialize nextRunAt for any schedule that doesn't have one
  void initializeNextRunTimes();
  tickerHandle = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
  // Fire one tick on startup so a missed schedule from before-restart catches up
  void tick();
}

export function stopScheduler(): void {
  if (tickerHandle) {
    clearInterval(tickerHandle);
    tickerHandle = null;
  }
}

async function initializeNextRunTimes(): Promise<void> {
  await updateRuntimeDatabase((db) => {
    if (!db.schedules) return;
    const now = new Date();
    for (const sch of db.schedules) {
      if (!sch.enabled) continue;
      if (sch.nextRunAt && new Date(sch.nextRunAt).getTime() > now.getTime()) continue;
      const next = nextRunAfter(sch.cron, now);
      sch.nextRunAt = next ? next.toISOString() : undefined;
    }
  });
}

async function tick(): Promise<void> {
  const now = new Date();
  const db = await readRuntimeDatabase();
  const due: StoredSchedule[] = (db.schedules ?? []).filter((s) => {
    if (!s.enabled) return false;
    if (!s.nextRunAt) return false;
    return new Date(s.nextRunAt).getTime() <= now.getTime();
  });
  if (due.length === 0) return;

  for (const sch of due) {
    try {
      await fireSchedule(sch);
    } catch (err) {
      // Log to schedule itself
      await updateRuntimeDatabase((dbu) => {
        const target = (dbu.schedules ?? []).find((s) => s.id === sch.id);
        if (target) {
          target.lastRunAt = new Date().toISOString();
          target.lastStatus = "failed";
          // Reschedule for next slot anyway so we don't loop on the same failure
          const next = nextRunAfter(target.cron, new Date());
          target.nextRunAt = next ? next.toISOString() : undefined;
        }
      });
      // eslint-disable-next-line no-console
      console.error(`[scheduler] schedule ${sch.id} failed:`, err);
    }
  }
}

async function fireSchedule(sch: StoredSchedule): Promise<void> {
  const db = await readRuntimeDatabase();
  // Resolve target connections
  let targets = db.connections.filter((c) => c.userId === sch.userId);
  if (sch.connectionIds.length > 0) {
    targets = targets.filter((c) => sch.connectionIds.includes(c.id));
  } else if (sch.tags.length > 0) {
    targets = targets.filter((c) => c.tags?.some((t) => sch.tags.includes(t)));
  }
  if (targets.length === 0) {
    // Nothing to do — still advance nextRunAt
    await updateRuntimeDatabase((dbu) => {
      const t = (dbu.schedules ?? []).find((s) => s.id === sch.id);
      if (t) {
        t.lastRunAt = new Date().toISOString();
        t.lastStatus = "skipped";
        const next = nextRunAfter(t.cron, new Date());
        t.nextRunAt = next ? next.toISOString() : undefined;
      }
    });
    return;
  }

  // Resolve YAML
  let yamlText: string | null = null;
  if (sch.playbookId) {
    const pb = (db.playbooks ?? []).find((p) => p.id === sch.playbookId && p.userId === sch.userId);
    yamlText = pb?.yaml ?? null;
  }
  // catalogId path is handled directly in executor via batch
  const { executePlaybookTask, executeBatchCatalogTask, registerBatchTask } = await import("./executor.js");

  const taskIds: string[] = [];
  for (const conn of targets) {
    if (sch.catalogId) {
      const taskId = registerBatchTask(
        sch.userId,
        conn.id,
        [{ catalogId: sch.catalogId, displayName: `${sch.name} (scheduled)` }],
        sch.dryRun
      );
      void executeBatchCatalogTask(
        sch.userId,
        conn,
        [{ catalogId: sch.catalogId, displayName: sch.name }],
        sch.dryRun,
        taskId
      );
      taskIds.push(taskId);
    } else if (yamlText) {
      const taskId = registerBatchTask(
        sch.userId,
        conn.id,
        [{ catalogId: "scheduled-playbook", displayName: sch.name }],
        sch.dryRun
      );
      void executePlaybookTask(sch.userId, conn, yamlText, sch.dryRun, taskId);
      taskIds.push(taskId);
    }
  }

  // Update schedule state
  await updateRuntimeDatabase((dbu) => {
    const t = (dbu.schedules ?? []).find((s) => s.id === sch.id);
    if (t) {
      t.lastRunAt = new Date().toISOString();
      t.lastStatus = taskIds.length > 0 ? "succeeded" : "skipped";
      const next = nextRunAfter(t.cron, new Date());
      t.nextRunAt = next ? next.toISOString() : undefined;
    }
  });

  // Fire webhook if subscribed
  await fireWebhooks(sch.userId, "schedule.fired", {
    scheduleId: sch.id,
    scheduleName: sch.name,
    targets: targets.map((c) => ({ id: c.id, label: c.label })),
    taskIds,
    firedAt: new Date().toISOString()
  });
}

/** Validate a schedule input before saving. Returns error string or null. */
export function validateScheduleInput(input: Partial<StoredSchedule>): string | null {
  if (!input.name?.trim()) return "Schedule name is required.";
  if (!input.cron?.trim()) return "Cron expression is required.";
  const cronErr = validateCron(input.cron);
  if (cronErr) return cronErr;
  if (!input.playbookId && !input.catalogId) {
    return "Either playbookId or catalogId is required.";
  }
  if (input.playbookId && input.catalogId) {
    return "Only one of playbookId or catalogId may be set.";
  }
  return null;
}
