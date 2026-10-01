import type { PayrollSettlementEntry } from "@massage-note/contracts";
import type { EmployeeSettlementPreview, PayrollSettlement } from "./types";

export function payrollEntryFromPreview(preview: EmployeeSettlementPreview): PayrollSettlementEntry {
  return {
    membershipId: preview.employee.membershipId,
    periodStart: preview.dateFrom,
    periodEnd: preview.dateTo,
    totalPaidCents: preview.summary.totalIncomeCents,
    paymentScope: preview.paymentScope,
  };
}

export function hasMatchingPayrollEntry(settlements: PayrollSettlement[], entry: PayrollSettlementEntry): boolean {
  return settlements.some((item) => !item.deletedAt
    && item.membershipId === entry.membershipId
    && item.periodStart.slice(0, 10) === entry.periodStart
    && item.periodEnd.slice(0, 10) === entry.periodEnd
    && item.totalPaidCents === entry.totalPaidCents
    && item.paymentScope === entry.paymentScope);
}

export function payrollAmountCents(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) throw new Error("金额格式不正确");
  const [dollars, fraction = ""] = value.trim().split(".");
  const amount = BigInt(dollars!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("金额超出系统允许范围");
  return Number(amount);
}
