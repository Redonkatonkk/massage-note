ALTER TABLE "stores"
  ADD COLUMN "monday_thursday_auto_discount_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "monday_thursday_auto_discount_threshold_cents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "monday_thursday_auto_discount_amount_cents" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "stores_monday_thursday_auto_discount_valid"
    CHECK (
      "monday_thursday_auto_discount_threshold_cents" >= 0
      AND "monday_thursday_auto_discount_amount_cents" >= 0
      AND (
        NOT "monday_thursday_auto_discount_enabled"
        OR (
          "monday_thursday_auto_discount_threshold_cents" > 0
          AND "monday_thursday_auto_discount_amount_cents" > 0
          AND "monday_thursday_auto_discount_amount_cents" <= "monday_thursday_auto_discount_threshold_cents"
        )
      )
    );

ALTER TABLE "work_record_discount_snapshots"
  ADD COLUMN "is_automatic" BOOLEAN NOT NULL DEFAULT false;
