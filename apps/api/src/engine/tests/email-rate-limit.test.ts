/**
 * P1.4 — email/rate-limit.ts unit tests.
 *
 * Covers:
 *   - Allows under-limit
 *   - Denies at-or-over-limit
 *   - Counts only successful sends (failures don't penalize)
 *   - Rolling 1-hour window — older entries don't count
 *   - Matches by userId (preferred) and by email (registration flow)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRateLimit } from "../../email/rate-limit.js";
import type { EmailDeliveryLog } from "../../runtime-store.js";

const NOW = new Date("2026-05-23T12:00:00Z").getTime();

function logEntry(partial: Partial<EmailDeliveryLog> & Pick<EmailDeliveryLog, "email" | "sentAt">): EmailDeliveryLog {
  return {
    id: partial.id ?? "log_" + Math.random().toString(36).slice(2),
    userId: partial.userId,
    email: partial.email,
    type: partial.type ?? "verify-register",
    sentAt: partial.sentAt,
    success: partial.success ?? true,
    errorMessage: partial.errorMessage
  };
}

test("rate-limit: empty log → allowed", () => {
  const r = evaluateRateLimit({
    log: [],
    recipient: { email: "alice@example.com" },
    limit: 30,
    now: NOW
  });
  assert.equal(r.allowed, true);
  assert.equal(r.countInWindow, 0);
});

test("rate-limit: under limit → allowed", () => {
  const log = Array.from({ length: 5 }, (_, i) =>
    logEntry({
      email: "alice@example.com",
      sentAt: new Date(NOW - i * 60_000).toISOString() // every minute back
    })
  );
  const r = evaluateRateLimit({
    log,
    recipient: { email: "alice@example.com" },
    limit: 30,
    now: NOW
  });
  assert.equal(r.allowed, true);
  assert.equal(r.countInWindow, 5);
});

test("rate-limit: at limit → denied", () => {
  const log = Array.from({ length: 30 }, (_, i) =>
    logEntry({
      email: "alice@example.com",
      sentAt: new Date(NOW - i * 60_000).toISOString()
    })
  );
  const r = evaluateRateLimit({
    log,
    recipient: { email: "alice@example.com" },
    limit: 30,
    now: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.countInWindow, 30);
});

test("rate-limit: over limit → denied (window cuts at 1h)", () => {
  // Mix: 30 entries within 30 min + 30 entries 90 min ago (outside window)
  const log = [
    ...Array.from({ length: 30 }, (_, i) =>
      logEntry({
        email: "alice@example.com",
        sentAt: new Date(NOW - i * 60_000).toISOString() // 0..29 min ago
      })
    ),
    ...Array.from({ length: 30 }, (_, i) =>
      logEntry({
        email: "alice@example.com",
        sentAt: new Date(NOW - 90 * 60_000 - i * 60_000).toISOString() // 90..119 min ago
      })
    )
  ];
  const r = evaluateRateLimit({
    log,
    recipient: { email: "alice@example.com" },
    limit: 30,
    now: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.countInWindow, 30, "Window only counts entries within 1h");
});

test("rate-limit: failed sends are NOT counted", () => {
  const log = [
    ...Array.from({ length: 100 }, () =>
      logEntry({
        email: "alice@example.com",
        sentAt: new Date(NOW - 60_000).toISOString(),
        success: false
      })
    )
  ];
  const r = evaluateRateLimit({
    log,
    recipient: { email: "alice@example.com" },
    limit: 30,
    now: NOW
  });
  assert.equal(r.allowed, true);
  assert.equal(r.countInWindow, 0);
});

test("rate-limit: entries older than 1h are excluded", () => {
  const log = [
    logEntry({
      email: "alice@example.com",
      sentAt: new Date(NOW - 3700_000).toISOString() // ~1h2min ago
    })
  ];
  const r = evaluateRateLimit({
    log,
    recipient: { email: "alice@example.com" },
    limit: 30,
    now: NOW
  });
  assert.equal(r.allowed, true);
  assert.equal(r.countInWindow, 0);
});

test("rate-limit: matches by userId when both userId and email don't match", () => {
  const log = [
    logEntry({
      userId: "u1",
      email: "old-address@example.com",
      sentAt: new Date(NOW - 60_000).toISOString()
    })
  ];
  // User changed email; the old log entry should still count toward their cap.
  const r = evaluateRateLimit({
    log,
    recipient: { userId: "u1", email: "new-address@example.com" },
    limit: 1,
    now: NOW
  });
  assert.equal(r.allowed, false, "userId match alone is enough");
  assert.equal(r.countInWindow, 1);
});

test("rate-limit: oldestInWindowAgeMs reports earliest entry's age", () => {
  const log = [
    logEntry({ email: "x@example.com", sentAt: new Date(NOW - 600_000).toISOString() }), // 10 min ago
    logEntry({ email: "x@example.com", sentAt: new Date(NOW - 300_000).toISOString() })  // 5 min ago
  ];
  const r = evaluateRateLimit({
    log,
    recipient: { email: "x@example.com" },
    limit: 30,
    now: NOW
  });
  assert.ok(r.oldestInWindowAgeMs);
  assert.equal(r.oldestInWindowAgeMs, 600_000);
});
