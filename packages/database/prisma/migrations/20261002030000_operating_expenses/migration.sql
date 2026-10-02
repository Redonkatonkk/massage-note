CREATE TABLE "expense_items" (
  "id" UUID NOT NULL, "store_id" UUID NOT NULL, "name" VARCHAR(100) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '', "kind" VARCHAR(16) NOT NULL,
  "occurred_on" DATE, "amount_cents" BIGINT, "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(3), "deleted_by" UUID, "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "expense_items_kind_check" CHECK (("kind" = 'ONCE' AND "occurred_on" IS NOT NULL AND "amount_cents" >= 0) OR ("kind" = 'RECURRING' AND "occurred_on" IS NULL AND "amount_cents" IS NULL))
);
CREATE INDEX "expense_items_store_id_deleted_at_idx" ON "expense_items"("store_id", "deleted_at");
CREATE TABLE "expense_rule_revisions" (
  "id" UUID NOT NULL, "item_id" UUID NOT NULL, "start_date" DATE NOT NULL,
  "end_exclusive" DATE, "unit" VARCHAR(8) NOT NULL, "interval" INTEGER NOT NULL,
  "amount_mode" VARCHAR(8) NOT NULL, "amount_cents" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_rule_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_rule_revisions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "expense_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "expense_rule_revisions_values_check" CHECK ("unit" IN ('DAY','MONTH') AND "interval" BETWEEN 1 AND 1200 AND "amount_mode" IN ('FIXED','BUDGET') AND "amount_cents" >= 0 AND ("end_exclusive" IS NULL OR "end_exclusive" >= "start_date") AND ("unit" <> 'MONTH' OR EXTRACT(DAY FROM "start_date") = 1))
);
CREATE UNIQUE INDEX "expense_rule_revisions_item_id_start_date_key" ON "expense_rule_revisions"("item_id", "start_date");
CREATE TABLE "expense_period_overrides" (
  "id" UUID NOT NULL, "rule_id" UUID NOT NULL, "period_start" DATE NOT NULL,
  "amount_cents" BIGINT NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "expense_period_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_period_overrides_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "expense_rule_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "expense_period_overrides_amount_check" CHECK ("amount_cents" >= 0)
);
CREATE UNIQUE INDEX "expense_period_overrides_rule_id_period_start_key" ON "expense_period_overrides"("rule_id", "period_start");
-- Expense writes insert audit_logs in the same transaction; audit_log_domain_event
-- enqueues their realtime events. Operating expenses do not lock daily closings.
