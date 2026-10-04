import { expect, it, vi } from "vitest";
import { createBusinessDateCalendarCache, type OpenWorkDatesResponse } from "./business-date-calendar-cache";

const marks: OpenWorkDatesResponse = {
  dates: ["2026-10-01"],
  closedDates: [{ date: "2026-10-02", discountedFeePerformanceCents: 10000, revenueCents: 12000 }],
};

it("切换同月日期、重新挂载和再次打开时复用同一月份数据", async () => {
  const cache = createBusinessDateCalendarCache();
  const fetchDates = vi.fn().mockResolvedValue(marks);
  await cache.load("store", "2026-10", fetchDates);
  expect(cache.peek("store", "2026-10")).toEqual(marks);
  expect(await cache.load("store", "2026-10", fetchDates)).toEqual(marks);
  expect(fetchDates).toHaveBeenCalledOnce();
});

it("切月首次读取，回到已读月份复用；不同店铺隔离", async () => {
  const cache = createBusinessDateCalendarCache();
  const fetchDates = vi.fn().mockResolvedValue(marks);
  await cache.load("first", "2026-10", fetchDates);
  await cache.load("first", "2026-09", fetchDates);
  await cache.load("first", "2026-10", fetchDates);
  expect(fetchDates).toHaveBeenCalledTimes(2);
  expect(cache.peek("second", "2026-10")).toBeUndefined();
  await cache.load("second", "2026-10", fetchDates);
  expect(fetchDates).toHaveBeenCalledTimes(3);
});

it("同月在途请求合并，避免重挂载时重复请求", async () => {
  const cache = createBusinessDateCalendarCache();
  let resolve!: (data: OpenWorkDatesResponse) => void;
  const fetchDates = vi.fn(() => new Promise<OpenWorkDatesResponse>(done => { resolve = done; }));
  const first = cache.load("store", "2026-10", fetchDates);
  const second = cache.load("store", "2026-10", fetchDates);
  await Promise.resolve();
  expect(second).toBe(first);
  expect(fetchDates).toHaveBeenCalledOnce();
  resolve(marks);
  await first;
});

it("手动或业务变更失效后重新读取，迟到的旧响应不能覆盖缓存", async () => {
  const cache = createBusinessDateCalendarCache();
  let resolve!: (data: OpenWorkDatesResponse) => void;
  const old = cache.load("store", "2026-10", () => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  cache.invalidate();
  const fresh: OpenWorkDatesResponse = { dates: [], closedDates: marks.closedDates };
  await cache.load("store", "2026-10", async () => fresh);
  resolve(marks);
  await old;
  expect(cache.peek("store", "2026-10")).toEqual(fresh);
  cache.invalidate();
  expect(cache.peek("store", "2026-10")).toBeUndefined();
});

it("失败请求可重试，旧请求失败不会移除新缓存", async () => {
  const cache = createBusinessDateCalendarCache();
  const fetchDates = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(marks);
  await expect(cache.load("store", "2026-10", fetchDates)).rejects.toThrow("offline");
  expect(await cache.load("store", "2026-10", fetchDates)).toEqual(marks);
  expect(fetchDates).toHaveBeenCalledTimes(2);

  let reject!: (error: Error) => void;
  const old = cache.load("store", "2026-09", () => new Promise((_resolve, fail) => { reject = fail; }));
  await Promise.resolve();
  cache.invalidate();
  await cache.load("store", "2026-09", async () => marks);
  const failure = expect(old).rejects.toThrow("old");
  reject(new Error("old"));
  await failure;
  expect(cache.peek("store", "2026-09")).toEqual(marks);
});

it("最多保留十二个月，页面长期使用时缓存有界", async () => {
  const cache = createBusinessDateCalendarCache();
  for (let month = 1; month <= 12; month++) {
    await cache.load("store", `2026-${String(month).padStart(2, "0")}`, async () => marks);
  }
  await cache.load("store", "2027-01", async () => marks);
  expect(cache.peek("store", "2026-01")).toBeUndefined();
  expect(cache.peek("store", "2027-01")).toEqual(marks);
});
