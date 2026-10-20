#!/bin/sh
# Run on DSM only after the config, signing key, Compose and verified image archive are staged.
set -eu
umask 077
root=/volume1/docker/massage-note-oracle-monitor
cd "$root"
test -s /volume1/docker/massage-note-recovery/smtp-password
monitor_uid=$(stat -c %u /volume1/docker/massage-note-recovery/smtp-password)
monitor_gid=$(stat -c %g /volume1/docker/massage-note-recovery/smtp-password)
printf 'MONITOR_UID=%s\nMONITOR_GID=%s\n' "$monitor_uid" "$monitor_gid" > .env
chmod 600 .env
chown root:root "$root"
chown -R "$monitor_uid:$monitor_gid" "$root/config" "$root/state"
chmod 700 "$root" "$root/config" "$root/state"
find "$root/config" -type f -exec chmod 600 {} +
test -s config/config.json
test -s config/oci-config
test -s config/api-key.pem
test -s config/instance-ssh.pub
if ! test -f runtime.tar.gz; then
  cat runtime.tar.gz.part-* > runtime.tar.gz.tmp
  mv runtime.tar.gz.tmp runtime.tar.gz
fi
sha256sum -c runtime.tar.gz.sha256
docker load --input runtime.tar.gz > image-load.log
docker compose -f compose.yml config --quiet
# Capacity/inventory checks never create a VM. Activation is deliberately separate.
docker compose -f compose.yml run --rm --no-deps monitor check
