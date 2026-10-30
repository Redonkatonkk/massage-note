CREATE TABLE audit_row_changes (
  id BIGSERIAL PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
  transaction_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  before_json JSONB,
  after_json JSONB
);
CREATE INDEX audit_row_changes_store_id_transaction_id_id_idx ON audit_row_changes(store_id, transaction_id, id);
CREATE INDEX audit_row_changes_store_id_id_idx ON audit_row_changes(store_id, id);
CREATE TABLE audit_log_transactions (
  audit_log_id UUID PRIMARY KEY REFERENCES audit_logs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  transaction_id TEXT NOT NULL
);
CREATE INDEX audit_log_transactions_transaction_id_idx ON audit_log_transactions(transaction_id);
CREATE TABLE audit_undos (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  transaction_id TEXT NOT NULL,
  audit_log_id UUID NOT NULL,
  undo_audit_log_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  UNIQUE(store_id, transaction_id)
);

-- Capture nested writes and their actual transaction, rather than trusting the
-- partial, user-facing audit summaries. Never include credentials or sessions.
CREATE FUNCTION capture_audit_row_change() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  previous JSONB;
  following JSONB;
  image JSONB;
  target_store UUID;
  parent_id UUID;
  bigint_column TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN following := to_jsonb(NEW); END IF;
  IF previous IS NOT DISTINCT FROM following THEN RETURN NEW; END IF;
  image := COALESCE(following, previous);
  IF TG_TABLE_NAME = 'stores' THEN target_store := (image->>'id')::uuid;
  ELSIF TG_ARGV[0] = '' THEN target_store := (image->>'store_id')::uuid;
  ELSE
    parent_id := (image->>TG_ARGV[1])::uuid;
    IF TG_ARGV[0] = 'expense_rule_revisions' THEN
      SELECT i.store_id INTO target_store FROM expense_rule_revisions r JOIN expense_items i ON i.id = r.item_id WHERE r.id = parent_id;
    ELSE
      EXECUTE format('SELECT store_id FROM %I WHERE id = $1', TG_ARGV[0]) INTO target_store USING parent_id;
    END IF;
    -- A parent's BEFORE DELETE image also scopes cascading child deletions.
    IF target_store IS NULL THEN
      SELECT store_id INTO target_store FROM audit_row_changes
      WHERE transaction_id = txid_current()::text AND table_name = TG_ARGV[0] AND row_id = parent_id
      ORDER BY id DESC LIMIT 1;
    END IF;
  END IF;
  IF target_store IS NULL THEN RAISE EXCEPTION 'Cannot scope audit row change for %', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME <> 'stores' AND NOT EXISTS (SELECT 1 FROM stores WHERE id = target_store) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  -- JSON integers must remain exact when Prisma reads the private images.
  FOREACH bigint_column IN ARRAY string_to_array(TG_ARGV[3], ',') LOOP
    IF previous->bigint_column <> 'null'::jsonb THEN previous := jsonb_set(previous, ARRAY[bigint_column], to_jsonb(previous->>bigint_column)); END IF;
    IF following->bigint_column <> 'null'::jsonb THEN following := jsonb_set(following, ARRAY[bigint_column], to_jsonb(following->>bigint_column)); END IF;
  END LOOP;
  INSERT INTO audit_row_changes(store_id, transaction_id, table_name, row_id, before_json, after_json)
  VALUES(target_store, txid_current()::text, TG_TABLE_NAME, (image->>TG_ARGV[2])::uuid, previous, following);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target TEXT;
  parent_table TEXT;
  parent_column TEXT;
  primary_column TEXT;
  bigint_columns TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'stores', 'store_memberships', 'store_join_requests', 'shifts', 'daily_boards', 'daily_employee_rows',
    'service_items', 'service_item_price_options', 'addon_items', 'discount_items',
    'employee_default_commissions', 'employee_item_commissions', 'work_records',
    'work_record_service_snapshots', 'work_record_addon_snapshots', 'work_record_discount_snapshots', 'payment_breakdowns',
    'gift_card_sales', 'lost_customers', 'business_day_closings', 'daily_cash_settlements',
    'payroll_settlements', 'payroll_settlement_confirmations', 'expense_items', 'expense_rule_revisions', 'expense_period_overrides',
    'work_bot_group_bindings', 'work_bot_member_bindings', 'work_bot_aliases',
    'employee_closing_deliveries', 'employee_settlement_deliveries'
  ] LOOP
    parent_table := ''; parent_column := ''; primary_column := 'id';
    IF target IN ('work_record_service_snapshots', 'work_record_addon_snapshots', 'work_record_discount_snapshots', 'payment_breakdowns') THEN
      parent_table := 'work_records'; parent_column := 'work_record_id';
    ELSIF target = 'service_item_price_options' THEN parent_table := 'service_items'; parent_column := 'service_item_id';
    ELSIF target = 'payroll_settlement_confirmations' THEN
      parent_table := 'payroll_settlements'; parent_column := 'payroll_settlement_id'; primary_column := 'payroll_settlement_id';
    ELSIF target = 'expense_rule_revisions' THEN parent_table := 'expense_items'; parent_column := 'item_id';
    ELSIF target = 'expense_period_overrides' THEN parent_table := 'expense_rule_revisions'; parent_column := 'rule_id';
    ELSIF target = 'work_bot_member_bindings' THEN parent_table := 'work_bot_group_bindings'; parent_column := 'group_binding_id';
    END IF;
    SELECT COALESCE(string_agg(attname, ','), '') INTO bigint_columns FROM pg_attribute
    WHERE attrelid = target::regclass AND atttypid IN ('int8'::regtype, 'numeric'::regtype) AND attnum > 0 AND NOT attisdropped;
    -- AFTER INSERT avoids journaling the discarded INSERT candidate of UPSERT.
    EXECUTE format('CREATE TRIGGER audit_row_insert AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION capture_audit_row_change(%L, %L, %L, %L)', target, parent_table, parent_column, primary_column, bigint_columns);
    EXECUTE format('CREATE TRIGGER audit_row_change BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_audit_row_change(%L, %L, %L, %L)', target, parent_table, parent_column, primary_column, bigint_columns);
  END LOOP;
END;
$$;

CREATE FUNCTION capture_audit_transaction() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.source <> 'data_import_history' THEN
    INSERT INTO audit_log_transactions(audit_log_id, transaction_id) VALUES(NEW.id, txid_current()::text);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_transaction AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION capture_audit_transaction();

-- Keep the application role append-only for undo bookkeeping as well.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') THEN
    GRANT SELECT ON audit_row_changes, audit_log_transactions TO massage_note_app;
    GRANT SELECT, INSERT ON audit_undos TO massage_note_app;
    REVOKE UPDATE, DELETE ON audit_row_changes, audit_log_transactions, audit_undos FROM massage_note_app;
  END IF;
END $$;
