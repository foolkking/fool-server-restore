/**
 * email/queue.ts — in-memory FIFO email queue with retry + log writer.
 *
 * Architecture choice: keep it simple — single-process queue, drains every
 * 5 seconds via `setInterval`. No durable storage; if the server crashes,
 * pending emails are lost. This is acceptable for the email types we send
 * (verification codes, notifications) — users can always re-trigger them.
 *
 * If/when EnvForge needs at-least-once email delivery, replace this with a
 * persistent queue (BullMQ on Redis, or just append unsent items to
 * runtime-db.json). The public API stays the same: `enqueueEmail()`.
 *
 * Failure handling:
 *   - Up to 3 attempts per item (immediate, +5s, +30s gaps within the same drain
 *     loop iterations). After 3 failed attempts, drop with a stderr warning.
 *   - Each attempt result (success or final failure) writes one EmailDeliveryLog
 *     entry to runtime-db.json.
 *
 * Rate limiting is checked at enqueue time against the persisted log; over-limit
 * sends are dropped before they ever hit the queue (with a stderr warning).
 */
import { createId } from "../runtime-store.js";
import { getConfig } from "../config.js";
import { readRuntimeDatabase, updateRuntimeDatabase } from "../runtime-store.js";
import { getEmailTransport, getDefaultFromHeader } from "./smtp.js";
import { evaluateRateLimit } from "./rate-limit.js";
import { renderTemplate, type TemplateContext } from "./render.js";

export interface EnqueueEmailInput {
  to: string;
  /** Internal user id. Pass when known; helps with rate-limit attribution. */
  userId?: string;
  /** Template id under apps/api/src/email/templates/. */
  templateId: string;
  /** Context vars referenced by the template. */
  context: TemplateContext;
  /** Optional custom From header. Defaults to getDefaultFromHeader(). */
  from?: string;
}

interface QueuedItem extends EnqueueEmailInput {
  attempts: number;
  enqueuedAt: number;
}

const MAX_ATTEMPTS = 3;
const MAX_LOG_ENTRIES = 200; // bound runtime-db.json growth

const queue: QueuedItem[] = [];
let drainTimer: NodeJS.Timeout | null = null;
let draining = false;

/** Stats useful for tests + admin dashboard. */
export interface EmailQueueStats {
  queueLength: number;
  draining: boolean;
}

export function getEmailQueueStats(): EmailQueueStats {
  return { queueLength: queue.length, draining };
}

/**
 * Try to enqueue an email. Returns `false` if rate-limited (caller should
 * surface a friendly error to the user).
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<boolean> {
  // Augment context with publicBaseUrl by default — every email links back home.
  const context: TemplateContext = {
    publicBaseUrl: getConfig().publicBaseUrl,
    ...input.context
  };

  // Check rate limit against the persisted log.
  const allowed = await checkRateLimitAndMaybeLogReject(input);
  if (!allowed) return false;

  queue.push({ ...input, context, attempts: 0, enqueuedAt: Date.now() });
  ensureDrainScheduled();
  return true;
}

/**
 * Check rate-limit before queueing. On rejection, write a fail entry to the
 * email log so the admin can see "we tried to send X but were over quota".
 *
 * Exposed for tests so they can verify the rate-limit decision + fail-log
 * write without going through the actual queue drain (which would need to
 * mock SMTP transport).
 */
export async function checkRateLimitAndMaybeLogReject(input: EnqueueEmailInput): Promise<boolean> {
  const db = await readRuntimeDatabase();
  const decision = evaluateRateLimit({
    log: db.emailLog ?? [],
    recipient: { userId: input.userId, email: input.to },
    limit: getConfig().emailRatePerUserPerHour
  });
  if (decision.allowed) return true;
  console.warn(
    `[email] rate-limit dropped: to=${input.to} type=${input.templateId} ` +
    `(${decision.countInWindow}/${decision.limit} in last hour)`
  );
  await writeLog({
    userId: input.userId,
    email: input.to,
    type: input.templateId,
    success: false,
    errorMessage: `rate-limited (${decision.countInWindow}/${decision.limit})`
  });
  return false;
}

/** Idempotent — start the drain loop if not already running. Called from server.ts. */
export function startEmailQueue(intervalMs = 5000): void {
  if (drainTimer) return;
  drainTimer = setInterval(() => {
    void drainOnce();
  }, intervalMs);
  // Don't keep the process alive solely on the queue timer.
  drainTimer.unref?.();
}

export function stopEmailQueue(): void {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}

function ensureDrainScheduled(): void {
  // If the timer is already running, the next tick will pick it up. If not
  // (e.g. tests calling enqueueEmail without calling startEmailQueue), we
  // still want a drain; do it asynchronously.
  if (drainTimer) return;
  // Small async drain — no timer registered, but we attempt a one-shot drain
  // so unit tests can `await` enqueue then check log.
  setImmediate(() => {
    void drainOnce();
  });
}

async function drainOnce(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await deliverItem(item);
    }
  } finally {
    draining = false;
  }
}

async function deliverItem(item: QueuedItem): Promise<void> {
  const transport = getEmailTransport();

  // No SMTP configured: log to stdout in a developer-friendly format.
  // This is a degraded but functional mode for local dev; production must configure SMTP.
  if (!transport) {
    try {
      const rendered = await renderTemplate(item.templateId, item.context);
      console.log(
        `[email:stdout-fallback] no SMTP configured\n` +
        `  to: ${item.to}\n` +
        `  subject: ${rendered.subject}\n` +
        `  body:\n${rendered.text.split("\n").map((l) => "    " + l).join("\n")}`
      );
      await writeLog({
        userId: item.userId,
        email: item.to,
        type: item.templateId,
        success: true,
        errorMessage: "stdout-fallback (no SMTP configured)"
      });
    } catch (err) {
      console.error(`[email:stdout-fallback] template render failed: ${asMessage(err)}`);
      await writeLog({
        userId: item.userId,
        email: item.to,
        type: item.templateId,
        success: false,
        errorMessage: `template render failed: ${asMessage(err)}`
      });
    }
    return;
  }

  // Real SMTP path with retries
  while (item.attempts < MAX_ATTEMPTS) {
    item.attempts += 1;
    try {
      const rendered = await renderTemplate(item.templateId, item.context);
      await transport.sendMail({
        from: item.from ?? getDefaultFromHeader(),
        to: item.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
      await writeLog({
        userId: item.userId,
        email: item.to,
        type: item.templateId,
        success: true
      });
      return;
    } catch (err) {
      if (item.attempts >= MAX_ATTEMPTS) {
        console.warn(
          `[email] giving up after ${MAX_ATTEMPTS} attempts: to=${item.to} type=${item.templateId} err=${asMessage(err)}`
        );
        await writeLog({
          userId: item.userId,
          email: item.to,
          type: item.templateId,
          success: false,
          errorMessage: `send failed (${item.attempts} attempts): ${asMessage(err)}`
        });
        return;
      }
      // Brief backoff between attempts within the same drain.
      const delay = item.attempts === 1 ? 5000 : 30_000;
      await sleep(delay);
    }
  }
}

async function writeLog(entry: {
  userId?: string;
  email: string;
  type: string;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  await updateRuntimeDatabase((db) => {
    if (!db.emailLog) db.emailLog = [];
    db.emailLog.push({
      id: createId("email"),
      userId: entry.userId,
      email: entry.email,
      type: entry.type,
      sentAt: new Date().toISOString(),
      success: entry.success,
      errorMessage: entry.errorMessage?.slice(0, 500)
    });
    // Bound storage: keep only most recent entries.
    if (db.emailLog.length > MAX_LOG_ENTRIES) {
      db.emailLog = db.emailLog.slice(-MAX_LOG_ENTRIES);
    }
  });
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test-only — wait for the queue to fully drain. */
export async function waitForEmailQueueDrain(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while ((queue.length > 0 || draining) && Date.now() - start < timeoutMs) {
    await sleep(50);
  }
  if (queue.length > 0 || draining) {
    throw new Error(`email queue did not drain within ${timeoutMs}ms`);
  }
}

/** Test-only — clear queue + reset state. */
export function resetEmailQueueForTests(): void {
  queue.length = 0;
  draining = false;
  stopEmailQueue();
}
