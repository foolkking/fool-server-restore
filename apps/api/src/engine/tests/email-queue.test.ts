/**
 * P1.4 — email/queue.ts test (lightweight).
 *
 * The queue is a stateful module that depends on the runtime-store singleton +
 * a setInterval timer + nodemailer transport. Full integration tests would need
 * a Vitest-style module mocking framework which we don't have set up.
 *
 * Approach: cover what's actually testable without that:
 *   1. Importing the module exposes the expected public surface
 *   2. Stats start zeroed
 *   3. Start/stop control the timer cleanly
 *
 * The render + rate-limit pieces are tested in their own files, and the smoke
 * test in new-deps-smoke.test.ts proves nodemailer transport works end-to-end.
 *
 * The actual rate-limited-enqueue + drain-to-log path is exercised in the real
 * server at boot (P1.5 will add an integration test once the verify-register
 * route is wired up — that test goes through HTTP and avoids the singleton trap
 * by using the singleton itself).
 */
import test from "node:test";
import assert from "node:assert/strict";

test("queue: module exposes expected public API", async () => {
  const mod = await import("../../email/queue.js");
  assert.equal(typeof mod.enqueueEmail, "function");
  assert.equal(typeof mod.startEmailQueue, "function");
  assert.equal(typeof mod.stopEmailQueue, "function");
  assert.equal(typeof mod.getEmailQueueStats, "function");
  assert.equal(typeof mod.waitForEmailQueueDrain, "function");
  assert.equal(typeof mod.resetEmailQueueForTests, "function");
});

test("queue: getEmailQueueStats reports queueLength=0 when idle", async () => {
  const { getEmailQueueStats, resetEmailQueueForTests } = await import("../../email/queue.js");
  resetEmailQueueForTests();
  const stats = getEmailQueueStats();
  assert.equal(stats.queueLength, 0);
  assert.equal(stats.draining, false);
});

test("queue: startEmailQueue + stopEmailQueue do not throw and are idempotent", async () => {
  const { startEmailQueue, stopEmailQueue, resetEmailQueueForTests } = await import("../../email/queue.js");
  resetEmailQueueForTests();

  // Calling start multiple times should be a no-op
  startEmailQueue(60_000);
  startEmailQueue(60_000);

  // Stopping should clean up
  stopEmailQueue();
  stopEmailQueue();
});
