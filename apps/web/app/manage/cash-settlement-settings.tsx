import { cashSettlementSettingsSchema } from "@massage-note/contracts";
import type { StoreDetails } from "../../lib/types";

export interface CashSettlementDraft {
  enabled: boolean;
  cycle: "WEEKLY" | "MONTHLY";
  weekday: number;
  monthDay: number;
  amount: string;
}

export function cashSettlementDraft(store: Partial<StoreDetails>): CashSettlementDraft {
  const cents = BigInt(store.cashResetAmountCents ?? 0);
  const amount = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return { enabled: store.cashSettlementEnabled ?? false, cycle: store.cashSettlementCycle ?? "WEEKLY",
    weekday: store.cashResetWeekday ?? 1, monthDay: store.cashResetMonthDay ?? 1,
    amount };
}

export function cashSettlementPayload(draft: CashSettlementDraft) {
  if (!/^\d+(?:\.\d{0,2})?$/.test(draft.amount.trim())) throw new Error("现金重置金额格式不正确");
  const [dollars = "0", fraction = ""] = draft.amount.trim().split(".");
  const amountCents = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cashSettlementSettingsSchema.parse({ cashSettlementEnabled: draft.enabled, cashSettlementCycle: draft.cycle,
    cashResetWeekday: draft.weekday, cashResetMonthDay: draft.monthDay, cashResetAmountCents: Number(amountCents) });
}

export function CashSettlementSettings({ value, onChange, disabled }: {
  value: CashSettlementDraft; onChange: (draft: CashSettlementDraft) => void; disabled: boolean;
}) {
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const update = (patch: Partial<CashSettlementDraft>) => onChange({ ...value, ...patch });
  return <section className={`auto-discount-settings${value.enabled ? " enabled" : ""}`} role="group" aria-label="店内现金结算">
    <div className="auto-discount-heading"><div><strong>店内现金结算</strong><p>按重置日和起始金额，计算日结后钱匣应有的现金。</p></div>
      <label className="inline-check"><input type="checkbox" disabled={disabled} checked={value.enabled} onChange={event => update({ enabled: event.target.checked })} />开启</label></div>
    <div className="manage-form-grid auto-discount-fields">
      <label>结算周期<select disabled={disabled || !value.enabled} value={value.cycle} onChange={event => update({ cycle: event.target.value as CashSettlementDraft["cycle"] })}><option value="WEEKLY">按周结</option><option value="MONTHLY">按月结</option></select></label>
      {value.cycle === "WEEKLY"
        ? <label>每周重置日<select disabled={disabled || !value.enabled} value={value.weekday} onChange={event => update({ weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
        : <label>每月重置日<select disabled={disabled || !value.enabled} value={value.monthDay} onChange={event => update({ monthDay: Number(event.target.value) })}>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>}
      <label>重置为多少（美元）<input disabled={disabled || !value.enabled} required={value.enabled} inputMode="decimal" value={value.amount} onChange={event => update({ amount: event.target.value })} /></label>
    </div>
    <p className="field-help">重置日营业开始时设为指定金额，再累计当天及之后的现金净变化；短月使用最后一天。修改设置也会重新计算历史余额，原日结快照保留。</p>
  </section>;
}
