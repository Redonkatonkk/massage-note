// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatUsd } from "../lib/money";
import { ApiError, apiRequest } from "../lib/api";
import type { BoardStatistics, StoreDetails, StoreMember, WorkRecord } from "../lib/types";
import { newWorkRecord } from "../lib/new-work-record";
import { TodayBoard } from "./today-board";

vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../lib/time", async (original) => ({ ...await original<typeof import("../lib/time")>(), currentStoreTime: () => "10:00" }));
vi.mock("./record-track", () => ({ RecordTrack: ({ children }: { children: ReactNode }) => <div className="record-track">{children}</div> }));
vi.mock("./record-editor", () => ({ RecordEditor: ({ isClosed, isNew, record, onClose }: { isClosed: boolean; isNew?: boolean; record: WorkRecord; onClose: () => void }) => <div className="normal-record-editor" data-readonly={isClosed} data-new={isNew} data-record={JSON.stringify(record)}>{isNew && <button onClick={onClose}>取消详细记工</button>}</div> }));
vi.mock("./board-employee-picker", () => ({ BoardEmployeePicker: () => null }));
vi.mock("./board-weekly-dispatch", () => ({ BoardWeeklyDispatch: () => null }));
vi.mock("./gift-card-sales", () => ({ GiftCardSales: () => null }));
vi.mock("./lost-customers", () => ({ LostCustomers: () => null }));
vi.mock("./employee-closing", () => ({ EmployeeClosingModal: () => null }));
vi.mock("./closing-delivery-queue", () => ({ ClosingDeliveryQueueButton: () => null }));
vi.mock("./ranking-explanation", () => ({ RankingExplanationButton: () => null }));
const request = vi.mocked(apiRequest);
const language = vi.hoisted(() => ({ locale: "zh-CN" as "zh-CN" | "en-US" }));
vi.mock("./language-provider", () => ({ useLanguage: () => language }));
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
  language.locale = "zh-CN";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  request.mockReset(); request.mockResolvedValue({ deliveries: [], batchAllowed: true, batchBlockedReason: null, agent: null }); reload.mockClear();
  props = { wideLayout: false, heading: "门店", accountActions: null, dateControls: null, returnToToday: null, calendar: null, loadError: "", membership: { id: "owner", role: "OWNER", displayName: "店主", isServiceProvider: true, store }, store, currentDay: { businessDate: "2026-10-06", timezone: store.timezone, businessCutoffLocal: "04:00", serverTime: "2026-10-06T16:00:00.000Z" }, isCurrentBusinessDay: true, isFutureBusinessDay: false,
    board: { id: "board", storeId: store.id, businessDate: "2026-10-06", version: 1, isClosed: false, rows: [{ id: "row", membershipId: employee.id, position: 0, isHidden: false, version: 1, membership: employee, shifts: [], workRecords: [], statistics: stats }], giftCardSales: [], nextGiftCardSerialNumber: "1", statistics: { ...stats, revenueCents: 0, totalIncomeCents: 0, cashChangeCents: null, recentClosedRevenue: null }, ranking: { enabled: false, rankedAt: null, explanation: null } },
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
function durationButton(minutes: number): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>(".duration-picker button")].find(node => node.querySelector("strong")?.textContent === `${minutes} 分钟`)!;
}
async function chooseDuration(minutes: number) { await act(async () => durationButton(minutes).click()); }
async function inputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function pressEnter(target: Element, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}

it.each([true, false])("总收入读取服务端结果并显示原收入公式，宽屏=%s", async wideLayout => {
  props.wideLayout = wideLayout;
  props.board.statistics = { ...props.board.statistics, totalIncomeCents: -1234 };
  await render();
  const metric = [...container.querySelectorAll<HTMLElement>("[title]")].find(node => node.title === "店铺收入＋店长收入＋经理收入；已加卖卡实收、减礼物卡使用的大费和小费");
  expect(metric).toBeDefined(); expect(metric!.textContent).toContain(formatUsd(-1234));
  expect(metric!.title).not.toContain("支出");
  props.membership.role = "EMPLOYEE";
  await render();
  expect(container.textContent).not.toContain("总收入");
});

describe("历史员工出勤隐藏", () => {
  it.each(["OWNER", "MANAGER"] as const)("%s 可在已日结历史隐藏、恢复员工，记工仍只读", async (role) => {
    props.membership.role = role;
    props.isCurrentBusinessDay = false;
    props.board.isClosed = true;
    props.board.rows[0]!.workRecords = [ordinary];
    await render();
    expect(document.querySelector(".closed-banner")!.textContent).toContain("影响后续生成顺序");
    expect(document.querySelector(".row-management")!.textContent).toContain("隐藏");
    expect(document.querySelector(".row-management")!.textContent).not.toMatch(/上移|下移|移除/);
    expect(document.querySelector(".add-record")).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>(".record-card")!.click());
    expect(document.querySelector(".normal-record-editor")!.getAttribute("data-readonly")).toBe("true");
    request.mockResolvedValueOnce({ removed: false });
    await click("隐藏");
    expect(request).toHaveBeenCalledWith("/stores/store/boards/2026-10-06/rows/row", {
      method: "PATCH", idempotent: true, body: { version: 1, isHidden: true },
    });
    expect(reload).toHaveBeenCalledTimes(1);
    props.board = { ...props.board, rows: props.board.rows.map(row => ({ ...row, isHidden: true, version: 2 })) };
    await render();
    const panel = document.querySelector(".hidden-rows-panel")!;
    expect(panel.textContent).toContain("排工视为该日未上班");
    expect(button("恢复显示", panel).disabled).toBe(false);
    request.mockResolvedValueOnce({ removed: false });
    await click("恢复显示", panel);
    expect(request).toHaveBeenLastCalledWith("/stores/store/boards/2026-10-06/rows/row", {
      method: "PATCH", idempotent: true, body: { version: 2, isHidden: false },
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it.each(["current", "future", "employee"])("%s 的已日结表格保留权限边界", async (kind) => {
    props.board.isClosed = true;
    props.isCurrentBusinessDay = kind === "current";
    props.isFutureBusinessDay = kind === "future";
    if (kind === "employee") props.membership.role = "EMPLOYEE";
    await render();
    expect(document.querySelector(".row-management")).toBeNull();
    props.board = { ...props.board, rows: props.board.rows.map(row => ({ ...row, isHidden: true })) };
    await render();
    if (kind === "employee") expect(document.querySelector(".hidden-rows-panel")).toBeNull();
    else expect(button("恢复显示").disabled).toBe(true);
    expect(request.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
  });

  it("历史隐藏遇到版本冲突时保留员工行并显示错误", async () => {
    props.isCurrentBusinessDay = false;
    props.board.isClosed = true;
    await render();
    request.mockRejectedValueOnce(new ApiError(409, { code: "BOARD_ROW_VERSION_CONFLICT", messageZh: "员工行已被其他设备修改，请刷新后重试" }));
    await click("隐藏");
    expect(document.querySelector(".form-error[role=alert]")!.textContent).toContain("请刷新后重试");
    expect(document.querySelector(".employee-row")).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("项目时长默认值", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function priceOptions(durations: number[]) {
    return durations.map((durationMinutes, position) => ({ id: `option-${position}`, durationMinutes, priceCents: durationMinutes * 100 + 1000, position }));
  }
  it.each([[30, 60, 90], [90, 30], [30, 60, 90, 120]])("快速记工展示全部 %j 分钟档位，点击直接保存，只有三档采用三列", async (...durations) => {
    props.catalog.serviceItems[0]!.priceOptions = priceOptions(durations);
    await render(); await click("新增记工");
    const modal = document.querySelector(".quick-work-modal")!;
    expect(modal.querySelectorAll('input[type="radio"], .quick-mode-switch, .save-record')).toHaveLength(0);
    expect(modal.textContent).not.toContain("选择项目");
    expect(writes()).toHaveLength(0);
    expect(modal.querySelector(".duration-picker")!.classList.contains("duration-picker--three-options")).toBe(durations.length === 3);
    expect([...modal.querySelectorAll(".duration-picker strong")].map(node => node.textContent)).toEqual([...durations].sort((a, b) => a - b).map(value => `${value} 分钟`));
    await chooseDuration(durations[0]!);
    expect(writes()[0]![1]!.body).toMatchObject({ durationMinutes: durations[0] });
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("合并时长并去重，忽略停用及删除项目，只提交时长而不关联项目", async () => {
    const service = props.catalog.serviceItems[0]!;
    service.priceOptions = priceOptions([60, 90]);
    props.catalog.serviceItems.push(
      { ...service, id: "body", priceOptions: priceOptions([30, 60, 120]).map(option => ({ ...option, priceCents: option.priceCents + 5000 })) },
      { ...service, id: "disabled", isEnabled: false, priceOptions: priceOptions([15]) },
      { ...service, id: "deleted", deletedAt: "2026-10-01", priceOptions: priceOptions([180]) },
    );
    await render(); await click("新增记工");
    expect([...document.querySelectorAll(".duration-picker strong")].map(node => node.textContent)).toEqual(["30 分钟", "60 分钟", "90 分钟", "120 分钟"]);
    expect(document.querySelectorAll(".duration-picker small")).toHaveLength(0);
    await chooseDuration(30);
    expect(writes().at(-1)![1]!.body).toMatchObject({ durationMinutes: 30 });
    await click("新增记工"); await chooseDuration(60);
    expect(writes().at(-1)![1]!.body).toMatchObject({ durationMinutes: 60 });
    await click("新增记工"); await chooseDuration(120);
    expect(writes().at(-1)![1]!.body).toMatchObject({ durationMinutes: 120 });
    for (const [, options] of writes()) {
      expect(options!.body).not.toHaveProperty("serviceItemId");
      expect(options!.body).not.toHaveProperty("customService");
    }
  });

  it("无效时间不写入；失败保留选择入口和标记，提交中阻止重复写入", async () => {
    await render(); await click("新增记工"); await click("★高亮标记");
    const hour = document.querySelector<HTMLInputElement>('#start-time')!;
    await inputValue(hour, "99"); await chooseDuration(60);
    expect(writes()).toHaveLength(0);
    expect(document.querySelector(".quick-work-modal [role=alert]")!.textContent).toContain("有效的开始时间");
    await inputValue(hour, "10");
    request.mockRejectedValueOnce(new ApiError(409, { code: "BUSINESS_DAY_CLOSED", messageZh: "已经日结" }));
    await chooseDuration(60);
    expect(document.querySelector(".quick-work-modal [role=alert]")!.textContent).toBe("已经日结");
    expect(button("★已高亮").getAttribute("aria-pressed")).toBe("true");
    let resolveSave!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    await act(async () => { durationButton(60).click(); durationButton(60).click(); });
    expect(writes()).toHaveLength(2);
    expect(durationButton(60).matches(":disabled")).toBe(true);
    await act(async () => resolveSave({}));
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    expect(writes().at(-1)![1]!.body).toMatchObject({ isHighlighted: true });
  });

  it.each([[[30, 60, 90], 60], [[90, 30], 90]] as const)("详情切换到 %j 档位默认 %i 分钟，同步价格和结束时间", async (durations, expected) => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    props.catalog.serviceItems[0]!.priceOptions = priceOptions([30, 60, 90]);
    props.catalog.serviceItems.push({ ...props.catalog.serviceItems[0]!, id: "body", fullName: "全身按摩", priceOptions: priceOptions([...durations]) });
    const record = { ...ordinary, status: "PENDING_PAYMENT" as const, endAt: "2026-10-06T14:30:00.000Z", serviceSnapshot: { ...ordinary.serviceSnapshot!, durationMinutes: 30, amountCents: 4000 } };
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={record} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={vi.fn()} onSaved={vi.fn()} onChanged={reload} />));
    const fields = document.querySelector(".record-service-section")!;
    const [service, duration] = fields.querySelectorAll<HTMLSelectElement>("select");
    expect(duration!.value).toBe("30");
    await act(async () => { service!.value = "body"; service!.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(duration!.value).toBe(String(expected));
    expect(fields.querySelector<HTMLInputElement>("input[inputmode=decimal]")!.value).toBe(String(expected + 10));
    const endFields = document.querySelector('[aria-label="结束时间"]')!;
    expect([...endFields.querySelectorAll<HTMLInputElement>("input")].map(item => item.value)).toEqual(["11", expected === 60 ? "00" : "30"]);
    request.mockResolvedValue(record); await click("保存");
    expect(request.mock.calls.find(([, options]) => options?.method === "PATCH")![1]!.body).toMatchObject({ serviceItemId: "body", serviceDurationMinutes: expected, mainServiceAmountCents: (expected + 10) * 100, endAt: expected === 60 ? "2026-10-06T15:00:00.000Z" : "2026-10-06T15:30:00.000Z" });
  });
});

describe("快速记工占位", () => {
  it("占位在高亮左侧，点击直接保存且不提交服务或其他标记", async () => {
    await render(); await click("新增记工");
    const modal = document.querySelector(".quick-work-modal")!;
    expect([...modal.querySelectorAll(".modal-heading__actions button")].map((node) => node.textContent)).toEqual(["占位", "不算排工", "★高亮标记"]);
    await click("★高亮标记"); await click("不算排工"); await click("占位");
    expect(writes()).toEqual([["/stores/store/work-records", { method: "POST", idempotent: true, body: { employeeMembershipId: "employee", startAt: "2026-10-06T14:00:00.000Z", isPlaceholder: true } }]]);
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    await click("新增记工");
    expect(button("★高亮标记").getAttribute("aria-pressed")).toBe("false");
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("false");
  });
  it("没有项目也能点击占位，创建只提交员工、时间和占位标记", async () => {
    props.catalog.serviceItems = []; await render(); await click("新增记工");
    expect(document.querySelectorAll(".duration-picker button")).toHaveLength(0);
    expect(document.querySelector(".duration-picker .empty-note")!.textContent).toContain("没有可用时长");
    await click("占位");
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
  it("快速记工独立切换，点击时长提交新标记并在再次打开时重置", async () => {
    await render(); await click("新增记工"); await click("不算排工");
    expect(button("不算排工").getAttribute("aria-pressed")).toBe("true");
    expect(button("★高亮标记").getAttribute("aria-pressed")).toBe("false");
    await chooseDuration(60);
    expect(writes()[0]![1]!.body).toMatchObject({ isDispatchExcluded: true, isHighlighted: false, durationMinutes: 60 });
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


describe("详情回车保存", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  async function renderEditor(isClosed = false) {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const record = { ...ordinary, status: "PENDING_PAYMENT" as const };
    request.mockResolvedValue(record);
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={record} catalog={props.catalog} members={props.members} canManage isClosed={isClosed} onClose={vi.fn()} onSaved={vi.fn()} onChanged={reload} />));
  }
  it("打开后即可按回车保存详情，付款全空仍待结账", async () => {
    await renderEditor();
    expect(document.activeElement).toBe(document.querySelector(".record-editor"));
    const event = await pressEnter(document.activeElement!);
    expect(event.defaultPrevented).toBe(true);
    expect(request).toHaveBeenCalledWith("/stores/store/work-records/ordinary", expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ version: ordinary.version }) }));
    expect(writes()).toHaveLength(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("回车沿用付款校验，纠正后与详情同时保存付款", async () => {
    await renderEditor();
    const input = document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!;
    await inputValue(input, "-1"); await pressEnter(input);
    expect(request).not.toHaveBeenCalled();
    expect(document.querySelector(".record-error-toast")!.textContent).toContain("非负金额");
    await inputValue(input, "60"); await pressEnter(input);
    expect(request).toHaveBeenCalledWith("/stores/store/work-records/ordinary/save", expect.objectContaining({ method: "POST", body: expect.objectContaining({ details: expect.objectContaining({ version: ordinary.version }), payment: expect.objectContaining({ version: ordinary.version, cashServiceCents: 6000, cashTipCents: 0 }) }) }));
  });
  it("备注、控件和输入法保留原回车行为，重复键及组合键不保存", async () => {
    await renderEditor();
    const input = document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!;
    for (const selector of ['textarea', 'select', 'button.delete-record', 'input[type="checkbox"]']) {
      expect((await pressEnter(document.querySelector(selector)!)).defaultPrevented).toBe(false);
    }
    for (const options of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect((await pressEnter(input, options)).defaultPrevented).toBe(false);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("日结及保存进行中不能按回车重复写入", async () => {
    await renderEditor(true);
    await pressEnter(document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!);
    expect(request).not.toHaveBeenCalled();
    await act(async () => root.render(null)); await renderEditor();
    let resolveSave!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    const input = document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!;
    await pressEnter(input); await pressEnter(input);
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolveSave({ ...ordinary, version: ordinary.version + 1 }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});


describe("未选项目的记工详情", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  it.each([30, 120])("只记 %i 分钟时不伪装自定义项目，补选后保留匹配时长且不覆盖提成", async durationMinutes => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    props.catalog.serviceItems[0]!.priceOptions = [30, 60, 120].map(minutes => ({ id: String(minutes), durationMinutes: minutes, priceCents: minutes * 100, position: minutes }));
    const record = { ...ordinary, status: "PENDING_PAYMENT" as const, serviceSnapshot: null, actualDurationMinutes: durationMinutes, mainServiceAmountCents: 0, grossFeeBaseCents: 0, endAt: new Date(Date.parse(ordinary.startAt) + durationMinutes * 60000).toISOString() };
    props.board.rows[0]!.workRecords = [record];
    await render();
    const card = container.querySelector(".record-card")!;
    expect(card.textContent).toContain("待选项目");
    expect(card.querySelector(".record-service-due")!.textContent).toBe("未填写");
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={record} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={vi.fn()} onSaved={vi.fn()} onChanged={reload} />));
    const fields = document.querySelector(".record-service-section")!;
    const selection = fields.querySelector<HTMLSelectElement>("select")!;
    expect(selection.value).toBe("__unassigned__");
    expect(fields.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe(String(durationMinutes));
    expect(fields.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe("");
    request.mockClear(); request.mockResolvedValue({ ...record, version: record.version });
    await pressEnter(document.activeElement!);
    expect(request).toHaveBeenCalledWith("/stores/store/work-records/ordinary", expect.objectContaining({ method: "PATCH", body: expect.objectContaining({ version: record.version }) }));
    expect(request.mock.calls.at(-1)![1]!.body).not.toHaveProperty("serviceItemId");
    await act(async () => { selection.value = "service"; selection.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(fields.querySelectorAll<HTMLSelectElement>("select")[1]!.value).toBe(String(durationMinutes));
    request.mockClear(); request.mockResolvedValue({ ...record, version: 2 }); await pressEnter(fields.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!);
    const payload = request.mock.calls.find(([, options]) => options?.method === "PATCH")![1]!.body;
    expect(payload).toMatchObject({ serviceItemId: "service", serviceDurationMinutes: durationMinutes, mainServiceAmountCents: durationMinutes * 100 });
    expect(payload).not.toHaveProperty("mainServiceCommissionBps");
  });
});


describe("快速记工进入详细记工", () => {
  it("关闭位于详细记工右侧同排，沿用时间和标记，打开或取消均不写入", async () => {
    await render(); await click("新增记工"); await click("★高亮标记"); await click("不算排工");
    const heading = document.querySelector(".quick-work-modal > .modal-heading")!;
    const actions = heading.querySelector(".modal-heading__actions")!;
    expect(button("关闭").parentElement).toBe(heading);
    expect(button("详细记工").parentElement).toBe(heading);
    expect(button("详细记工").nextElementSibling).toBe(button("关闭"));
    expect(button("关闭").nextElementSibling).toBe(actions);
    await inputValue(document.querySelector<HTMLInputElement>("#start-time")!, "11");
    await click("详细记工");
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    const editor = document.querySelector<HTMLElement>(".normal-record-editor")!;
    expect(editor.dataset.new).toBe("true");
    expect(JSON.parse(editor.dataset.record!)).toMatchObject({ employeeMembershipId: "employee", startAt: "2026-10-06T15:00:00.000Z", isHighlighted: true, isDispatchExcluded: true, serviceSnapshot: null });
    expect(writes()).toHaveLength(0);
    await click("取消详细记工");
    expect(document.querySelector(".normal-record-editor")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("时间无效时保留快速记工并提示错误", async () => {
    await render(); await click("新增记工");
    await inputValue(document.querySelector<HTMLInputElement>("#start-time")!, "99");
    await click("详细记工");
    expect(document.querySelector(".normal-record-editor")).toBeNull();
    expect(document.querySelector(".quick-work-modal [role=alert]")!.textContent).toContain("有效的开始时间");
    expect(writes()).toHaveLength(0);
  });
});

describe("详细记工新建与零实收", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  async function editor(isNew: boolean) {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const record = isNew ? newWorkRecord({ employeeMembershipId: "employee", startAt: ordinary.startAt, businessDate: "2026-10-06", storeTimezoneSnapshot: store.timezone, businessCutoffSnapshot: "04:00", isHighlighted: true, isDispatchExcluded: true }) : { ...ordinary, cashServiceCents: 6000, cardServiceCents: 0, cashTipCents: 0, cardTipCents: 0 };
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={record} isNew={isNew} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={vi.fn()} onSaved={vi.fn()} onChanged={reload} />));
    return record;
  }
  it.each(["", "0"])("新建完整表单只在保存时写入一次，实收 %j 保存待结账", async amount => {
    await editor(true);
    expect(writes()).toHaveLength(0);
    expect(document.querySelector(".delete-record")).toBeNull();
    const service = document.querySelector<HTMLSelectElement>(".record-service-section select")!;
    await act(async () => { service.value = "service"; service.dispatchEvent(new Event("change", { bubbles: true })); });
    for (const input of document.querySelectorAll<HTMLInputElement>(".payment-method-rows input")) await inputValue(input, amount);
    await pressEnter(document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toEqual(["/stores/store/work-records/detailed", expect.objectContaining({ method: "POST", idempotent: true, body: expect.objectContaining({ create: expect.objectContaining({ employeeMembershipId: "employee", serviceItemId: "service", serviceDurationMinutes: 60, isHighlighted: true }), details: expect.objectContaining({ version: 1 }) }) })]);
    expect(writes()[0]![1]!.body).not.toHaveProperty("payment");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("massage_note_record_draft_new")).toBeNull();
  });
  it.each(["", "0"])("未选项目且实收 %j 也能保存，保留预填 60 分钟", async amount => {
    await editor(true);
    const fields = document.querySelector(".record-service-section")!;
    expect(fields.querySelector<HTMLSelectElement>("select")!.value).toBe("__unassigned__");
    expect(fields.querySelector<HTMLInputElement>("input[readonly]")!.value).toBe("60");
    expect([...document.querySelectorAll<HTMLInputElement>('[aria-label="结束时间"] input')].map(input => input.value)).toEqual(["11", "00"]);
    for (const input of document.querySelectorAll<HTMLInputElement>(".payment-method-rows input")) await inputValue(input, amount);
    await pressEnter(document.activeElement!);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toEqual(["/stores/store/work-records/detailed", expect.objectContaining({ body: expect.objectContaining({ create: expect.objectContaining({ durationMinutes: 60 }), details: expect.objectContaining({ version: 1 }) }) })]);
    expect(writes()[0]![1]!.body).not.toHaveProperty("payment");
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("新表单可取消已选项目，保留 60 分钟并清空报价后保存待结账", async () => {
    await editor(true);
    const select = document.querySelector<HTMLSelectElement>(".record-service-section select")!;
    for (const value of ["service", "__unassigned__"]) await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.querySelector<HTMLInputElement>('.record-service-section input[inputmode="decimal"]')!.value).toBe("");
    await click("保存");
    expect(writes()[0]![1]!.body).toMatchObject({ create: { durationMinutes: 60 } });
    expect(writes()[0]![1]!.body).not.toHaveProperty("payment");
  });
  it("未选项目时实收为正仍阻止保存", async () => {
    await editor(true);
    await inputValue(document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!, "60");
    await click("保存");
    expect(writes()).toHaveLength(0);
    expect(document.querySelector(".record-error-toast")!.textContent).toContain("请先选择项目");
  });
  it("已结账记录四项清零后走原子保存并清除旧付款", async () => {
    await editor(false);
    for (const input of document.querySelectorAll<HTMLInputElement>(".payment-method-rows input")) await inputValue(input, "0");
    expect(document.querySelector(".record-save-help")!.textContent).toContain("待结账");
    await click("保存");
    expect(writes()).toEqual([["/stores/store/work-records/ordinary/save", expect.objectContaining({ body: expect.objectContaining({ payment: { version: ordinary.version, cashServiceCents: 0, cardServiceCents: 0, cashTipCents: 0, cardTipCents: 0, giftCardServiceCents: 0, giftCardTipCents: 0, giftCardSerialNumber: null } }) })]]);
  });
  it("完整表单新建可直接录入付款", async () => {
    await editor(true);
    const service = document.querySelector<HTMLSelectElement>(".record-service-section select")!;
    await act(async () => { service.value = "service"; service.dispatchEvent(new Event("change", { bubbles: true })); });
    await inputValue(document.querySelector<HTMLInputElement>('[aria-label="现金大费（美元）"]')!, "60");
    await click("保存");
    expect(writes()[0]).toEqual(["/stores/store/work-records/detailed", expect.objectContaining({ body: expect.objectContaining({ payment: expect.objectContaining({ cashServiceCents: 6000, cashTipCents: 0 }) }) })]);
  });
});


describe("日结后的现金变化", () => {
  it.each([true, false])("桌面和手机指标在日结后替换礼物卡总额，并在取消后恢复：%s", async wideLayout => {
    props.wideLayout = wideLayout;
    await render();
    expect(container.textContent).toContain("礼物卡总额");
    expect(container.textContent).not.toContain("现金变化");
    props.board = { ...props.board, isClosed: true, statistics: { ...props.board.statistics, cashChangeCents: 12345 } };
    await render();
    expect(container.textContent).not.toContain("礼物卡总额");
    const metrics = [...container.querySelectorAll(".overview-metric")].filter(node => node.textContent?.includes("现金变化"));
    expect(metrics).toHaveLength(2);
    for (const metric of metrics) expect(metric.querySelector("strong")?.textContent).toBe("+US$123.45");
    props.board = { ...props.board, isClosed: false };
    await render();
    expect(container.textContent).toContain("礼物卡总额");
    expect(container.textContent).not.toContain("现金变化");
  });
  it.each([[12345, "+$123.45"], [-12345, "-$123.45"], [0, "$0.00"], [null, "—"]] as const)("英文保留正负号、美分、零及旧日结缺失：%s", async (cashChangeCents, expected) => {
    language.locale = "en-US";
    props.board = { ...props.board, isClosed: true, statistics: { ...props.board.statistics, cashChangeCents } };
    await render();
    const metric = [...container.querySelectorAll(".overview-metric")].find(node => node.textContent?.includes("现金变化"))!;
    expect(metric.querySelector("strong")?.textContent).toBe(expected);
    expect(metric.textContent).toContain(cashChangeCents === null ? "旧日结未记录，重新日结后生成" : "正数增加，负数减少");
  });
  it("普通员工没有全店现金变化指标", async () => {
    props.membership = { ...props.membership, role: "EMPLOYEE", id: employee.id };
    props.board = { ...props.board, isClosed: true };
    await render();
    expect(container.querySelector(".board-overview")).toBeNull();
  });
});
