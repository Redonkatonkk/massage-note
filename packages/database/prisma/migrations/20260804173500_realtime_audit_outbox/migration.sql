CREATE OR REPLACE FUNCTION enqueue_audit_domain_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS audit_log_domain_event ON audit_logs;
CREATE TRIGGER audit_log_domain_event
AFTER INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION enqueue_audit_domain_event();
