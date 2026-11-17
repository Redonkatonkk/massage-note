CREATE TABLE employee_daily_snapshot_shares (
  delivery_id UUID PRIMARY KEY REFERENCES employee_closing_deliveries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  month_to_date_json JSONB NOT NULL
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') THEN
    GRANT SELECT, INSERT, DELETE ON employee_daily_snapshot_shares TO massage_note_app;
  END IF;
END $$;
