ALTER TABLE "work_records"
  ADD COLUMN "is_highlighted" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "work_records_store_id_is_highlighted_business_date_idx"
  ON "work_records"("store_id", "is_highlighted", "business_date");
