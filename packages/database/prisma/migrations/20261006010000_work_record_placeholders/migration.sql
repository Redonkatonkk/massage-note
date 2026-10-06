ALTER TYPE "WorkRecordStatus" ADD VALUE 'PLACEHOLDER';

-- Text comparison also works when this migration runs inside a transaction:
-- the newly added enum value cannot be used as an enum literal until commit.
ALTER TABLE "work_records"
  ADD CONSTRAINT "work_records_placeholder_empty"
  CHECK (
    status::text <> 'PLACEHOLDER' OR (
      end_at IS NULL AND actual_duration_minutes IS NULL AND
      main_service_amount_cents = 0 AND addon_total_cents = 0 AND
      gross_fee_base_cents = 0 AND discount_total_cents = 0 AND
      discounted_fee_performance_cents = 0 AND main_service_wage_cents = 0 AND
      addon_wage_cents = 0 AND total_large_fee_wage_cents = 0 AND
      cash_service_cents IS NULL AND card_service_cents IS NULL AND
      gift_card_serial_number IS NULL AND gift_card_service_cents IS NULL AND
      cash_tip_cents IS NULL AND card_tip_cents IS NULL AND gift_card_tip_cents IS NULL AND
      total_tip_cents IS NULL AND actual_service_collected_cents IS NULL AND
      customer_total_paid_cents IS NULL AND payment_difference_cents IS NULL AND
      employee_total_income_cents IS NULL AND cash_allocated_service_wage_cents IS NULL AND
      cash_acquired_service_wage_cents IS NULL AND cash_wage_shortfall_cents IS NULL AND
      NOT tip_settled_manual_flag AND NOT large_fee_settled_manual_flag AND
      NOT automatic_discount_suppressed AND NOT is_highlighted AND NOT manual_price_flag AND
      note = ''
    )
  );
