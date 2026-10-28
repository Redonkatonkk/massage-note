// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { newWorkRecord } from "./new-work-record";
import { createWorkRecordSaveManager, recordSaveLocked, unresolvedWrite, type WorkRecordSaveInput, type WorkRecordSaveManager } from "./work-record-saves";
import type { WorkRecord } from "./types";

const record = { ...newWorkRecord({ employeeMembershipId: "employee", businessDate: "2026-10-28", storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "04:00", startAt: "2026-10-28T14:00:00Z", isHighlighted: false, isDispatchExcluded: false }), id: "saved", version: 2 };
const scope = { storeId: "store", businessDate: "2026-10-28" };
const managers: WorkRecordSaveManager[] = [];
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const motion = () => ({ complete: vi.fn(async (_id?: string) => {}), cancel: vi.fn(), setWaitingVisible: vi.fn() });
function input(id: string): WorkRecordSaveInput {
  return { id, ...scope, storeName: "Shop", employeeName: "Alex", request: { path: "/stores/store/work-records", method: "POST", body: { employeeMembershipId: "employee", startAt: record.startAt } }, draft: { kind: "quick", employeeId: "employee", serviceId: "service", mode: "HIGHLIGHTED", startTime: "10:00" }, motion: motion() };
}
function setup(write = vi.fn(async () => record)) {
  const manager = createWorkRecordSaveManager(write); managers.push(manager);
  const refresh = vi.fn(async () => {}); manager.registerView({ ...scope, refresh });
  return { manager, write, refresh };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { managers.splice(0).forEach(manager => manager.dispose()); vi.useRealTimers(); });

it("submits independent writes in parallel, freezes inputs and completes in response order", async () => {
  const first = deferred<WorkRecord>(), second = deferred<WorkRecord>();
  const write = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { manager } = setup(write);
  const a = input("a"), b = input("b");
  const order: string[] = [];
  a.motion!.complete = vi.fn(async () => { order.push("a"); }); b.motion!.complete = vi.fn(async () => { order.push("b"); });
  expect(manager.submit(a)).toBe(true); expect(manager.submit(b)).toBe(true);
  (a.request.body as { startAt: string }).startAt = "changed";
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[0]![1].body.startAt).toBe(record.startAt);
  expect(manager.getSnapshot().tasks.filter(unresolvedWrite)).toHaveLength(2);
  expect(a.motion!.setWaitingVisible).toHaveBeenLastCalledWith(true);
  expect(b.motion!.setWaitingVisible).toHaveBeenLastCalledWith(false);
  second.resolve({ ...record, id: "b-card" }); await settle();
  expect(order).toEqual(["b"]);
  expect(manager.getSnapshot().tasks.find(task => task.id === "a")!.status).toBe("saving");
  first.resolve(record); await settle(); expect(order).toEqual(["b", "a"]);
});

it("deduplicates a form session and locks only the same existing record", async () => {
  const pending = deferred<WorkRecord>(); const { manager, write } = setup(vi.fn(() => pending.promise));
  expect(manager.submit({ ...input("a"), recordId: "old" })).toBe(true);
  expect(manager.submit(input("a"))).toBe(false);
  expect(manager.submit({ ...input("b"), recordId: "old" })).toBe(false);
  expect(manager.submit({ ...input("c"), recordId: "different" })).toBe(true);
  expect(write).toHaveBeenCalledTimes(2);
  pending.resolve(record); await settle();
});

it("uncertain writes retry the identical body and key before releasing record/day locks", async () => {
  const write = vi.fn().mockRejectedValueOnce(new TypeError("Network interrupted")).mockResolvedValueOnce(record);
  const { manager } = setup(write);
  manager.submit({ ...input("original-key"), recordId: "old" }); await settle();
  const task = manager.getSnapshot().tasks[0]!;
  expect(task.status).toBe("uncertain"); expect(recordSaveLocked(task)).toBe(true); expect(unresolvedWrite(task)).toBe(true);
  manager.requestRecovery(task.id); expect(manager.getSnapshot().recovery).toBeNull();
  manager.retry(task.id); manager.retry(task.id); await settle();
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
  expect(manager.getSnapshot().tasks[0]!.status).toBe("saved");
});

it.each(["IDEMPOTENCY_REQUEST_IN_PROGRESS", "IDEMPOTENCY_KEY_EXPIRED"])("keeps %s unresolved instead of making a new write", async code => {
  const { manager } = setup(vi.fn().mockRejectedValue(new ApiError(409, { code })));
  manager.submit(input("a")); await settle();
  expect(manager.getSnapshot().tasks[0]!.status).toBe("uncertain");
});

it("definitive rejection retains the full editor draft and restores only its own scope", async () => {
  const { manager } = setup(vi.fn().mockRejectedValue(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "Conflict" })));
  const fields = { note: "Keep this note", cashService: "12.34", addons: [{ key: "addon", amount: "8" }], recordVersion: 1 };
  manager.submit({ ...input("a"), recordId: "old", draft: { kind: "editor", record, isNew: false, fields } }); await settle();
  expect(manager.getSnapshot().tasks[0]!.status).toBe("failed");
  manager.requestRecovery("a"); expect(manager.takeRecovery({ ...scope, storeId: "other" })).toBeUndefined();
  const restored = manager.takeRecovery(scope)!;
  expect(restored.draft).toEqual({ kind: "editor", record, isNew: false, fields });
  expect(restored.code).toBe("WORK_RECORD_VERSION_CONFLICT"); expect(manager.getSnapshot().tasks).toEqual([]);
});

it("refresh failure after commit retries only reads and preserves the saved record version", async () => {
  const { manager, write, refresh } = setup();
  refresh.mockRejectedValueOnce(new Error("Read failed"));
  manager.submit({ ...input("a"), recordId: "old" }); await settle();
  const task = manager.getSnapshot().tasks[0]!;
  expect(task.status).toBe("syncFailed"); expect(task.savedRecord?.version).toBe(2);
  expect(unresolvedWrite(task)).toBe(false); expect(recordSaveLocked(task)).toBe(true);
  manager.retry("a"); await settle();
  expect(write).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledTimes(2);
  expect(manager.getSnapshot().tasks[0]!.status).toBe("saved");
});

it("store/date changes retain writes without refreshing or animating into another scope", async () => {
  const pending = deferred<WorkRecord>(); const { manager, refresh } = setup(vi.fn(() => pending.promise));
  const task = input("a"); manager.submit(task);
  manager.leaveView(); const otherRefresh = vi.fn(async () => {});
  manager.registerView({ storeId: "another", businessDate: "2026-10-29", refresh: otherRefresh });
  pending.resolve(record); await settle();
  expect(refresh).not.toHaveBeenCalled(); expect(otherRefresh).not.toHaveBeenCalled();
  expect(task.motion!.complete).not.toHaveBeenCalled(); expect(task.motion!.cancel).toHaveBeenCalled();
  expect(manager.getSnapshot().tasks[0]!.storeId).toBe("store");
});

it("queued animation does not serialize writes or survive page disposal", async () => {
  const { manager, write } = setup();
  const finish = deferred<void>(); const task = input("a"); task.motion!.complete = vi.fn(() => finish.promise);
  manager.submit(task); await settle(); manager.submit(input("b")); await settle();
  expect(write).toHaveBeenCalledTimes(2); expect(manager.getSnapshot().tasks[1]!.status).toBe("syncing");
  manager.dispose(); expect(task.motion!.cancel).toHaveBeenCalled(); finish.resolve(); await settle();
  expect(vi.getTimerCount()).toBe(0);
});

it("graphics visibility or cleanup exceptions cannot prevent a write or change a committed result", async () => {
  const { manager, write, refresh } = setup();
  const task = input("graphics-failure");
  task.motion!.setWaitingVisible = vi.fn(() => { throw new Error("Graphics failure"); });
  task.motion!.cancel = vi.fn(() => { throw new Error("Cleanup failure"); });
  expect(manager.submit(task)).toBe(true); await settle();
  expect(write).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
  expect(manager.getSnapshot().tasks[0]!.status).toBe("saved");
});
