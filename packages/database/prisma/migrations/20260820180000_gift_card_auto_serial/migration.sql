ALTER TABLE "stores"
  ADD COLUMN "gift_card_next_serial_number" INTEGER NOT NULL DEFAULT 1001,
  ADD COLUMN "gift_card_auto_discount_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gift_card_auto_discount_threshold_cents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "gift_card_auto_discount_bps" INTEGER NOT NULL DEFAULT 0;

UPDATE "stores" AS store
SET "gift_card_next_serial_number" = GREATEST(
  1001,
  COALESCE(
    (
      SELECT MAX(sale."serial_number_normalized"::INTEGER) + 1
      FROM "gift_card_sales" AS sale
      WHERE sale."store_id" = store."id"
        AND sale."serial_number_normalized" ~ '^[0-9]{1,9}$'
    ),
    1001
  )
);

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_gift_card_next_serial_number_valid"
  CHECK ("gift_card_next_serial_number" >= 1001),
  ADD CONSTRAINT "stores_gift_card_auto_discount_valid"
  CHECK (
    ("gift_card_auto_discount_enabled" = false AND
      "gift_card_auto_discount_threshold_cents" = 0 AND
      "gift_card_auto_discount_bps" = 0) OR
    ("gift_card_auto_discount_enabled" = true AND
      "gift_card_auto_discount_threshold_cents" > 0 AND
      "gift_card_auto_discount_bps" > 0 AND
      "gift_card_auto_discount_bps" < 10000)
  );

ALTER TABLE "gift_card_sales"
  ADD COLUMN "face_value_cents" BIGINT,
  ADD COLUMN "discount_threshold_cents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "discount_rate_bps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_cents" BIGINT NOT NULL DEFAULT 0;

UPDATE "gift_card_sales"
SET "face_value_cents" = "amount_cents";

ALTER TABLE "gift_card_sales"
  ALTER COLUMN "face_value_cents" SET NOT NULL,
  DROP CONSTRAINT "gift_card_sales_valid_amounts",
  ADD CONSTRAINT "gift_card_sales_valid_amounts" CHECK (
    "face_value_cents" > 0 AND
    "discount_threshold_cents" >= 0 AND
    "discount_rate_bps" >= 0 AND "discount_rate_bps" < 10000 AND
    "discount_cents" >= 0 AND "discount_cents" < "face_value_cents" AND
    "cash_cents" >= 0 AND "card_cents" >= 0 AND "amount_cents" > 0 AND
    "amount_cents" = "cash_cents" + "card_cents" AND
    "amount_cents" = "face_value_cents" - "discount_cents"
  );
