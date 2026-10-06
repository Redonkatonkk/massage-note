import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { createEmployeeClosingSvg } from "@massage-note/domain";
import { describe, expect, it } from "vitest";
import { renderClosingPng, type ClosingSnapshot } from "../src/render.js";

const snapshot: ClosingSnapshot = {
  storeName: "安心按摩", storeTimezone: "America/New_York", businessDate: "2026-08-27", isClosed: true, activeClosing: { cycleNo: 2 },
  employee: { displayName: "小林", grossFeeBaseCents: 10_000, cashToSubmitToStoreCents: 4_000, cashLargeFeeDividendCents: 3_000, cardLargeFeeDividendCents: 3_000, cashTipDividendCents: 1_000, cardTipDividendCents: 2_001, confirmedLargeFeeWageCents: 6_000, confirmedTipWageCents: 3_001, confirmedIncomeCents: 9_001 },
  records: [{ startAt: "2026-08-27T14:00:00.000Z", endAt: "2026-08-27T15:00:00.000Z", status: "CONFIRMED", serviceShortName: "全身", serviceName: "全身按摩", addons: [], grossFeeBaseCents: 10_000, cashServiceCents: 7_000, cardServiceCents: 0, giftCardServiceCents: 2_000, cashTipCents: 0, cardTipCents: 3_001, giftCardTipCents: 0, employeeIncomeCents: 9_001 }],
};

// Inspect PNG scanlines so an explicit SVG background cannot mask a transparent
// output regression in macOS sips. RGB images are opaque by definition.
function expectOpaquePng(bytes: Buffer) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  expect(bytes[24]).toBe(8);
  expect([2, 6]).toContain(colorType);
  if (colorType === 2) return;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.subarray(offset + 4, offset + 8).toString() === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(compressed));
  const rowBytes = width * 4;
  expect(pixels.length).toBe((rowBytes + 1) * height);
  let previous = Buffer.alloc(rowBytes);
  let transparent = false;
  const paeth = (left: number, up: number, upperLeft: number) => {
    const estimate = left + up - upperLeft;
    const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)];
    return distances[0]! <= distances[1]! && distances[0]! <= distances[2]! ? left : distances[1]! <= distances[2]! ? up : upperLeft;
  };
  for (let y = 0; y < height; y++) {
    const offset = y * (rowBytes + 1);
    const filter = pixels[offset]!;
    expect(filter).toBeLessThanOrEqual(4);
    const row = Buffer.allocUnsafe(rowBytes);
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= 4 ? row[x - 4]! : 0;
      const up = previous[x]!;
      const upperLeft = x >= 4 ? previous[x - 4]! : 0;
      const correction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      row[x] = (pixels[offset + 1 + x]! + correction) & 0xff;
      if (x % 4 === 3 && row[x] !== 255) transparent = true;
    }
    previous = row;
  }
  expect(transparent).toBe(false);
}

describe.skipIf(process.platform !== "darwin")("个人日结 PNG", () => {
  it("使用共享阅读模板和 macOS 转换器生成固定宽度不透明 PNG", async () => {
    const directory = await mkdtemp(join(tmpdir(), "closing-render-test-"));
    try {
      const svgPath = join(directory, "closing.svg");
      const pngPath = join(directory, "closing.png");
      const expected = createEmployeeClosingSvg(snapshot, "zh_CN");
      await renderClosingPng(snapshot, "zh_CN", svgPath, pngPath);
      const bytes = await readFile(pngPath);
      const markup = await readFile(svgPath, "utf8");
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.length).toBeGreaterThan(10_000);
      expect(bytes.readUInt32BE(16)).toBe(1170);
      expect(bytes.readUInt32BE(20)).toBe(expected.height);
      expect(markup).toBe(expected.svg);
      expectOpaquePng(bytes);
      expect(markup).toContain("今日已确认总收入");
      expect(markup).toContain("US$90.01");
      expect(markup).toContain("非现金（刷卡＋礼物卡）");
      expect(markup).toContain("折前项目金额");
      expect(markup).toContain("礼物卡 US$20.00");
      expect(markup).not.toMatch(/应提交现金|linearGradient|card-amount-box/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it.each(["zh_CN", "en_US"] as const)("%s 多笔长项目完整换行，正文保持固定字号和宽度", async locale => {
    const directory = await mkdtemp(join(tmpdir(), "closing-layout-test-"));
    try {
      const svgPath = join(directory, "closing.svg");
      const pngPath = join(directory, "closing.png");
      const record = { ...snapshot.records[0]!, serviceShortName: "", serviceName: "Deep tissue massage + Hot stone massage + Aromatherapy 完整项目".repeat(2), cardServiceCents: 3_000 };
      const data = { ...snapshot, records: Array.from({ length: 12 }, () => record) };
      const expected = createEmployeeClosingSvg(data, locale);
      await renderClosingPng(data, locale, svgPath, pngPath);
      const bytes = await readFile(pngPath);
      const markup = await readFile(svgPath, "utf8");
      expect(bytes.readUInt32BE(16)).toBe(1170);
      expect(bytes.readUInt32BE(20)).toBe(expected.height);
      expect(expected.height).toBeGreaterThan(createEmployeeClosingSvg(snapshot, locale).height);
      expect(markup).toBe(expected.svg);
      expectOpaquePng(bytes);
      expect(markup.match(/data-card-kind="record"/g)).toHaveLength(12);
      expect(markup.match(/class="amount record-income"/g)).toHaveLength(12);
      expect(markup).toContain(".payment-detail{font-size:42px");
      expect(markup).not.toMatch(/应提交现金|Cash to submit|linearGradient|…/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
