ALTER TABLE "expense_rule_revisions" ADD COLUMN "default_amount_from" DATE;

-- Choose once at upgrade time in each store's timezone. A crossing period keeps
-- its original actual bill (or remains unrecorded) for the entire period.
WITH anchors AS (
  SELECT r."id", date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE s."timezone")::date AS month_start
  FROM "expense_rule_revisions" r
  JOIN "expense_items" i ON i."id" = r."item_id"
  JOIN "stores" s ON s."id" = i."store_id"
)
UPDATE "expense_rule_revisions" r SET "default_amount_from" =
  CASE WHEN r."amount_mode" = 'FIXED' THEN r."start_date"
  WHEN r."unit" = 'DAY' THEN r."start_date" +
    (GREATEST(0, a.month_start - r."start_date") + r."interval" - 1) / r."interval" * r."interval"
  ELSE (r."start_date" + make_interval(months =>
    (GREATEST(0, (EXTRACT(YEAR FROM a.month_start)::int - EXTRACT(YEAR FROM r."start_date")::int) * 12
      + EXTRACT(MONTH FROM a.month_start)::int - EXTRACT(MONTH FROM r."start_date")::int)
      + r."interval" - 1) / r."interval" * r."interval"))::date
  END
FROM anchors a WHERE a."id" = r."id";

ALTER TABLE "expense_rule_revisions" ALTER COLUMN "default_amount_from" SET NOT NULL;
ALTER TABLE "expense_rule_revisions" ADD CONSTRAINT "expense_default_amount_boundary_check" CHECK (
  "default_amount_from" >= "start_date" AND
  CASE WHEN "unit" = 'DAY' THEN ("default_amount_from" - "start_date") % "interval" = 0
  ELSE EXTRACT(DAY FROM "default_amount_from") = 1 AND
    ((EXTRACT(YEAR FROM "default_amount_from")::int - EXTRACT(YEAR FROM "start_date")::int) * 12
      + EXTRACT(MONTH FROM "default_amount_from")::int - EXTRACT(MONTH FROM "start_date")::int) % "interval" = 0
  END
);
