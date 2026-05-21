/**
 * Tests for task-queue.ts — per-connectionId FIFO mutex
 */
import test from "node:test";
import assert from "node:assert/strict";
import { enqueueTask, isConnectionBusy, cancelQueuedTask, getQueueSnapshot } from "../../task-queue.js";

test("task-queue: same connection runs serially", async () => {
  const order: string[] = [];
  const cid = "conn-A";
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  enqueueTask({
    taskId: "t1",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { order.push("t1-start"); await wait(40); order.push("t1-end"); }
  });
  enqueueTask({
    taskId: "t2",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { order.push("t2-start"); await wait(20); order.push("t2-end"); }
  });

  // Wait for both to complete
  while (isConnectionBusy(cid)) await wait(10);

  assert.deepEqual(order, ["t1-start", "t1-end", "t2-start", "t2-end"]);
});

test("task-queue: different connections run in parallel", async () => {
  const order: string[] = [];
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  enqueueTask({
    taskId: "p1",
    userId: "u",
    connectionId: "conn-X",
    enqueuedAt: new Date().toISOString(),
    run: async () => { order.push("X-start"); await wait(40); order.push("X-end"); }
  });
  enqueueTask({
    taskId: "p2",
    userId: "u",
    connectionId: "conn-Y",
    enqueuedAt: new Date().toISOString(),
    run: async () => { order.push("Y-start"); await wait(40); order.push("Y-end"); }
  });

  while (isConnectionBusy("conn-X") || isConnectionBusy("conn-Y")) await wait(10);

  // Both starts must come before either end (interleaved = parallel)
  const xStartIdx = order.indexOf("X-start");
  const yStartIdx = order.indexOf("Y-start");
  const xEndIdx = order.indexOf("X-end");
  const yEndIdx = order.indexOf("Y-end");
  assert.ok(xStartIdx < yEndIdx, "X started before Y ended (parallel)");
  assert.ok(yStartIdx < xEndIdx, "Y started before X ended (parallel)");
});

test("task-queue: enqueue returns position-ahead correctly", async () => {
  const cid = "conn-pos";
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const blocker = new Promise<void>((resolve) => {
    enqueueTask({
      taskId: "blocker",
      userId: "u",
      connectionId: cid,
      enqueuedAt: new Date().toISOString(),
      run: async () => { await wait(60); resolve(); }
    });
  });

  // Give the runner a tick to mark draining=true
  await wait(5);

  const pos2 = enqueueTask({
    taskId: "after-1",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { /* noop */ }
  });
  // blocker is running (1 ahead), no one else queued → pos = 1
  assert.equal(pos2, 1);

  const pos3 = enqueueTask({
    taskId: "after-2",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { /* noop */ }
  });
  assert.equal(pos3, 2);

  await blocker;
  while (isConnectionBusy(cid)) await wait(10);
});

test("task-queue: cancelQueuedTask removes task without running it", async () => {
  const cid = "conn-cancel";
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let cancelledRan = false;

  enqueueTask({
    taskId: "blocker2",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { await wait(40); }
  });

  await wait(5);

  enqueueTask({
    taskId: "to-cancel",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { cancelledRan = true; }
  });

  const removed = cancelQueuedTask(cid, "to-cancel");
  assert.equal(removed, true);

  while (isConnectionBusy(cid)) await wait(10);
  assert.equal(cancelledRan, false);
});

test("task-queue: getQueueSnapshot reports running and queued counts", async () => {
  const cid = "conn-snap";
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  enqueueTask({
    taskId: "s1",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { await wait(30); }
  });
  enqueueTask({
    taskId: "s2",
    userId: "u",
    connectionId: cid,
    enqueuedAt: new Date().toISOString(),
    run: async () => { /* noop */ }
  });

  await wait(5);
  const snap = getQueueSnapshot().find((s) => s.connectionId === cid);
  assert.ok(snap);
  assert.equal(snap.running, true);
  assert.equal(snap.queued, 1); // s2 is waiting (s1 running)

  while (isConnectionBusy(cid)) await wait(10);
});
