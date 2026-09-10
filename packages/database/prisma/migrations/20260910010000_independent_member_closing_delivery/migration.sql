ALTER TABLE "employee_closing_deliveries" ADD COLUMN "business_date" DATE;
UPDATE "employee_closing_deliveries" d SET "business_date" = c."business_date" FROM "business_day_closings" c WHERE d."closing_id" = c."id";
ALTER TABLE "employee_closing_deliveries" ALTER COLUMN "business_date" SET NOT NULL, ALTER COLUMN "closing_id" DROP NOT NULL;
CREATE INDEX "employee_closing_deliveries_store_id_business_date_created_at_idx" ON "employee_closing_deliveries"("store_id", "business_date", "created_at");
CREATE UNIQUE INDEX "employee_closing_deliveries_member_request_key" ON "employee_closing_deliveries"("store_id", "business_date", "membership_id", "kind", "request_key") WHERE "closing_id" IS NULL;
