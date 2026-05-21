import test from "node:test";
import assert from "node:assert/strict";
import { parseCron, validateCron, nextRunAfter, matches } from "../../cron.js";

test("cron parser: rejects bad expressions", () => {
  assert.ok(validateCron("* * * *") !== null);
  assert.ok(validateCron("* * * * * *") !== null);
  assert.ok(validateCron("60 * * * *") !== null);
  assert.ok(validateCron("a b c d e") !== null);
});

test("cron parser: accepts simple expressions", () => {
  assert.equal(validateCron("* * * * *"), null);
  assert.equal(validateCron("0 3 * * *"), null);
  assert.equal(validateCron("*/5 * * * *"), null);
  assert.equal(validateCron("0 9-17 * * 1-5"), null);
});

test("cron parser: */5 generates 0,5,10,...,55 minutes", () => {
  const p = parseCron("*/5 * * * *");
  const minutes = [...p.minute].sort((a, b) => a - b);
  assert.deepEqual(minutes, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
});

test("cron parser: 0 9-17 * * 1-5 — business hours", () => {
  const p = parseCron("0 9-17 * * 1-5");
  assert.deepEqual([...p.minute], [0]);
  assert.deepEqual([...p.hour].sort((a, b) => a - b), [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual([...p.dayOfWeek].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("matches: 0 3 * * * fires at exactly 03:00 UTC", () => {
  const p = parseCron("0 3 * * *");
  assert.equal(matches(new Date(Date.UTC(2026, 4, 22, 3, 0)), p), true);
  assert.equal(matches(new Date(Date.UTC(2026, 4, 22, 3, 1)), p), false);
  assert.equal(matches(new Date(Date.UTC(2026, 4, 22, 4, 0)), p), false);
});

test("nextRunAfter: 0 0 * * * — daily midnight", () => {
  const from = new Date(Date.UTC(2026, 4, 22, 14, 30, 0));
  const next = nextRunAfter("0 0 * * *", from);
  assert.ok(next);
  assert.equal(next.getUTCHours(), 0);
  assert.equal(next.getUTCMinutes(), 0);
  // Should be the NEXT day
  assert.equal(next.getUTCDate(), 23);
});

test("nextRunAfter: */15 * * * * — within the next 15 minutes", () => {
  const from = new Date(Date.UTC(2026, 4, 22, 14, 7, 0));
  const next = nextRunAfter("*/15 * * * *", from);
  assert.ok(next);
  // After 14:07, next slot is 14:15
  assert.equal(next.getUTCHours(), 14);
  assert.equal(next.getUTCMinutes(), 15);
});

test("nextRunAfter: 0 9-17 * * 1-5 — skips weekend", () => {
  // Friday 2026-05-22 18:00 UTC → next is Monday 2026-05-25 09:00
  const friday = new Date(Date.UTC(2026, 4, 22, 18, 0, 0));
  const next = nextRunAfter("0 9-17 * * 1-5", friday);
  assert.ok(next);
  assert.equal(next.getUTCDay(), 1); // Monday
  assert.equal(next.getUTCHours(), 9);
});
