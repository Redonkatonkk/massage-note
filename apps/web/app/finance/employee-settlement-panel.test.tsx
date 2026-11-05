// @vitest-environment jsdom
import { act } from "react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { EmployeeSettlementPreview, StoreMember } from "../../lib/types";
import { PayrollEntryForm } from "./payroll-entry-form";
import { EmployeeSettlementPanel } from "./employee-settlement-panel";

vi.mock("../../lib/api", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/api")>(), apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const member = { id: "10000000-0000-4000-8000-000000000001", displayName: "Amy", role: "EMPLOYEE", status: "ACTIVE" } as StoreMember;
let container: HTMLDivElement;
let root: Root;
const quoted = (params: URLSearchParams): EmployeeSettlementPreview => ({
  storeId: "store", storeName: "Store", storeTimezone: "America/New_York", dateFrom: "2026-10-01", dateTo: "2026-10-25",
  paymentScope: params.get("paymentScope") as EmployeeSettlementPreview["paymentScope"], amountType: params.get("amountType") as NonNullable<EmployeeSettlementPreview["amountType"]>,
  employee: { membershipId: member.id, displayName: member.displayName }, generatedAt: "2026-10-25T12:00:00Z",
  summary: { recordCount: 1, cashServiceCents: 0, nonCashServiceCents: 10000, cashLargeFeeWageCents: 0, nonCashLargeFeeWageCents: 0, cashTipCents: 0, nonCashTipCents: 2300, cashIncomeCents: 0, nonCashIncomeCents: 2300, totalIncomeCents: 2300 },
  records: [{ id: "record", businessDate: "2026-10-25", startAt: "2026-10-25T12:00:00Z", endAt: null, serviceName: "Massage", serviceShortName: "M", addons: [], grossFeeBaseCents: 10000, cashServiceCents: 0, cardServiceCents: 10000, giftCardServiceCents: 0, nonCashServiceCents: 10000, cashLargeFeeWageCents: 0, nonCashLargeFeeWageCents: 0, cashTipCents: 0, cardTipCents: 2000, giftCardTipCents: 300, nonCashTipCents: 2300, cashIncomeCents: 0, nonCashIncomeCents: 2300, totalIncomeCents: 2300 }],
  payment: { unsettledCents: 2300, fullyConfirmed: false, revision: "a".repeat(64) },
});
function checkbox(label: string) { return [...container.querySelectorAll("label")].find(node => node.textContent === label)!.querySelector<HTMLInputElement>("input")!; }
async function toggle(label: string) { await act(async () => checkbox(label).click()); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find(node => node.textContent === label)!.click()); }
async function render(busy = false) { await act(async () => root.render(<EmployeeSettlementPanel storeId="store" businessDate="2026-10-25" members={[member]} settlements={[]} busy={busy} run={async action => action()} onSettled={async () => {}} />)); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockReset();
  request.mockImplementation(async (path) => {
    if (path.includes("/calendar?")) return { membershipId: member.id, month: "2026-10", days: [] };
    if (path.includes("/preview?")) return quoted(new URL(path, "http://localhost").searchParams);
    if (path.endsWith("/shares")) return { token: "a".repeat(43), createdAt: "2026-10-25T12:00:00Z", expiresAt: "2026-11-08T12:00:00Z", employeeName: "Amy", dateFrom: "2026-10-01", dateTo: "2026-10-25", totalIncomeCents: 2300 };
    return {};
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("工资结算复选框", () => {
  it("全部员工、日历、来源类型与操作同处一个工作区，生成前保留不可用的付款和分享入口", async () => {
    const members = Array.from({ length: 12 }, (_, index) => ({ ...member, id: index ? `member-${index}` : member.id, displayName: `Employee ${index + 1}` }));
    await act(async () => root.render(<EmployeeSettlementPanel storeId="store" businessDate="2026-10-25" members={members} settlements={[]} busy={false} run={async action => action()} onSettled={async () => {}} />));
    const workspace = container.querySelector(".payroll-workspace-grid")!;
    expect(workspace.querySelectorAll(".payroll-employee-list button")).toHaveLength(12);
    expect(workspace.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);
    expect(workspace.querySelector(".settlement-calendar")).not.toBeNull();
    expect(workspace.querySelector("select")).toBeNull();
    for (const label of ["已付款", "复制分享链接"]) expect([...workspace.querySelectorAll("button")].find(node => node.textContent === label)?.disabled).toBe(true);
    await click("生成结算单");
    expect(workspace.querySelector('input[inputmode="decimal"]')).not.toBeNull();
    for (const label of ["生成结算单", "已付款", "复制分享链接"]) {
      const button = [...workspace.querySelectorAll("button")].find(node => node.textContent === label)!;
      expect(button.closest("details")).toBeNull();
      expect(button.disabled).toBe(false);
    }
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="下个月"]')!.click());
    expect(workspace.querySelectorAll(".settlement-calendar-days > *")).toHaveLength(42);
    expect(workspace.querySelector('time[datetime="2026-11-30"]')).not.toBeNull();
  });

  it("桌面并排保留员工、日历和金额，名单不截断；手机恢复触控尺寸和任务顺序", async () => {
    await click("生成结算单");
    const checkerPath = pathToFileURL(resolve(process.cwd(), "../../scripts/check-mobile-ui.mjs")).href;
    const { stylesAtWidth } = await import(/* @vite-ignore */ checkerPath);
    const sources = await Promise.all(["globals.css", "design-system.css", "responsive.css"].map(async name => ({ name, css: await readFile(resolve(process.cwd(), "app", name), "utf8") })));
    for (const width of [390, 760, 1024, 1274, 1440]) {
      const dom = new JSDOM(`<style>${stylesAtWidth(sources, width)}</style>${container.innerHTML}`);
      const style = (selector: string) => dom.window.getComputedStyle(dom.window.document.querySelector(selector)!);
      expect(["", "none"], `${width}px roster must not clip employees`).toContain(style(".payroll-employee-list").maxHeight);
      expect(["", "visible"], `${width}px roster must not scroll internally`).toContain(style(".payroll-employee-list").overflowY);
      if (width > 760) {
        expect(style(".payroll-workspace-grid").gridTemplateColumns).toBe("minmax(460px, 536px) minmax(0, 1fr)");
        expect(style(".payroll-setup").gridTemplateColumns).toBe("minmax(152px, 188px) minmax(0, 1fr)");
        expect(style(".settlement-payment-amounts").gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
        expect(parseFloat(style(".settlement-calendar-day").minHeight)).toBe(32);
      } else {
        for (const selector of [".payroll-employee-list button", ".settlement-calendar-day", ".employee-settlement-send-actions button"]) expect(parseFloat(style(selector).minHeight)).toBeGreaterThanOrEqual(44);
        expect(style(".payroll-setup-choices").display).toBe("contents");
        expect([style(".payroll-employee-field").order, style(".settlement-calendar").order, style(".payroll-setup-options").order, style(".payroll-setup-choices > button").order]).toEqual(["0", "1", "2", "3"]);
      }
      dom.window.close();
    }
  });

  it("生成前展示真实选择，生成后总额与来源对应且不把结算单当作已付款", async () => {
    const pending = container.querySelector('[aria-label="结算单预览"]')!;
    expect(pending.textContent).toContain("Amy");
    expect(pending.textContent).toContain("2026-10-01");
    expect(pending.textContent).toContain("生成结算单不会登记付款");
    expect(pending.textContent).not.toContain("$0.00");
    await toggle("现金");
    await click("生成结算单");
    expect(container.querySelector(".settlement-ledger-total strong")?.textContent).toBe("$23.00");
    const rows = [...container.querySelectorAll(".settlement-source-table tbody tr")];
    expect(rows.map(row => [...row.children].map(cell => cell.textContent))).toEqual([
      ["现金", "$0.00", "$0.00"], ["刷卡＋礼物卡", "$0.00", "$23.00"],
    ]);
    expect(container.querySelector(".payroll-payment-status")?.textContent).toBe("待付款确认");
    expect(request.mock.calls.some(([path]) => path.endsWith("/confirm"))).toBe(false);
  });

  it("生成等待中保留选择并禁用重复提交，返回后恢复操作", async () => {
    let finish!: (value: EmployeeSettlementPreview) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click("生成结算单");
    expect(container.querySelector('[aria-label="结算单预览"]')?.getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("Amy");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () => finish(quoted(new URLSearchParams({ paymentScope: "NON_CASH", amountType: "ALL" }))));
    expect(container.querySelector('[aria-label="结算单汇总"]')?.getAttribute("aria-busy")).toBe("false");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it("保留空记录的零值，禁止付款和分享", async () => {
    const empty = quoted(new URLSearchParams({ paymentScope: "NON_CASH", amountType: "ALL" }));
    empty.records = [];
    empty.summary = Object.fromEntries(Object.keys(empty.summary).map(key => [key, 0])) as EmployeeSettlementPreview["summary"];
    empty.payment = { ...empty.payment!, unsettledCents: 0 };
    request.mockImplementationOnce(async () => empty);
    await click("生成结算单");
    expect(container.querySelector(".settlement-ledger-total strong")?.textContent).toBe("$0.00");
    expect(container.textContent).toContain("当前范围没有符合条件的已确认记工");
    for (const label of ["已付款", "复制分享链接"]) expect([...container.querySelectorAll("button")].find(node => node.textContent === label)?.disabled).toBe(true);
  });

  it("Owner 结算仅供核对，不展示付款登记", async () => {
    await act(async () => root.render(<EmployeeSettlementPanel storeId="store" businessDate="2026-10-25" members={[{ ...member, role: "OWNER" }]} settlements={[]} busy={false} run={async action => action()} onSettled={async () => {}} />));
    await click("生成结算单");
    expect(container.querySelector(".payroll-payment-status")?.textContent).toBe("仅查看结算");
    expect(container.querySelector('[aria-label="付款登记"]')).toBeNull();
    expect(container.querySelector(".settlement-ledger-total strong")?.textContent).toBe("$23.00");
  });

  it("默认刷卡与全部类型，支持单选、多选且每组至少一项", async () => {
    expect([checkbox("刷卡").checked, checkbox("现金").checked, checkbox("大费").checked, checkbox("小费").checked]).toEqual([true, false, true, true]);
    await toggle("刷卡"); expect(checkbox("刷卡").checked).toBe(true);
    await toggle("现金"); expect(checkbox("刷卡").checked).toBe(true); expect(checkbox("现金").checked).toBe(true);
    await toggle("刷卡"); expect(checkbox("现金").checked).toBe(true); expect(checkbox("刷卡").checked).toBe(false);
    await toggle("小费"); expect(checkbox("大费").checked).toBe(true); expect(checkbox("小费").checked).toBe(false);
    await toggle("小费"); await toggle("大费"); expect(checkbox("小费").checked).toBe(true); expect(checkbox("大费").checked).toBe(false);
    await render(true); expect([...container.querySelectorAll("fieldset")].every(node => node.disabled)).toBe(true);
  });

  it("查询、付款和公开分享均保留类型，自动复制且清除旧预览", async () => {
    await toggle("大费"); await click("生成结算单");
    const query = request.mock.calls.find(([path]) => path.includes("/preview?"))![0];
    expect(new URL(query, "http://localhost").searchParams.get("amountType")).toBe("TIP");
    expect(new URL(query, "http://localhost").searchParams.get("paymentScope")).toBe("NON_CASH");
    await click("复制分享链接");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(`/share/settlement?token=${"a".repeat(43)}`));
    expect(vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0]).toContain("姓名：Amy\n结算日期：2026-10-01 至 2026-10-25\n合计金额：$23.00\n详情链接：");
    expect(container.textContent).not.toContain("短信发送长图");
    expect(container.textContent).not.toContain("生成图片");
    expect(request.mock.calls.find(([path, options]) => path.endsWith("/shares") && options?.method === "POST")?.[1]?.body).toMatchObject({ amountType: "TIP", paymentScope: "NON_CASH" });
    await click("已付款");
    expect(request.mock.calls.find(([path]) => path.endsWith("/confirm"))?.[1]?.body).toMatchObject({ amountType: "TIP", paymentScope: "NON_CASH", revision: "a".repeat(64) });
    await toggle("现金"); expect(container.querySelector('[aria-label="结算单汇总"]')).toBeNull();
  });

  it("剪贴板被拒绝后保留可手动复制的链接", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    await click("生成结算单"); await click("复制分享链接");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("手动复制");
    expect(container.querySelector<HTMLTextAreaElement>("textarea[readonly]")?.value).toContain("/share/settlement?token=");
  });

  it("切换范围后不复制迟到的链接", async () => {
    await click("生成结算单");
    let finish!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click("复制分享链接");
    // A refreshed preview can invalidate a request even while the controls are disabled.
    await act(async () => root.unmount());
    await act(async () => finish({ token: "a".repeat(43) }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    root = createRoot(container);
  });

  it("手工工资登记沿用默认选项，保存时保留所选来源和类型", async () => {
    await act(async () => root.render(<PayrollEntryForm storeId="store" businessDate="2026-10-25" members={[member]} busy={false} run={async action => action()} onSaved={async () => {}} />));
    expect([checkbox("刷卡").checked, checkbox("现金").checked, checkbox("大费").checked, checkbox("小费").checked]).toEqual([true, false, true, true]);
    await toggle("现金"); await toggle("小费");
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "23.45");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("保存工资结算");
    expect(request.mock.calls.find(([path]) => path.endsWith("/payroll-settlements"))?.[1]?.body).toMatchObject({ paymentScope: "ALL", amountType: "SERVICE", totalPaidCents: 2345 });
  });

});
