ALTER TABLE stores
  ADD COLUMN weekly_dispatch_json JSONB,
  ADD COLUMN weekly_dispatch_effective_from DATE;

ALTER TABLE daily_boards
  ADD COLUMN weekly_dispatch_applied_at TIMESTAMPTZ(3);
