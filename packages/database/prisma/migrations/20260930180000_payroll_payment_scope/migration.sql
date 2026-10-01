-- Old payment methods describe how wages were paid, not their income source.
-- Keep historical sources unknown rather than guessing from CASH/ZELLE/etc.
ALTER TABLE payroll_settlements ADD COLUMN payment_scope TEXT;
ALTER TABLE payroll_settlements ADD CONSTRAINT payroll_settlements_payment_scope_valid
  CHECK (payment_scope IS NULL OR payment_scope IN ('CASH', 'NON_CASH', 'ALL'));
