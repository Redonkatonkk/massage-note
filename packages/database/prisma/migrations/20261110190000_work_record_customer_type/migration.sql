CREATE TYPE "WorkRecordCustomerType" AS ENUM ('NEW', 'RETURNING');

ALTER TABLE "work_records"
  ADD COLUMN "customer_type" "WorkRecordCustomerType",
  ADD CONSTRAINT "work_records_placeholder_customer_type_empty"
    CHECK (status::text <> 'PLACEHOLDER' OR customer_type IS NULL);
