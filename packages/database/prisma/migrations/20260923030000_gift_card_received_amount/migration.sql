ALTER TABLE "gift_card_sales"
  DROP CONSTRAINT "gift_card_sales_valid_amounts",
  ADD CONSTRAINT "gift_card_sales_valid_amounts" CHECK (
    "face_value_cents" > 0 AND
    "discount_threshold_cents" >= 0 AND
    "discount_rate_bps" >= 0 AND "discount_rate_bps" < 10000 AND
    "discount_cents" >= 0 AND "discount_cents" < "face_value_cents" AND
    "cash_cents" >= 0 AND "card_cents" >= 0 AND "amount_cents" > 0 AND
    "amount_cents" = "cash_cents" + "card_cents"
  );
