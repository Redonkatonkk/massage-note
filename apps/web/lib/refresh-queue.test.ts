import { expect, it } from "vitest";
import { createRefreshQueue } from "./refresh-queue";

it("collapses bursts, never overlaps reads, and rereads after a mid-flight change", async () => {
  const releases: Array<() => void> = [];
  let calls = 0;
  const queue = createRefreshQueue(() => {
    calls += 1;
    return new Promise<void>(resolve => releases.push(resolve));
  });
  const first = queue.request();
  queue.request();
  await Promise.resolve();
  expect(calls).toBe(1);
  for (let i = 0; i < 20; i++) queue.request();
  expect(calls).toBe(1);
  releases.shift()!();
  await Promise.resolve();
  expect(calls).toBe(2);
  releases.shift()!();
  await first;
  expect(calls).toBe(2);
});

it("drops queued work when leaving a store", async () => {
  let release!: () => void;
  let calls = 0;
  const queue = createRefreshQueue(() => { calls++; return new Promise<void>(resolve => { release = resolve; }); });
  const done = queue.request();
  await Promise.resolve();
  queue.request();
  queue.dispose();
  release();
  await done;
  await queue.request();
  expect(calls).toBe(1);
});

it("allows retry after a failed read", async () => {
  let calls = 0;
  const queue = createRefreshQueue(async () => { if (++calls === 1) throw new Error("offline"); });
  await expect(queue.request()).rejects.toThrow("offline");
  await queue.request();
  expect(calls).toBe(2);
});
