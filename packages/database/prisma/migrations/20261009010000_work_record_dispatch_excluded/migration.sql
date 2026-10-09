ALTER TABLE "work_records"
  ADD COLUMN "is_dispatch_excluded" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "work_records"
  ADD CONSTRAINT "work_records_placeholder_dispatch_excluded_check"
  CHECK ("status" <> 'PLACEHOLDER' OR NOT "is_dispatch_excluded");
