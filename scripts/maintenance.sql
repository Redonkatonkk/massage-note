\set ON_ERROR_STOP on

BEGIN;

DELETE FROM idempotency_requests
WHERE expires_at < now() - interval '1 day';

UPDATE ai_change_previews
SET status = 'EXPIRED'
WHERE status IN ('PENDING', 'CONFIRMED')
  AND consumed_at IS NULL
  AND expires_at < now();

DELETE FROM ai_change_previews
WHERE (consumed_at IS NOT NULL AND consumed_at < now() - interval '30 days')
   OR (status IN ('EXPIRED', 'CANCELLED') AND expires_at < now() - interval '30 days');

DELETE FROM domain_outbox
WHERE created_at < now() - interval '7 days';

COMMIT;
