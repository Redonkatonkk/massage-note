import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSettlementLongImage, type SettlementSnapshot } from "../src/settlement-render.js";

const snapshot: SettlementSnapshot = {
  storeName: "Massage Note", storeTimezone: "America/New_York", dateFrom: "2026-08-01", dateTo: "2026-08-28", paymentScope: "NON_CASH",
  generatedAt: "2026-08-29T18:00:00.000Z",
  employee: { displayName: "Amy 测试员工" },
  summary: { recordCount: 45, cashLargeFeeWageCents: 108000, nonCashLargeFeeWageCents: 162000, cashTipCents: 45000, nonCashTipCents: 103500, cashIncomeCents: 153000, nonCashIncomeCents: 265500, totalIncomeCents: 418500 },
  records: Array.from({ length: 45 }, (_, index) => ({
    businessDate: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`, startAt: "2026-08-20T14:00:00Z", endAt: "2026-08-20T15:00:00Z",
    serviceName: "Deep Tissue Massage", serviceShortName: "DT", addons: [{ name: "Hot Stone", shortName: "HS" }], grossFeeBaseCents: 10000,
    cashServiceCents: 4000, cardServiceCents: 6000, giftCardServiceCents: 0, nonCashServiceCents: 6000, cashLargeFeeWageCents: 2400, nonCashLargeFeeWageCents: 3600,
    cashTipCents: 1000, cardTipCents: 2000, giftCardTipCents: 300, nonCashTipCents: 2300, cashIncomeCents: 3400, nonCashIncomeCents: 5900, totalIncomeCents: 9300,
  })),
};

describe.skipIf(process.platform !== "darwin")("employee settlement artifacts", () => {
  it("生成顶部汇总、按日卡片和每日总结的可读长图", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-render-test-"));
    try {
      const detailsImage = join(directory, "details.jpg");
      const result = await renderSettlementLongImage(snapshot, "zh_CN", directory, detailsImage);
      expect(result.longImage.width).toBeGreaterThanOrEqual(1080);
      expect(result.longImage.height).toBeLessThanOrEqual(32_760);
      expect(result.longImage.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect((await readFile(detailsImage)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const detailSvg = await readFile(join(directory, "settlement-details-long.svg"), "utf8");
      expect(detailSvg).toContain("大费: 现金 US$40.00 / 刷卡 US$60.00");
      expect(detailSvg).toContain("混合付款 · 仅计算刷卡＋礼卡部分");
      expect(detailSvg.match(/员工区间结算/g)).toHaveLength(1);
      expect(detailSvg).toContain("当日总结");
      expect(detailSvg).toContain("28 天");
      expect(detailSvg).toContain("刷卡大费分红");
      expect(detailSvg).toContain("刷卡小费");
      expect(detailSvg).toContain("非现金工资合计");
      expect(detailSvg).not.toContain("仅统计付款已确认记工");
      expect(detailSvg).not.toContain("…");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("同一不可变快照重复生成完全相同的长图，允许只重发明细", async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), "settlement-render-first-"));
    const secondDirectory = await mkdtemp(join(tmpdir(), "settlement-render-second-"));
    try {
      await renderSettlementLongImage(snapshot, "zh_CN", firstDirectory, join(firstDirectory, "details.jpg"));
      await renderSettlementLongImage(snapshot, "zh_CN", secondDirectory, join(secondDirectory, "details.jpg"));
      expect(await readFile(join(secondDirectory, "details.jpg"))).toEqual(await readFile(join(firstDirectory, "details.jpg")));
    } finally {
      await Promise.all([firstDirectory, secondDirectory].map((directory) => rm(directory, { recursive: true, force: true })));
    }
  }, 30_000);

  it("旧快照缺少付款拆分字段时仍可生成紧凑长图", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-render-legacy-"));
    try {
      const legacy = structuredClone(snapshot);
      for (const record of legacy.records) {
        delete record.cardServiceCents;
        delete record.giftCardServiceCents;
        delete record.cardTipCents;
        delete record.giftCardTipCents;
      }
      const result = await renderSettlementLongImage(legacy, "zh_CN", directory, join(directory, "details.jpg"));
      expect(result.longImage.width).toBeGreaterThanOrEqual(1080);
      expect(result.longImage.height).toBeLessThanOrEqual(32_760);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("同一天记工很多时自动换成多行卡片且不截断文字", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-render-limit-"));
    try {
      const busyDay = structuredClone(snapshot);
      busyDay.dateFrom = "2026-08-20";
      busyDay.dateTo = "2026-08-20";
      busyDay.records = Array.from({ length: 18 }, (_, index) => ({
        ...structuredClone(snapshot.records[index % snapshot.records.length]!),
        businessDate: "2026-08-20",
        serviceName: `完整显示的超长项目名称 ${index + 1}`,
        serviceShortName: "",
      }));
      busyDay.summary.recordCount = busyDay.records.length;
      const result = await renderSettlementLongImage(busyDay, "zh_CN", directory, join(directory, "details.jpg"));
      expect(result.longImage.width).toBe(1080);
      expect(result.longImage.height).toBeGreaterThan(2_000);
      expect(result.longImage.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      const detailSvg = await readFile(join(directory, "settlement-details-long.svg"), "utf8");
      expect(detailSvg).toContain("完整显示的超长项目名称 18");
      expect(detailSvg).not.toContain("…");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("每日总结始终位于最右列，双数笔记工时左侧保留空位", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-render-summary-position-"));
    try {
      const twoRecords = structuredClone(snapshot);
      twoRecords.dateFrom = "2026-08-20";
      twoRecords.dateTo = "2026-08-20";
      twoRecords.records = snapshot.records.slice(0, 2).map((record) => ({ ...structuredClone(record), businessDate: "2026-08-20" }));
      twoRecords.summary.recordCount = twoRecords.records.length;
      await renderSettlementLongImage(twoRecords, "zh_CN", directory, join(directory, "details.jpg"));
      const detailSvg = await readFile(join(directory, "settlement-details-long.svg"), "utf8");
      expect(detailSvg).toContain('<rect data-card-kind="day-summary" x="548"');
      expect(detailSvg.match(/data-card-kind="day-summary"/g)).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("31 天、每天 12 笔记工仍生成一张可读长图", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-render-month-"));
    try {
      const month = structuredClone(snapshot);
      month.dateFrom = "2026-08-01";
      month.dateTo = "2026-08-31";
      month.records = Array.from({ length: 31 * 12 }, (_, index) => ({
        ...structuredClone(snapshot.records[index % snapshot.records.length]!),
        businessDate: `2026-08-${String(Math.floor(index / 12) + 1).padStart(2, "0")}`,
      }));
      month.summary.recordCount = month.records.length;
      const result = await renderSettlementLongImage(month, "zh_CN", directory, join(directory, "details.jpg"));
      expect(result.longImage.width).toBeGreaterThanOrEqual(1080);
      expect(result.longImage.height).toBeLessThanOrEqual(32_760);
      expect(result.longImage.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      const detailSvg = await readFile(join(directory, "settlement-details-long.svg"), "utf8");
      expect(detailSvg).toContain("31 天");
      expect(detailSvg.match(/当日总结/g)).toHaveLength(31);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
