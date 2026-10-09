// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../lib/api";
import type { BoardStatistics, StoreDetails, StoreMember, WorkRecord } from "../lib/types";
import { TodayBoard } from "./today-board";

vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../lib/time", async (original) => ({ ...await original<typeof import("../lib/time")>(), currentStoreTime: () => "10:00" }));
vi.mock("./record-track", () => ({ RecordTrack: ({ children }: { children: ReactNode }) => <div className="record-track">{children}</div> }));
vi.mock("./record-editor", () => ({ RecordEditor: () => <div className="normal-record-editor" /> }));
vi.mock("./board-employee-picker", () => ({ BoardEmployeePicker: () => null }));
vi.mock("./board-weekly-dispatch", () => ({ BoardWeeklyDispatch: () => null }));
vi.mock("./gift-card-sales", () => ({ GiftCardSales: () => null }));
vi.mock("./lost-customers", () => ({ LostCustomers: () => null }));
vi.mock("./employee-closing", () => ({ EmployeeClosingModal: () => null }));
vi.mock("./closing-delivery-queue", () => ({ ClosingDeliveryQueueButton: () => null }));
vi.mock("./ranking-explanation", () => ({ RankingExplanationButton: () => null }));
const request = vi.mocked(apiRequest);
const stats: BoardStatistics = { recordCount: 0, grossFeeBaseCents: 0, discountTotalCents: 0, discountedFeePerformanceCents: 0, totalTipCents: 0, totalLargeFeeWageCents: 0, employeeIncomeCents: 0, giftCardSaleCount: 0, giftCardCashCents: 0, giftCardCardCents: 0, giftCardSalesAmountCents: 0, giftCardRedemptionCents: 0, storeIncomeCents: 0 };
const employee: StoreMember = { id: "employee", displayName: "Alexandria · 姓名很长的员工", role: "EMPLOYEE", isServiceProvider: true, employmentType: "PART_TIME", status: "ACTIVE", version: 1, defaultCommissionBps: 6000, closingDeliveryEnabled: false, closingDeliveryPhoneE164: null, closingImageLocale: null, deletedAt: null };
const store: StoreDetails = { id: "store", storeCode: "123456", name: "门店", timezone: "America/New_York", businessCutoffLocal: "04:00", status: "ACTIVE", globalCommissionBps: 6000, mondayThursdayAutoDiscountEnabled: false, mondayThursdayAutoDiscountThresholdCents: 6000, mondayThursdayAutoDiscountAmountCents: 1000, giftCardAutoDiscountEnabled: false, giftCardAutoDiscountThresholdCents: 10000, giftCardAutoDiscountBps: 1000, closingDefaultLocale: "zh_CN", version: 1, ownerMembershipId: "owner", ownerMembership: null, automaticDispatchEnabled: false };
const placeholder: WorkRecord = { id: "placeholder", employeeMembershipId: employee.id, businessDate: "2026-10-06", storeTimezoneSnapshot: store.timezone, businessCutoffSnapshot: "04:00", startAt: "2026-10-06T15:00:00.000Z", endAt: null, actualDurationMinutes: null, status: "PLACEHOLDER", mainServiceAmountCents: 0, addonTotalCents: 0, grossFeeBaseCents: 0, discountTotalCents: 0, discountedFeePerformanceCents: 0, cashServiceCents: null, cardServiceCents: null, giftCardSerialNumber: null, giftCardServiceCents: null, cashTipCents: null, cardTipCents: null, giftCardTipCents: null, totalTipCents: null, actualServiceCollectedCents: null, customerTotalPaidCents: null, paymentDifferenceCents: null, mainServiceWageCents: 0, addonWageCents: 0, totalLargeFeeWageCents: 0, employeeTotalIncomeCents: null, tipSettledManualFlag: false, largeFeeSettledManualFlag: false, automaticDiscountSuppressed: false, isHighlighted: false, isDispatchExcluded: false, note: "", version: 7, deletedAt: null, serviceSnapshot: null, addonSnapshots: [], discountSnapshots: [], payment: null };
const ordinary: WorkRecord = { ...placeholder, id: "ordinary", startAt: "2026-10-06T14:00:00.000Z", endAt: "2026-10-06T15:00:00.000Z", status: "CONFIRMED", serviceSnapshot: { sourceServiceItemId: "service", isCustom: false, name: "足疗", shortName: "足疗", amountCents: 6000, durationMinutes: 60, commissionBps: 6000, commissionSource: "STORE", wageCents: 3600 } };
let root: Root;
let container: HTMLDivElement;
let props: ComponentProps<typeof TodayBoard>;
const reload = vi.fn(async () => {});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  request.mockReset(); request.mockResolvedValue({ deliveries: [], batchAllowed: true, batchBlockedReason: null, agent: null }); reload.mockClear();
  props = { wideLayout: false, heading: "门店", accountActions: null, dateControls: null, returnToToday: null, calendar: null, loadError: "", membership: { id: "owner", role: "OWNER", displayName: "店主", isServiceProvider: true, store }, store, currentDay: { businessDate: "2026-10-06", timezone: store.timezone, businessCutoffLocal: "04:00", serverTime: "2026-10-06T16:00:00.000Z" }, isCurrentBusinessDay: true, isFutureBusinessDay: false,
    board: { id: "board", storeId: store.id, businessDate: "2026-10-06", version: 1, isClosed: false, rows: [{ id: "row", membershipId: employee.id, position: 0, isHidden: false, version: 1, membership: employee, shifts: [], workRecords: [], statistics: stats }], giftCardSales: [], nextGiftCardSerialNumber: "1", statistics: { ...stats, revenueCents: 0, totalIncomeCents: 0, recentClosedRevenue: null }, ranking: { enabled: false, rankedAt: null, explanation: null } },
    catalog: { serviceItems: [{ id: "service", position: 0, fullName: "足部按摩", shortName: "足疗", priceOptions: [{ id: "option", durationMinutes: 60, priceCents: 6000, position: 0 }], defaultCommissionBps: null, isEnabled: true, deletedAt: null, version: 1 }], addonItems: [], discountItems: [] }, members: [employee], onReload: reload };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render() { await act(async () => root.render(<TodayBoard {...props} />)); }
function button(text: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function click(text: string, scope: ParentNode = document) { await act(async () => button(text, scope).click()); }
function writes() { return request.mock.calls.filter(([, options]) => options?.method === "POST" || options?.method === "DELETE"); }

describe("快速记工占位", () => {
  it("在高亮左侧切换占位，隐藏项目并保留时间，退出恢复普通草稿和高亮", async () => {
    await render(); await click("新增记工");
    const modal = document.querySelector(".quick-work-modal")!;
    expect([...modal.querySelectorAll(".modal-heading__actions button")].map((node) => node.textContent)).toEqual(["占位", "不算排工", "★高亮标记", "关闭"]);
    await click("★高亮标记"); await click("＋ 自定义项目");
    const name = modal.querySelector<HTMLInputElement>(".quick-custom-grid input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "保留草稿"); name.dispatchEvent(new Event("input", { bubbles: true })); });
    await click("占位");
    expect(modal.querySelector(".work-time-field")).not.toBeNull(); expect(modal.querySelector(".quick-mode-switch")).toBeNull(); expect(modal.querySelector(".quick-custom-grid")).toBeNull();
    expect(button("★高亮标记", modal).disabled).toBe(true); expect(button("保存占位", modal).disabled).toBe(false);
    await click("占位");
    expect(modal.querySelector<HTMLInputElement>(".quick-custom-grid input")!.value).toBe("保留草稿"); expect(button("★已高亮", modal).disabled).toBe(false); expect(button("保存记工", modal)).toBeDefined();
    expect(writes()).toEqual([]);
  });
  it("没有项目也能占位，创建只提交员工、时间和占位标记", async () => {
    props.catalog.serviceItems = []; await render(); await click("新增记工");
    expect(button("保存记工").disabled).toBe(true); await click("占位"); await click("保存占位");
    expect(writes()).toEqual([["/stores/store/work-records", { method: "POST", idempotent: true, body: { employeeMembershipId: "employee", startAt: "2026-10-06T14:00:00.000Z", isPlaceholder: true } }]]);
    expect(document.querySelector(".quick-work-modal")).toBeNull(); expect(reload).toHaveBeenCalledTimes(1); expect(container.textContent).toContain("占位已保存");
  });
  it("普通、占位与高亮混排，占位卡显示所选时间和整卡对角线且不计工数", async () => {
    props.board.rows[0]!.workRecords = [ordinary, placeholder, { ...ordinary, id: "highlight", isHighlighted: true }]; await render();
    const card = container.querySelector<HTMLButtonElement>(".record-card--placeholder")!;
    expect(card.textContent).toBe("11:00 AM"); expect(card.getAttribute("aria-label")).toBe("占位");
    const time = card.querySelector("time.record-time.record-placeholder-time")!;
    expect(time.textContent).toBe("11:00 AM"); expect(time.getAttribute("datetime")).toBe(placeholder.startAt);
    expect(time.id).toBe("placeholder-time-placeholder"); expect(card.getAttribute("aria-describedby")).toBe(time.id);
    const svg = card.querySelector("svg")!; expect(svg.getAttribute("viewBox")).toBe("0 0 100 100"); expect(svg.getAttribute("preserveAspectRatio")).toBe("none"); expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect([...svg.querySelectorAll("line")].map((line) => [line.getAttribute("x1"), line.getAttribute("y1"), line.getAttribute("x2"), line.getAttribute("y2"), line.getAttribute("stroke-width"), line.getAttribute("vector-effect")])).toEqual([["0", "0", "100", "100", "2", "non-scaling-stroke"], ["100", "0", "0", "100", "2", "non-scaling-stroke"]]);
    expect([...container.querySelector(".record-track")!.children].map((node) => node.className)).toEqual(["record-card", "record-card record-card--placeholder", "add-record", "record-card record-card--right-group record-card--highlighted"]);
    expect(container.querySelector(".row-work-count strong")!.textContent).toBe("2");
    props.board.rows = [{ ...props.board.rows[0]!, isHidden: true }]; await render(); expect(container.querySelector(".hidden-rows-panel small")!.textContent).toBe("2 条记工");
  });
  it("点击占位只打开删除确认并保留版本，取消不写入", async () => {
    props.board.rows[0]!.workRecords = [placeholder]; await render();
    await act(async () => container.querySelector<HTMLButtonElement>(".record-card--placeholder")!.click());
    expect(document.querySelector(".placeholder-delete-dialog[open]")).not.toBeNull(); expect(document.querySelector(".normal-record-editor")).toBeNull(); expect(writes()).toEqual([]);
    await click("取消", document.querySelector(".placeholder-delete-dialog")!); expect(document.querySelector(".placeholder-delete-dialog")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".record-card--placeholder")!.click()); await click("删除占位");
    expect(writes()).toEqual([["/stores/store/work-records/placeholder", { method: "DELETE", idempotent: true, body: { version: 7 } }]]); expect(reload).toHaveBeenCalledTimes(1); expect(document.querySelector(".placeholder-delete-dialog")).toBeNull();
  });
  it("历史员工不能操作占位，日结后禁用删除；冲突不覆盖旧版本", async () => {
    props.board.rows[0]!.workRecords = [placeholder]; props.isCurrentBusinessDay = false; props.membership.role = "EMPLOYEE"; await render();
    expect(container.querySelector<HTMLButtonElement>(".record-card--placeholder")!.disabled).toBe(true);
    props.membership.role = "OWNER"; props.board.isClosed = true; await render(); await act(async () => container.querySelector<HTMLButtonElement>(".record-card--placeholder")!.click());
    expect(button("删除占位").disabled).toBe(true); await click("取消");
    props.board.isClosed = false; await render(); await act(async () => container.querySelector<HTMLButtonElement>(".record-card--placeholder")!.click());
    request.mockRejectedValue(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "版本冲突" })); await click("删除占位");
    expect(document.querySelector(".placeholder-delete-dialog [role=alert]")!.textContent).toBe("版本冲突"); await click("删除占位");
    expect(writes().map(([, options]) => options!.body)).toEqual([{ version: 7 }, { version: 7 }]); expect(reload).not.toHaveBeenCalled();
  });
});


describe("不算排工", () => {
  it("快速记工独立切换、占位暂停选择，保存只提交新标记并在再次打开时重置", async () => {
    await render(); await click("新增记工"); await click("不算排工");
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("true");
    expect(button("★高亮标记").getAttribute("aria-pressed")).toBe("false");
    await click("占位");
    expect(button("不算排工").disabled).toBe(true);
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("false");
    await click("占位");
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("true");
    await click("保存记工");
    expect(writes()[0]![1]!.body).toMatchObject({ isDispatchExcluded: true, isHighlighted: false, serviceItemId: "service", serviceDurationMinutes: 60 });
    await click("新增记工");
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("false");
  });
  it("普通样式的小卡与高亮混排，取消标记回左侧，历史只读保持分组", async () => {
    props.board.rows[0]!.workRecords = [ordinary, { ...ordinary, id: "excluded", isDispatchExcluded: true }, { ...ordinary, id: "highlight", isHighlighted: true }];
    await render();
    const cards = () => [...container.querySelectorAll<HTMLButtonElement>(".record-track > button")];
    expect(cards().map(card => card.className)).toEqual(["record-card", "add-record", "record-card record-card--right-group record-card--highlighted", "record-card record-card--right-group"]);
    expect(container.querySelector(".row-work-count strong")!.textContent).toBe("3");
    props.isCurrentBusinessDay = false; props.membership.role = "EMPLOYEE"; await render();
    expect(cards().at(-1)!.disabled).toBe(true);
    expect(cards().at(-1)!.classList.contains("record-card--highlighted")).toBe(false);
    props.board.rows[0]!.workRecords[1]!.isDispatchExcluded = false; await render();
    expect(cards().map(card => card.className)).toEqual(["record-card", "record-card", "record-card record-card--right-group record-card--highlighted"]);
  });
  it("详情入口在高亮左侧，草稿恢复后保存，冲突不覆盖旧版本", async () => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const record = { ...ordinary, status: "PENDING_PAYMENT" as const };
    const renderEditor = async () => { await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={record} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={vi.fn()} onSaved={vi.fn()} onChanged={reload} />)); };
    await renderEditor();
    expect([...document.querySelectorAll(".record-editor .modal-heading__actions button")].map(node => node.textContent)).toEqual(["不算排工", "★高亮标记", "关闭"]);
    await click("不算排工");
    const draftKey = `massage_note_record_draft_${record.id}`;
    expect(JSON.parse(localStorage.getItem(draftKey)!).isDispatchExcluded).toBe(true);
    await act(async () => root.render(null)); await renderEditor();
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("true");
    expect(button("★高亮标记").getAttribute("aria-pressed")).toBe("false");
    request.mockRejectedValueOnce(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "版本冲突" }));
    await click("保存");
    expect(document.querySelector(".record-error-toast[role=alert]")!.textContent).toContain("版本冲突");
    request.mockResolvedValue({ ...record, isDispatchExcluded: true, version: record.version + 1 });
    await click("保存");
    const changes = request.mock.calls.filter(([, options]) => options?.method === "PATCH");
    expect(changes).toHaveLength(2);
    for (const [, options] of changes) {
      expect(options!.body).toMatchObject({ version: record.version, isDispatchExcluded: true });
      expect(options!.body).not.toHaveProperty("isHighlighted");
    }
    expect(localStorage.getItem(draftKey)).toBeNull();
  });
});
