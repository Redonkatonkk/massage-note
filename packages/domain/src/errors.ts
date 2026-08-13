export type DomainErrorCode =
  | "AMOUNT_MUST_BE_NON_NEGATIVE"
  | "AMOUNT_MUST_BE_INTEGER"
  | "AMOUNT_MUST_BE_SAFE_INTEGER"
  | "BPS_OUT_OF_RANGE"
  | "DISCOUNT_EXCEEDS_GROSS"
  | "CASH_ALLOCATED_WAGE_EXCEEDS_TOTAL"
  | "INVALID_PAYMENT_SPLIT"
  | "INVALID_TIMEZONE"
  | "INVALID_CUTOFF"
  | "END_BEFORE_START";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
