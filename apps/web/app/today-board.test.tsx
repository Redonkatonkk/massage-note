// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatUsd } from "../lib/money";
import { ApiError, apiRequest } from "../lib/api";
import type { BoardStatistics, StoreDetails, StoreMember, WorkRecord } from "../lib/types";
import { newWorkRecord } from "../lib/new-work-record";
import { TodayBoard } from "./today-board";
import { absorbWorkRecordDialog, beginWorkRecordSaveMotion, cancelWorkRecordSaveMotion, beginDetachedWorkRecordSaveMotion } from "../lib/work-record-save-motion";
import { beginWorkRecordDeleteMotion } from "../lib/work-record-delete-motion";

vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../lib/time", async (original) => ({ ...await original<typeof import("../lib/time")>(), currentStoreTime: () => "10:00" }));
const detached = vi.hoisted(() => ({ complete: vi.fn(async (_id?: string) => {}), cancel: vi.fn(), setWaitingVisible: vi.fn() }));
vi.mock("../lib/work-record-save-motion", () => ({ beginDetachedWorkRecordSaveMotion: vi.fn(() => detached), absorbWorkRecordDialog: vi.fn(async () => {}), beginWorkRecordSaveMotion: vi.fn(), cancelWorkRecordSaveMotion: vi.fn(), preloadWorkRecordSaveMotion: vi.fn() }));
vi.mock("../lib/work-record-delete-motion", () => ({ beginWorkRecordDeleteMotion: vi.fn(), preloadWorkRecordDeleteMotion: vi.fn() }));
vi.mock("./record-track", () => ({ RecordTrack: ({ children }: { children: ReactNode }) => <div className="record-track">{children}</div> }));
const editorRendering = vi.hoisted(() => ({ actual: false }));
vi.mock("./record-editor", async original => {
  const actual = await original<typeof import("./record-editor")>();
  return { RecordEditor: (props: ComponentProps<typeof actual.RecordEditor>) => editorRendering.actual ? <actual.RecordEditor {...props} />
    : <div className="normal-record-editor" data-readonly={props.isClosed} data-new={props.isNew} data-service={props.initialServiceItemId} data-record={JSON.stringify(props.record)}>{props.isNew && <button onClick={props.onClose}>取消详细记工</button>}</div> };
});
vi.mock("./board-employee-picker", () => ({ BoardEmployeePicker: () => null }));
vi.mock("./board-weekly-dispatch", () => ({ BoardWeeklyDispatch: () => null }));
vi.mock("./gift-card-sales", () => ({ GiftCardSales: () => null }));
vi.mock("./lost-customers", () => ({ LostCustomers: () => null }));
vi.mock("./employee-closing", () => ({ EmployeeClosingModal: () => null }));
vi.mock("./closing-delivery-queue", () => ({ ClosingDeliveryQueueButton: () => null }));
vi.mock("./ranking-explanation", () => ({ RankingExplanationButton: () => null }));
const request = vi.mocked(apiRequest);
const saveMotion = vi.mocked(absorbWorkRecordDialog);
const beginMotion = vi.mocked(beginWorkRecordSaveMotion);
const beginDetached = vi.mocked(beginDetachedWorkRecordSaveMotion);
const cancelMotion = vi.mocked(cancelWorkRecordSaveMotion);
const deleteMotion = vi.mocked(beginWorkRecordDeleteMotion);
const releaseDeleteMotion = vi.fn();
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
  language.locale = "zh-CN"; editorRendering.actual = false;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  request.mockReset(); request.mockResolvedValue({ deliveries: [], batchAllowed: true, batchBlockedReason: null, agent: null }); reload.mockReset().mockResolvedValue(undefined);
  saveMotion.mockReset().mockResolvedValue(undefined);
  beginMotion.mockClear(); cancelMotion.mockClear(); beginDetached.mockClear(); detached.complete.mockReset().mockResolvedValue(undefined); detached.cancel.mockClear();
  deleteMotion.mockReset().mockReturnValue({ finished: Promise.resolve(), cancel: releaseDeleteMotion }); releaseDeleteMotion.mockClear();
  props = { wideLayout: false, heading: "门店", accountActions: null, dateControls: null, returnToToday: null, calendar: null, loadError: "", membership: { id: "owner", role: "OWNER", displayName: "店主", isServiceProvider: true, store }, store, currentDay: { businessDate: "2026-10-06", timezone: store.timezone, businessCutoffLocal: "04:00", serverTime: "2026-10-06T16:00:00.000Z" }, isCurrentBusinessDay: true, isFutureBusinessDay: false,
    board: { id: "board", storeId: store.id, businessDate: "2026-10-06", version: 1, isClosed: false, rows: [{ id: "row", membershipId: employee.id, position: 0, isHidden: false, version: 1, membership: employee, shifts: [], workRecords: [], statistics: stats }], giftCardSales: [], nextGiftCardSerialNumber: "1", statistics: { ...stats, revenueCents: 0, totalIncomeCents: 0, cashChangeCents: null, recentClosedRevenue: null }, ranking: { enabled: false, rankedAt: null, explanation: null } },
    catalog: { serviceItems: [{ id: "service", position: 0, fullName: "足部按摩", shortName: "足疗", priceOptions: [{ id: "option", durationMinutes: 60, priceCents: 6000, position: 0 }], defaultCommissionBps: null, isEnabled: true, deletedAt: null, version: 1 }], addonItems: [], discountItems: [] }, members: [employee], onReload: reload };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render() { await act(async () => root.render(<TodayBoard {...props} />)); }
function button(text: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.getAttribute("aria-label") === text || node.textContent === text);
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

it("主表操作与读取失败都使用中央浮层，提示不插入页面布局", async () => {
  props.isCurrentBusinessDay = false; props.board.isClosed = true;
  await render();
  const layout = [...container.children].map(node => [node.tagName, node.className]);
  request.mockResolvedValueOnce({ removed: false });
  await click("隐藏");
  expect(document.querySelector(".screen-feedback[role=status]")!.textContent).toContain("已隐藏");
  expect(container.querySelector(".success-banner, .screen-feedback, .form-error")).toBeNull();
  expect([...container.children].map(node => [node.tagName, node.className])).toEqual(layout);
  props.loadError = "读取失败，请刷新后重试"; await render();
  expect(document.querySelectorAll(".screen-feedback")).toHaveLength(1);
  expect(document.querySelector(".screen-feedback[role=alert]")!.textContent).toBe(props.loadError);
  expect([...container.children].map(node => [node.tagName, node.className])).toEqual(layout);
});

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
    expect(document.querySelector(".screen-feedback[role=alert]")!.textContent).toContain("请刷新后重试");
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
    expect(modal.querySelectorAll('.save-record')).toHaveLength(0);
    expect(modal.querySelectorAll('[role=radio][aria-checked=true]')).toHaveLength(1);
    expect(button("正常排工").getAttribute("aria-checked")).toBe("true");
    const select = modal.querySelector<HTMLSelectElement>("#quick-service")!;
    expect(select.value).toBe("service");
    expect(select.previousElementSibling?.textContent).toBe("选择项目");
    expect(select.nextElementSibling).toBe(modal.querySelector(".duration-picker"));
    expect(writes()).toHaveLength(0);
    expect(modal.querySelector(".duration-picker")!.classList.contains("duration-picker--three-options")).toBe(durations.length === 3);
    expect([...modal.querySelectorAll(".duration-picker strong")].map(node => node.textContent)).toEqual([...durations].sort((a, b) => a - b).map(value => `${value} 分钟`));
    await chooseDuration(durations[0]!);
    expect(writes()[0]![1]!.body).toMatchObject({ serviceItemId: "service", serviceDurationMinutes: durations[0] });
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("按店铺顺序默认首个可用项目，切换时长并保存对应项目，再打开恢复默认", async () => {
    const service = props.catalog.serviceItems[0]!;
    service.priceOptions = priceOptions([60, 90]);
    props.catalog.serviceItems.push(
      { ...service, id: "body", position: -1, fullName: "全身按摩", priceOptions: priceOptions([30, 60, 120]).map(option => ({ ...option, priceCents: option.priceCents + 5000 })) },
      { ...service, id: "disabled", isEnabled: false, priceOptions: priceOptions([15]) },
      { ...service, id: "deleted", deletedAt: "2026-10-01", priceOptions: priceOptions([180]) },
    );
    await render(); await click("新增记工");
    const select = document.querySelector<HTMLSelectElement>("#quick-service")!;
    expect([...select.options].map(option => option.value)).toEqual(["body", "service"]);
    expect(select.value).toBe("body");
    expect([...document.querySelectorAll(".duration-picker strong")].map(node => node.textContent)).toEqual(["30 分钟", "60 分钟", "120 分钟"]);
    expect(document.querySelectorAll(".duration-picker small")).toHaveLength(0);
    await chooseDuration(30);
    expect(writes().at(-1)![1]!.body).toMatchObject({ serviceItemId: "body", serviceDurationMinutes: 30 });
    await click("新增记工");
    const reopened = document.querySelector<HTMLSelectElement>("#quick-service")!;
    await act(async () => { reopened.value = "service"; reopened.dispatchEvent(new Event("change", { bubbles: true })); });
    expect([...document.querySelectorAll(".duration-picker strong")].map(node => node.textContent)).toEqual(["60 分钟", "90 分钟"]);
    await chooseDuration(90);
    expect(writes().at(-1)![1]!.body).toMatchObject({ serviceItemId: "service", serviceDurationMinutes: 90 });
    await click("新增记工");
    expect(document.querySelector<HTMLSelectElement>("#quick-service")!.value).toBe("body");
    await chooseDuration(120);
    expect(writes().at(-1)![1]!.body).toMatchObject({ serviceItemId: "body", serviceDurationMinutes: 120 });
    for (const [, options] of writes()) {
      expect(options!.body).not.toHaveProperty("durationMinutes");
      expect(options!.body).not.toHaveProperty("customService");
    }
  });

  it("打开后项目被停用时回退到首个可用项目及其时长", async () => {
    const service = props.catalog.serviceItems[0]!;
    props.catalog.serviceItems.push({ ...service, id: "body", position: 1, priceOptions: priceOptions([90]) });
    await render(); await click("新增记工");
    props.catalog = { ...props.catalog, serviceItems: props.catalog.serviceItems.map(item => item.id === "service" ? { ...item, isEnabled: false } : item) };
    await render();
    expect(document.querySelector<HTMLSelectElement>("#quick-service")!.value).toBe("body");
    expect([...document.querySelectorAll(".duration-picker strong")].map(node => node.textContent)).toEqual(["90 分钟"]);
    await chooseDuration(90);
    expect(writes()[0]![1]!.body).toMatchObject({ serviceItemId: "body", serviceDurationMinutes: 90 });
  });

  it("无效时间不写入；失败保留选择入口和标记，提交中阻止重复写入", async () => {
    await render(); await click("新增记工"); await click("★高亮标记");
    const hour = document.querySelector<HTMLInputElement>('#start-time')!;
    await inputValue(hour, "99"); await chooseDuration(60);
    expect(writes()).toHaveLength(0);
    expect(beginMotion).not.toHaveBeenCalled();
    expect(document.querySelector(".screen-feedback[role=alert]")!.textContent).toContain("有效的开始时间");
    await inputValue(hour, "10");
    request.mockRejectedValueOnce(new ApiError(409, { code: "BUSINESS_DAY_CLOSED", messageZh: "已经日结" }));
    await chooseDuration(60);
    expect(document.querySelector(".work-save-results")!.textContent).toContain("已经日结");
    await click("恢复填写内容");
    expect(button("★高亮标记").getAttribute("aria-checked")).toBe("true");
    let resolveSave!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    await act(async () => { durationButton(60).click(); durationButton(60).click(); });
    expect(writes()).toHaveLength(2);
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
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

describe("保存后收进记工卡片", () => {
  it("删除成功后关闭弹窗并焚烧对应小卡，刷新与动画均完成后清理", async () => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const closed = vi.fn();
    const saved = vi.fn(); const deleted = vi.fn();
    let finishBurn!: () => void;
    deleteMotion.mockReturnValueOnce({ finished: new Promise(resolve => { finishBurn = resolve; }), cancel: releaseDeleteMotion });
    let finishWrite!: () => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finishWrite = () => resolve(undefined); }));
    let finishRefresh!: () => void;
    reload.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    const confirm = vi.spyOn(window, "confirm");
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={ordinary} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={closed} onSaved={saved} onDeleted={deleted} onChanged={reload} />));
    await click("删除记录");
    expect(writes()).toEqual([]); expect(confirm).not.toHaveBeenCalled();
    expect(button("确认删除").classList.contains("delete-record--confirming")).toBe(true);
    await click("确认删除");
    expect(button("确认删除").disabled).toBe(true); await click("确认删除"); expect(writes()).toHaveLength(1);
    expect(deleteMotion).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled();
    await act(async () => finishWrite());
    expect(closed).toHaveBeenCalledOnce(); expect(saveMotion).not.toHaveBeenCalled();
    expect(deleted).toHaveBeenCalledOnce(); expect(saved).not.toHaveBeenCalled();
    expect(deleteMotion).toHaveBeenCalledExactlyOnceWith(ordinary.id); expect(releaseDeleteMotion).not.toHaveBeenCalled();
    await act(async () => finishRefresh());
    expect(releaseDeleteMotion).not.toHaveBeenCalled();
    await act(async () => finishBurn()); expect(releaseDeleteMotion).toHaveBeenCalledOnce();
  });
  it("删除失败不焚烧、不关闭编辑器，并恢复为需要再次确认的删除按钮", async () => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const closed = vi.fn(); const confirm = vi.spyOn(window, "confirm");
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={ordinary} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={closed} onSaved={vi.fn()} onChanged={reload} />));
    await click("删除记录"); expect(writes()).toEqual([]);
    request.mockRejectedValueOnce(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "版本冲突" }));
    await click("确认删除");
    expect(deleteMotion).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled(); expect(button("删除记录").classList.contains("delete-record--confirming")).toBe(false);
    await click("删除记录"); expect(writes()).toHaveLength(1);
    expect(document.querySelector('[role="alert"]')!.textContent).toBe("版本冲突");
  });
  it("删除确认失焦或按 Escape 后撤回，重新打开仍须点两次", async () => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const closed = vi.fn();
    const editor = <RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={ordinary} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={closed} onSaved={vi.fn()} onChanged={reload} />;
    await act(async () => root.render(editor));
    await act(async () => button("删除记录").focus()); await click("删除记录");
    await act(async () => button("保存").focus());
    expect(button("删除记录").classList.contains("delete-record--confirming")).toBe(false);
    await click("删除记录");
    await act(async () => button("确认删除").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(button("删除记录").classList.contains("delete-record--confirming")).toBe(false);
    await click("删除记录");
    await act(async () => root.render(<div />)); await act(async () => root.render(editor));
    expect(button("删除记录").classList.contains("delete-record--confirming")).toBe(false);
    expect(writes()).toEqual([]); expect(closed).not.toHaveBeenCalled();
  });
  it.each(["service", "placeholder"])("%s 保存释放弹窗，旧请求和动画不会关闭下一笔表单", async kind => {
    await render(); await click("新增记工");
    if (kind === "placeholder") await click("占位");
    const saved = { ...ordinary, id: "saved-record" };
    let finishWrite!: (value: WorkRecord) => void;
    let finishRefresh!: () => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve; }));
    reload.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    let finishMotion!: () => void;
    detached.complete.mockImplementationOnce(() => new Promise(resolve => { finishMotion = resolve; }));
    const modal = document.querySelector<HTMLElement>(".quick-work-modal")!;
    await act(async () => { const submit = kind === "placeholder" ? button("确认") : durationButton(60); submit.click(); submit.click(); });
    expect(beginDetached).toHaveBeenCalledWith(modal);
    expect(writes()).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(button("日结").disabled).toBe(true);
    await click("新增记工");
    const nextModal = document.querySelector(".quick-work-modal");
    await act(async () => finishWrite(saved));
    expect(reload).toHaveBeenCalledOnce(); expect(detached.complete).not.toHaveBeenCalled();
    await act(async () => finishRefresh());
    expect(detached.complete).toHaveBeenCalledWith(saved.id);
    expect(document.querySelector(".quick-work-modal")).toBe(nextModal);
    expect(button("关闭").disabled).toBe(false);
    await act(async () => finishMotion());
    expect(document.querySelector(".quick-work-modal")).toBe(nextModal);
  });

  it.each([true, false])("详细记工新建=%s 等待保存动画再关闭，失败保持表单", async isNew => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    const value = { ...ordinary, status: "PENDING_PAYMENT" as const };
    const closed = vi.fn(); const saved = vi.fn();
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={value} isNew={isNew} catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={closed} onSaved={saved} onChanged={reload} />));
    request.mockRejectedValueOnce(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "版本冲突" }));
    await click("保存");
    expect(saveMotion).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled();
    expect(beginMotion).toHaveBeenCalledOnce();
    expect(cancelMotion).toHaveBeenCalledWith(document.querySelector(".record-editor"));
    beginMotion.mockClear();
    let finishWrite!: (value: WorkRecord) => void;
    let finishRefresh!: () => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve; }));
    reload.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    let finishMotion!: () => void;
    saveMotion.mockImplementationOnce(() => new Promise(resolve => { finishMotion = resolve; }));
    await click("保存");
    expect(beginMotion).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled(); expect(saveMotion).not.toHaveBeenCalled();
    await act(async () => finishWrite({ ...value, id: "saved-record" }));
    expect(reload).toHaveBeenCalledOnce(); expect(saveMotion).not.toHaveBeenCalled();
    await act(async () => finishRefresh());
    expect(saveMotion).toHaveBeenCalledWith(document.querySelector(".record-editor"), "saved-record");
    expect(closed).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
    expect(button("关闭").disabled).toBe(true);
    await act(async () => finishMotion());
    expect(saved).toHaveBeenCalledOnce(); expect(closed).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("离开快速记工页面会清理等待动画", async () => {
    await render(); await click("新增记工");
    const dialog = document.querySelector<HTMLElement>(".quick-work-modal")!;
    let finishWrite!: (value: WorkRecord) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve; }));
    await act(async () => durationButton(60).click());
    expect(beginDetached).toHaveBeenCalledWith(dialog);
    await act(async () => root.render(null));
    expect(detached.cancel).toHaveBeenCalled();
    await act(async () => finishWrite(ordinary));
  });
});

describe("快速记工占位", () => {
  it.each(["正常排工", "不算排工", "★高亮标记"])("切换到 %s 只保存对应模式，取消后重新打开恢复正常", async mode => {
    await render(); await click("新增记工");
    await click("★高亮标记"); await click("不算排工"); await click("占位"); await click(mode);
    expect(document.querySelectorAll('.quick-mode-switch [aria-checked="true"]')).toHaveLength(1);
    expect(document.querySelector(".quick-work-modal")!.getAttribute("data-quick-mode")).toBe(mode === "正常排工" ? "NORMAL" : mode === "不算排工" ? "DISPATCH_EXCLUDED" : "HIGHLIGHTED");
    await chooseDuration(60);
    expect(writes()[0]![1]!.body).toMatchObject({ isHighlighted: mode === "★高亮标记", isDispatchExcluded: mode === "不算排工" });
    await click("新增记工"); await click("★高亮标记"); await click("关闭"); await click("新增记工");
    expect(button("正常排工").getAttribute("aria-checked")).toBe("true");
  });
  it("占位校验时间，失败保留模式，保存时禁用模式并阻止重复写入", async () => {
    await render(); await click("新增记工"); await click("占位");
    await inputValue(document.querySelector<HTMLInputElement>("#start-time")!, "99"); await click("确认");
    expect(writes()).toHaveLength(0);
    await inputValue(document.querySelector<HTMLInputElement>("#start-time")!, "10");
    request.mockRejectedValueOnce(new ApiError(409, { code: "BUSINESS_DAY_CLOSED", messageZh: "已经日结" }));
    await click("确认");
    expect(document.querySelector(".work-save-results")!.textContent).toContain("已经日结");
    await click("恢复填写内容");
    expect(button("占位").getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".quick-work-modal")!.getAttribute("data-quick-mode")).toBe("PLACEHOLDER");
    let finish!: (result: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { button("确认").click(); button("确认").click(); });
    expect(writes()).toHaveLength(2);
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    await act(async () => finish({}));
    expect(document.querySelector(".quick-work-modal")).toBeNull();
  });
  it("四种模式互斥，占位需单独保存且不提交服务或其他标记", async () => {
    await render(); await click("新增记工");
    const modal = document.querySelector(".quick-work-modal")!;
    expect([...modal.querySelectorAll(".modal-heading__actions button")].map((node) => node.textContent)).toEqual(["正常排工", "占位", "不算排工", "★高亮标记"]);
    await click("★高亮标记"); await click("不算排工"); await click("占位");
    expect(writes()).toHaveLength(0);
    expect(modal.querySelectorAll('[role=radio][aria-checked=true]')).toHaveLength(1);
    expect(button("占位").getAttribute("aria-checked")).toBe("true");
    expect(button("详细记工").disabled).toBe(true);
    expect(modal.querySelector("#quick-service, .duration-picker")).toBeNull();
    const content = modal.querySelector(".quick-modal-content")!;
    expect([...content.querySelectorAll(".field-label")].map(label => label.textContent)).toEqual(["开始时间"]);
    expect(content.querySelectorAll(".work-time-field")).toHaveLength(1);
    expect([...content.querySelectorAll("button")].map(control => control.textContent)).toEqual(["确认"]);
    await inputValue(content.querySelector<HTMLInputElement>("#start-time")!, "11");
    expect(writes()).toHaveLength(0);
    await click("确认");
    expect(writes()).toEqual([["/stores/store/work-records", { method: "POST", idempotent: true, headers: { "Idempotency-Key": expect.any(String) }, body: { employeeMembershipId: "employee", startAt: "2026-10-06T15:00:00.000Z", isPlaceholder: true } }]]);
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    await click("新增记工");
    expect(button("★高亮标记").getAttribute("aria-checked")).toBe("false");
    expect(button("不算排工").getAttribute("aria-checked")).toBe("false");
    expect(button("正常排工").getAttribute("aria-checked")).toBe("true");
  });
  it("没有项目也能点击占位，创建只提交员工、时间和占位标记", async () => {
    props.catalog.serviceItems = []; await render(); await click("新增记工");
    expect(document.querySelectorAll(".duration-picker button")).toHaveLength(0);
    expect(document.querySelector<HTMLSelectElement>("#quick-service")!.disabled).toBe(true);
    expect(document.querySelector(".duration-picker .empty-note")!.textContent).toContain("没有可用时长");
    await click("占位"); await click("确认");
    expect(writes()).toEqual([["/stores/store/work-records", { method: "POST", idempotent: true, headers: { "Idempotency-Key": expect.any(String) }, body: { employeeMembershipId: "employee", startAt: "2026-10-06T14:00:00.000Z", isPlaceholder: true } }]]);
    expect(document.querySelector(".quick-work-modal")).toBeNull(); expect(reload).toHaveBeenCalledTimes(1); expect(document.querySelector(".work-save-results")!.textContent).toContain("记工已保存");
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
    expect(deleteMotion).toHaveBeenCalledExactlyOnceWith(placeholder.id); expect(releaseDeleteMotion).toHaveBeenCalledOnce();
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
    expect(deleteMotion).not.toHaveBeenCalled();
  });
});


describe("不算排工", () => {
  it("快速记工选择排工模式，点击时长提交新标记并在再次打开时重置", async () => {
    await render(); await click("新增记工"); await click("不算排工");
    expect(button("不算排工").getAttribute("aria-checked")).toBe("true");
    expect(button("★高亮标记").getAttribute("aria-checked")).toBe("false");
    await chooseDuration(60);
    expect(writes()[0]![1]!.body).toMatchObject({ isDispatchExcluded: true, isHighlighted: false, serviceItemId: "service", serviceDurationMinutes: 60 });
    await click("新增记工");
    expect(button("不算排工").getAttribute("aria-checked")).toBe("false");
    expect(button("正常排工").getAttribute("aria-checked")).toBe("true");
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
    expect(editor.dataset.service).toBe("service");
    expect(JSON.parse(editor.dataset.record!)).toMatchObject({ employeeMembershipId: "employee", startAt: "2026-10-06T15:00:00.000Z", isHighlighted: false, isDispatchExcluded: true, serviceSnapshot: null });
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
    expect(document.querySelector(".screen-feedback[role=alert]")!.textContent).toContain("有效的开始时间");
    expect(writes()).toHaveLength(0);
  });
});

describe("详细记工新建与零实收", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  it("带入快速记工项目，按目录默认档位同步报价及结束时间，保存一次写入", async () => {
    const { RecordEditor } = await vi.importActual<typeof import("./record-editor")>("./record-editor");
    props.catalog.serviceItems[0]!.priceOptions = [{ id: "90", durationMinutes: 90, priceCents: 8500, position: 0 }];
    const record = newWorkRecord({ employeeMembershipId: "employee", startAt: ordinary.startAt, businessDate: "2026-10-06", storeTimezoneSnapshot: store.timezone, businessCutoffSnapshot: "04:00", isHighlighted: false, isDispatchExcluded: false });
    await act(async () => root.render(<RecordEditor storeId="store" timezone={store.timezone} businessDate="2026-10-06" autoDiscountSettings={store} record={record} isNew initialServiceItemId="service" catalog={props.catalog} members={props.members} canManage isClosed={false} onClose={vi.fn()} onSaved={vi.fn()} onChanged={reload} />));
    const fields = document.querySelector(".record-service-section")!;
    expect(fields.querySelector<HTMLSelectElement>("select")!.value).toBe("service");
    expect(fields.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe("85");
    expect([...document.querySelectorAll<HTMLInputElement>('[aria-label="结束时间"] input')].map(input => input.value)).toEqual(["11", "30"]);
    expect(writes()).toHaveLength(0);
    await click("保存");
    expect(writes()).toHaveLength(1);
    expect(writes()[0]![1]!.body).toMatchObject({ create: { serviceItemId: "service", serviceDurationMinutes: 90 }, details: { mainServiceAmountCents: 8500 } });
    expect(writes()[0]![1]!.body).not.toHaveProperty("payment");
  });
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
    for (const metric of metrics) expect(metric.querySelector("strong")?.textContent).toBe("+$123.45");
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
    if (cashChangeCents === null) expect(metric.textContent).toContain("旧日结未记录，重新日结后生成");
    else expect(metric.querySelector(".overview-metric__note")).toBeNull();
  });
  it("普通员工没有全店现金变化指标", async () => {
    props.membership = { ...props.membership, role: "EMPLOYEE", id: employee.id };
    props.board = { ...props.board, isClosed: true };
    await render();
    expect(container.querySelector(".board-overview")).toBeNull();
  });
});


describe("独立保存任务", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  async function note(value: string) {
    const field = document.querySelector<HTMLTextAreaElement>(".record-editor textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  it("慢网允许提交第二笔，乱序完成仍保留正在填写的第三笔", async () => {
    await render();
    let first!: (record: WorkRecord) => void, second!: (record: WorkRecord) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { first = resolve; }));
    await click("新增记工"); await chooseDuration(60);
    request.mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    await click("新增记工"); await click("★高亮标记"); await chooseDuration(60);
    expect(writes()).toHaveLength(2);
    expect(writes()[0]![1]!.headers).not.toEqual(writes()[1]![1]!.headers);
    expect(document.querySelector(".work-save-count")!.textContent).toContain("正在保存 2 笔");
    await click("新增记工"); await click("占位");
    const third = document.querySelector(".quick-work-modal");
    await act(async () => second({ ...ordinary, id: "second" }));
    expect(document.querySelector(".quick-work-modal")).toBe(third);
    expect(button("占位").getAttribute("aria-checked")).toBe("true");
    await act(async () => first({ ...ordinary, id: "first" }));
    expect(document.querySelector(".quick-work-modal")).toBe(third);
    expect(button("确认").disabled).toBe(false);
  });
  it.each([true, false])("详细保存新增=%s 立即释放表单，失败恢复完整内容且不打断下一笔", async isNew => {
    editorRendering.actual = true;
    if (!isNew) props.board.rows[0]!.workRecords = [ordinary];
    await render();
    if (isNew) { await click("新增记工"); await click("详细记工"); }
    else await act(async () => container.querySelector<HTMLButtonElement>('[data-work-record-id="ordinary"]')!.click());
    await note("上一笔完整备注 / retained note");
    let fail!: (error: unknown) => void;
    request.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await click("保存");
    expect(document.querySelector(".record-editor")).toBeNull();
    expect(writes()).toHaveLength(1);
    if (!isNew) expect(container.querySelector<HTMLButtonElement>('[data-work-record-id="ordinary"]')!.disabled).toBe(true);
    await click("新增记工"); await click("详细记工"); await note("下一笔还在填写");
    const next = document.querySelector(".record-editor");
    await act(async () => fail(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "版本冲突" })));
    expect(document.querySelector(".record-editor")).toBe(next);
    await click("恢复填写内容");
    expect(document.querySelector<HTMLTextAreaElement>(".record-editor textarea")!.value).toBe("下一笔还在填写");
    await click("关闭");
    expect(document.querySelector<HTMLTextAreaElement>(".record-editor textarea")!.value).toBe("上一笔完整备注 / retained note");
    expect(document.querySelector(".record-error-toast[role=alert]")!.textContent).toContain("版本冲突");
    expect(writes()).toHaveLength(1);
    request.mockResolvedValueOnce({ ...ordinary, id: "saved", version: 8 });
    await click("保存");
    const original = writes()[0]![1]!.body, retry = writes()[1]![1]!.body;
    expect(retry).toEqual(original);
    expect(document.querySelector(".record-editor")).toBeNull();
  });
  it("已保存后同步失败只重读，不再写入", async () => {
    await render(); request.mockResolvedValueOnce({ ...ordinary, id: "saved" });
    reload.mockRejectedValueOnce(new Error("刷新失败"));
    await click("新增记工"); await chooseDuration(60);
    expect(document.querySelector(".work-save-results")!.textContent).toContain("记工已保存，同步暂时失败");
    await click("重新同步");
    expect(writes()).toHaveLength(1); expect(reload).toHaveBeenCalledTimes(2);
  });
});
