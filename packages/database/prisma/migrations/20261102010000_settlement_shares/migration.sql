CREATE TABLE employee_settlement_shares (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX employee_settlement_shares_store_id_idx ON employee_settlement_shares(store_id);
CREATE INDEX employee_settlement_shares_expires_at_idx ON employee_settlement_shares(expires_at);

-- Retire pending range images; summary-image deliveries remain available.
UPDATE employee_settlement_deliveries
SET status = 'CANCELLED', lease_token = NULL, lease_expires_at = NULL,
    last_error_code = 'RANGE_IMAGES_RETIRED', last_error = 'Use a payroll share link', updated_at = CURRENT_TIMESTAMP
WHERE document_type = 'RANGE_SETTLEMENT' AND status IN ('QUEUED', 'CLAIMED');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') THEN
    GRANT SELECT, INSERT, DELETE ON employee_settlement_shares TO massage_note_app;
  END IF;
END $$;
