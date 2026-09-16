ALTER TABLE "work_record_discount_snapshots" ADD COLUMN "rate_bps" INTEGER;
ALTER TABLE "work_record_discount_snapshots" ADD CONSTRAINT "work_record_discount_rate_range" CHECK ("rate_bps" IS NULL OR "rate_bps" BETWEEN 0 AND 10000);
