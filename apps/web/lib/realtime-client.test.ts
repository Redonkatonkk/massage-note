import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStoreChannel } from "./realtime-client";

class FakeSource extends EventTarget {
  static instances: FakeSource[] = [];
  onopen?: () => void;
  onerror?: () => void;
  closed = false;
  constructor(public url: string) { super(); FakeSource.instances.push(this); }
  close() { this.closed = true; }
  emit(type: string, data: unknown = {}) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }
}
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
let network: { onLine: boolean };
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.instances = [];
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  network = { onLine: true };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", network);
  vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function subscribe(refresh = vi.fn().mockResolvedValue(undefined)) {
  const state = vi.fn();
  const channel = createStoreChannel("/events");
  cleanups.push(channel.subscribe(refresh, state));
  return { channel, refresh, state, source: FakeSource.instances.at(-1)! };
}

it("shares a connection, coalesces writes, and requires REST success plus live events", async () => {
  const { channel, source, refresh, state } = subscribe();
  const other = vi.fn();
  cleanups.push(channel.subscribe(other, vi.fn()));
  expect(FakeSource.instances).toHaveLength(1);
  source.onopen?.();
  await vi.advanceTimersByTimeAsync(250);
  expect(state).not.toHaveBeenLastCalledWith("已同步");
  source.emit("heartbeat");
  expect(state).toHaveBeenLastCalledWith("已同步");
  refresh.mockClear(); other.mockClear();
  for (let i = 0; i < 10; i++) source.emit("store.changed", { entityType: "work_record", businessDate: "2026-09-17" });
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledOnce();
  expect(other).toHaveBeenCalledOnce();
  expect(refresh.mock.calls[0]![0].full).toBe(false);
});

it("suspends in background and offline, resumes with a full read", async () => {
  const { source, refresh, state } = subscribe();
  await vi.advanceTimersByTimeAsync(250);
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(source.closed).toBe(true);
  refresh.mockClear();
  await vi.advanceTimersByTimeAsync(60000);
  expect(refresh).not.toHaveBeenCalled();
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenLastCalledWith({ full: true, changes: [] });
  network.onLine = false; win.dispatchEvent(new Event("offline"));
  expect(state).toHaveBeenLastCalledWith("网络已断开");
  refresh.mockClear();
  await vi.advanceTimersByTimeAsync(60000);
  expect(refresh).not.toHaveBeenCalled();
  network.onLine = true; win.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledOnce();
});

it("replaces a silently stalled connection after ten seconds with bounded fallback reads", async () => {
  const { source, refresh, state } = subscribe();
  source.emit("heartbeat");
  await vi.advanceTimersByTimeAsync(250);
  expect(state).toHaveBeenLastCalledWith("已同步");
  refresh.mockClear();
  await vi.advanceTimersByTimeAsync(10000);
  expect(source.closed).toBe(true);
  expect(FakeSource.instances).toHaveLength(2);
  expect(refresh).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30000);
  expect(refresh).toHaveBeenCalledTimes(2);
  const latest = FakeSource.instances.at(-1)!;
  latest.emit("heartbeat");
  refresh.mockClear();
  for (let i = 0; i < 20; i++) { await vi.advanceTimersByTimeAsync(2000); latest.emit("heartbeat"); }
  expect(refresh).not.toHaveBeenCalled();
});

it("serializes slow reads and keeps a trailing refresh after an intervening write", async () => {
  let release!: () => void;
  const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const { source, state } = subscribe(refresh);
  await vi.advanceTimersByTimeAsync(250);
  source.emit("store.changed", { entityType: "work_record" });
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledOnce();
  expect(state).not.toHaveBeenLastCalledWith("已同步");
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(state).toHaveBeenLastCalledWith("已同步");
});

it("failed REST reads never report synced and retry while heartbeats are healthy", async () => {
  const refresh = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(undefined);
  const { source, state } = subscribe(refresh);
  source.emit("heartbeat");
  await vi.advanceTimersByTimeAsync(250);
  expect(state).toHaveBeenLastCalledWith("连接中");
  for (let i = 0; i < 15; i++) { await vi.advanceTimersByTimeAsync(2000); source.emit("heartbeat"); }
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(state).toHaveBeenLastCalledWith("已同步");
});

it("unknown events and bfcache restoration force full reads; cleanup stops everything", async () => {
  const { source, refresh } = subscribe();
  await vi.advanceTimersByTimeAsync(250);
  source.emit("store.changed", { reason: "resync" });
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenLastCalledWith({ full: true, changes: [] });
  win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  expect(source.closed).toBe(true);
  await vi.advanceTimersByTimeAsync(250);
  cleanups.splice(0).forEach(fn => fn());
  refresh.mockClear();
  await vi.advanceTimersByTimeAsync(60000);
  expect(refresh).not.toHaveBeenCalled();
  expect(FakeSource.instances.every(item => item.closed)).toBe(true);
});
