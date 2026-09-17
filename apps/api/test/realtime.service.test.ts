import { afterEach, expect, it, vi } from "vitest";
import { RealtimeService } from "../src/realtime/realtime.service.js";

afterEach(() => vi.useRealTimers());

function fixture() {
  const prisma = { domainOutbox: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) } };
  const access = { requireActiveMembership: vi.fn().mockResolvedValue({}) };
  return { prisma, access, service: new RealtimeService(prisma as never, access as never) };
}

it("慢轮询不会被后续定时器取消", async () => {
  vi.useFakeTimers();
  const { prisma, service } = fixture();
  let release!: (events: unknown[]) => void;
  prisma.domainOutbox.findMany.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const next = vi.fn();
  const subscription = (await service.stream({ id: "user" } as never, "store")).subscribe(next);
  try {
    await vi.advanceTimersByTimeAsync(4000);
    expect(prisma.domainOutbox.findMany).toHaveBeenCalledTimes(1);
    release([{ id: "event", topic: "store.changed", payloadJson: {} }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ id: "event" }));
  } finally { subscription.unsubscribe(); }
});

it("撤销权限后终止已建立的实时订阅", async () => {
  vi.useFakeTimers();
  const { access, service } = fixture();
  const error = vi.fn();
  const subscription = (await service.stream({ id: "user" } as never, "store")).subscribe({ error });
  try {
    await vi.advanceTimersByTimeAsync(0);
    access.requireActiveMembership.mockRejectedValue(new Error("access revoked"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "access revoked" }));
    expect(subscription.closed).toBe(true);
  } finally { subscription.unsubscribe(); }
});

it("定期重新获取 REST 数据以覆盖游标之前延迟提交的事件", async () => {
  vi.useFakeTimers();
  const { service } = fixture();
  const next = vi.fn();
  const subscription = (await service.stream({ id: "user" } as never, "store")).subscribe(next);
  try {
    await vi.advanceTimersByTimeAsync(30000);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ type: "store.changed", data: { reason: "resync" } }));
  } finally { subscription.unsubscribe(); }
});

it("同账号多连接和不同账号共享一次店铺查询，分别收到全部事件", async () => {
  vi.useFakeTimers();
  const { prisma, access, service } = fixture();
  const callbacks = [vi.fn(), vi.fn(), vi.fn()];
  const subscriptions = await Promise.all(callbacks.map(async (next, index) =>
    (await service.stream({ id: index === 2 ? "other" : "user" } as never, "store")).subscribe(next),
  ));
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(prisma.domainOutbox.findMany).toHaveBeenCalledTimes(1);
    prisma.domainOutbox.findMany.mockResolvedValue([{ id: "event", topic: "store.changed", payloadJson: { entityType: "work_record" } }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(prisma.domainOutbox.findMany).toHaveBeenCalledTimes(2);
    callbacks.forEach(next => expect(next).toHaveBeenCalledWith(expect.objectContaining({ id: "event" })));
    expect(access.requireActiveMembership).toHaveBeenCalledWith("other", "store");
    subscriptions[0]!.unsubscribe();
    await vi.advanceTimersByTimeAsync(2000);
    expect(subscriptions[1]!.closed).toBe(false);
  } finally { subscriptions.forEach(item => item.unsubscribe()); }
  const count = prisma.domainOutbox.findMany.mock.calls.length;
  await vi.advanceTimersByTimeAsync(6000);
  expect(prisma.domainOutbox.findMany).toHaveBeenCalledTimes(count);
});

it("撤销一个用户不影响同店其他用户，跨店各自查询", async () => {
  vi.useFakeTimers();
  const { prisma, access, service } = fixture();
  const error = vi.fn();
  const revoked = (await service.stream({ id: "revoked" } as never, "store")).subscribe({ error });
  const active = (await service.stream({ id: "active" } as never, "store")).subscribe();
  const other = (await service.stream({ id: "active" } as never, "other-store")).subscribe();
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(prisma.domainOutbox.findMany).toHaveBeenCalledTimes(2);
    access.requireActiveMembership.mockImplementation(async (id: string) => { if (id === "revoked") throw new Error("revoked"); return {}; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(error).toHaveBeenCalledOnce();
    expect(active.closed).toBe(false);
    expect(other.closed).toBe(false);
    expect(prisma.domainOutbox.findMany.mock.calls.map(call => (call as unknown as [{ where: { storeId: string } }])[0].where.storeId)).toEqual(["store", "other-store", "store", "other-store"]);
  } finally { revoked.unsubscribe(); active.unsubscribe(); other.unsubscribe(); }
});

it("晚加入与重连立即要求 REST 同步，服务销毁释放轮询", async () => {
  vi.useFakeTimers();
  const { prisma, service } = fixture();
  const first = (await service.stream({ id: "user" } as never, "store")).subscribe();
  await vi.advanceTimersByTimeAsync(4000);
  const next = vi.fn();
  const second = (await service.stream({ id: "user" } as never, "store", "old-event")).subscribe(next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ data: { reason: "resync" } }));
  service.onModuleDestroy();
  expect(first.closed).toBe(true);
  expect(second.closed).toBe(true);
  const count = prisma.domainOutbox.findMany.mock.calls.length;
  await vi.advanceTimersByTimeAsync(4000);
  expect(prisma.domainOutbox.findMany).toHaveBeenCalledTimes(count);
});
