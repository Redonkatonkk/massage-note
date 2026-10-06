import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmployeeClosingSvg, type ClosingSnapshot } from "../src/employee-closing-image.js";
import { formatImageMoney as money, type ImageLocale as Locale } from "../src/image-format.js";

type Record = ClosingSnapshot["records"][number];
type Text = { x: number; y: number; lastY: number; className: string; value: string; lines: number; anchor?: string };
type Panel = { x: number; y: number; width: number; height: number; kind: string };
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

describe("个人日结图片的收入语义与手机阅读顺序", () => {
  it.each(locales)("%s 先交代门店日期姓名，再显示唯一主要收入和两组来源", locale => {
    const data = snapshot();
    const { svg, width, height } = createEmployeeClosingSvg(data, locale);
    const allTexts = texts(svg);
    const allPanels = panels(svg);
    expect(width).toBe(1170);
    expect(svg).toContain(`viewBox="0 0 1170 ${height}"`);
    expect(allPanels.map(item => item.kind)).toEqual(["income", "service-summary", "tip-summary", "record"]);
    const store = allTexts.find(item => hasClass(item, "store"))!;
    const date = allTexts.find(item => hasClass(item, "date"))!;
    const employee = allTexts.find(item => hasClass(item, "employee-name"))!;
    const primary = allTexts.filter(item => hasClass(item, "primary-amount"));
    expect(store.value).toBe(data.storeName);
    expect(employee.value).toBe(data.employee.displayName);
    expect(date.y).toBeGreaterThan(store.lastY);
    expect(employee.y).toBeGreaterThan(date.lastY);
    expect(allPanels[0]!.y).toBeGreaterThan(employee.lastY);
    expect(primary).toHaveLength(1);
    expect(compact(primary[0]!.value)).toBe(compact(money(data.employee.confirmedIncomeCents, locale)));
    const expectedAmounts = [[2_401, 3_600, 6_001], [0, 200, 200]];
    allPanels.slice(1, 3).forEach((panel, index) => {
      const rows = allTexts.filter(item => inside(item, panel) && hasClass(item, "amount"));
      const labels = allTexts.filter(item => inside(item, panel) && hasClass(item, "amount-label"));
      expect(rows.map(item => compact(item.value))).toEqual(expectedAmounts[index]!.map(amount => compact(money(amount, locale))));
      expect(labels).toHaveLength(3);
      rows.forEach((row, rowIndex) => {
        expect(row.anchor).toBe("end");
        expect(labels[rowIndex]!.x).toBeLessThan(row.x);
        expect(labels[rowIndex]!.lastY).toBeLessThanOrEqual(row.y);
        if (rowIndex > 0) expect(labels[rowIndex]!.y).toBeGreaterThan(rows[rowIndex - 1]!.lastY);
      });
    });
    const plain = allTexts.map(item => item.value).join(" ");
    expect(plain).toContain(locale === "zh_CN" ? "非现金（刷卡＋礼物卡）" : "Non-cash (card + gift card)");
    expect(plain).toContain(locale === "zh_CN" ? "实际发放请核对结算记录" : "Check settlement records for payments");
    expect(plain).not.toMatch(/应提交现金|Cash to submit|实付工资|Wages paid|到账/);
    expect(plain).not.toContain(money(data.employee.cashToSubmitToStoreCents, locale));
  });

  it.each(locales)("%s 每笔纵向显示时间、项目、收入与折前价，然后明确客人付款来源", locale => {
    const { svg } = createEmployeeClosingSvg(snapshot(), locale);
    const panel = panels(svg).find(item => item.kind === "record")!;
    const items = texts(svg).filter(item => inside(item, panel));
    const title = items.find(item => hasClass(item, "record-title"))!;
    const meta = items.filter(item => hasClass(item, "record-meta"));
    const income = items.find(item => hasClass(item, "record-income"))!;
    const amountLabels = items.filter(item => hasClass(item, "amount-label"));
    const paymentLabels = items.filter(item => hasClass(item, "payment-label"));
    const paymentDetails = items.filter(item => hasClass(item, "payment-detail"));
    expect(title.y).toBeGreaterThan(meta[0]!.lastY);
    expect(meta[1]!.y).toBeGreaterThan(title.lastY);
    expect(income.y).toBeGreaterThan(meta[1]!.lastY);
    expect(amountLabels[1]!.y).toBeGreaterThan(income.lastY);
    expect(paymentLabels[0]!.y).toBeGreaterThan(amountLabels[1]!.lastY);
    expect(paymentLabels).toHaveLength(2);
    expect(paymentDetails).toHaveLength(2);
    const sourceNames = locale === "zh_CN" ? ["现金", "刷卡", "礼物卡"] : ["Cash", "Card", "Gift card"];
    sourceNames.forEach(source => expect(paymentDetails[0]!.value).toContain(source));
    expect(paymentDetails[1]!.value).not.toContain(locale === "zh_CN" ? "现金" : "Cash");
    expect(paymentDetails[1]!.value).toContain(locale === "zh_CN" ? "刷卡" : "Card");
    expect(paymentDetails[1]!.value).toContain(locale === "zh_CN" ? "礼物卡" : "Gift card");
    expect(compact(paymentDetails[0]!.value)).toContain(compact(money(4_001, locale)));
    expect(compact(paymentDetails[0]!.value)).toContain(compact(money(4_000, locale)));
    expect(compact(paymentDetails[0]!.value)).toContain(compact(money(2_000, locale)));
    expect(compact(paymentDetails[1]!.value)).not.toContain(compact(money(0, locale)));
    expect(compact(paymentDetails[1]!.value)).toContain(compact(money(199, locale)));
    expect(svg).not.toContain("card-amount-box");
  });

  it.each(locales)("%s 待结账不展示确认收入，未知付款与精确零值不同", locale => {
    const data = snapshot([
      record({ status: "DRAFT", employeeIncomeCents: 888_888, cashServiceCents: null, cardServiceCents: null, giftCardServiceCents: null, cashTipCents: null, cardTipCents: null, giftCardTipCents: null }),
      record({ employeeIncomeCents: null, cashServiceCents: 0, cardServiceCents: 0, giftCardServiceCents: 0, cashTipCents: 0, cardTipCents: null, giftCardTipCents: 0 }),
    ]);
    const { svg } = createEmployeeClosingSvg(data, locale);
    const allTexts = texts(svg);
    const recordPanels = panels(svg).filter(item => item.kind === "record");
    const pending = allTexts.filter(item => inside(item, recordPanels[0]!));
    const confirmed = allTexts.filter(item => inside(item, recordPanels[1]!));
    expect(pending.find(item => hasClass(item, "record-income"))!.value).toBe(locale === "zh_CN" ? "未确认" : "Unconfirmed");
    expect(pending.map(item => item.value).join(" ")).toContain(locale === "zh_CN" ? "未计入今日汇总" : "excluded from today's totals");
    expect(pending.map(item => item.value).join(" ")).not.toContain(locale === "zh_CN" ? "本笔已确认收入" : "Confirmed earnings for this record");
    expect(pending.filter(item => hasClass(item, "payment-detail")).map(item => item.value)).toEqual(Array(2).fill(locale === "zh_CN" ? "未确认" : "Unconfirmed"));
    expect(confirmed.find(item => hasClass(item, "record-income"))!.value).toBe(locale === "zh_CN" ? "未确认" : "Unconfirmed");
    const zeroPayment = confirmed.find(item => hasClass(item, "payment-detail"))!;
    expect(compact(zeroPayment.value)).toBe(compact(money(0, locale)));
    expect(confirmed.filter(item => hasClass(item, "payment-detail"))[1]!.value).toContain(locale === "zh_CN" ? "刷卡 未确认" : "Card Unconfirmed");
    expect(svg).not.toContain(money(888_888, locale));
    expect(compact(allTexts.find(item => hasClass(item, "primary-amount"))!.value)).toBe(compact(money(data.employee.confirmedIncomeCents, locale)));
  });

  it.each(locales)("%s 免费项目的非现金工资沿用快照，没有依据零付款重新计算", locale => {
    const data = snapshot([record({ grossFeeBaseCents: 0, cashServiceCents: 0, cardServiceCents: 0, giftCardServiceCents: 0, employeeIncomeCents: 3_600 })]);
    data.employee.cashLargeFeeDividendCents = 0;
    data.employee.cardLargeFeeDividendCents = 3_600;
    data.employee.confirmedLargeFeeWageCents = 3_600;
    const { svg } = createEmployeeClosingSvg(data, locale);
    const panel = panels(svg).find(item => item.kind === "service-summary")!;
    const items = texts(svg).filter(item => inside(item, panel));
    expect(items.filter(item => hasClass(item, "amount")).map(item => compact(item.value))).toEqual([0, 3_600, 3_600].map(amount => compact(money(amount, locale))));
    expect(items.find(item => hasClass(item, "note"))!.value).toContain(locale === "zh_CN" ? "未按现金分配" : "not allocated to cash");
  });

  it.each(locales)("%s 空营业日显示零收入和仍未日结的上下文", locale => {
    const data = snapshot([]);
    data.isClosed = false;
    data.activeClosing = null;
    for (const field of Object.keys(data.employee) as Array<keyof ClosingSnapshot["employee"]>) if (field !== "displayName") data.employee[field] = 0;
    const { svg } = createEmployeeClosingSvg(data, locale);
    const allTexts = texts(svg);
    expect(allTexts.find(item => hasClass(item, "closing-state"))!.value).toBe(locale === "zh_CN" ? "尚未日结" : "Business day still open");
    expect(compact(allTexts.find(item => hasClass(item, "primary-amount"))!.value)).toBe(compact(money(0, locale)));
    expect(panels(svg).filter(item => item.kind === "record")).toHaveLength(0);
    expect(panels(svg).filter(item => item.kind === "empty")).toHaveLength(1);
    expect(allTexts.map(item => item.value).join(" ")).toContain(locale === "zh_CN" ? "暂无记工" : "No work records");
  });

  it("逐笔按实际开始时间排序，相同时间稳定，缺失时间最后且不修改快照", () => {
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
    expect(data).toEqual(before);
    expect(texts(svg).find(item => hasClass(item, "closing-state"))!.value).toContain("Closing #2");
  });

  it.each(locales)("%s 长中英文对象、项目与大金额完整换行且保留在各自面板中", locale => {
    const data = snapshot([record({ serviceName: "完整服务项目 VeryLongUnbrokenServiceWWIdentifier".repeat(8), addons: [{ name: "完整加项 LongAddonIdentifier".repeat(6), shortName: "" }], employeeIncomeCents: 123_456_789_012_345 })]);
    data.storeName = "完整门店名称 StoreWWIdentifier".repeat(8);
    data.employee.displayName = "完整员工姓名 EmployeeWWIdentifier".repeat(8);
    data.employee.confirmedIncomeCents = 123_456_789_012_345;
    data.employee.cardLargeFeeDividendCents = 123_456_789_012_345;
    const { svg, width, height } = createEmployeeClosingSvg(data, locale);
    const allTexts = texts(svg);
    for (const [className, expected] of [["store", data.storeName], ["employee-name", data.employee.displayName], ["record-title", `${data.records[0]!.serviceName} + ${data.records[0]!.addons[0]!.name}`]] as const) {
      const item = allTexts.find(text => hasClass(text, className))!;
      expect(compact(item.value)).toBe(compact(expected));
      expect(item.lines).toBeGreaterThan(1);
    }
    const primary = allTexts.find(item => hasClass(item, "primary-amount"))!;
    expect(primary.lines).toBeGreaterThan(1);
    expect(compact(primary.value)).toBe(compact(money(data.employee.confirmedIncomeCents, locale)));
    const allPanels = panels(svg);
    allPanels.forEach((panel, index) => {
      expect(panel.x + panel.width).toBeLessThanOrEqual(width);
      expect(panel.y + panel.height).toBeLessThan(height);
      if (index > 0) expect(panel.y).toBeGreaterThan(allPanels[index - 1]!.y + allPanels[index - 1]!.height);
    });
    const recordPanel = allPanels.find(item => item.kind === "record")!;
    const recordTexts = allTexts.filter(item => item.y > recordPanel.y && !hasClass(item, "footer"));
    expect(recordTexts.every(item => inside(item, recordPanel))).toBe(true);
    expect(svg).not.toMatch(/…|<clipPath\b|overflow="hidden"|text-overflow/);
  });

  it("图片沿用共享调色板及圆角，固定不透明背景，文字不缩为三列小字", () => {
    const css = readFileSync(new URL("../../../apps/web/app/globals.css", import.meta.url), "utf8");
    const { svg, height } = createEmployeeClosingSvg(snapshot(), "zh_CN");
    const theme = ["page", "surface", "ink", "muted", "line", "brand"].map(name => css.match(new RegExp(`--${name}:\\s*(#[\\da-fA-F]+)`))![1]!.toLowerCase());
    const renderedColors = [...new Set([...svg.matchAll(/#[\da-fA-F]{3,8}\b/g)].map(match => match[0].toLowerCase()))].sort();
    expect(renderedColors).toEqual([...theme].sort());
    const background = css.match(/--page:\s*(#[\da-fA-F]+)/)![1]!;
    expect(svg).toContain(`<rect x="0" y="0" width="1170" height="${height}" fill="${background}"/>`);
    expect(svg).not.toMatch(/linearGradient|<filter\b|feDropShadow|fill-opacity=|width="100%"|font-weight:[789]00/);
    const panelRadius = Number(css.match(/--radius-panel:\s*(\d+)px/)![1]);
    expect([...svg.matchAll(/\brx="(\d+)"/g)].every(match => Number(match[1]) === panelRadius)).toBe(true);
    expect([...svg.matchAll(/font-size:(\d+)px/g)].every(match => Number(match[1]) >= 36)).toBe(true);
    expect(panels(svg).every(panel => panel.x === 48 && panel.width === 1074)).toBe(true);
  });
});
