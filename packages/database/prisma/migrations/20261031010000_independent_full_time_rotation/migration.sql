ALTER TABLE "daily_boards"
  ADD COLUMN "full_time_order" JSONB,
  ADD COLUMN "full_time_order_override" JSONB,
  ADD COLUMN "ranking_pending" BOOLEAN NOT NULL DEFAULT false;
