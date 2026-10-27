// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ExpenseItemResponse, ExpenseMonthResponse } from "@massage-note/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../../lib/api";
import { ExpensesPanel } from "./expenses-panel";

vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../../lib/realtime", () => ({ useStoreRealtime: () => {} }));
const language = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("../language-provider", () => ({ useLanguage: () => language }));
const request = vi.mocked(apiRequest);
const recurring = (id: string, changes: Partial<ExpenseItemResponse> = {}): ExpenseItemResponse => ({ id, version: 4, name: id, note: "查看备注", kind: "RECURRING", occurredOn: null, amountCents: null, deletedAt: null, rules: [{ id: `rule-${id}`, startDate: "2026-01-01", endExclusive: null, defaultAmountFrom: "2026-01-01", unit: "MONTH", interval: 1, amountCents: "10000" }], ...changes });
function fixture(): ExpenseMonthResponse {
  const rent = recurring("房租"), utility = recurring("水电");
  const once = (id: string, date: string, amount: string): ExpenseItemResponse => ({ ...recurring(id), kind: "ONCE", note: "", occurredOn: date, amountCents: amount, rules: [] });
  return {
    month: "2026-10", daysInMonth: 31, totalCents: "11400", recurringCents: "11100", oneTimeCents: "300", dailyAverageCents: "368", missingPeriodCount: 2,
    itemSummaries: [{ itemId: rent.id, allocatedCents: "10000", missingPeriodCount: 0 }, { itemId: utility.id, allocatedCents: "1100", missingPeriodCount: 2 }, { itemId: "修理", allocatedCents: "100", missingPeriodCount: 0 }, { itemId: "用品", allocatedCents: "200", missingPeriodCount: 0 }],
    items: [utility, once("修理", "2026-10-02", "100"), recurring("未来", { rules: [{ ...rent.rules[0]!, id: "future-rule", startDate: "2027-01-01", defaultAmountFrom: "2027-01-01" }] }), once("用品", "2026-10-10", "200"), rent, once("上月", "2026-09-01", "999"), recurring("停止", { rules: [{ ...rent.rules[0]!, endExclusive: "2026-09-01" }] }), recurring("删除", { deletedAt: "2026-10-01T00:00:00Z" })],
    lines: [
      { itemId: rent.id, ruleId: rent.rules[0]!.id, name: rent.name, periodStart: "2026-10-01", periodEnd: "2026-10-31", periodAmountCents: "10000", allocatedCents: "10000", hasOverride: false },
      ...["01", "11", "21"].map((day, index) => ({ itemId: utility.id, ruleId: utility.rules[0]!.id, name: utility.name, periodStart: `2026-10-${day}`, periodEnd: `2026-10-${index === 2 ? "31" : index === 1 ? "20" : "10"}`, periodAmountCents: index === 1 ? "1100" : null, allocatedCents: index === 1 ? "1100" : null, hasOverride: index === 1 })),
      { itemId: "修理", ruleId: null, name: "修理", periodStart: "2026-10-02", periodEnd: "2026-10-02", periodAmountCents: "100", allocatedCents: "100", hasOverride: false },
      { itemId: "用品", ruleId: null, name: "用品", periodStart: "2026-10-10", periodEnd: "2026-10-10", periodAmountCents: "200", allocatedCents: "200", hasOverride: false },
    ],
  };
}
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  language.locale = "zh-CN"; request.mockReset(); request.mockResolvedValue(fixture());
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render(storeId = "store") { await act(async () => root.render(<ExpensesPanel storeId={storeId} today="2026-10-17" />)); }
function button(label: string, scope: ParentNode = container) {
  const node = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(value => value.textContent === label);
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
async function click(label: string, scope: ParentNode = container) { await act(async () => button(label, scope).click()); }
function card(id: string) { return container.querySelector<HTMLElement>(`.mobile-data-view [data-expense-id="${id}"]`)!; }
function dialog() { return container.querySelector<HTMLElement>("[role=dialog]")!; }
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => dialog().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("四项指标取服务端值，区域顺序、排序和每项目一个入口，其他月份一次性不出现", async () => {
  await render();
  expect([...container.querySelectorAll(".expenses-summary article span")].map(node => node.textContent)).toEqual(["本月总支出", "每月固定支出", "本月平均每日支出", "本月一次性支出"]);
  expect([...container.querySelectorAll(".expenses-summary strong")].map(node => node.textContent)).toEqual(["$114.00", "$111.00", "$3.68", "$3.00"]);
  const regions = container.querySelectorAll(".expenses-region");
  expect(regions[0]!.querySelector("h2")!.textContent).toBe("一次性支出");
  expect([...regions[0]!.querySelectorAll(".mobile-data-view li[data-expense-id]")].map(node => node.getAttribute("data-expense-id"))).toEqual(["用品", "修理"]);
  expect([...regions[1]!.querySelectorAll(".mobile-data-view li[data-expense-id]")].map(node => node.getAttribute("data-expense-id"))).toEqual(["房租", "水电"]);
  for (const id of ["房租", "水电", "用品", "修理"]) {
    expect(container.querySelectorAll(`.desktop-data-view [data-expense-id="${id}"]`)).toHaveLength(1);
    expect(container.querySelectorAll(`.mobile-data-view [data-expense-id="${id}"]`)).toHaveLength(1);
  }
  expect(container.textContent).not.toMatch(/预算|金额来源|当月费用明细|支出项目管理|上月/);
  expect(container.querySelector<HTMLDetailsElement>(".expenses-inactive")!.open).toBe(false);
  expect(container.querySelector(".expenses-inactive")!.textContent).toMatch(/未来/);
  expect(container.querySelector(".expenses-inactive")!.textContent).toMatch(/停止/);
});

it("展开整期记录，保留缺失提示、未录入空输入与真实零金额，撤销带版本和确认", async () => {
  await render(); await click("查看各期", card("水电"));
  const periods = card("水电").querySelectorAll(".expenses-periods .mobile-data-card");
  expect(periods).toHaveLength(3); expect(periods[0]!.textContent).toContain("未录入"); expect(card("水电").textContent).toContain("2 期未录入");
  await click("填写 / 修改金额", periods[0]!);
  const amount = dialog().querySelector<HTMLInputElement>("input[inputmode=decimal]")!;
  expect(amount.value).toBe(""); await input(amount, "0"); await submit();
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/水电/periods", { method: "POST", idempotent: true, body: { version: 4, ruleId: "rule-水电", periodStart: "2026-10-01", amountCents: 0 } });
  await click("撤销当期修改", card("水电")); expect(window.confirm).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));
  vi.mocked(window.confirm).mockReturnValue(true); await click("撤销当期修改", card("水电"));
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/水电/periods", { method: "DELETE", idempotent: true, body: { version: 4, ruleId: "rule-水电", periodStart: "2026-10-11" } });
});

it("新增和常用金额变更不提交模式，常用金额按指定周期生效", async () => {
  await render(); await click("新增支出");
  expect(dialog().textContent).not.toContain("预算");
  await input(dialog().querySelector<HTMLInputElement>("input[maxlength='100']")!, "网络");
  await input(dialog().querySelector<HTMLInputElement>("input[inputmode=decimal]")!, "12.34");
  await submit();
  expect(request).toHaveBeenCalledWith("/stores/store/expenses", { method: "POST", idempotent: true, body: { name: "网络", note: "", kind: "RECURRING", rule: { startDate: "2026-10-01", unit: "MONTH", interval: 1, amountCents: 1234 } } });
  await click("修改常用金额 / 周期", card("房租"));
  await input(dialog().querySelector<HTMLInputElement>("input[type=month]")!, "2026-12");
  await submit();
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/房租/rules", { method: "POST", idempotent: true, body: { version: 4, rule: { startDate: "2026-12-01", unit: "MONTH", interval: 1, amountCents: 10000 } } });
});

it("详情包含备注、历史和停止，折叠项目可重新开始，删除和恢复保留确认及版本", async () => {
  await render(); await click("项目详情", card("房租"));
  expect(dialog().textContent).toContain("查看备注"); expect(dialog().textContent).toContain("自动沿用自");
  await click("停止", dialog()); await submit();
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/房租/stop", { method: "POST", idempotent: true, body: { version: 4, effectiveFrom: "2026-11-01" } });
  await click("项目详情", container.querySelector('.expenses-inactive [data-expense-id="停止"]')!);
  await click("重新开始", dialog()); await submit();
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/停止/rules", expect.objectContaining({ method: "POST", body: expect.objectContaining({ version: 4 }) }));
  await click("项目详情", card("用品")); await click("删除", dialog());
  expect(dialog()).not.toBeNull();
  vi.mocked(window.confirm).mockReturnValue(true); await click("删除", dialog());
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/用品", { method: "DELETE", idempotent: true, body: { version: 4 } });
  // A deletion readback removes its detail dialog and retains the recovery entry.
  const deleted = fixture(); deleted.items.find(item => item.id === "用品")!.deletedAt = "2026-10-17T00:00:00Z";
  request.mockResolvedValue(deleted); await click("删除", dialog());
  expect(dialog()).toBeNull();
  await click("恢复", container.querySelector('.expenses-deleted [data-expense-id="用品"]')!);
  expect(request).toHaveBeenCalledWith("/stores/store/expenses/用品/restore", { method: "POST", idempotent: true, body: { version: 4 } });
});

it("保存失败保留草稿可重试，409 关闭旧编辑并刷新核对", async () => {
  await render(); await click("修改金额", card("用品"));
  await input(dialog().querySelector<HTMLInputElement>("input[inputmode=decimal]")!, "9.87");
  request.mockRejectedValueOnce(new Error("保存失败")); await submit();
  expect(dialog().textContent).toContain("保存失败"); expect(dialog().querySelector<HTMLInputElement>("input[inputmode=decimal]")!.value).toBe("9.87");
  request.mockRejectedValueOnce(new ApiError(409, { messageZh: "支出已被修改" })); await submit();
  expect(dialog()).toBeNull(); expect(container.querySelector("[role=alert]")!.textContent).toContain("支出已被修改");
});

it("详情删除失败可在弹层内读取错误并重试，冲突后关闭详情", async () => {
  await render(); await click("项目详情", card("用品"));
  vi.mocked(window.confirm).mockReturnValue(true);
  request.mockRejectedValueOnce(new Error("删除失败")); await click("删除", dialog());
  expect(dialog().querySelector("[role=alert]")!.textContent).toBe("删除失败");
  request.mockRejectedValueOnce(new ApiError(409, { messageZh: "支出已被修改" })); await click("删除", dialog());
  expect(dialog()).toBeNull(); expect(container.querySelector("[role=alert]")!.textContent).toContain("支出已被修改");
});

it("切月和切店隔离延迟响应、清除旧详情；失败可刷新恢复", async () => {
  await render();
  let resolveMonth!: (value: ExpenseMonthResponse) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { resolveMonth = resolve; }));
  await input(container.querySelector<HTMLInputElement>('input[type=month]')!, "2026-09");
  expect(container.querySelector(".expenses-summary")).toBeNull();
  expect(request).toHaveBeenLastCalledWith("/stores/store/expenses?month=2026-09");
  request.mockRejectedValueOnce(new Error("读取失败")); await render("other");
  await act(async () => resolveMonth(fixture()));
  expect(container.textContent).toContain("读取失败"); expect(container.querySelector(".expenses-summary")).toBeNull();
  const next = { ...fixture(), month: "2026-09", totalCents: "12345" };
  request.mockResolvedValue(next); await click("刷新");
  expect(request).toHaveBeenLastCalledWith("/stores/other/expenses?month=2026-09");
  expect(container.querySelector(".expenses-summary strong")!.textContent).toBe("$123.45");
});

it("切店期间的保存结果不影响新店，等待时阻止重复提交", async () => {
  await render(); await click("修改金额", card("用品"));
  let finishSave!: () => void;
  request.mockImplementationOnce(() => new Promise(resolve => { finishSave = () => resolve({}); }));
  await submit(); expect(button("保存中…", dialog()).disabled).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].every(node => node.disabled)).toBe(true);
  await render("other"); expect(dialog()).toBeNull();
  const count = request.mock.calls.length;
  await act(async () => finishSave()); expect(request).toHaveBeenCalledTimes(count);
  expect(request).toHaveBeenLastCalledWith("/stores/other/expenses?month=2026-10");
});

it("英文、全未录入和零值保持含义；空月保留两个区域", async () => {
  language.locale = "en-US";
  const response = fixture(); response.itemSummaries[0] = { itemId: "房租", allocatedCents: null, missingPeriodCount: 1 };
  response.itemSummaries[1] = { itemId: "水电", allocatedCents: "0", missingPeriodCount: 0 };
  request.mockResolvedValue(response); await render();
  expect(card("房租").textContent).toContain("Not recorded"); expect(card("水电").textContent).toContain("$0.00");
  expect(container.querySelector(".expenses-summary")!.textContent).toContain("Monthly recurring expenses");
  const empty = { ...response, month: "2026-09", items: [], lines: [], itemSummaries: [], missingPeriodCount: 0 };
  request.mockResolvedValue(empty); await input(container.querySelector<HTMLInputElement>('input[type=month]')!, "2026-09");
  expect(container.textContent).toContain("No one-time expenses this month."); expect(container.textContent).toContain("No recurring costs this month.");
});
