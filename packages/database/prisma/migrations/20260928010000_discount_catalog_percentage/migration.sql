ALTER TABLE "discount_items"
  ADD COLUMN "rate_bps" INTEGER;

ALTER TABLE "discount_items"
  ADD CONSTRAINT "discount_items_rate_bps_range"
  CHECK ("rate_bps" IS NULL OR "rate_bps" BETWEEN 0 AND 10000);
