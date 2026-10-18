#!/bin/sh
set -eu
umask 077
backup_root=/volume1/docker/massage-note-recovery
cd "$backup_root"
test -f runner-images.tar.gz.sha256
if ! sha256sum -c runner-images.tar.gz.sha256 >/dev/null 2>&1; then
  cat runner-images.tar.gz.part-* > runner-images.tar.gz.tmp
  mv runner-images.tar.gz.tmp runner-images.tar.gz
fi
sha256sum -c runner-images.tar.gz.sha256 >/dev/null
docker load -i runner-images.tar.gz >/dev/null
cp runner-images.tar.gz.sha256 loaded-helper.sha256
chmod 600 loaded-helper.sha256
