ALTER TABLE "store_memberships" ADD COLUMN "daily_settlement_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "daily_cash_settlements"
  ADD COLUMN "daily_settlement_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "additional_service_wage_paid_cents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "non_cash_tip_paid_cents" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "daily_full_settlement_amounts_check" CHECK (
    "additional_service_wage_paid_cents" >= 0 AND "non_cash_tip_paid_cents" >= 0
    AND ("daily_settlement_enabled" OR ("additional_service_wage_paid_cents" = 0 AND "non_cash_tip_paid_cents" = 0))
  );
