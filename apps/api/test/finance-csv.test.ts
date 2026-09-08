import { expect, it, vi } from "vitest";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";

it.each(["=1+1", "\t=1+1", "  @SUM(1)", "\r+1", "\n-1"])("导出将带前导空白的公式文本作为文字: %s", async note => {
  const service = new FinanceQueriesService({} as never, {} as never);
  vi.spyOn(service, "details").mockResolvedValue({ records: [{ businessDate: new Date("2026-09-08"), startAt: new Date("2026-09-08"), endAt: null, employee: { displayName: "Amy" }, serviceSnapshot: null, addonSnapshots: [], note }], giftCardSales: [] } as never);
  const csv = await service.exportCsv({} as never, "store", {} as never);
  expect(csv).toContain(`"'${note}"`);
});
