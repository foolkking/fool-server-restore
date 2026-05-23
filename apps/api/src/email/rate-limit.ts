/**
 * email/rate-limit.ts — per-recipient rolling-hour rate limit.
 *
 * Pure function over a slice of EmailDeliveryLog: given a recipient (userId
 * preferred when known, else email address) and the configured cap, decide
 * whether one more send is allowed.
 *
 * NOTE: We count successful sends only — failed deliveries shouldn't penalize
 * the user (otherwise an SMTP outage would lock everyone out for an hour).
 * Failures are still logged but skipped here.
 */
import type { EmailDeliveryLog } from "../runtime-store.js";

export interface RateLimitDecision {
  allowed: boolean;
  /** Number of successful sends in the rolling window. */
  countInWindow: number;
  /** Configured limit. */
  limit: number;
  /** Earliest entry's age in ms (undefined when no entries). Useful for "try again in N min" hints. */
  oldestInWindowAgeMs?: number;
}

export interface RateLimitInput {
  /** All known email log entries; we'll filter to the relevant window/recipient. */
  log: readonly EmailDeliveryLog[];
  /** Match either by userId (preferred) OR email (registration flow). */
  recipient: { userId?: string; email: string };
  /** Cap. Pass `getConfig().emailRatePerUserPerHour`. */
  limit: number;
  /** Window length in ms. Defaults to 1 hour. */
  windowMs?: number;
  /** Reference clock — `Date.now()` in production, fixed value in tests. */
  now?: number;
}

export function evaluateRateLimit(input: RateLimitInput): RateLimitDecision {
  const windowMs = input.windowMs ?? 3600_000;
  const now = input.now ?? Date.now();
  const cutoff = now - windowMs;

  const matches = input.log.filter((entry) => {
    if (!entry.success) return false;
    const ts = new Date(entry.sentAt).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) return false;
    if (input.recipient.userId && entry.userId === input.recipient.userId) return true;
    if (entry.email === input.recipient.email) return true;
    return false;
  });

  const oldestAge =
    matches.length === 0
      ? undefined
      : now - Math.min(...matches.map((m) => new Date(m.sentAt).getTime()));

  return {
    allowed: matches.length < input.limit,
    countInWindow: matches.length,
    limit: input.limit,
    oldestInWindowAgeMs: oldestAge
  };
}
