CREATE TABLE dispatch_sms_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  send_time_local VARCHAR(5) NOT NULL CHECK (send_time_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  phone_e164 VARCHAR(16) CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  start_on_date DATE,
  CHECK (NOT enabled OR (phone_e164 IS NOT NULL AND start_on_date IS NOT NULL))
);

CREATE TABLE dispatch_sms_deliveries (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  target_date DATE NOT NULL,
  status "ClosingDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  recipient_phone_e164 VARCHAR(16) NOT NULL CHECK (recipient_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ(3),
  dispatch_started_at TIMESTAMPTZ(3),
  next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ(3),
  delivery_status TEXT,
  delivery_message_guid TEXT,
  delivery_error_code INTEGER,
  delivery_service TEXT,
  delivery_checked_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL
);

CREATE UNIQUE INDEX dispatch_sms_deliveries_store_id_target_date_key ON dispatch_sms_deliveries (store_id, target_date);
CREATE INDEX dispatch_sms_deliveries_store_id_status_next_attempt_at_idx ON dispatch_sms_deliveries (store_id, status, next_attempt_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dispatch_sms_settings, dispatch_sms_deliveries TO massage_note_app;
  END IF;
END $$;
