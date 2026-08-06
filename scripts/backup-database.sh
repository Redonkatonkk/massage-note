#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL:?必须设置 DATABASE_URL}"
: "${BACKUP_DIR:?必须设置 BACKUP_DIR，且不能是根目录或用户目录}"

case "$BACKUP_DIR" in
  /|"$HOME"|"") echo "BACKUP_DIR 不安全" >&2; exit 1 ;;
esac

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain_path="$BACKUP_DIR/massage-note-$timestamp.dump"

pg_dump "$DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$plain_path"

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  encrypted_path="$plain_path.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$plain_path" -out "$encrypted_path" -pass env:BACKUP_ENCRYPTION_KEY
  rm -f "$plain_path"
  checksum_target="$encrypted_path"
else
  checksum_target="$plain_path"
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$checksum_target" | awk '{print $1}' > "$checksum_target.sha256"
else
  shasum -a 256 "$checksum_target" | awk '{print $1}' > "$checksum_target.sha256"
fi
find "$BACKUP_DIR" -type f -name 'massage-note-*.dump*' -mtime "+${BACKUP_RETENTION_DAYS:-30}" -delete
echo "备份完成：$checksum_target"
