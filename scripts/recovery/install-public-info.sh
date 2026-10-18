#!/bin/sh
# Install and test the loopback proxy only; DSM routing is a separate final step.
set -eu
umask 077
backup_root=/volume1/docker/massage-note-recovery
exec > "$backup_root/public-info/install.log" 2>&1
chmod 700 "$backup_root" "$backup_root/public-info"
/bin/sh "$backup_root/load-runtime.sh"
chmod 755 "$backup_root/public-info/www"
chmod 644 "$backup_root/public-info/Caddyfile" "$backup_root/public-info/www/"*.html
chmod 600 "$backup_root/public-info/compose.json"
docker compose -f "$backup_root/public-info/compose.json" up -d --pull never
trap 'docker logs --tail 30 mn-recovery-public-info-public-info-1' EXIT
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error --max-time 10 -H 'Host: massagenote.waltonjin.com' http://127.0.0.1:13100/api/v1/health/ready > "$backup_root/public-info/ready.json"; then
    ready=true; break
  fi
  sleep 1
done
test "$ready" = true
for page in index.html privacy.html terms.html; do
  curl --fail --silent --show-error --max-time 10 -H 'Host: massagenote.waltonjin.com' "http://127.0.0.1:13100/backup-info/$page" > "$backup_root/public-info/readback.html"
  cmp "$backup_root/public-info/www/$page" "$backup_root/public-info/readback.html"
done
rm "$backup_root/public-info/readback.html"
printf '%s\n' '{"loopbackProxyReady":true,"publicFilesReadback":"passed","productionRouteChanged":false}' > "$backup_root/public-info/install-status.json"
