// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { generateEmployeeSettlementImage } from "../../lib/employee-settlement-image";
import type { EmployeeSettlementPreview, StoreMember } from "../../lib/types";
import { PayrollEntryForm } from "./payroll-entry-form";
import { EmployeeSettlementPanel } from "./employee-settlement-panel";

vi.mock("../../lib/api", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../../lib/employee-settlement-image", () => ({ generateEmployeeSettlementImage: vi.fn() }));
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
    if (path.endsWith("/deliveries")) return { deliveries: [], agent: null };
    return {};
  });
  vi.mocked(generateEmployeeSettlementImage).mockResolvedValue({ url: "blob:test", fileName: "tips.png" });
  vi.stubGlobal("URL", class extends URL { static revokeObjectURL = vi.fn(); });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("工资结算复选框", () => {
  it("默认刷卡与全部类型，支持单选、多选且每组至少一项", async () => {
    expect([checkbox("刷卡").checked, checkbox("现金").checked, checkbox("大费").checked, checkbox("小费").checked]).toEqual([true, false, true, true]);
    await toggle("刷卡"); expect(checkbox("刷卡").checked).toBe(true);
    await toggle("现金"); expect(checkbox("刷卡").checked).toBe(true); expect(checkbox("现金").checked).toBe(true);
    await toggle("刷卡"); expect(checkbox("现金").checked).toBe(true); expect(checkbox("刷卡").checked).toBe(false);
    await toggle("小费"); expect(checkbox("大费").checked).toBe(true); expect(checkbox("小费").checked).toBe(false);
    await toggle("小费"); await toggle("大费"); expect(checkbox("小费").checked).toBe(true); expect(checkbox("大费").checked).toBe(false);
    await render(true); expect([...container.querySelectorAll("fieldset")].every(node => node.disabled)).toBe(true);
  });

  it("查询、付款、图片和短信均保留类型，切换条件清除旧预览", async () => {
    await toggle("大费"); await click("生成结算单");
    const query = request.mock.calls.find(([path]) => path.includes("/preview?"))![0];
    expect(new URL(query, "http://localhost").searchParams.get("amountType")).toBe("TIP");
    expect(new URL(query, "http://localhost").searchParams.get("paymentScope")).toBe("NON_CASH");
    await click("生成图片"); expect(vi.mocked(generateEmployeeSettlementImage).mock.calls.at(-1)![0]).toMatchObject({ amountType: "TIP", paymentScope: "NON_CASH" });
    await click("短信发送长图");
    expect(request.mock.calls.find(([path, options]) => path.endsWith("/deliveries") && options?.method === "POST")?.[1]?.body).toMatchObject({ amountType: "TIP", paymentScope: "NON_CASH" });
    await click("已付款");
    expect(request.mock.calls.find(([path]) => path.endsWith("/confirm"))?.[1]?.body).toMatchObject({ amountType: "TIP", paymentScope: "NON_CASH", revision: "a".repeat(64) });
    await toggle("现金"); expect(container.querySelector('[aria-label="结算单汇总"]')).toBeNull();
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
