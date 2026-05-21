/**
 * webhooks.ts — outbound HTTPS notifications on task / drift / schedule events
 *
 * Each user can register N webhooks. A webhook subscribes to a set of event types.
 * On event: POST JSON to the URL with optional HMAC-SHA256 signature header.
 *
 * Failures are logged on the webhook record (lastDeliveryStatus + lastDeliveryError).
 * No retry queue here — webhooks are best-effort. Critical events should also be in task history.
 */

import { createHmac } from "node:crypto";
import { readRuntimeDatabase, updateRuntimeDatabase, type StoredWebhook } from "./runtime-store.js";

export type WebhookEventType = StoredWebhook["events"][number];

export interface WebhookEvent {
  /** Unique event id; useful for receiver deduplication */
  id: string;
  type: WebhookEventType;
  firedAt: string;
  /** Source user id (do not leak email/personal data) */
  userId: string;
  data: Record<string, unknown>;
}

/** Look up all enabled webhooks subscribed to this event type, then POST to each. */
export async function fireWebhooks(
  userId: string,
  type: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const db = await readRuntimeDatabase();
  const subs = (db.webhooks ?? []).filter((w) => w.userId === userId && w.enabled && w.events.includes(type));
  if (subs.length === 0) return;

  const event: WebhookEvent = {
    id: `evt_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
    type,
    firedAt: new Date().toISOString(),
    userId,
    data
  };

  // Fire all in parallel; failures don't block other deliveries
  await Promise.all(subs.map((hook) => deliverOne(hook, event)));
}

async function deliverOne(hook: StoredWebhook, event: WebhookEvent): Promise<void> {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "EnvForge/1.0 webhook",
    "X-EnvForge-Event": event.type,
    "X-EnvForge-Event-Id": event.id
  };
  if (hook.secret) {
    const sig = createHmac("sha256", hook.secret).update(body).digest("hex");
    headers["X-EnvForge-Signature"] = `sha256=${sig}`;
  }

  let status: "success" | "failed" = "failed";
  let error: string | undefined;

  try {
    // Reject non-HTTPS / non-HTTP URLs and any private/loopback hostnames? For self-hosted
    // tools it's fine to allow http://localhost (some users want that). We block file://, etc.
    const url = new URL(hook.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      status = "success";
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Record outcome
  await updateRuntimeDatabase((db) => {
    const target = (db.webhooks ?? []).find((w) => w.id === hook.id);
    if (target) {
      target.lastDeliveryAt = new Date().toISOString();
      target.lastDeliveryStatus = status;
      target.lastDeliveryError = error;
    }
  });
}
