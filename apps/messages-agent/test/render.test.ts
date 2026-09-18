import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderClosingPng, type ClosingSnapshot } from "../src/render.js";

const snapshot: ClosingSnapshot = {
  storeName: "安心按摩",
  storeTimezone: "America/New_York",
  businessDate: "2026-08-27",
  isClosed: true,
  activeClosing: { cycleNo: 2 },
  employee: {
    displayName: "小林",
    grossFeeBaseCents: 10_000,
    cashToSubmitToStoreCents: 4_000,
    cashLargeFeeDividendCents: 3_000,
    cardLargeFeeDividendCents: 3_000,
    cashTipDividendCents: 1_000,
    cardTipDividendCents: 2_000,
    confirmedLargeFeeWageCents: 6_000,
    confirmedTipWageCents: 3_000,
    confirmedIncomeCents: 9_000,
  },
  records: [{
    startAt: "2026-08-27T14:00:00.000Z", endAt: "2026-08-27T15:00:00.000Z", status: "CONFIRMED",
    serviceShortName: "全身", serviceName: "全身按摩", addons: [],
    grossFeeBaseCents: 10_000,
    cashServiceCents: 7_000, cardServiceCents: 0, giftCardServiceCents: 2_000,
    cashTipCents: 0, cardTipCents: 3_000, giftCardTipCents: 0, employeeIncomeCents: 9_000,
  }],
};

describe.skipIf(process.platform !== "darwin")("个人日结 PNG", () => {
  it("使用 macOS 自带转换器生成固定宽度 PNG", async () => {
    const directory = await mkdtemp(join(tmpdir(), "closing-render-test-"));
    try {
      const svg = join(directory, "closing.svg");
      const png = join(directory, "closing.png");
      await renderClosingPng(snapshot, "zh_CN", svg, png);
      const bytes = await readFile(png);
      const svgMarkup = await readFile(svg, "utf8");
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.length).toBeGreaterThan(10_000);
      // Check the actual PNG IHDR, not just the SVG source dimensions.
      expect(bytes.readUInt32BE(16)).toBe(1170);
      expect(bytes.readUInt32BE(20)).toBe(719);
      expect(svgMarkup).toContain('viewBox="0 0 1170 719"');
      expect(svgMarkup).toContain('<rect x="0" y="0" width="1170" height="719" fill="url(#bg)"/>');
      expect(svgMarkup).not.toContain('width="100%"');
      expect(svgMarkup).not.toContain("大费基数");
      expect(svgMarkup).not.toContain("应提交现金");
      expect(svgMarkup).toContain('class="card-amount-box"');
      expect(svgMarkup).toContain('20（礼物卡）');
      expect(svgMarkup).toContain('员工大费（折前）');
      expect(svgMarkup).toContain('class="gross-value">US$100.00</text>');
      expect(svgMarkup).toContain('class="summary-heading">现金</text>');
      expect(svgMarkup).toContain('class="summary-heading">刷卡</text>');
      expect(svgMarkup).toContain('class="summary-label">大费工资</text>');
      expect(svgMarkup).toContain('class="summary-label">小费工资</text>');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each(["zh_CN", "en_US"] as const)("%s 多笔短信附件保持 1170 像素宽及完整换行", async (locale) => {
    const directory = await mkdtemp(join(tmpdir(), "closing-layout-test-"));
    try {
      const svg = join(directory, "closing.svg");
      const png = join(directory, "closing.png");
      const record = { ...snapshot.records[0]!, serviceShortName: "Deep tissue massage + Hot stone massage + Aromatherapy", cardServiceCents: 3000 };
      await renderClosingPng({ ...snapshot, records: Array.from({ length: 12 }, () => record) }, locale, svg, png);
      const bytes = await readFile(png);
      const markup = await readFile(svg, "utf8");
      expect(bytes.readUInt32BE(16)).toBe(1170);
      expect(bytes.readUInt32BE(20)).toBeGreaterThan(719);
      expect(markup).not.toMatch(/大费基数|应提交现金|Service-fee base|Cash to submit/);
      expect(markup).toContain('fill="#f8dfcc"');
      expect(markup.match(/class="gross-value"/g)).toHaveLength(12);
      expect(markup.match(/x="605"[^>]+class="payment-label"/g)).toHaveLength(24);
      expect(markup).not.toContain("…");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

});
