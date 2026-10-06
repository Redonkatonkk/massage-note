// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { ExpenseMonthResponse } from "@massage-note/contracts";
import { formatUsd, formatUsdPrecise } from "../../lib/money";
import type { AuditLogItem, CashSettlementRow, ClosingDeliveryItem, ClosingEmployeeTotals, DeletedGiftCardSale, DeletedWorkRecord, EmployeeSettlementPreview, FinanceDetailsResponse, GiftCardLedgerResponse, PayrollSettlement, WorkBotSettings } from "../../lib/types";
import { ClosingDeliveryQueue } from "../closing-delivery-queue";
import HelpPage from "../help/page";
import { auditFacts, AuditDetails } from "../manage/audit-details";
import { RecoveryPanel } from "../manage/recovery-panel";
import { WorkBotPanel } from "../manage/work-bot-panel";
import { FinanceGiftSaleCards, FinanceRecordCards } from "../finance/finance-detail-records";
import { GiftCardLedger } from "../finance/gift-card-ledger";
import { PayrollLedger } from "../finance/payroll-ledger";
import { SettlementSummary } from "../finance/settlement-summary";
import { ClosingEmployeeTable } from "../finance/closing-employee-table";
import { ExpensesPanel } from "../finance/expenses-panel";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../lib/realtime", () => ({ useStoreRealtime: () => {} }));
const request = vi.mocked(apiRequest);
const at = "2026-10-04T14:00:00.000Z";
const name = "Alexandria · 一位姓名很长的员工";
const reason = "选错营业日，已和员工核对，需要恢复这条历史记录。";
const member = { id: "member", displayName: name, role: "EMPLOYEE" as const, status: "ACTIVE" as const };
// These fixtures deliberately vary the values used by each renderer; no client-side financial calculation is substituted.
const record: DeletedWorkRecord = {
  id: "record", employeeMembershipId: member.id, businessDate: "2026-10-03", storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "04:00", employee: { ...member, isServiceProvider: true }, startAt: at, endAt: null, actualDurationMinutes: null, status: "CONFIRMED",
  mainServiceAmountCents: 123400, addonTotalCents: 0, grossFeeBaseCents: 123400, discountTotalCents: 0, discountedFeePerformanceCents: 123400, cashServiceCents: 123400, cardServiceCents: 0, giftCardSerialNumber: null, giftCardServiceCents: 0, cashTipCents: 0, cardTipCents: 0, giftCardTipCents: 0, totalTipCents: 0, actualServiceCollectedCents: 123400, customerTotalPaidCents: 123400, paymentDifferenceCents: 0, mainServiceWageCents: 74040, addonWageCents: 0, totalLargeFeeWageCents: 74040, employeeTotalIncomeCents: 74040, tipSettledManualFlag: false, largeFeeSettledManualFlag: false, automaticDiscountSuppressed: false, isHighlighted: false, note: "", version: 9, deletedAt: at, deletedBy: "manager", deleteReason: reason,
  serviceSnapshot: { sourceServiceItemId: "service", isCustom: false, name: "足疗", shortName: "足疗", amountCents: 123400, durationMinutes: 60, commissionBps: 6000, commissionSource: "STORE", wageCents: 74040 }, addonSnapshots: [], discountSnapshots: [], payment: null,
};
const sale: DeletedGiftCardSale = { id: "sale", businessDate: "2026-10-03", serialNumber: "1002", faceValueCents: 20000, discountThresholdCents: 10000, discountRateBps: 1000, discountCents: 2000, cashCents: 9000, cardCents: 9000, amountCents: 18000, operatorMembershipId: member.id, operator: member, version: 7, deletedAt: at, deletedBy: "manager", deleteReason: reason, createdAt: at, updatedAt: at };
const payroll: PayrollSettlement = { id: "pay", membershipId: member.id, settlementDate: "2026-10-04", periodStart: "2026-09-01", periodEnd: "2026-09-30", serviceWageCents: 100000, cashTipCents: 0, cardTipCents: 23456, adjustmentCents: 0, totalPaidCents: 123456, paymentMethod: "CASH", paymentScope: "NON_CASH", note: "", createdBy: "manager", updatedBy: "manager", createdByDisplayName: "经理", updatedByDisplayName: "经理", historyChangedAfterSettlement: true, createdAt: at, updatedAt: at, version: 3, deletedAt: null, deleteReason: null, membership: member };
const delivery = (status: ClosingDeliveryItem["status"]): ClosingDeliveryItem => ({ id: status, closingId: "closing", membershipId: member.id, kind: "INITIAL", status, recipientPhoneE164: "+17705750450", locale: "zh_CN", attemptCount: 3, lastErrorCode: "OFFLINE", lastError: "发送设备长时间离线，请检查代理连接后重试。", sentAt: null, nextAttemptAt: at, createdAt: at, updatedAt: at, closing: { cycleNo: 2, status: "CLOSED" }, membership: member });
const queue = { deliveries: [delivery("QUEUED"), delivery("FAILED"), delivery("CLAIMED"), delivery("SENT")], batchAllowed: true, batchBlockedReason: null, agent: null };
const audit: AuditLogItem = { id: "audit", source: "WEB", action: "UPDATE", entityType: "member", entityId: "member-identifier-with-a-long-continuous-suffix", businessDate: null, beforeJson: { displayName: "ALL", commissionBps: 6250, totalPaidCents: 123456, isEnabled: false, note: null }, afterJson: { displayName: name, commissionBps: 7000, totalPaidCents: "234567", unknownField: { preserved: "nested-value" } }, reason, requestId: "request", createdAt: at, actor: member };
const preview: EmployeeSettlementPreview = { storeId: "store", storeName: "门店", storeTimezone: "America/New_York", dateFrom: "2026-09-01", dateTo: "2026-09-30", paymentScope: "ALL", employee: { membershipId: member.id, displayName: name }, summary: { recordCount: 10, cashServiceCents: 110000, nonCashServiceCents: 220000, cashLargeFeeWageCents: 123456, nonCashLargeFeeWageCents: 234567, cashTipCents: 3456, nonCashTipCents: 4567, cashIncomeCents: 126912, nonCashIncomeCents: 239134, totalIncomeCents: 366046 }, records: [], generatedAt: at };
const usage = { id: "usage", businessDate: "2026-10-04", startAt: at, serviceShortName: "足疗", employee: member, serviceCents: 5000, tipCents: 1000, amountCents: 6000 };
const ledger: GiftCardLedgerResponse = { nextSerialNumber: "1003", sales: [{ ...sale, deletedAt: null, usageRecords: [usage] }], legacyUsages: [{ serialNumber: "999", usageRecords: [{ ...usage, id: "old-usage" }] }] };
const finance: FinanceDetailsResponse = { filters: { dateFrom: "2026-10-01", dateTo: "2026-10-04", membershipIds: [], paymentMethod: "CASH", amountType: "ALL", highlightFilter: "ALL" }, records: [{ ...record, deletedAt: null, status: "CONFIRMED", isHighlighted: true, hasCashAndNonCashPayment: true, mainServiceAmountCents: 10000, addonTotalCents: 2000, discountTotalCents: 1000, discountedFeePerformanceCents: 11000, cashServiceCents: 4000, cardServiceCents: 6000, giftCardServiceCents: 1000, giftCardSerialNumber: "1002", cashTipCents: 500, cardTipCents: 800, giftCardTipCents: 200, customerTotalPaidCents: 12500, selectedLargeFeeWageCents: 2400, selectedTipCents: 500, selectedEmployeeIncomeCents: 2900 }], giftCardSales: [sale] };
const bot: WorkBotSettings = { instructions: "", instructionsVersion: 1, aliases: [], operations: [], groups: [{ id: "group", platform: "wechat", botId: "long-bot-id", groupId: "long-group-id", version: 1, updatedAt: at, memberBindings: [{ id: "binding", senderId: "__massage_note_delegated__:long-identity", membershipId: member.id, activeWorkRecordId: "active-record", verifiedAt: null, version: 1, updatedAt: at, membership: member, activeWorkRecord: { id: "active-record", startAt: at, endAt: null, status: "WORKING" } }] }] };
const noop = () => {};
const run = async (action: () => Promise<void>) => action();
const reload = vi.fn(async () => {});
const recovery = (busy = false) => <RecoveryPanel storeId="store" records={[record]} giftCardSales={[sale]} busy={busy} run={run} reload={reload} />;
const pay = (canManage = true, busy = false, settlements = [payroll]) => <PayrollLedger settlements={settlements} canManage={canManage} busy={busy} onEdit={noop} onDelete={noop} onRestore={noop} />;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); request.mockReset(); request.mockResolvedValue({}); reload.mockClear(); vi.spyOn(window, "confirm").mockReturnValue(false); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function mount(element: ReactElement) { await act(async () => root.render(element)); }
function mobileCards() { return [...container.querySelectorAll<HTMLElement>(".mobile-data-view .mobile-data-card")]; }
function button(text: string, scope: ParentNode) { const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text); if (!found) throw new Error(`Missing button ${text}`); return found; }
function fact(scope: ParentNode, label: string) { return [...scope.querySelectorAll("dl > div")].find(node => node.querySelector("dt")?.textContent === label)?.querySelector("dd")?.textContent; }

describe("mobile reading order and protected actions in actual components", () => {
  it("describes placeholder recovery without a service or amount and summarizes its audit status", async () => {
    const placeholder = { ...record, status: "PLACEHOLDER" as const, serviceSnapshot: null, grossFeeBaseCents: 0 };
    await mount(<RecoveryPanel storeId="store" records={[placeholder]} giftCardSales={[]} busy={false} run={run} reload={reload} />);
    const card = mobileCards()[0]!;
    expect(card.querySelector("header p")?.textContent).toContain("占位");
    expect(fact(card, "大费基数")).toBeUndefined(); expect(card.textContent).not.toContain("$0");
    vi.mocked(window.confirm).mockReturnValue(true); await act(async () => button("恢复占位", card).click());
    expect(window.confirm).toHaveBeenCalledWith(`确认恢复 ${name} 的这张占位小卡吗？恢复后只在主表占位，不计入财务。`);
    expect(request).toHaveBeenCalledWith("/stores/store/work-records/record/restore", { method: "POST", idempotent: true, body: { version: 9 } });
    expect(auditFacts({ status: "PLACEHOLDER", grossFeeBaseCents: 0, cashServiceCents: null, commissionBps: 0, isHighlighted: false, durationMinutes: null, serviceName: null, note: "" })).toEqual([{ label: "状态", value: "占位" }]);
  });
  it("shows deletion context before restore, and preserves confirmation, version and idempotency", async () => {
    await mount(recovery()); const [work, gift] = mobileCards();
    expect(work!.querySelector("h3")?.textContent).toBe(name);
    expect(fact(work!, "删除原因")).toBe(reason);
    expect(work!.textContent!.indexOf(reason)).toBeLessThan(work!.textContent!.indexOf("恢复记工"));
    await act(async () => button("恢复记工", work!).click()); expect(request).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    await act(async () => button("恢复记工", work!).click());
    expect(request).toHaveBeenCalledWith("/stores/store/work-records/record/restore", { method: "POST", idempotent: true, body: { version: 9 } });
    await act(async () => button("恢复卖卡记录", gift!).click());
    expect(request).toHaveBeenLastCalledWith("/stores/store/gift-card-sales/sale/restore", { method: "POST", idempotent: true, body: { version: 7 } });
    expect(reload).toHaveBeenCalledTimes(2);
    await mount(recovery(true)); expect(mobileCards().every(card => card.querySelector<HTMLButtonElement>("button")!.disabled)).toBe(true);
  });
  it("pairs precise paid amounts with date range and scope, retains warnings and permission rules", async () => {
    await mount(pay()); const card = mobileCards()[0]!;
    expect(fact(card, "实付工资")).toBe(formatUsdPrecise(payroll.totalPaidCents));
    expect(fact(card, "工资来源")).toBe("刷卡＋礼物卡");
    expect(card.textContent!.indexOf("历史数据")).toBeLessThan(card.textContent!.indexOf("修改"));
    await mount(pay(false)); expect(mobileCards()[0]!.querySelector("button")).toBeNull();
    await mount(pay(true, true)); expect([...mobileCards()[0]!.querySelectorAll<HTMLButtonElement>("button")].every(node => node.disabled)).toBe(true);
    await mount(pay(true, false, [{ ...payroll, deletedAt: at }])); expect(mobileCards()[0]!.textContent).toContain("已删除"); expect([...mobileCards()[0]!.querySelectorAll("button")].map(node => node.textContent)).toEqual(["恢复"]);
    await mount(pay(true, false, [])); expect(container.textContent).toContain("还没有工资结算记录");
  });
  it("puts failed delivery reasons in the main record, and only lets queued tasks be cancelled", async () => {
    const cancel = vi.fn(); await mount(<ClosingDeliveryQueue value={queue} busy={false} onCancel={cancel} expanded />);
    const cards = mobileCards(); expect(cards).toHaveLength(4); expect(cards[1]!.querySelector(".form-error")?.textContent).toBe(queue.deliveries[1]!.lastError);
    expect(cards[1]!.querySelector("button")).toBeNull(); expect(cards[2]!.querySelector("button")).toBeNull(); expect(cards[3]!.querySelector(".form-error")).toBeNull();
    expect(cards[0]!.querySelector(".mobile-data-card__details")!.hasAttribute("open")).toBe(false);
    await act(async () => button("取消发送", cards[0]!).click()); expect(cancel).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true); await act(async () => button("取消发送", cards[0]!).click()); expect(cancel).toHaveBeenCalledExactlyOnceWith(queue.deliveries[0]);
  });
  it("keeps human-readable audit amounts, false and zero values, without translating employee names as enums", () => {
    expect(auditFacts({ displayName: "ALL", totalPaidCents: 0, commissionBps: 6250, isEnabled: false, note: null })).toEqual([{ label: "店内显示名", value: "ALL" }, { label: "实付工资", value: formatUsdPrecise(0) }, { label: "提成比例", value: "62.5%" }, { label: "启用", value: "否" }, { label: "备注", value: "未设置" }]);
    expect(auditFacts({ totalPaidCents: "234567" })[0]!.value).toBe(formatUsdPrecise(234567));
    expect(auditFacts({ totalPaidCents: "9007199254740993" })[0]!.value).toBe("9007199254740993");
    const dom = new JSDOM(renderToStaticMarkup(<AuditDetails item={audit} entityLabel="成员" />));
    const raw = dom.window.document.querySelector(".audit-raw")!; expect(raw.hasAttribute("open")).toBe(false); expect(raw.textContent).toContain("nested-value");
    expect(dom.window.document.querySelector(".audit-snapshots")?.textContent).toContain(formatUsdPrecise(123456)); dom.window.close();
  });
  it("preserves API payment values and the mixed-payment warning before expanded details", () => {
    const dom = new JSDOM(renderToStaticMarkup(<FinanceRecordCards details={finance} />)); const card = dom.window.document.querySelector("article")!;
    expect(fact(card, "客人总付款")).toBe(formatUsd(12500)); expect(fact(card, "所选员工收入")).toBe(formatUsd(2900)); expect(fact(card, "刷卡大费")).toBe(formatUsd(6000));
    expect(card.classList.contains("mobile-data-card--highlighted")).toBe(true); expect(card.querySelector(".mobile-data-card__note")?.textContent).toBe("混合付款 · 仅计现金"); expect(card.querySelector("details")!.hasAttribute("open")).toBe(false); dom.window.close();
  });
  it("keeps sold cards and historical usages together, in numeric serial order", async () => {
    await mount(<GiftCardLedger ledger={ledger} />); const cards = mobileCards(); expect(cards.map(card => card.querySelector("h3")?.textContent)).toEqual(["礼物卡 999", "礼物卡 1002"]);
    expect(cards[0]!.textContent).toContain("未登记销售"); expect(cards[0]!.querySelector(".mobile-card-usages")?.textContent).toContain(name); expect(fact(cards[1]!, "实际收款")).toBe(formatUsd(18000));
  });
  it("makes identity and status precede separate bot actions, with delegated and active-work restrictions intact", async () => {
    await mount(<WorkBotPanel storeId="store" catalog={{ serviceItems: [], addonItems: [], discountItems: [] }} settings={bot} busy={false} run={run} reload={reload} />);
    const row = container.querySelector(".work-bot-member")!; expect([...row.children].map(node => node.className)).toEqual(["work-bot-member__identity", "work-bot-member__status", "work-bot-member__actions"]);
    expect(button("核实身份并开启数据访问", row).disabled).toBe(true); expect(button("解除", row).disabled).toBe(true); expect(request).not.toHaveBeenCalled();
  });
  it("makes the ALL wage breakdown readable without dropping cents or totals", async () => {
    await mount(<SettlementSummary preview={preview} />); const mobile = container.querySelector(".mobile-data-view")!; const sections = [...mobile.querySelectorAll("section")];
    expect(sections.map(node => node.querySelector("h3")?.textContent)).toEqual(["大费工资", "小费工资"]);
    expect(fact(sections[0]!, "现金")).toBe(formatUsdPrecise(123456)); expect(fact(sections[0]!, "合计")).toBe(formatUsdPrecise(358023)); expect(fact(sections[1]!, "合计")).toBe(formatUsdPrecise(8023));
    expect(container.querySelector("article.total")?.textContent).toContain(formatUsdPrecise(366046));
  });
  it("uses the cash settlement response for employee actions and amounts, and disables missing cash data", async () => {
    const employee: ClosingEmployeeTotals = { membershipId: member.id, displayName: name, role: "EMPLOYEE", recordCount: 3, employeeIncomeCents: 7800, incompleteRecordCount: 0, grossFeeBaseCents: 10000, discountTotalCents: 0, discountedFeePerformanceCents: 10000, totalTipCents: 1000, customerTotalPaidCents: 11000, totalLargeFeeWageCents: 6800, cashToSubmitToStoreCents: 999900, cashLargeFeeDividendCents: 6800, cashTipDividendCents: 1000, cardLargeFeeDividendCents: 0, cardTipDividendCents: 0 };
    const cash: CashSettlementRow = { membershipId: member.id, displayName: name, role: "EMPLOYEE", status: "UNSETTLED", cashToSubmitToStoreCents: 3200, cashRetainedCents: 7800, cashServiceCents: 10000, cashTipCents: 1000, cashReceivedCents: 11000, cashAllocatedServiceWageCents: 6800, cashAcquiredServiceWageCents: 6800, cashWageShortfallCents: 0, note: "", settledBy: null, settledByDisplayName: null, settledAt: null, version: 1, settlementId: null };
    const toggle = vi.fn(); const element = (cashRows: CashSettlementRow[] | null) => <ClosingEmployeeTable employees={[employee]} cashRows={cashRows} busy={false} cashLoadFailed={false} onReloadCash={noop} onSettleAll={noop} onToggleCash={toggle} />;
    await mount(element([cash])); const card = mobileCards()[0]!;
    expect(fact(card, "应提交店铺")).toBe(formatUsd(3200)); expect(card.textContent).not.toContain(formatUsd(999900));
    await act(async () => button("标记全部结清", card).click()); expect(toggle).toHaveBeenCalledExactlyOnceWith(cash);
    await mount(element(null)); expect(button("标记全部结清", mobileCards()[0]!).disabled).toBe(true);
  });
  it("distinguishes the monthly allocation from the full expense period, and opens the same period editor", async () => {
    const expense: ExpenseMonthResponse = { month: "2026-10", daysInMonth: 31, totalCents: "123456", dailyAverageCents: "3982", budgetCents: "123456", lines: [{ itemId: "electric", ruleId: "rule", name: "水电费", periodStart: "2026-10-01", periodEnd: "2026-11-30", source: "BUDGET", periodAmountCents: "246912", allocatedCents: "123456", hasOverride: true }], items: [{ id: "electric", version: 4, name: "水电费", note: "", kind: "RECURRING", occurredOn: null, amountCents: null, deletedAt: null, rules: [{ id: "rule", startDate: "2026-10-01", endExclusive: null, unit: "MONTH", interval: 2, amountMode: "BUDGET", amountCents: "246912" }] }] };
    request.mockResolvedValue(expense); await mount(<ExpensesPanel storeId="store" today="2026-10-04" />);
    const card = mobileCards()[0]!; expect(card.querySelector("h3")?.textContent).toBe("水电费"); expect(card.textContent).toContain("预算估算"); expect(fact(card, "本月分摊")).toBe(formatUsdPrecise(123456)); expect(fact(card, "整期金额")).toBe(formatUsdPrecise(246912));
    expect(fact(card, "覆盖日期")).toBe("2026-10-01 — 2026-11-30");
    await act(async () => button("填写 / 修改金额", card).click()); expect(container.querySelector("[role=dialog] h2")?.textContent).toBe("填写当期实际金额"); expect(request).toHaveBeenCalledTimes(1);
    await act(async () => button("关闭", container.querySelector("[role=dialog]")!).click());
    await act(async () => button("撤销覆盖", card).click()); expect(request).toHaveBeenCalledTimes(1);
    vi.mocked(window.confirm).mockReturnValue(true); await act(async () => button("撤销覆盖", card).click());
    expect(request).toHaveBeenCalledWith("/stores/store/expenses/electric/periods", { method: "DELETE", idempotent: true, body: { version: 4, ruleId: "rule", periodStart: "2026-10-01" } });
  });
  it("starts help with everyday work and provides anchors for every listed topic", () => {
    const dom = new JSDOM(renderToStaticMarkup(<HelpPage />)); const doc = dom.window.document;
    expect(doc.querySelector(".help-grid > details")?.id).toBe("help-work"); for (const link of doc.querySelectorAll<HTMLAnchorElement>(".help-topics a")) expect(doc.querySelector(link.hash)).not.toBeNull(); dom.window.close();
  });
  it("opens and focuses a help topic when selected, so its content is immediately available", async () => {
    await mount(<HelpPage />); const target = container.querySelector<HTMLDetailsElement>("#help-payroll")!; expect(target.open).toBe(false);
    await act(async () => container.querySelector<HTMLAnchorElement>('.help-topics a[href="#help-payroll"]')!.click());
    expect(target.open).toBe(true); expect(document.activeElement).toBe(target.querySelector("summary"));
  });
});

describe("responsive CSS applied to actual rare-page markup", () => {
  it("selects one presentation, keeps named facts readable, and wraps long content across phone widths", async () => {
    const checkerPath = pathToFileURL(resolve(process.cwd(), "../../scripts/check-mobile-ui.mjs")).href;
    const { stylesAtWidth } = await import(/* @vite-ignore */ checkerPath);
    const sources = await Promise.all(["globals.css", "design-system.css", "responsive.css"].map(async name => ({ name, css: await readFile(resolve(process.cwd(), "app", name), "utf8") })));
    const markup = renderToStaticMarkup(<main className="app-shell"><div className="manage-shell">{recovery()}<AuditDetails item={audit} entityLabel="成员" /></div><div className="finance-shell">{pay()}<ClosingDeliveryQueue value={queue} busy={false} onCancel={noop} expanded /><GiftCardLedger ledger={ledger} /><FinanceGiftSaleCards sales={finance.giftCardSales} /><section className="settlement-preview-compact"><SettlementSummary preview={preview} /></section></div></main>);
    for (const width of [320, 360, 390, 414, 480, 600, 760, 900, 1200]) {
      const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style>${markup}`); const doc = dom.window.document; const style = (node: Element) => dom.window.getComputedStyle(node);
      for (const view of doc.querySelectorAll(".responsive-data-view")) {
        expect(style(view.querySelector(".desktop-data-view")!).display, `${width}px desktop view`).toBe(width <= 900 ? "none" : "block");
        expect(style(view.querySelector(".mobile-data-view")!).display, `${width}px mobile view`).toBe(width <= 900 ? "block" : "none");
      }
      for (const value of doc.querySelectorAll(".record-facts dd")) { expect(["16px", "1rem"], `${width}px fact value`).toContain(style(value).fontSize); expect(style(value).whiteSpace).toBe("normal"); }
      for (const card of doc.querySelectorAll(".mobile-data-card")) { expect(style(card).overflowWrap).toBe("anywhere"); expect(style(card).borderRadius).toBe("10px"); }
      for (const button of doc.querySelectorAll(".mobile-data-card button")) expect(parseFloat(style(button).minHeight), `${width}px touch target`).toBeGreaterThanOrEqual(44);
      if (width === 320) for (const facts of doc.querySelectorAll(".record-facts")) expect(style(facts).gridTemplateColumns).toBe("minmax(0, 1fr)");
      dom.window.close();
    }
  }, 30000);
});
