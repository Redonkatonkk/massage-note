ALTER TABLE "payroll_settlements" ADD COLUMN "amount_type" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_amount_type_check" CHECK ("amount_type" IN ('ALL', 'SERVICE', 'TIP'));
ALTER TABLE "employee_settlement_deliveries" ADD COLUMN "amount_type" TEXT NOT NULL DEFAULT 'ALL';
UPDATE "employee_settlement_deliveries" SET "amount_type" = "snapshot_json"->>'amountType' WHERE "snapshot_json"->>'amountType' IN ('SERVICE', 'TIP');
ALTER TABLE "employee_settlement_deliveries" ADD CONSTRAINT "settlement_delivery_amount_type_check" CHECK ("amount_type" IN ('ALL', 'SERVICE', 'TIP'));
