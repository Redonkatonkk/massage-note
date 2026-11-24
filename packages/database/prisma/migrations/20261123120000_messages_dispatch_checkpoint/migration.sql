ALTER TABLE "employee_closing_deliveries"
  ADD COLUMN "dispatch_started_at" TIMESTAMPTZ(3);

ALTER TABLE "employee_settlement_deliveries"
  ADD COLUMN "dispatch_started_at" TIMESTAMPTZ(3),
  ADD COLUMN "send_round" INTEGER NOT NULL DEFAULT 0;

-- An earlier agent may have queued a retry after a false failure on the Mac.
UPDATE "employee_closing_deliveries"
SET "status" = 'FAILED', "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'QUEUED' AND "last_error_code" = 'MESSAGES_DELIVERY_FAILED';

UPDATE "employee_settlement_deliveries"
SET "status" = 'FAILED', "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'QUEUED' AND "last_error_code" = 'MESSAGES_DELIVERY_FAILED';
