import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderSettlementArtifacts, type SettlementSnapshot } from "../src/settlement-render.js";

const snapshot: SettlementSnapshot = {
  storeName: "Massage Note", storeTimezone: "America/New_York", dateFrom: "2026-08-01", dateTo: "2026-08-28", paymentScope: "ALL",
  employee: { displayName: "Amy 测试员工" },
  summary: { recordCount: 45, cashLargeFeeWageCents: 108000, nonCashLargeFeeWageCents: 162000, cashTipCents: 45000, nonCashTipCents: 103500, cashIncomeCents: 153000, nonCashIncomeCents: 265500, totalIncomeCents: 418500 },
  records: Array.from({ length: 45 }, (_, index) => ({
    businessDate: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`, startAt: "2026-08-20T14:00:00Z", endAt: "2026-08-20T15:00:00Z",
    serviceName: "Deep Tissue Massage", serviceShortName: "DT", addons: [{ name: "Hot Stone", shortName: "HS" }], grossFeeBaseCents: 10000,
    cashServiceCents: 4000, nonCashServiceCents: 6000, cashLargeFeeWageCents: 2400, nonCashLargeFeeWageCents: 3600,
    cashTipCents: 1000, nonCashTipCents: 2300, cashIncomeCents: 3400, nonCashIncomeCents: 5900, totalIncomeCents: 9300,
  })),
};

describe.skipIf(process.platform !== "darwin")("employee settlement artifacts", () => {
  it("生成摘要 PNG 和自动分页 PDF", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-render-test-"));
    try {
      const summary = join(directory, "summary.png");
      const details = join(directory, "details.pdf");
      const result = await renderSettlementArtifacts(snapshot, "zh_CN", directory, summary, details);
      expect(result.pageCount).toBe(3);
      expect((await readFile(summary)).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(await PDFDocument.load(await readFile(details))).toHaveProperty("getPageCount");
      expect((await PDFDocument.load(await readFile(details))).getPageCount()).toBe(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
