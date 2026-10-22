ALTER TABLE audit_logs ADD COLUMN actor_snapshot_json JSONB, ADD COLUMN origin_audit_id UUID;
CREATE UNIQUE INDEX audit_logs_store_id_origin_audit_id_key ON audit_logs(store_id, origin_audit_id);

UPDATE audit_logs a SET actor_snapshot_json = jsonb_build_object('id', m.id, 'displayName', m.display_name, 'role', m.role)
FROM store_memberships m WHERE a.actor_membership_id = m.id AND a.store_id = m.store_id;

CREATE FUNCTION snapshot_audit_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.actor_snapshot_json IS NULL AND NEW.actor_membership_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', id, 'displayName', display_name, 'role', role) INTO NEW.actor_snapshot_json
    FROM store_memberships WHERE id = NEW.actor_membership_id AND store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_actor_snapshot BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION snapshot_audit_actor();

CREATE TABLE store_data_import_previews (
  id UUID PRIMARY KEY, store_id UUID NOT NULL, user_id UUID NOT NULL,
  checksum TEXT NOT NULL, target_fingerprint TEXT NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL, recovery_downloaded_at TIMESTAMPTZ(3),
  idempotency_key TEXT, result_json JSONB
);
CREATE UNIQUE INDEX store_data_import_previews_store_id_user_id_idempotency_key_key ON store_data_import_previews(store_id,user_id,idempotency_key);
CREATE INDEX store_data_import_previews_expires_at_idx ON store_data_import_previews(expires_at);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON store_data_import_previews TO massage_note_app;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enqueue_audit_domain_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source = 'data_import_history' THEN RETURN NEW; END IF;
  INSERT INTO domain_outbox (
    store_id,
    topic,
    aggregate_type,
    aggregate_id,
    payload_json
  ) VALUES (
    NEW.store_id,
    'store.changed',
    NEW.entity_type,
    NEW.entity_id,
    jsonb_build_object(
      'auditLogId', NEW.id,
      'action', NEW.action,
      'entityType', NEW.entity_type,
      'entityId', NEW.entity_id,
      'businessDate', NEW.business_date,
      'actorMembershipId', NEW.actor_membership_id,
      'createdAt', NEW.created_at
    )
  );
  PERFORM pg_notify('massage_note_domain_events', NEW.store_id::text);
  RETURN NEW;
END;
$$;
