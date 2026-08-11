ALTER TABLE "work_record_discount_snapshots"
  DROP CONSTRAINT "work_record_discount_snapshots_valid_values";

ALTER TABLE "work_record_discount_snapshots"
  ADD CONSTRAINT "work_record_discount_snapshots_valid_values"
  CHECK (
    "amount_cents" >= 0
    AND (
      (
        "is_automatic"
        AND NOT "is_custom"
        AND "source_discount_item_id" IS NULL
      )
      OR (
        NOT "is_automatic"
        AND (
          ("is_custom" AND "source_discount_item_id" IS NULL)
          OR (NOT "is_custom" AND "source_discount_item_id" IS NOT NULL)
        )
      )
    )
  );
