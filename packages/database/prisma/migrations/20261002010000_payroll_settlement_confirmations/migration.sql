CREATE TABLE "payroll_settlement_confirmations" (
    "payroll_settlement_id" UUID NOT NULL,
    "unsettled_cents" BIGINT NOT NULL,
    "deduction_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_settlement_confirmations_pkey" PRIMARY KEY ("payroll_settlement_id"),
    CONSTRAINT "payroll_confirmation_amounts_check" CHECK ("unsettled_cents" >= 0 AND "deduction_cents" >= 0 AND "deduction_cents" <= "unsettled_cents"),
    CONSTRAINT "payroll_confirmation_ledger_fkey" FOREIGN KEY ("payroll_settlement_id") REFERENCES "payroll_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
