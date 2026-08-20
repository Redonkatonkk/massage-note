ALTER TABLE "work_records"
  ADD COLUMN "gift_card_serial_number" TEXT,
  ADD COLUMN "gift_card_service_cents" BIGINT,
  ADD COLUMN "gift_card_tip_cents" BIGINT;

ALTER TABLE "payment_breakdowns"
  ADD COLUMN "gift_card_serial_number" TEXT,
  ADD COLUMN "gift_card_service_cents" BIGINT,
  ADD COLUMN "gift_card_tip_cents" BIGINT;

UPDATE "work_records"
SET "gift_card_service_cents" = 0,
    "gift_card_tip_cents" = 0
WHERE "status" = 'CONFIRMED';

UPDATE "payment_breakdowns"
SET "gift_card_service_cents" = 0,
    "gift_card_tip_cents" = 0
WHERE "confirmed_at" IS NOT NULL;

CREATE TABLE "gift_card_sales" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "serial_number" TEXT NOT NULL,
  "serial_number_normalized" TEXT NOT NULL,
  "cash_cents" BIGINT NOT NULL DEFAULT 0,
  "card_cents" BIGINT NOT NULL DEFAULT 0,
  "amount_cents" BIGINT NOT NULL,
  "operator_membership_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(3),
  "deleted_by" UUID,
  "delete_reason" TEXT,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "gift_card_sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gift_card_sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gift_card_sales_operator_membership_id_fkey" FOREIGN KEY ("operator_membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gift_card_sales_valid_amounts" CHECK (
    cash_cents >= 0 AND card_cents >= 0 AND amount_cents > 0 AND
    amount_cents = cash_cents + card_cents
  ),
  CONSTRAINT "gift_card_sales_serial_not_blank" CHECK (length(btrim(serial_number_normalized)) > 0)
);

CREATE INDEX "gift_card_sales_store_id_business_date_created_at_idx"
  ON "gift_card_sales"("store_id", "business_date", "created_at");
CREATE INDEX "gift_card_sales_store_id_serial_number_normalized_idx"
  ON "gift_card_sales"("store_id", "serial_number_normalized");
CREATE INDEX "gift_card_sales_operator_membership_id_business_date_idx"
  ON "gift_card_sales"("operator_membership_id", "business_date");
CREATE UNIQUE INDEX "gift_card_sales_active_serial_unique"
  ON "gift_card_sales"("store_id", "serial_number_normalized")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "work_records" DROP CONSTRAINT "work_records_non_negative_money";
ALTER TABLE "work_records" DROP CONSTRAINT "work_records_calculated_totals";
ALTER TABLE "work_records" DROP CONSTRAINT "work_records_confirmed_finance_complete";
ALTER TABLE "payment_breakdowns" DROP CONSTRAINT "payment_breakdowns_confirmed_complete";
ALTER TABLE "payment_breakdowns" DROP CONSTRAINT "payment_breakdowns_non_negative_money";

ALTER TABLE "work_records"
  ADD CONSTRAINT "work_records_non_negative_money"
  CHECK (
    main_service_amount_cents >= 0 AND addon_total_cents >= 0 AND
    gross_fee_base_cents >= 0 AND discount_total_cents >= 0 AND
    discounted_fee_performance_cents >= 0 AND main_service_wage_cents >= 0 AND
    addon_wage_cents >= 0 AND total_large_fee_wage_cents >= 0 AND
    (cash_service_cents IS NULL OR cash_service_cents >= 0) AND
    (card_service_cents IS NULL OR card_service_cents >= 0) AND
    (gift_card_service_cents IS NULL OR gift_card_service_cents >= 0) AND
    (cash_tip_cents IS NULL OR cash_tip_cents >= 0) AND
    (card_tip_cents IS NULL OR card_tip_cents >= 0) AND
    (gift_card_tip_cents IS NULL OR gift_card_tip_cents >= 0) AND
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
      cash_wage_shortfall_cents = cash_allocated_service_wage_cents - cash_acquired_service_wage_cents)
  );

ALTER TABLE "work_records"
  ADD CONSTRAINT "work_records_calculated_totals"
  CHECK (
    gross_fee_base_cents = main_service_amount_cents + addon_total_cents AND
    discounted_fee_performance_cents = gross_fee_base_cents - discount_total_cents AND
    total_large_fee_wage_cents = main_service_wage_cents + addon_wage_cents AND
    (total_tip_cents IS NULL OR total_tip_cents = cash_tip_cents + card_tip_cents + gift_card_tip_cents) AND
    (actual_service_collected_cents IS NULL OR
      actual_service_collected_cents = cash_service_cents + card_service_cents + gift_card_service_cents) AND
    (customer_total_paid_cents IS NULL OR
      customer_total_paid_cents = actual_service_collected_cents + total_tip_cents) AND
    (employee_total_income_cents IS NULL OR
      employee_total_income_cents = total_large_fee_wage_cents + total_tip_cents)
  );

ALTER TABLE "work_records"
  ADD CONSTRAINT "work_records_confirmed_finance_complete"
  CHECK (
    status <> 'CONFIRMED' OR (
      cash_service_cents IS NOT NULL AND card_service_cents IS NOT NULL AND
      gift_card_service_cents IS NOT NULL AND cash_tip_cents IS NOT NULL AND
      card_tip_cents IS NOT NULL AND gift_card_tip_cents IS NOT NULL AND
      total_tip_cents IS NOT NULL AND actual_service_collected_cents IS NOT NULL AND
      customer_total_paid_cents IS NOT NULL AND employee_total_income_cents IS NOT NULL AND
      cash_allocated_service_wage_cents IS NOT NULL AND
      cash_acquired_service_wage_cents IS NOT NULL AND cash_wage_shortfall_cents IS NOT NULL AND
      ((gift_card_service_cents + gift_card_tip_cents = 0 AND gift_card_serial_number IS NULL) OR
       (gift_card_service_cents + gift_card_tip_cents > 0 AND gift_card_serial_number IS NOT NULL AND length(btrim(gift_card_serial_number)) > 0))
    )
  );

ALTER TABLE "payment_breakdowns"
  ADD CONSTRAINT "payment_breakdowns_confirmed_complete"
  CHECK (
    confirmed_at IS NULL OR (
      cash_service_cents IS NOT NULL AND card_service_cents IS NOT NULL AND
      gift_card_service_cents IS NOT NULL AND cash_tip_cents IS NOT NULL AND
      card_tip_cents IS NOT NULL AND gift_card_tip_cents IS NOT NULL AND
      ((gift_card_service_cents + gift_card_tip_cents = 0 AND gift_card_serial_number IS NULL) OR
       (gift_card_service_cents + gift_card_tip_cents > 0 AND gift_card_serial_number IS NOT NULL AND length(btrim(gift_card_serial_number)) > 0))
    )
  );

ALTER TABLE "payment_breakdowns"
  ADD CONSTRAINT "payment_breakdowns_non_negative_money"
  CHECK (
    (cash_service_cents IS NULL OR cash_service_cents >= 0) AND
    (card_service_cents IS NULL OR card_service_cents >= 0) AND
    (gift_card_service_cents IS NULL OR gift_card_service_cents >= 0) AND
    (cash_tip_cents IS NULL OR cash_tip_cents >= 0) AND
    (card_tip_cents IS NULL OR card_tip_cents >= 0) AND
    (gift_card_tip_cents IS NULL OR gift_card_tip_cents >= 0)
  );
