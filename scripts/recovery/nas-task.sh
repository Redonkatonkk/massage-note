#!/bin/sh
# Install this script with mode 0700. DSM schedules it daily at 00:00 Eastern.
set -eu
umask 077
backup_root=/volume1/docker/massage-note-recovery
chmod 700 "$backup_root"
test -d "$backup_root/recovery"
find "$backup_root/recovery" -type d -exec chmod 700 {} +
find "$backup_root/recovery" -type f -exec chmod 600 {} +
chmod 700 "$backup_root/nas-task.sh" "$backup_root/load-runtime.sh"
chmod 600 "$backup_root/runner-image-reference" "$backup_root/runner-images.tar.gz.sha256"
mkdir -p "$backup_root/work"
chmod 700 "$backup_root/work"
date '+%Y-%m-%dT%H:%M:%S%z %Z' > "$backup_root/work/host-clock.txt"
if test -f /etc/TZ; then cat /etc/TZ > "$backup_root/work/host-timezone.txt"; fi
if test -f "$backup_root/enabled"; then chmod 600 "$backup_root/enabled"; fi
case "${1:-}" in
  --verify-install) ;;
  '')
    if ! test -f "$backup_root/enabled"; then
      echo 'Recovery backup is not activated; cloud acceptance is still pending.'
      exit 0
    fi ;;
  *) echo 'Invalid recovery task argument' >&2; exit 1 ;;
esac
test -f "$backup_root/config.json"
test -f "$backup_root/recovery/recovery.py"
test -f "$backup_root/runner-image-reference"
runner_reference=$(cat "$backup_root/runner-image-reference")
case "$runner_reference" in mn-recovery/runner:[0-9]*.[0-9]*.[0-9]*) ;; *) echo 'Invalid recovery runner reference' >&2; exit 1 ;; esac
if ! docker image inspect "$runner_reference" >/dev/null 2>&1 || ! cmp -s "$backup_root/loaded-helper.sha256" "$backup_root/runner-images.tar.gz.sha256"; then
  /bin/sh "$backup_root/load-runtime.sh"
fi
runner_image=$(docker image inspect "$runner_reference" --format '{{.Id}}')
chmod 600 "$backup_root/config.json" "$backup_root/rclone.conf" "$backup_root/smtp-password"
test -f /usr/syno/etc/www/ReverseProxy.json
# Only the container named here is created. No production compose update/restart.
exec docker run --rm --pull=never --platform linux/amd64 --name mn-recovery-backup \
  --label com.massagenote.recovery=nightly --network host --memory=512m \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$backup_root:$backup_root" \
  -v "$backup_root/recovery:/opt/recovery:ro" \
  -v /volume1/docker/massage-note-v2:/volume1/docker/massage-note-v2:ro \
  -v /usr/syno/etc/www:/host-dsm-proxy:ro \
  "$runner_image" backup --config "$backup_root/config.json"
