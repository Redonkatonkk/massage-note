import snapshot from "./responses.json";

export class DemoRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function demoKey(path: string): string {
  const url = new URL(path, "https://demo.invalid");
  for (const [key, value] of [...url.searchParams]) {
    if (["paymentMethod", "amountType"].includes(key) && value === "ALL") url.searchParams.delete(key);
    if (key === "includeDeleted" && value === "true") url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.pathname + (url.searchParams.size ? `?${url.searchParams}` : "");
}

const responses = new Map(Object.entries(snapshot.responses).map(([path, value]) => [demoKey(path), value]));

/** No network fallback: every response comes from the synthetic snapshot. */
export function demoRequest(path: string, method = "GET"): unknown {
  // The board calls this during reads. In the snapshot there is no schedule to apply.
  if (method === "POST" && /^\/stores\/10000000-0000-4000-8000-000000000001\/boards\/2026-10-\d{2}\/apply-weekly-dispatch$/.test(path)) return null;
  if (method !== "GET") throw new DemoRequestError(403, "DEMO_READ_ONLY", "This portfolio demo is read-only. Saving, sign-in, AI, imports and message delivery are disabled. / 演示版只读，不能保存、登录、调用 AI、导入或发送消息。");
  const value = responses.get(demoKey(path));
  if (value === undefined) throw new DemoRequestError(404, "DEMO_SNAPSHOT_ONLY", `This selection is outside the demo snapshot. Use the default dates ending ${snapshot.today} or return through the demo navigation. / 此筛选不在演示快照中，请使用默认日期或演示导航。`);
  return structuredClone(value);
}
