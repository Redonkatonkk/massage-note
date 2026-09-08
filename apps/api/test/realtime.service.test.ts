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
