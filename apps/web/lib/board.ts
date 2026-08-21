import { formatWholeDollarAmount } from "./money";

export function deduplicateMembershipRows<T extends { membershipId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.membershipId)) return false;
    seen.add(row.membershipId);
    return true;
  });
}

export function canShowEmployeeClockIn(input: {
  role: "OWNER" | "MANAGER" | "EMPLOYEE";
  isServiceProvider: boolean;
  isCurrentBusinessDay: boolean;
  isClosed: boolean;
  hasOwnRow: boolean;
}): boolean {
  return input.role === "EMPLOYEE" &&
    input.isServiceProvider &&
    input.isCurrentBusinessDay &&
    !input.isClosed &&
    !input.hasOwnRow;
}

export function canViewEmployeeTotals(input: {
  role: "OWNER" | "MANAGER" | "EMPLOYEE";
  viewerMembershipId: string;
  rowMembershipId: string;
}): boolean {
  return input.role !== "EMPLOYEE" || input.viewerMembershipId === input.rowMembershipId;
}

export function discountBadgeText(cents: number): string {
  return `off${formatWholeDollarAmount(cents)}`;
}

export type RecordPaymentDisplay =
  | { kind: "PENDING"; parts: [] }
  | { kind: "ZERO"; parts: [] }
  | {
      kind: "PAID";
      parts: Array<{
        method: "CARD" | "CASH" | "GIFT_CARD";
        cents: number;
      }>;
    };

export function recordPaymentDisplay(input: {
  status: "PENDING_PAYMENT" | "CONFIRMED";
  cashCents: number | null;
  cardCents: number | null;
  giftCardCents: number | null;
}): RecordPaymentDisplay {
  if (input.status === "PENDING_PAYMENT") return { kind: "PENDING", parts: [] };

  const parts = [
    { method: "CARD" as const, cents: input.cardCents ?? 0 },
    { method: "CASH" as const, cents: input.cashCents ?? 0 },
    { method: "GIFT_CARD" as const, cents: input.giftCardCents ?? 0 },
  ].filter((part) => part.cents > 0);

  return parts.length > 0
    ? { kind: "PAID", parts }
    : { kind: "ZERO", parts: [] };
}

export function compactPaymentAmount(cents: number): string {
  return formatWholeDollarAmount(cents);
}
