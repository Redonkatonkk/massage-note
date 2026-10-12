import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type ClosingSnapshot } from "@massage-note/domain";
import { EmployeeClosingStatement } from "./employee-closing-statement";

const record: ClosingSnapshot["records"][number] = {
  id: "mixed", startAt: "2026-10-12T16:00:00Z", endAt: "2026-10-12T17:00:00Z", status: "CONFIRMED",
  serviceShortName: "全身", serviceName: "全身按摩", addons: [{ shortName: "热石", name: "热石加项" }],
  isHighlighted: true, discountTotalCents: 501, grossFeeBaseCents: 10001,
  cashServiceCents: 4000, cardServiceCents: 4500, giftCardServiceCents: 1000,
  cashTipCents: 0, cardTipCents: 1250, giftCardTipCents: 0, employeeIncomeCents: 7251,
};
const snapshot: ClosingSnapshot = {
  storeName: "测试店 & Spa", storeTimezone: "America/New_York", businessDate: "2026-10-12", isClosed: false, activeClosing: null,
  employee: { displayName: "小美", grossFeeBaseCents: 10001, cashToSubmitToStoreCents: 999999, cashLargeFeeDividendCents: 2400, cardLargeFeeDividendCents: 3601, cashTipDividendCents: 0, cardTipDividendCents: 1250, confirmedLargeFeeWageCents: 6001, confirmedTipWageCents: 1250, confirmedIncomeCents: 7251 },
  records: [record, { ...record, id: "pending", startAt: "2026-10-12T14:00:00Z", endAt: "2026-10-12T15:00:00Z", status: "PENDING_PAYMENT", isHighlighted: false, discountTotalCents: 0, addons: [], employeeIncomeCents: 888888 }, { ...record, id: "zero", startAt: "2026-10-12T18:00:00Z", endAt: "2026-10-12T19:00:00Z", isHighlighted: false, discountTotalCents: 0, addons: [], cashTipCents: 0, cardTipCents: 0, giftCardTipCents: 0 }],
};

describe("个人日结页面统一记工卡", () => {
  it.each(["zh-CN", "en-US"] as const)("%s 汇总用服务端金额，卡片保留精确付款、状态和标记", locale => {
    const dom = new JSDOM(renderToStaticMarkup(<EmployeeClosingStatement snapshot={snapshot} locale={locale} />));
    const doc = dom.window.document;
    expect(doc.querySelector(".closing-template-total")!.textContent).toBe("$72.51");
    expect([...doc.querySelectorAll("tbody td")].map(cell => cell.textContent)).toEqual(["$24.00", "$0.00", "$36.01", "$12.50"]);
    expect(doc.querySelector("tbody tr:last-child th")!.textContent).toBe(locale === "zh-CN" ? "刷卡＋礼卡" : "Card + gift card");
    const cards = [...doc.querySelectorAll(".closing-template-record")];
    expect(cards.map(card => card.querySelector("time")!.textContent)).toEqual(["10:00–11:00", "12:00–13:00", "14:00–15:00"]);
    expect(cards[0]!.querySelector(".closing-template-pending")!.textContent).toContain(locale === "zh-CN" ? "未计入汇总" : "excluded from totals");
    expect(cards[0]!.querySelector(".closing-template-income strong")!.textContent).toBe(locale === "zh-CN" ? "未确认" : "Unconfirmed");
    expect(cards[0]!.textContent).not.toContain("$8,888.88");
    expect(cards[1]!.classList.contains("is-highlighted")).toBe(true);
    expect(cards[1]!.querySelector(".closing-template-discount")!.textContent).toBe("off5.01");
    expect(cards[1]!.querySelector(".closing-template-addon")).not.toBeNull();
    expect(cards[1]!.querySelector(".closing-template-extra")!.textContent).toContain("热石");
    expect(cards[1]!.querySelector(".closing-template-gross strong")!.textContent).toBe("$100.01");
    expect([...cards[1]!.querySelectorAll(".closing-template-payment--card")].map(node => node.textContent)).toEqual([4500, 1250].map(value => `${locale === "zh-CN" ? "刷卡" : "Card"} $${(value / 100).toFixed(2)}`));
    expect(cards[1]!.querySelector(".closing-template-payment--gift")!.textContent).toContain("$10.00");
    expect(cards[2]!.querySelector(".closing-template-payment--zero")!.textContent).toBe("$0.00");
    expect(doc.body.textContent).not.toContain("$9,999.99");
    dom.window.close();
  });

  it("空日仍有收入和来源，长数据可换行，320至桌面持续保持两列与来源语义", async () => {
    const empty = new JSDOM(renderToStaticMarkup(<EmployeeClosingStatement snapshot={{ ...snapshot, records: [] }} locale="zh-CN" />));
    expect(empty.window.document.querySelector(".closing-template-empty")!.textContent).toContain("没有记工"); empty.window.close();
    const checkerPath = pathToFileURL(resolve(process.cwd(), "../../scripts/check-mobile-ui.mjs")).href;
    const { stylesAtWidth } = await import(/* @vite-ignore */ checkerPath);
    const sources = await Promise.all(["globals.css", "design-system.css", "responsive.css"].map(async name => ({ name, css: await readFile(resolve(process.cwd(), "app", name), "utf8") })));
    const long = { ...snapshot, employee: { ...snapshot.employee, displayName: "Alexandria 很长的员工姓名".repeat(5) }, records: [{ ...record, serviceShortName: "VeryLongUnbrokenServiceName".repeat(8), cashServiceCents: 123456789012345 }] };
    const markup = renderToStaticMarkup(<EmployeeClosingStatement snapshot={long} locale="en-US" />);
    for (const width of [320, 360, 390, 760, 1200]) {
      const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style>${markup}`);
      const doc = dom.window.document, style = (selector: string) => dom.window.getComputedStyle(doc.querySelector(selector)!);
      expect(style(".closing-template-records").gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
      expect(style(".closing-template-record").gridTemplateColumns).not.toBe("minmax(0, 1fr) 116px");
      for (const selector of [".closing-template-heading h2", ".closing-template-record-title > strong", ".closing-template-payment", ".closing-template-sources td"]) expect(style(selector).overflowWrap).toBe("anywhere");
      expect(style(".closing-template-record").borderRadius).toBe("6px");
      expect(style(".closing-template-record").backgroundColor).toBe("rgb(237, 242, 233)");
      dom.window.close();
    }
  }, 30000);
});
