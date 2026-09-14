import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { businessDateFor, deviceNow, deviceTimezone, deviceTimeMiddleware } from "../src/common/device-time.js";

const input = { timezone: "America/New_York", cutoffLocal: "22:00" };
function request(headers: Record<string, string>) {
  return { header: (name: string) => headers[name] } as Request;
}

describe("设备日期请求上下文", () => {
  it("并行请求使用各自设备日期和时区，结束后不泄漏到后台", async () => {
    const run = (timezone: string, instant: string) => new Promise<string>((resolve, reject) => {
      deviceTimeMiddleware(request({ "X-Device-Timezone": timezone, "X-Device-Time": instant }), {} as Response, (error?: unknown) => {
        if (error) return reject(error);
        void Promise.resolve().then(() => {
          expect(deviceTimezone(input.timezone)).toBe(timezone);
          resolve(businessDateFor({ ...input, startAt: deviceNow() }));
        }).catch(reject);
      });
    });
    expect(await Promise.all([
      run("Asia/Tokyo", "2026-09-14T03:30:00Z"),
      run("America/Los_Angeles", "2026-09-14T03:30:00Z"),
    ])).toEqual(["2026-09-14", "2026-09-13"]);
    expect(deviceTimezone(input.timezone)).toBe(input.timezone);
    expect(businessDateFor({ ...input, startAt: "2026-09-14T03:30:00Z" })).toBe("2026-09-13");
  });

  it.each([
    { "X-Device-Timezone": "Mars/Olympus", "X-Device-Time": "2026-09-14T03:30:00Z" },
    { "X-Device-Timezone": "Asia/Tokyo", "X-Device-Time": "invalid" },
    { "X-Device-Timezone": "Asia/Tokyo" },
  ])("拒绝无效或不完整设备上下文", (headers) => {
    let received: unknown;
    deviceTimeMiddleware(request(headers as Record<string, string>), {} as Response, (error?: unknown) => { received = error; });
    expect(received).toBeInstanceOf(Error);
  });
});
