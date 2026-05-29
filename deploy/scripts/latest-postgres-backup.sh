#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/shooting-system/postgres}"

latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shooting-system-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

if [[ -z "$latest_backup" ]]; then
  echo "No PostgreSQL backups found in $BACKUP_DIR" >&2
  exit 1
fi

echo "path=$latest_backup"
echo "size_bytes=$(stat -c '%s' "$latest_backup")"
echo "modified_at=$(date -u -r "$latest_backup" '+%Y-%m-%dT%H:%M:%SZ')"
echo "sha256=$(sha256sum "$latest_backup" | awk '{print $1}')"
