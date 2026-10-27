// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../lib/api";
import type { GiftCardSale, StoreMember, WorkRecord } from "../lib/types";
import { GiftCardSales } from "./gift-card-sales";
import { RecordEditor } from "./record-editor";
import { GiftCardLedger } from "./finance/gift-card-ledger";
import { GiftCardIdentityField } from "./gift-card-identity-field";

vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const member: StoreMember = { id: "member", displayName: "店主", role: "OWNER", status: "ACTIVE", isServiceProvider: true, employmentType: "PART_TIME", defaultCommissionBps: null, closingDeliveryEnabled: false, closingDeliveryPhoneE164: null, closingImageLocale: null, deletedAt: null, version: 1 };
const sale: GiftCardSale = { id: "sale", businessDate: "2026-10-15", serialNumber: "001001", isOnline: true, faceValueCents: 10000, discountThresholdCents: 0, discountRateBps: 0, discountCents: 0, cashCents: 10000, cardCents: 0, amountCents: 10000, operatorMembershipId: member.id, operator: member, version: 1, deletedAt: null, deletedBy: null, deleteReason: null, createdAt: "2026-10-15T16:00:00Z", updatedAt: "2026-10-15T16:00:00Z" };
const record: WorkRecord = {
  id: "record", employeeMembershipId: member.id, businessDate: "2026-10-15", storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "04:00", startAt: "2026-10-15T14:00:00Z", endAt: "2026-10-15T15:00:00Z", actualDurationMinutes: 60, status: "CONFIRMED",
  mainServiceAmountCents: 10000, addonTotalCents: 0, grossFeeBaseCents: 10000, discountTotalCents: 0, discountedFeePerformanceCents: 10000, cashServiceCents: 0, cardServiceCents: 0, giftCardSerialNumber: "001001", giftCardIsOnline: true, giftCardServiceCents: 10000, cashTipCents: 0, cardTipCents: 0, giftCardTipCents: 0, totalTipCents: 0, actualServiceCollectedCents: 10000, customerTotalPaidCents: 10000, paymentDifferenceCents: 0, mainServiceWageCents: 6000, addonWageCents: 0, totalLargeFeeWageCents: 6000, employeeTotalIncomeCents: 6000,
  tipSettledManualFlag: false, largeFeeSettledManualFlag: false, automaticDiscountSuppressed: false, isHighlighted: false, isDispatchExcluded: false, note: "", version: 1, deletedAt: null, serviceSnapshot: { isCustom: true, sourceServiceItemId: null, name: "按摩", shortName: "按摩", amountCents: 10000, durationMinutes: 60, commissionBps: 6000, commissionSource: "store_global", wageCents: 6000 }, addonSnapshots: [], discountSnapshots: [], payment: null,
};
const settings = { giftCardAutoDiscountEnabled: false, giftCardAutoDiscountThresholdCents: 0, giftCardAutoDiscountBps: 0 };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  request.mockReset(); request.mockResolvedValue(sale);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => button.click());
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
function input(label: string) {
  const byAria = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (byAria) return byAria;
  const node = [...document.querySelectorAll("label")].find((node) => node.textContent === label);
  if (!node) throw new Error(`Missing label ${label}`);
  return (node.htmlFor ? document.getElementById(node.htmlFor) : node.querySelector("input")) as HTMLInputElement;
}
const salesForm = (sales: GiftCardSale[] = []) => <GiftCardSales storeId="store" businessDate="2026-10-15" sales={sales} nextSerialNumber="1001" discountSettings={settings} members={[member]} defaultOperatorMembershipId={member.id} canEdit onReload={async () => {}} />;
const editor = (value = record) => <RecordEditor storeId="store" timezone="America/New_York" businessDate="2026-10-15" autoDiscountSettings={{ mondayThursdayAutoDiscountEnabled: false, mondayThursdayAutoDiscountThresholdCents: 0, mondayThursdayAutoDiscountAmountCents: 0 }} record={value} catalog={{ serviceItems: [], addonItems: [], discountItems: [] }} members={[member]} canManage isClosed={false} onSaved={() => {}} onClose={() => {}} onChanged={async () => {}} />;

it("网上卖卡切换为用户名，保留前导零；切回实体卡保留建议号", async () => {
  await act(async () => root.render(salesForm())); await click("＋记录卖卡");
  expect(input("礼物卡序列号").value).toBe("1001");
  await click("网上卖卡"); await fill(input("用户名"), "001001");
  await click("网上卖卡"); expect(input("礼物卡序列号").value).toBe("1001");
  await click("网上卖卡"); expect(input("用户名").value).toBe("001001");
  await fill(input("礼物卡总金额（美元）"), "100"); await fill(input("现金付款（美元）"), "100");
  await click("保存卖卡记录");
  expect(request).toHaveBeenCalledWith("/stores/store/gift-card-sales", expect.objectContaining({ body: expect.objectContaining({ serialNumber: "001001", isOnline: true }) }));
});

it("编辑网上卖卡保留用户名模式，空用户名不提交", async () => {
  await act(async () => root.render(salesForm([sale])));
  await act(async () => container.querySelector<HTMLButtonElement>(".gift-card-sale-card")!.click());
  expect(input("用户名").value).toBe("001001");
  await fill(input("用户名"), " "); await click("保存卖卡记录");
  expect(request).not.toHaveBeenCalled(); expect(container.textContent).toContain("请填写用户名");
});

it("礼卡付款重新编辑保留模式，可直接保存任意用户名", async () => {
  await act(async () => root.render(editor()));
  expect(input("用户名").value).toBe("001001");
  await fill(input("用户名"), "000000999"); await click("保存");
  expect(request).toHaveBeenCalledWith("/stores/store/work-records/record/save", expect.objectContaining({ body: expect.objectContaining({ payment: expect.objectContaining({ giftCardSerialNumber: "000000999", giftCardIsOnline: true, giftCardServiceCents: 10000 }) }) }));
});

it("取消礼卡付款会清除用户名付款标记", async () => {
  await act(async () => root.render(editor()));
  const toggle = [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].find((node) => node.parentElement?.textContent?.includes("使用礼物卡付款"))!;
  await act(async () => toggle.click()); await fill(input("现金大费（美元）"), "100"); await click("保存");
  const body = request.mock.calls[0]![1]!.body as { payment: object };
  expect(body.payment).toMatchObject({ giftCardServiceCents: 0, giftCardTipCents: 0 });
  expect(body.payment).not.toHaveProperty("giftCardIsOnline", true);
});

it("切换用户名模式形成草稿，重新打开后保持原输入和模式", async () => {
  const physical = { ...record, giftCardIsOnline: false };
  await act(async () => root.render(editor(physical)));
  await click("使用用户名");
  await act(async () => root.render(null));
  await act(async () => root.render(editor(physical)));
  expect(input("用户名").value).toBe("001001");
  expect([...document.querySelectorAll("button")].find((node) => node.textContent === "使用用户名")!.getAttribute("aria-pressed")).toBe("true");
});

it("台账把重复购买归为用户名一组，使用金额只合计一次且与同号实体卡分开", () => {
  const usage = { id: "use", businessDate: "2026-10-15", startAt: "2026-10-15T16:00:00Z", serviceShortName: "按摩", employee: member, serviceCents: 1000, tipCents: 0, amountCents: 1000 };
  const markup = renderToStaticMarkup(<GiftCardLedger ledger={{ nextSerialNumber: "1002", sales: [{ ...sale, id: "physical", isOnline: false, usageRecords: [] }, { ...sale, usageRecords: [] }, { ...sale, id: "repeat", usageRecords: [] }], legacyUsages: [], onlineAccounts: [{ username: "001001", sales: [sale, { ...sale, id: "repeat" }], usageRecords: [usage] }, { username: "unknown", sales: [], usageRecords: [] }] }} />);
  const dom = document.createElement("div"); dom.innerHTML = markup;
  expect(dom.querySelectorAll(".gift-card-ledger__summary article strong")[2]!.textContent).toBe("$10");
  expect(dom.textContent).toContain("2 次购买"); expect(dom.textContent).toContain("用户名 unknown");
  const table = dom.querySelector(".gift-card-ledger__table")!;
  expect(dom.querySelectorAll("table")).toHaveLength(1);
  expect([...table.querySelectorAll("tbody")].map((group) => group.getAttribute("aria-label"))).toEqual(["实体卡", "网上卖卡"]);
  expect(table.querySelectorAll('tbody[aria-label="实体卡"] tr')).toHaveLength(2);
  const online = table.querySelector('tbody[aria-label="网上卖卡"]')!;
  expect(online.querySelectorAll("tr")).toHaveLength(4);
  expect(online.querySelector(".gift-card-ledger__account")?.getAttribute("rowspan")).toBe("2");
  expect(online.querySelectorAll(".gift-card-ledger__usage-list article")).toHaveLength(1);
  expect(online.textContent).toContain("用户名 unknown未登记销售");
  expect(dom.querySelectorAll(".mobile-data-view .mobile-data-card")).toHaveLength(3);
});

it("用户名输入和模式按钮在手机样式中可换行，保持文本输入与触控高度", async () => {
  const checkerPath = pathToFileURL(resolve(process.cwd(), "../../scripts/check-mobile-ui.mjs")).href;
  const { stylesAtWidth } = await import(/* @vite-ignore */ checkerPath);
  const sources = await Promise.all(["globals.css", "design-system.css", "responsive.css"].map(async name => ({ name, css: await readFile(resolve(process.cwd(), "app", name), "utf8") })));
  const field = <GiftCardIdentityField isOnline onModeChange={() => {}} value={"001001".repeat(20)} onChange={() => {}} actionLabel="网上卖卡" />;
  const markup = renderToStaticMarkup(<section className="quick-modal gift-card-sale-modal"><div className="gift-card-sale-form">{field}</div></section>);
  for (const width of [320, 390, 600, 760, 1200]) {
    const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style>${markup}`);
    const doc = dom.window.document;
    const style = (selector: string) => dom.window.getComputedStyle(doc.querySelector(selector)!);
    expect(style(".gift-card-identity-field__controls").flexWrap).toBe("wrap");
    expect(parseFloat(style("input").minWidth)).toBe(0);
    expect(parseFloat(style("button").minHeight)).toBeGreaterThanOrEqual(44);
    expect(doc.querySelector("input")!.type).toBe("text");
    dom.window.close();
  }
});
