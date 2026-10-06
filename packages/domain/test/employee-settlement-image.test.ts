import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmployeeSettlementSvg, type SettlementSnapshot } from "../src/employee-settlement-image.js";

type Locale = "zh_CN" | "en_US";
type Scope = SettlementSnapshot["paymentScope"];
type Record = SettlementSnapshot["records"][number];
type Rect = { x: number; y: number; width: number; height: number; kind: string | undefined; rx: number };
type Text = { x: number; y: number; lastY: number; className: string; text: string; label: string; lines: number; anchor: string | undefined };

const locales: Locale[] = ["zh_CN", "en_US"];
const scopes: Scope[] = ["CASH", "NON_CASH", "ALL"];
const cases = locales.flatMap((locale) => scopes.map((scope) => ({ locale, scope })));
const unescapeXml = (value: string) => value.replace(/&(lt|gt|amp|quot|apos);/g, (_, entity: string) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[entity]!);
const attrs = (value: string) => Object.fromEntries([...value.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1]!, unescapeXml(match[2]!)]));
const plain = (value: string) => unescapeXml(value.replace(/<[^>]+>/g, ""));
const compact = (value: string) => value.replace(/\s/g, "");
const money = (cents: number, locale: Locale) => new Intl.NumberFormat(locale === "zh_CN" ? "zh-CN" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const hasClass = (item: Text, className: string) => item.className.split(/\s+/).includes(className);

function texts(svg: string): Text[] {
  return [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((match) => {
    const attributes = attrs(match[1]!);
    const spans = [...match[2]!.matchAll(/<tspan\b([^>]*)>/g)];
    const y = Number(attributes.y);
    return {
      x: Number(attributes.x), y,
      lastY: spans.reduce((baseline, span) => baseline + Number(attrs(span[1]!).dy ?? 0), y),
      className: attributes.class ?? "", text: plain(match[2]!), label: attributes["aria-label"] ?? plain(match[2]!),
      lines: spans.length || 1, anchor: attributes["text-anchor"],
    };
  });
}

function rectangles(svg: string): Rect[] {
  return [...svg.matchAll(/<rect\b([^>]*)\/?\s*>/g)].map((match) => {
    const attributes = attrs(match[1]!);
    return { x: Number(attributes.x ?? 0), y: Number(attributes.y ?? 0), width: Number(attributes.width), height: Number(attributes.height), kind: attributes["data-card-kind"], rx: Number(attributes.rx ?? 0) };
  });
}

const inside = (text: Text, rect: Rect) => text.x >= rect.x && text.x <= rect.x + rect.width && text.y > rect.y && text.lastY < rect.y + rect.height;
const monetaryTexts = (items: Text[]) => items.filter((item) => hasClass(item, "value") || hasClass(item, "record-value"));

function record(overrides: Partial<Record> = {}): Record {
  return {
    businessDate: "2026-10-01", startAt: "2026-10-01T14:00:00Z", endAt: "2026-10-01T15:00:00Z",
    serviceName: "按摩 & Spa <Full>", serviceShortName: "", addons: [{ name: '热石 "Stone"', shortName: "" }],
    grossFeeBaseCents: 10001, cashServiceCents: 4001, cardServiceCents: 4000, giftCardServiceCents: 2000, nonCashServiceCents: 6000,
    cashLargeFeeWageCents: 1234, nonCashLargeFeeWageCents: 2345, cashTipCents: 0, cardTipCents: 100, giftCardTipCents: 1, nonCashTipCents: 101,
    cashIncomeCents: 1234, nonCashIncomeCents: 2446, totalIncomeCents: 3680,
    ...overrides,
  };
}

function snapshot(scope: Scope = "ALL", records: Record[] = [record(), record({ businessDate: "2026-10-02", startAt: "2026-10-02T14:00:00Z", endAt: null, cashLargeFeeWageCents: 2222, nonCashLargeFeeWageCents: 3456, cashTipCents: 77, cardTipCents: 88, giftCardTipCents: 0, nonCashTipCents: 88, cashIncomeCents: 2299, nonCashIncomeCents: 3544, totalIncomeCents: 5843 })]): SettlementSnapshot {
  const total = (field: "cashLargeFeeWageCents" | "nonCashLargeFeeWageCents" | "cashTipCents" | "nonCashTipCents" | "cashIncomeCents" | "nonCashIncomeCents" | "totalIncomeCents") => records.reduce((sum, item) => sum + item[field], 0);
  return {
    storeName: 'Walton & <Spa> "Store"', storeTimezone: "America/New_York", dateFrom: "2026-10-01", dateTo: "2026-10-31", paymentScope: scope, generatedAt: "2026-10-05T16:00:00Z",
    employee: { displayName: "李 & O'Neil <Employee>" }, records,
    summary: { recordCount: records.length, cashLargeFeeWageCents: total("cashLargeFeeWageCents"), nonCashLargeFeeWageCents: total("nonCashLargeFeeWageCents"), cashTipCents: total("cashTipCents"), nonCashTipCents: total("nonCashTipCents"), cashIncomeCents: total("cashIncomeCents"), nonCashIncomeCents: total("nonCashIncomeCents"), totalIncomeCents: total("totalIncomeCents") },
  };
}

function topCards(svg: string) {
  const firstDay = texts(svg).find((item) => hasClass(item, "day-title"));
  return rectangles(svg).filter((rect) => rect.rx > 0 && (!firstDay || rect.y + rect.height < firstDay.y));
}

describe("员工结算图片的来源、完整内容与账本布局", () => {
  it.each(cases)("$locale / $scope 保留来源、美分和独立的当日结算金额", ({ locale, scope }) => {
    const data = snapshot(scope);
    const { svg } = createEmployeeSettlementSvg(data, locale);
    const allTexts = texts(svg);
    const cards = topCards(svg);
    expect(cards).toHaveLength(3);
    const expected = scope === "CASH" ? [[3456], [77], [3533]]
      : scope === "NON_CASH" ? [[5801], [189], [5990]]
        : [[3456, 77, 3533], [5801, 189, 5990], [9257, 266, 9523]];
    cards.forEach((card, index) => {
      expect(monetaryTexts(allTexts.filter((item) => inside(item, card))).map((item) => compact(item.text))).toEqual(expected[index]!.map((amount) => compact(money(amount, locale))));
    });

    const days = rectangles(svg).filter((rect) => rect.kind === "day-summary");
    const dailyAmounts = scope === "CASH" ? [1234, 2299] : scope === "NON_CASH" ? [2446, 3544] : [3680, 5843];
    expect(days).toHaveLength(2);
    days.forEach((day, index) => {
      const dailyTotal = allTexts.filter((item) => inside(item, day) && hasClass(item, "value"));
      expect(dailyTotal.map((item) => compact(item.text))).toEqual([compact(money(dailyAmounts[index]!, locale))]);
      expect(day.x).toBe(32);
    });
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;Spa&gt;");
    expect(svg).toContain("&quot;Store&quot;");
    expect(svg).toContain("O&apos;Neil");
    expect(svg).not.toContain("<Employee>");
  });

  it.each(cases)("$locale / $scope 空记录仍明确显示零值", ({ locale, scope }) => {
    const { svg, height } = createEmployeeSettlementSvg(snapshot(scope, []), locale);
    const allTexts = texts(svg);
    const cards = topCards(svg);
    expect(cards).toHaveLength(3);
    expect(monetaryTexts(allTexts).map((item) => compact(item.text))).toEqual(Array.from({ length: scope === "ALL" ? 9 : 3 }, () => compact(money(0, locale))));
    expect(rectangles(svg).filter((rect) => rect.kind === "day-summary")).toHaveLength(0);
    expect(height).toBeLessThanOrEqual(32_760);
  });

  it.each(locales)("$locale 长店名、姓名、项目自然换行，首日不会侵入页头", (locale) => {
    const data = snapshot("ALL", [record({ serviceName: "完整服务项目不应省略 VeryLongUnbrokenServiceIdentifier".repeat(6), addons: [{ name: "完整附加项目 AddonIdentifier".repeat(5), shortName: "" }] })]);
    data.storeName = "完整门店名称 LongUnbrokenStoreIdentifier".repeat(10);
    data.employee.displayName = "完整员工姓名 LongUnbrokenEmployeeIdentifier".repeat(7);
    const { svg } = createEmployeeSettlementSvg(data, locale);
    const allTexts = texts(svg);
    const name = allTexts.find((item) => hasClass(item, "name"))!;
    const store = allTexts.find((item) => hasClass(item, "eyebrow") && compact(item.text).includes(compact(data.storeName)))!;
    const service = allTexts.find((item) => hasClass(item, "record-title") && compact(item.text).includes(compact(data.records[0]!.serviceName)))!;
    for (const [text, expected] of [[name, data.employee.displayName], [store, data.storeName], [service, `${data.records[0]!.serviceName} + ${data.records[0]!.addons[0]!.name}`]] as const) {
      expect(text).toBeDefined();
      expect(text.lines).toBeGreaterThan(1);
      expect(compact(text.text)).toContain(compact(expected));
      expect(text.text).not.toMatch(/…|\.\.\./);
    }
    const cards = topCards(svg);
    const meta = allTexts.find((item) => hasClass(item, "meta") && item.text.includes(data.dateFrom) && item.text.includes(data.dateTo))!;
    const dayTitle = allTexts.find((item) => hasClass(item, "day-title"))!;
    const daySummary = rectangles(svg).find((rect) => rect.kind === "day-summary")!;
    expect(name.y).toBeGreaterThan(store.lastY);
    expect(meta.y).toBeGreaterThan(store.lastY);
    expect(name.y).toBeGreaterThan(meta.lastY);
    expect(Math.min(...cards.map((card) => card.y))).toBeGreaterThan(name.lastY);
    expect(dayTitle.y).toBeGreaterThan(Math.max(...cards.map((card) => card.y + card.height)));
    expect(daySummary.y).toBeGreaterThan(dayTitle.lastY);
    expect(svg).not.toMatch(/<clipPath\b|text-overflow|overflow="hidden"/);

    const recordRect = rectangles(svg).find((rect) => inside(service, rect) && rect.kind !== "day-summary" && rect.rx > 0)!;
    const rows = allTexts.filter((item) => inside(item, recordRect) && hasClass(item, "record-value"));
    const labels = allTexts.filter((item) => inside(item, recordRect) && hasClass(item, "record-label"));
    expect(rows).toHaveLength(3);
    expect(labels).toHaveLength(3);
    rows.forEach((amount, index) => {
      const label = labels[index]!;
      expect(label).toBeDefined();
      expect(label.x).toBeLessThan(amount.x);
      expect(label.lastY).toBeLessThanOrEqual(amount.y);
      expect(amount.anchor).toBe("end");
    });
    expect(rows[1]!.y).toBeGreaterThan(rows[0]!.lastY);
    expect(rows[2]!.y).toBeGreaterThan(rows[1]!.lastY);
    const recordDetails = allTexts.filter((item) => inside(item, recordRect) && ["record-title", "record-meta", "record-detail"].some((className) => hasClass(item, className)));
    expect(rows[0]!.y).toBeGreaterThan(Math.max(...recordDetails.map((item) => item.lastY)));
  });

  it.each(locales)("$locale 大金额完整显示，标签和金额都留在所属卡片内", (locale) => {
    const data = snapshot("ALL", [record({
      serviceName: "Large values", addons: [],
      cashLargeFeeWageCents: 123_456_789_012_345, nonCashLargeFeeWageCents: 234_567_890_123_456,
      cashTipCents: 987_654_321, nonCashTipCents: 123_456_789,
      cashIncomeCents: 123_457_776_666_666, nonCashIncomeCents: 234_568_013_580_245, totalIncomeCents: 358_025_790_246_911,
    })]);
    const { svg } = createEmployeeSettlementSvg(data, locale);
    const allTexts = texts(svg);
    const expected = [
      [123_456_789_012_345, 987_654_321, 123_457_776_666_666],
      [234_567_890_123_456, 123_456_789, 234_568_013_580_245],
      [358_024_679_135_801, 1_111_111_110, 358_025_790_246_911],
    ];
    topCards(svg).forEach((card, index) => {
      expect(monetaryTexts(allTexts.filter((item) => inside(item, card))).map((item) => compact(item.text))).toEqual(expected[index]!.map((amount) => compact(money(amount, locale))));
    });
    const title = allTexts.find((item) => hasClass(item, "record-title") && item.text === "Large values")!;
    const card = rectangles(svg).find((rect) => inside(title, rect) && rect.kind !== "day-summary" && rect.rx > 0)!;
    const rows = allTexts.filter((item) => inside(item, card) && hasClass(item, "record-value"));
    const labels = allTexts.filter((item) => inside(item, card) && hasClass(item, "record-label"));
    expect(rows.map((item) => compact(item.text))).toEqual([123_457_776_666_666, 234_568_013_580_245, 358_025_790_246_911].map((amount) => compact(money(amount, locale))));
    expect(labels).toHaveLength(3);
    rows.forEach((amount, index) => {
      expect(labels[index]!.lastY).toBeLessThanOrEqual(amount.y);
      expect(amount.anchor).toBe("end");
      if (index > 0) expect(labels[index]!.y).toBeGreaterThan(rows[index - 1]!.lastY);
    });
  });

  it.each([{ days: 1, perDay: 18 }, { days: 31, perDay: 12 }])("$days 日、每日 $perDay 笔完整生成一张有高度上限的图片", ({ days, perDay }) => {
    const records = Array.from({ length: days * perDay }, (_, index) => {
      const date = `2026-10-${String(Math.floor(index / perDay) + 1).padStart(2, "0")}`;
      return record({ businessDate: date, startAt: `${date}T${String(6 + index % perDay).padStart(2, "0")}:00:00Z`, serviceName: `Service_${date}_${index % perDay + 1}`, addons: [] });
    });
    const { svg, width, height } = createEmployeeSettlementSvg(snapshot("ALL", records), "en_US");
    const titles = texts(svg).filter((item) => hasClass(item, "record-title") && item.text.startsWith("Service_"));
    expect(titles.map((item) => compact(item.text))).toEqual(records.map((item) => compact(item.serviceName)));
    expect(rectangles(svg).filter((rect) => rect.kind === "day-summary")).toHaveLength(days);
    expect(height).toBeLessThanOrEqual(32_760);
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    for (const rect of rectangles(svg)) {
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    }
  });

  it.each(cases)("$locale / $scope 先识别日期员工再读唯一主金额，逐笔从时间开始核对", ({ locale, scope }) => {
    const data = snapshot(scope);
    const { svg } = createEmployeeSettlementSvg(data, locale);
    const content = texts(svg);
    const store = content.find(item => hasClass(item, "eyebrow"))!;
    const range = content.find(item => item.text.includes(data.dateFrom) && item.text.includes(data.dateTo))!;
    const name = content.find(item => hasClass(item, "name"))!;
    const summary = topCards(svg);
    expect(range.y).toBeGreaterThan(store.lastY);
    expect(name.y).toBeGreaterThan(range.lastY);
    const summaryValues = monetaryTexts(content.filter(item => summary.some(card => inside(item, card))));
    expect(summaryValues.filter(item => hasClass(item, "total"))).toHaveLength(1);
    expect(summaryValues.filter(item => hasClass(item, "summary-main"))).toHaveLength(1);
    const note = content.find(item => hasClass(item, "income-notice"))!;
    expect(note.y).toBeGreaterThan(Math.max(...summary.map(card => card.y + card.height)));
    expect(note.text).toContain(locale === "en_US" ? "Check payroll records" : "实际发放请核对工资账本");
    const card = rectangles(svg).find(rect => rect.rx > 0 && rect.y > note.y && rect.kind !== "day-summary")!;
    const details = content.filter(item => inside(item, card));
    expect(details[0]!.className).toContain("record-meta");
    expect(details[1]!.className).toContain("record-title");
  });

  it("超大输入明确拒绝，不生成被裁切的结算明细", () => {
    const records = Array.from({ length: 1500 }, (_, index) => record({ serviceName: `完整服务_${index}`, addons: [] }));
    expect(() => createEmployeeSettlementSvg(snapshot("ALL", records), "zh_CN")).toThrow(/too many records|shorten the date range/);
  });

  it("静态图片沿用共享表面、颜色和圆角，不使用装饰渐变或阴影", () => {
    const css = readFileSync(new URL("../../../apps/web/app/globals.css", import.meta.url), "utf8");
    const { svg } = createEmployeeSettlementSvg(snapshot(), "zh_CN");
    const theme = ["page", "surface", "ink", "muted", "line", "brand"].map((name) => css.match(new RegExp(`--${name}:\\s*(#[\\da-fA-F]+)`))![1]!.toLowerCase());
    const renderedColors = [...new Set([...svg.matchAll(/#[\da-fA-F]{3,8}\b/g)].map((match) => match[0].toLowerCase()))].sort();
    expect(renderedColors).toEqual([...theme].sort());
    expect(svg).not.toMatch(/linearGradient|<filter\b|feDropShadow|filter="|fill-opacity=/);
    const panelRadius = Number(css.match(/--radius-panel:\s*(\d+)px/)![1]);
    expect(rectangles(svg).filter((rect) => rect.rx > 0).every((rect) => rect.rx === panelRadius)).toBe(true);
  });
});
