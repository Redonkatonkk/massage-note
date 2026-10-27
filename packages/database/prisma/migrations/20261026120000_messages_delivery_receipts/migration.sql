ALTER TABLE "employee_closing_deliveries"
  ADD COLUMN "delivery_status" TEXT,
  ADD COLUMN "delivery_message_guid" TEXT,
  ADD COLUMN "delivery_error_code" INTEGER,
  ADD COLUMN "delivery_service" TEXT,
  ADD COLUMN "delivery_checked_at" TIMESTAMPTZ(3);

ALTER TABLE "employee_settlement_deliveries"
  ADD COLUMN "delivery_status" TEXT,
  ADD COLUMN "delivery_message_guid" TEXT,
  ADD COLUMN "delivery_error_code" INTEGER,
  ADD COLUMN "delivery_service" TEXT,
  ADD COLUMN "delivery_checked_at" TIMESTAMPTZ(3);
