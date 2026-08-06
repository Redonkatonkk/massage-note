import { DomainError } from "./errors.js";

export type Cents = bigint;
export type BasisPoints = number;

export function cents(value: bigint | number): Cents {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new DomainError(
      "AMOUNT_MUST_BE_SAFE_INTEGER",
      "金额必须是系统允许范围内的整数美分",
    );
  }

  const normalized = BigInt(value);
  if (normalized < 0n) {
    throw new DomainError("AMOUNT_MUST_BE_NON_NEGATIVE", "金额不能为负数");
  }
  return normalized;
}

export function basisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new DomainError(
      "BPS_OUT_OF_RANGE",
      "提成比例必须是 0% 到 100% 之间的万分比整数",
    );
  }
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0n);
}

export function minCents(left: Cents, right: Cents): Cents {
  return left < right ? left : right;
}

/** 对非负有理数执行四舍五入，0.5 美分向上。 */
export function roundHalfUp(numerator: bigint, denominator: bigint): Cents {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError("roundHalfUp 只接受非负分子和正分母");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function multiplyByBps(
  amount: Cents,
  commissionBps: BasisPoints,
): Cents {
  const validatedAmount = cents(amount);
  const validatedBps = basisPoints(commissionBps);
  return roundHalfUp(validatedAmount * BigInt(validatedBps), 10_000n);
}

export function formatUsd(amount: Cents): string {
  const validated = cents(amount);
  const dollars = validated / 100n;
  const remainder = (validated % 100n).toString().padStart(2, "0");
  return `$${dollars.toString()}.${remainder}`;
}
