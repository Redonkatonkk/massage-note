#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL:?必须设置目标 DATABASE_URL}"
: "${BACKUP_FILE:?必须设置 BACKUP_FILE}"
: "${CONFIRM_RESTORE:?恢复会覆盖目标库；确认无误后设置 CONFIRM_RESTORE=YES}"

if [ "$CONFIRM_RESTORE" != "YES" ]; then
  echo "CONFIRM_RESTORE 必须精确设置为 YES" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "备份文件不存在：$BACKUP_FILE" >&2
  exit 1
fi

if [ -f "$BACKUP_FILE.sha256" ]; then
  expected_checksum="$(awk 'NR == 1 {print $1}' "$BACKUP_FILE.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_checksum="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  else
    actual_checksum="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
  fi
  if [ "$expected_checksum" != "$actual_checksum" ]; then
    echo "备份校验和不匹配，拒绝恢复" >&2
    exit 1
  fi
fi

restore_file="$BACKUP_FILE"
temporary_file=""
case "$BACKUP_FILE" in
  *.enc)
    : "${BACKUP_ENCRYPTION_KEY:?加密备份必须设置 BACKUP_ENCRYPTION_KEY}"
    temporary_file="$(mktemp "${TMPDIR:-/tmp}/massage-note-restore.XXXXXX.dump")"
    trap 'test -n "$temporary_file" && rm -f "$temporary_file"' EXIT
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -out "$temporary_file" -pass env:BACKUP_ENCRYPTION_KEY
    restore_file="$temporary_file"
    ;;
esac

pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl --exit-on-error "$restore_file"
echo "恢复完成。请运行数据库迁移和应用健康检查。"
