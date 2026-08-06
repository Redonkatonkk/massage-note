-- Prisma schema 无法表达的 PostgreSQL 约束。
-- 生成第一版迁移时将本文件内容追加到 migration.sql，并在集成测试中验证。

CREATE UNIQUE INDEX store_memberships_one_active_owner
  ON store_memberships (store_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE' AND deleted_at IS NULL;

CREATE UNIQUE INDEX store_memberships_active_display_name
  ON store_memberships (store_id, display_name_normalized)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE UNIQUE INDEX store_join_requests_one_pending_per_user
  ON store_join_requests (store_id, user_id)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX shifts_one_open_shift_per_member
  ON shifts (store_id, membership_id)
  WHERE clock_out_at IS NULL;

CREATE UNIQUE INDEX business_day_closings_one_active_cycle
  ON business_day_closings (store_id, business_date)
  WHERE status = 'CLOSED';

ALTER TABLE stores
  ADD CONSTRAINT stores_code_six_digits
  CHECK (store_code ~ '^[0-9]{6}$');

ALTER TABLE stores
  ADD CONSTRAINT stores_commission_range
  CHECK (global_commission_bps BETWEEN 0 AND 10000);

ALTER TABLE stores
  ADD CONSTRAINT stores_business_cutoff_format
  CHECK (business_cutoff_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE store_memberships
  ADD CONSTRAINT memberships_commission_range
  CHECK (default_commission_bps IS NULL OR default_commission_bps BETWEEN 0 AND 10000);

ALTER TABLE service_items
  ADD CONSTRAINT service_items_valid_values
  CHECK (
    duration_minutes BETWEEN 1 AND 720 AND price_cents >= 0 AND
    (default_commission_bps IS NULL OR default_commission_bps BETWEEN 0 AND 10000)
  );

ALTER TABLE addon_items
  ADD CONSTRAINT addon_items_valid_values
  CHECK (
    amount_cents >= 0 AND
    (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 720) AND
    (default_commission_bps IS NULL OR default_commission_bps BETWEEN 0 AND 10000)
  );

ALTER TABLE discount_items
  ADD CONSTRAINT discount_items_non_negative_amount
  CHECK (amount_cents >= 0);

ALTER TABLE employee_default_commissions
  ADD CONSTRAINT employee_default_commissions_valid_values
  CHECK (
    commission_bps BETWEEN 0 AND 10000 AND
    (effective_to IS NULL OR effective_to > effective_from)
  );

ALTER TABLE employee_item_commissions
  ADD CONSTRAINT employee_item_commissions_valid_values
  CHECK (
    commission_bps BETWEEN 0 AND 10000 AND
    (effective_to IS NULL OR effective_to > effective_from)
  );

ALTER TABLE shifts
  ADD CONSTRAINT shifts_end_not_before_start
  CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at);

ALTER TABLE work_records
  ADD CONSTRAINT work_records_end_not_before_start
  CHECK (end_at IS NULL OR end_at >= start_at);

ALTER TABLE work_records
  ADD CONSTRAINT work_records_non_negative_money
  CHECK (
    main_service_amount_cents >= 0 AND addon_total_cents >= 0 AND
    gross_fee_base_cents >= 0 AND discount_total_cents >= 0 AND
    discounted_fee_performance_cents >= 0 AND main_service_wage_cents >= 0 AND
    addon_wage_cents >= 0 AND total_large_fee_wage_cents >= 0 AND
    (cash_service_cents IS NULL OR cash_service_cents >= 0) AND
    (card_service_cents IS NULL OR card_service_cents >= 0) AND
    (cash_tip_cents IS NULL OR cash_tip_cents >= 0) AND
    (card_tip_cents IS NULL OR card_tip_cents >= 0) AND
    (total_tip_cents IS NULL OR total_tip_cents >= 0) AND
    (actual_service_collected_cents IS NULL OR actual_service_collected_cents >= 0) AND
    (customer_total_paid_cents IS NULL OR customer_total_paid_cents >= 0) AND
    (employee_total_income_cents IS NULL OR employee_total_income_cents >= 0) AND
    (cash_allocated_service_wage_cents IS NULL OR cash_allocated_service_wage_cents >= 0) AND
    (cash_acquired_service_wage_cents IS NULL OR cash_acquired_service_wage_cents >= 0) AND
    (cash_wage_shortfall_cents IS NULL OR cash_wage_shortfall_cents >= 0) AND
    (cash_acquired_service_wage_cents IS NULL OR cash_allocated_service_wage_cents IS NULL OR
      cash_acquired_service_wage_cents <= cash_allocated_service_wage_cents) AND
    (cash_wage_shortfall_cents IS NULL OR cash_allocated_service_wage_cents IS NULL OR
      cash_acquired_service_wage_cents IS NULL OR
      cash_wage_shortfall_cents =
        cash_allocated_service_wage_cents - cash_acquired_service_wage_cents)
  );

ALTER TABLE work_records
  ADD CONSTRAINT work_records_calculated_totals
  CHECK (
    gross_fee_base_cents = main_service_amount_cents + addon_total_cents AND
    discounted_fee_performance_cents = gross_fee_base_cents - discount_total_cents AND
    total_large_fee_wage_cents = main_service_wage_cents + addon_wage_cents AND
    (total_tip_cents IS NULL OR total_tip_cents = cash_tip_cents + card_tip_cents) AND
    (actual_service_collected_cents IS NULL OR
      actual_service_collected_cents = cash_service_cents + card_service_cents) AND
    (customer_total_paid_cents IS NULL OR
      customer_total_paid_cents = actual_service_collected_cents + total_tip_cents) AND
    (employee_total_income_cents IS NULL OR
      employee_total_income_cents = total_large_fee_wage_cents + total_tip_cents)
  );

ALTER TABLE work_records
  ADD CONSTRAINT work_records_confirmed_finance_complete
  CHECK (
    status <> 'CONFIRMED' OR (
      cash_service_cents IS NOT NULL AND card_service_cents IS NOT NULL AND
      cash_tip_cents IS NOT NULL AND card_tip_cents IS NOT NULL AND
      total_tip_cents IS NOT NULL AND actual_service_collected_cents IS NOT NULL AND
      customer_total_paid_cents IS NOT NULL AND employee_total_income_cents IS NOT NULL AND
      cash_allocated_service_wage_cents IS NOT NULL AND
      cash_acquired_service_wage_cents IS NOT NULL AND cash_wage_shortfall_cents IS NOT NULL
    )
  );

ALTER TABLE work_record_service_snapshots
  ADD CONSTRAINT work_record_service_snapshots_valid_values
  CHECK (
    amount_cents >= 0 AND duration_minutes BETWEEN 1 AND 720 AND
    commission_bps BETWEEN 0 AND 10000 AND wage_cents >= 0 AND
    ((is_custom AND source_service_item_id IS NULL) OR
      (NOT is_custom AND source_service_item_id IS NOT NULL))
  );

ALTER TABLE work_record_addon_snapshots
  ADD CONSTRAINT work_record_addon_snapshots_valid_values
  CHECK (
    amount_cents >= 0 AND
    (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 720) AND
    commission_bps BETWEEN 0 AND 10000 AND wage_cents >= 0 AND
    ((is_custom AND source_addon_item_id IS NULL) OR
      (NOT is_custom AND source_addon_item_id IS NOT NULL))
  );

ALTER TABLE work_record_discount_snapshots
  ADD CONSTRAINT work_record_discount_snapshots_valid_values
  CHECK (
    amount_cents >= 0 AND
    ((is_custom AND source_discount_item_id IS NULL) OR
      (NOT is_custom AND source_discount_item_id IS NOT NULL))
  );

ALTER TABLE payment_breakdowns
  ADD CONSTRAINT payment_breakdowns_confirmed_complete
  CHECK (
    confirmed_at IS NULL OR (
      cash_service_cents IS NOT NULL AND card_service_cents IS NOT NULL AND
      cash_tip_cents IS NOT NULL AND card_tip_cents IS NOT NULL
    )
  );

ALTER TABLE payment_breakdowns
  ADD CONSTRAINT payment_breakdowns_non_negative_money
  CHECK (
    (cash_service_cents IS NULL OR cash_service_cents >= 0) AND
    (card_service_cents IS NULL OR card_service_cents >= 0) AND
    (cash_tip_cents IS NULL OR cash_tip_cents >= 0) AND
    (card_tip_cents IS NULL OR card_tip_cents >= 0)
  );

ALTER TABLE daily_cash_settlements
  ADD CONSTRAINT daily_cash_settlements_valid_totals
  CHECK (
    cash_service_cents >= 0 AND cash_tip_cents >= 0 AND cash_received_cents >= 0 AND
    cash_allocated_service_wage_cents >= 0 AND
    cash_acquired_service_wage_cents >= 0 AND cash_wage_shortfall_cents >= 0 AND
    cash_retained_cents >= 0 AND cash_to_submit_to_store_cents >= 0 AND
    cash_received_cents = cash_service_cents + cash_tip_cents AND
    cash_retained_cents = cash_acquired_service_wage_cents + cash_tip_cents AND
    cash_to_submit_to_store_cents = cash_service_cents - cash_acquired_service_wage_cents
    AND cash_wage_shortfall_cents =
      cash_allocated_service_wage_cents - cash_acquired_service_wage_cents
  );

ALTER TABLE payroll_settlements
  ADD CONSTRAINT payroll_settlements_valid_values
  CHECK (
    period_end >= period_start AND service_wage_cents >= 0 AND
    cash_tip_cents >= 0 AND card_tip_cents >= 0 AND
    total_paid_cents = service_wage_cents + cash_tip_cents + card_tip_cents + adjustment_cents
  );
