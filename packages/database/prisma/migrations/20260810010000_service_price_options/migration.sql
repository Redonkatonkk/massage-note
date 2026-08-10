CREATE TABLE "service_item_price_options" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service_item_id" UUID NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "price_cents" BIGINT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_item_price_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_item_price_options_valid_values"
    CHECK ("duration_minutes" BETWEEN 1 AND 720 AND "price_cents" >= 0),
  CONSTRAINT "service_item_price_options_service_item_id_fkey"
    FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "service_item_price_options_service_item_id_duration_minutes_key"
  ON "service_item_price_options"("service_item_id", "duration_minutes");

CREATE INDEX "service_item_price_options_service_item_id_position_idx"
  ON "service_item_price_options"("service_item_id", "position");

INSERT INTO "service_item_price_options" (
  "service_item_id",
  "duration_minutes",
  "price_cents",
  "position",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "duration_minutes",
  "price_cents",
  0,
  "created_at",
  "updated_at"
FROM "service_items";
