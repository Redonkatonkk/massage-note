CREATE TABLE "lost_customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "occurred_time" VARCHAR(5) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(3),
  "deleted_by" UUID,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "lost_customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lost_customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lost_customers_occurred_time_format" CHECK ("occurred_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE INDEX "lost_customers_store_id_business_date_deleted_at_occurred_time_idx"
  ON "lost_customers"("store_id", "business_date", "deleted_at", "occurred_time");

CREATE FUNCTION prevent_closed_lost_customer_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_store_id UUID;
  target_business_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_store_id := OLD.store_id;
    target_business_date := OLD.business_date;
  ELSE
    target_store_id := NEW.store_id;
    target_business_date := NEW.business_date;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(target_store_id::text || ':' || target_business_date::text, 0)
  );

  IF EXISTS (
    SELECT 1 FROM business_day_closings
    WHERE store_id = target_store_id
      AND business_date = target_business_date
      AND status = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Cannot change lost customer record for a closed business day'
      USING ERRCODE = '23514', CONSTRAINT = 'lost_customers_business_day_open';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lost_customers_open_business_day
  BEFORE INSERT OR UPDATE OR DELETE ON "lost_customers"
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_lost_customer_change();

-- All write paths insert an audit_log in the same transaction. The existing
-- audit_log_domain_event trigger creates the corresponding domain_outbox event.
