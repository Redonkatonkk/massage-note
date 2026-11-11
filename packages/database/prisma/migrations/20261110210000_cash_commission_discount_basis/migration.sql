-- Restore store-funded discounts to the cash service basis for existing orders.
-- Payment receipts, total wages and historical payment/closing/share snapshots stay intact.
WITH recalculated AS (
  SELECT id,
    ROUND(
      total_large_fee_wage_cents::numeric * (cash_service_cents::numeric + discount_total_cents)
      / (cash_service_cents::numeric + card_service_cents + gift_card_service_cents + discount_total_cents)
    )::bigint AS allocated
  FROM work_records
  WHERE status = 'CONFIRMED' AND cash_service_cents > 0 AND discount_total_cents > 0
)
UPDATE work_records AS record
SET cash_allocated_service_wage_cents = recalculated.allocated,
    cash_acquired_service_wage_cents = LEAST(record.cash_service_cents, recalculated.allocated),
    cash_wage_shortfall_cents = recalculated.allocated - LEAST(record.cash_service_cents, recalculated.allocated),
    version = record.version + 1,
    updated_at = CURRENT_TIMESTAMP
FROM recalculated
WHERE record.id = recalculated.id
  AND (record.cash_allocated_service_wage_cents, record.cash_acquired_service_wage_cents, record.cash_wage_shortfall_cents)
    IS DISTINCT FROM (recalculated.allocated, LEAST(record.cash_service_cents, recalculated.allocated),
      recalculated.allocated - LEAST(record.cash_service_cents, recalculated.allocated));
