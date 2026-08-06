#!/bin/sh
set -eu

if [ -z "${MASSAGE_NOTE_APP_PASSWORD:-}" ]; then
  echo "MASSAGE_NOTE_APP_PASSWORD 未设置" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$MASSAGE_NOTE_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE massage_note_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'massage_note_app') \gexec
ALTER ROLE massage_note_app PASSWORD :'app_password';
GRANT CONNECT ON DATABASE massage_note TO massage_note_app;
GRANT USAGE ON SCHEMA public TO massage_note_app;
ALTER DEFAULT PRIVILEGES FOR ROLE massage_note_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO massage_note_app;
ALTER DEFAULT PRIVILEGES FOR ROLE massage_note_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO massage_note_app;
SQL
