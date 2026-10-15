ALTER TABLE "gift_card_sales"
  ADD COLUMN "is_online" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_records"
  ADD COLUMN "gift_card_is_online" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "work_records_online_gift_card_identifier" CHECK (
    NOT "gift_card_is_online" OR ("gift_card_serial_number" IS NOT NULL AND length(btrim("gift_card_serial_number")) > 0)
  );
ALTER TABLE "payment_breakdowns"
  ADD COLUMN "gift_card_is_online" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "payment_breakdowns_online_gift_card_identifier" CHECK (
    NOT "gift_card_is_online" OR ("gift_card_serial_number" IS NOT NULL AND length(btrim("gift_card_serial_number")) > 0)
  );

-- Online usernames may buy repeatedly and are independent of physical serials.
DROP INDEX "gift_card_sales_active_serial_unique";
CREATE UNIQUE INDEX "gift_card_sales_active_serial_unique"
  ON "gift_card_sales" ("store_id", "serial_number_normalized")
  WHERE "deleted_at" IS NULL AND NOT "is_online";
