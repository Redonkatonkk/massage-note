ALTER TABLE stores
  ADD COLUMN cash_settlement_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN cash_settlement_cycle VARCHAR(7) NOT NULL DEFAULT 'WEEKLY',
  ADD COLUMN cash_reset_weekday INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN cash_reset_month_day INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN cash_reset_amount_cents BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT stores_cash_settlement_cycle_check CHECK (cash_settlement_cycle IN ('WEEKLY', 'MONTHLY')),
  ADD CONSTRAINT stores_cash_reset_weekday_check CHECK (cash_reset_weekday BETWEEN 1 AND 7),
  ADD CONSTRAINT stores_cash_reset_month_day_check CHECK (cash_reset_month_day BETWEEN 1 AND 31),
  ADD CONSTRAINT stores_cash_reset_amount_check CHECK (cash_reset_amount_cents BETWEEN 0 AND 9007199254740991);
