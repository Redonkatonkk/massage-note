#!/bin/sh
set -eu

mode="${1:-app}"

case "$mode" in
  migrate)
    cd /opt/massage-note/database
    exec node node_modules/prisma/build/index.js migrate deploy
    ;;
  harden)
    exec /opt/massage-note/harden-database.sh
    ;;
  app)
    node /opt/massage-note/api/dist/main.js &
    api_pid="$!"
    node /opt/massage-note/web/apps/web/server.js &
    web_pid="$!"
    trap 'kill -TERM "$api_pid" "$web_pid" 2>/dev/null || true' EXIT INT TERM
    wait "$web_pid"
    status="$?"
    kill -TERM "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
    exit "$status"
    ;;
  *)
    exec "$@"
    ;;
esac
