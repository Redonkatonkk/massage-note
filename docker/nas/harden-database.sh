#!/bin/sh
set -eu

: "${ADMIN_DATABASE_URL:?必须设置 ADMIN_DATABASE_URL}"
: "${MASSAGE_NOTE_APP_PASSWORD:?必须设置 MASSAGE_NOTE_APP_PASSWORD}"

psql "$ADMIN_DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$MASSAGE_NOTE_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE massage_note_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') \gexec
ALTER ROLE massage_note_app PASSWORD :'app_password';
GRANT CONNECT ON DATABASE massage_note TO massage_note_app;
GRANT USAGE ON SCHEMA public TO massage_note_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO massage_note_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO massage_note_app;
ALTER DEFAULT PRIVILEGES FOR ROLE massage_note_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO massage_note_app;
ALTER DEFAULT PRIVILEGES FOR ROLE massage_note_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO massage_note_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM massage_note_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ai_query_logs FROM massage_note_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE domain_outbox FROM massage_note_app;
SQL
