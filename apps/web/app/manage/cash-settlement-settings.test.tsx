// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { StoreDetails } from "../../lib/types";
import { translateText } from "../../lib/i18n";
import { cashSettlementDraft, cashSettlementPayload } from "./cash-settlement-settings";
import { StorePanel } from "./manage-page-client";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
vi.mock("../decision-dialog", () => ({ useDecision: () => ({}) }));
const store: StoreDetails = { id: "store", storeCode: "123456", name: "Test store", timezone: "America/New_York", businessCutoffLocal: "22:00", status: "ACTIVE", version: 3,
  globalCommissionBps: 6000, mondayThursdayAutoDiscountEnabled: false, mondayThursdayAutoDiscountThresholdCents: 0, mondayThursdayAutoDiscountAmountCents: 0,
  giftCardAutoDiscountEnabled: false, giftCardAutoDiscountThresholdCents: 0, giftCardAutoDiscountBps: 0, closingDefaultLocale: "zh_CN", automaticDispatchEnabled: false,
  ownerMembershipId: "owner", ownerMembership: { id: "owner", displayName: "Owner", userId: "owner" },
  cashSettlementEnabled: false, cashSettlementCycle: "WEEKLY", cashResetWeekday: 1, cashResetMonthDay: 1, cashResetAmountCents: 0 };
let root: Root, container: HTMLDivElement;
const reload = vi.fn(async () => {});
const request = vi.mocked(apiRequest);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockReset().mockResolvedValue(null); reload.mockClear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function mount(role: "OWNER" | "EMPLOYEE" = "OWNER", busy = false, details = store) {
  await act(async () => root.render(<StorePanel store={details} membership={{ id: "owner", role, displayName: "Owner", isServiceProvider: false, store: details }} members={[]} busy={busy} run={async action => action()} reload={reload} />));
}
const group = () => container.querySelector('[aria-label="店内现金结算"]')!;
async function select(index: number, value: string) {
  await act(async () => { const field = group().querySelectorAll("select")[index]!; field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function enable() { await act(async () => group().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); }
it("defaults off, retains both reset days across cycle changes, and saves with the store version", async () => {
  await mount();
  expect(group().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  expect(group().querySelector("select")!.disabled).toBe(true);
  await enable();
  await select(1, "3");
  await select(0, "MONTHLY");
  expect(group().querySelectorAll("select")[1]!.options).toHaveLength(31);
  await select(1, "31");
  await select(0, "WEEKLY");
  expect(group().querySelectorAll("select")[1]!.value).toBe("3");
  await act(async () => {
    const amount = group().querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(amount, "200.01");
    amount.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(request).toHaveBeenCalledWith("/stores/store", expect.objectContaining({ method: "PATCH", idempotent: true, body: expect.objectContaining({ version: 3,
    cashSettlementEnabled: true, cashSettlementCycle: "WEEKLY", cashResetWeekday: 3, cashResetMonthDay: 31, cashResetAmountCents: 20001 }) }));
  expect(reload).toHaveBeenCalledOnce();
});
it("keeps settings read-only for employees and while saving", async () => {
  await mount("EMPLOYEE", false, { ...store, cashSettlementEnabled: true });
  expect([...group().querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].every(field => field.disabled)).toBe(true);
  expect(container.querySelector('button[type="submit"]')).toBeNull();
  await mount("OWNER", true);
  expect([...group().querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].every(field => field.disabled)).toBe(true);
});
it("accepts zero and rejects negative, fractional-cent and unsafe reset amounts", () => {
  const draft = { enabled: true, cycle: "WEEKLY" as const, weekday: 1, monthDay: 1, amount: "0" };
  expect(cashSettlementPayload(draft).cashResetAmountCents).toBe(0);
  expect(cashSettlementDraft({ ...store, cashResetAmountCents: Number.MAX_SAFE_INTEGER }).amount).toBe("90071992547409.91");
  expect(cashSettlementPayload({ ...draft, amount: "90071992547409.90" }).cashResetAmountCents).toBe(9007199254740990);
  for (const amount of ["", "-1", "1.001", "90071992547410"]) expect(() => cashSettlementPayload({ ...draft, amount })).toThrow();
});

it("translates reset settings, weekdays and missing-history guidance", () => {
  for (const text of ["店内现金结算", "按周结", "按月结", "每周重置日", "每月重置日", "重置为多少（美元）", "周一", "周日", "历史数据不足，请补充日结："]) {
    expect(translateText(text, "en-US")).not.toMatch(/[\p{Script=Han}]/u);
  }
});
