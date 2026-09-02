ALTER TABLE "employee_settlement_deliveries"
  ALTER COLUMN "membership_id" DROP NOT NULL,
  ADD COLUMN "document_type" TEXT NOT NULL DEFAULT 'RANGE_SETTLEMENT';

ALTER TABLE "employee_settlement_deliveries"
  ADD CONSTRAINT "employee_settlement_deliveries_document_type_check"
  CHECK ("document_type" IN ('RANGE_SETTLEMENT', 'EMPLOYEE_SUMMARY'));
