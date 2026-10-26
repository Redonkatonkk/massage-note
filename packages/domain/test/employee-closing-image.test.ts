import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmployeeClosingSvg, type ClosingSnapshot } from "../src/employee-closing-image.js";
import { type ImageLocale as Locale } from "../src/image-format.js";

type Record = ClosingSnapshot["records"][number];
type Text = { x: number; y: number; lastY: number; className: string; value: string; lines: number; anchor?: string };
type Panel = { x: number; y: number; width: number; height: number; kind: string };
const money = (cents: number, locale: Locale) => new Intl.NumberFormat(locale === "zh_CN" ? "zh-CN" : "en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }).format(cents / 100);
const locales: Locale[] = ["zh_CN", "en_US"];
const unescapeXml = (value: string) => value.replace(/&(lt|gt|amp|quot|apos);/g, (_, entity: string) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[entity]!);
const attributes = (value: string) => Object.fromEntries([...value.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1]!, unescapeXml(match[2]!)]));
const compact = (value: string) => value.replace(/\s/g, "");
const hasClass = (item: Text, className: string) => item.className.split(/\s+/).includes(className);

function texts(svg: string): Text[] {
  return [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map(match => {
    const attrs = attributes(match[1]!);
    const spans = [...match[2]!.matchAll(/<tspan\b([^>]*)>/g)];
    const y = Number(attrs.y);
    return { x: Number(attrs.x), y, lastY: spans.reduce((baseline, span) => baseline + Number(attributes(span[1]!).dy ?? 0), y), className: attrs.class ?? "", value: attrs["aria-label"] ?? unescapeXml(match[2]!.replace(/<[^>]+>/g, "")), lines: spans.length || 1, ...(attrs["text-anchor"] ? { anchor: attrs["text-anchor"] } : {}) };
  });
}

function panels(svg: string): Panel[] {
  return [...svg.matchAll(/<rect\b([^>]*)\/?\s*>/g)].map(match => attributes(match[1]!)).filter(attrs => attrs["data-card-kind"]).map(attrs => ({ x: Number(attrs.x), y: Number(attrs.y), width: Number(attrs.width), height: Number(attrs.height), kind: attrs["data-card-kind"]! }));
}
const inside = (text: Text, panel: Panel) => text.x >= panel.x && text.x <= panel.x + panel.width && text.y > panel.y && text.lastY < panel.y + panel.height;

function record(overrides: Partial<Record> = {}): Record {
  return { startAt: "2026-08-27T14:00:00Z", endAt: "2026-08-27T15:00:00Z", status: "CONFIRMED", serviceShortName: "", serviceName: "全身 & Massage <Full>", addons: [{ shortName: "", name: '热石 "Stone"' }], grossFeeBaseCents: 10_001, cashServiceCents: 4_001, cardServiceCents: 4_000, giftCardServiceCents: 2_000, cashTipCents: 0, cardTipCents: 199, giftCardTipCents: 1, employeeIncomeCents: 6_201, ...overrides };
}

function snapshot(records: Record[] = [record()]): ClosingSnapshot {
  return {
    storeName: '安心 & <Spa> "Store"', storeTimezone: "America/New_York", businessDate: "2026-08-27", isClosed: true, activeClosing: { cycleNo: 2 },
    employee: { displayName: "李 & O'Neil <Employee>", grossFeeBaseCents: 10_001, cashToSubmitToStoreCents: 99_999_999, cashLargeFeeDividendCents: 2_401, cardLargeFeeDividendCents: 3_600, cashTipDividendCents: 0, cardTipDividendCents: 200, confirmedLargeFeeWageCents: 6_001, confirmedTipWageCents: 200, confirmedIncomeCents: 6_201 }, records,
  };
}

describe("个人日结统一记工卡模板", () => {
  it.each(locales)("%s 门店姓名日期在前，收入只突出一次，来源合并为三列表格", locale => {
    const data = snapshot();
    const { svg, width, height } = createEmployeeClosingSvg(data, locale);
    const items = texts(svg);
    const income = panels(svg).find(panel => panel.kind === "income")!;
    expect(width).toBe(1170);
    expect(svg).toContain(`viewBox="0 0 1170 ${height}"`);
    expect(panels(svg).map(panel => panel.kind)).toEqual(["income", "record"]);
    expect(items.find(item => hasClass(item, "store"))!.value).toBe(data.storeName);
    expect(items.find(item => hasClass(item, "employee-name"))!.value).toContain(data.employee.displayName);
    const primary = items.filter(item => hasClass(item, "primary-amount"));
    expect(primary).toHaveLength(1);
    expect(compact(primary[0]!.value)).toBe(compact(money(6201, locale)));
    expect(income.y).toBeGreaterThan(items.find(item => hasClass(item, "date"))!.lastY);
    expect(items.filter(item => hasClass(item, "source-amount")).map(item => compact(item.value))).toEqual([2401, 0, 3600, 200].map(value => compact(money(value, locale))));
    expect(items.filter(item => hasClass(item, "source-label")).map(item => item.value)).toEqual(locale === "zh_CN" ? ["现金", "刷卡＋礼卡"] : ["Cash", "Card + gift card"]);
    expect(items.filter(item => hasClass(item, "source-amount")).every(item => inside(item, income) && item.anchor === "end")).toBe(true);
    const plain = items.map(item => item.value).join(" ");
    expect(plain).toContain(locale === "zh_CN" ? "工资发放以结算记录为准" : "Check settlement records for payments");
    expect(plain).not.toMatch(/应提交现金|Cash to submit|实付工资|Wages paid/);
    expect(plain).not.toContain(money(data.employee.cashToSubmitToStoreCents, locale));
  });

  it.each(locales)("%s 原价与实收分别标注，刷卡只框该付款部分，礼卡与现金有文字", locale => {
    const { svg } = createEmployeeClosingSvg(snapshot(), locale);
    const panel = panels(svg).find(item => item.kind === "record")!;
    const items = texts(svg).filter(item => inside(item, panel));
    expect(items.find(item => hasClass(item, "record-title"))!.value).toBe('全身 & Massage <Full>');
    expect(items.find(item => hasClass(item, "record-gross"))!.value).toBe(money(10001, locale));
    expect(items.find(item => hasClass(item, "record-income"))!.value).toBe(money(6201, locale));
    expect(items.filter(item => hasClass(item, "payment-cash")).map(item => item.value)).toEqual([`${locale === "zh_CN" ? "现金" : "Cash"} ${money(4001, locale)}`]);
    expect(items.filter(item => hasClass(item, "payment-card")).map(item => item.value)).toEqual([4000, 199].map(value => `${locale === "zh_CN" ? "刷卡" : "Card"} ${money(value, locale)}`));
    expect(items.filter(item => hasClass(item, "payment-gift")).map(item => item.value)).toEqual([2000, 1].map(value => `${locale === "zh_CN" ? "礼卡" : "Gift card"} ${money(value, locale)}`));
    expect(svg.match(/data-payment-method="card"/g)).toHaveLength(2);
    expect(svg.match(/data-payment-method="gift"/g)).toHaveLength(2);
    expect(svg).not.toContain('data-payment-method="cash"');
    expect(items.find(item => hasClass(item, "record-income"))!.y).toBeGreaterThan(Math.max(...items.filter(item => hasClass(item, "payment-detail")).map(item => item.lastY)));
  });

  it.each(locales)("%s 未选项目不显示零元价格，保留待结账与时间", locale => {
    const { svg } = createEmployeeClosingSvg(snapshot([record({ serviceSelected: false, status: "PENDING_PAYMENT", grossFeeBaseCents: 0, addons: [] })]), locale);
    const items = texts(svg);
    expect(items.find(item => hasClass(item, "record-title"))!.value).toBe(locale === "zh_CN" ? "待选项目" : "Select service");
    expect(items.find(item => hasClass(item, "record-gross"))!.value).toBe(locale === "zh_CN" ? "未填写" : "Not entered");
    expect(items.find(item => hasClass(item, "pending-note"))!.value).toContain(locale === "zh_CN" ? "未计入汇总" : "excluded from totals");
  });

  it.each(locales)("%s 待结账排除收入，未知付款和零付款不同", locale => {
    const data = snapshot([
      record({ status: "PENDING_PAYMENT", employeeIncomeCents: 888888, cashServiceCents: null, cardServiceCents: null, giftCardServiceCents: null, cashTipCents: null, cardTipCents: null, giftCardTipCents: null }),
      record({ employeeIncomeCents: null, cashServiceCents: 0, cardServiceCents: 0, giftCardServiceCents: 0, cashTipCents: 0, cardTipCents: null, giftCardTipCents: 0 }),
    ]);
    const { svg } = createEmployeeClosingSvg(data, locale);
    const cards = panels(svg).filter(item => item.kind === "record");
    const pending = texts(svg).filter(item => inside(item, cards[0]!));
    const confirmed = texts(svg).filter(item => inside(item, cards[1]!));
    expect(pending.find(item => hasClass(item, "record-income"))!.value).toBe(locale === "zh_CN" ? "未确认" : "Unconfirmed");
    expect(pending.find(item => hasClass(item, "pending-note"))!.value).toContain(locale === "zh_CN" ? "未计入汇总" : "excluded from totals");
    expect(pending.filter(item => hasClass(item, "payment-detail")).map(item => item.value)).toEqual(Array(2).fill(locale === "zh_CN" ? "未确认" : "Unconfirmed"));
    expect(confirmed.find(item => hasClass(item, "payment-zero"))!.value).toBe(money(0, locale));
    expect(confirmed.find(item => hasClass(item, "payment-card"))!.value).toContain(locale === "zh_CN" ? "未确认" : "Unconfirmed");
    expect(svg).not.toContain(money(888888, locale));
  });

  it("两列逐笔按实际时间排序，同时间稳定，缺失时间最后，保留原快照", () => {
    const data = snapshot([
      record({ serviceName: "Null first", addons: [], startAt: null }),
      record({ serviceName: "Later", addons: [], startAt: "2026-08-27T16:00:00Z" }),
      record({ serviceName: "Earlier one", addons: [], startAt: "2026-08-27T14:00:00Z" }),
      record({ serviceName: "Earlier two", addons: [], startAt: "2026-08-27T10:00:00-04:00" }),
      record({ serviceName: "Null second", addons: [], startAt: null }),
    ]);
    const before = structuredClone(data);
    const { svg } = createEmployeeClosingSvg(data, "en_US");
    expect(texts(svg).filter(item => hasClass(item, "record-title")).map(item => item.value)).toEqual(["Earlier one", "Earlier two", "Later", "Null first", "Null second"]);
    const cards = panels(svg).filter(item => item.kind === "record");
    expect(cards[0]!.y).toBe(cards[1]!.y);
    expect(cards[1]!.x).toBeGreaterThan(cards[0]!.x + cards[0]!.width);
    expect(cards[2]!.y).toBeGreaterThan(Math.max(cards[0]!.y + cards[0]!.height, cards[1]!.y + cards[1]!.height));
    expect(cards[4]!.x).toBe(48);
    expect(data).toEqual(before);
  });

  it.each(locales)("%s 长对象、项目、付款和收入完整换行，不越出卡片", locale => {
    const data = snapshot([record({ serviceName: "完整服务项目 VeryLongUnbrokenServiceWWIdentifier".repeat(8), addons: [{ name: "完整加项 LongAddonIdentifier".repeat(6), shortName: "" }], employeeIncomeCents: 123456789012345, cashServiceCents: 123456789012345, cardServiceCents: 123456789012345, discountTotalCents: 1234567890123 })]);
    data.storeName = "完整门店名称 StoreWWIdentifier".repeat(8);
    data.employee.displayName = "完整员工姓名 EmployeeWWIdentifier".repeat(8);
    data.employee.confirmedIncomeCents = 123456789012345;
    data.employee.cardLargeFeeDividendCents = 123456789012345;
    const { svg, width, height } = createEmployeeClosingSvg(data, locale);
    const items = texts(svg);
    expect(items.find(item => hasClass(item, "store"))!.value).toBe(data.storeName);
    expect(items.find(item => hasClass(item, "employee-name"))!.value).toContain(data.employee.displayName);
    expect(items.find(item => hasClass(item, "record-title"))!.value).toBe(data.records[0]!.serviceName);
    const card = panels(svg).find(item => item.kind === "record")!;
    expect(items.filter(item => item.y > card.y && item.y < card.y + card.height).every(item => inside(item, card))).toBe(true);
    const primary = items.find(item => hasClass(item, "primary-amount"))!;
    expect(primary.lines).toBeGreaterThan(1);
    expect(compact(primary.value)).toBe(compact(money(data.employee.confirmedIncomeCents, locale)));
    panels(svg).forEach(panel => { expect(panel.x + panel.width).toBeLessThanOrEqual(width); expect(panel.y + panel.height).toBeLessThan(height); });
    expect(svg).not.toMatch(/…|<clipPath|text-overflow/);
  });

  it.each(locales)("%s 空记录和免费工资仍沿用快照，旧快照兼容，无日结周期噪声", locale => {
    const data = snapshot([]); data.isClosed = false; data.activeClosing = null;
    data.employee.cardLargeFeeDividendCents = 3600; data.employee.confirmedIncomeCents = 0;
    const { svg } = createEmployeeClosingSvg(data, locale);
    const items = texts(svg);
    expect(items.find(item => hasClass(item, "closing-state"))!.value).toContain(locale === "zh_CN" ? "尚未日结" : "Still open");
    expect(items.find(item => hasClass(item, "primary-amount"))!.value).toBe(money(0, locale));
    expect(items.filter(item => hasClass(item, "source-amount"))[2]!.value).toBe(money(3600, locale));
    expect(panels(svg).map(item => item.kind)).toEqual(["income", "empty"]);
    expect(svg).not.toMatch(/Closing #|第.*次日结/);
  });

  it("高亮、折扣、加项及固定不透明背景沿用项目语义色，所有文字至少12px", () => {
    const css = readFileSync(new URL("../../../apps/web/app/globals.css", import.meta.url), "utf8");
    const { svg, height } = createEmployeeClosingSvg(snapshot([record({ isHighlighted: true, discountTotalCents: 501 })]), "zh_CN");
    const background = css.match(/--page:\s*(#[\da-fA-F]+)/)![1]!;
    const highlight = css.match(/--highlight:\s*(#[\da-fA-F]+)/)![1]!;
    expect(svg).toContain(`<rect x="0" y="0" width="1170" height="${height}" fill="${background}"/>`);
    expect(panels(svg).find(item => item.kind === "record")).toBeDefined();
    expect(svg).toContain(`fill="${highlight}"`);
    expect(texts(svg).find(item => hasClass(item, "discount"))!.value).toBe("off5.01");
    expect(svg).not.toMatch(/linearGradient|<filter|feDropShadow|font-weight:[789]00/);
    expect([...svg.matchAll(/font-size="(\d+)"/g)].every(match => Number(match[1]) >= 36)).toBe(true);
  });
});
