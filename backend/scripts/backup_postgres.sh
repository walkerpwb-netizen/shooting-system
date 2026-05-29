#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/shooting-system}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/shooting-system/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_BACKUPS="${MIN_BACKUPS:-3}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
REMOTE_SYNC_COMMAND="${REMOTE_SYNC_COMMAND:-}"
tmp_file=""

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

read_database_url() {
  [[ -r "$ENV_FILE" ]] || fail "Cannot read env file: $ENV_FILE"

  local line value
  line="$(grep -m 1 '^DATABASE_URL=' "$ENV_FILE" || true)"
  [[ -n "$line" ]] || fail "DATABASE_URL is missing in $ENV_FILE"

  value="${line#DATABASE_URL=}"
  value="${value%$'\r'}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"

  [[ -n "$value" ]] || fail "DATABASE_URL is empty in $ENV_FILE"
  printf '%s' "$value"
}

pg_dump_url() {
  local url="$1"

  case "$url" in
    postgresql+*://*)
      printf 'postgresql://%s' "${url#*://}"
      ;;
    postgres://*)
      printf 'postgresql://%s' "${url#*://}"
      ;;
    postgresql://*)
      printf '%s' "$url"
      ;;
    *)
      fail "DATABASE_URL must be a PostgreSQL URL"
      ;;
  esac
}

prune_old_backups() {
  local deleted_any=0

  while IFS= read -r -d '' backup_file; do
    local current_count
    current_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shooting-system-*.dump' | wc -l)"

    if (( current_count <= MIN_BACKUPS )); then
      break
    fi

    rm -f -- "$backup_file"
    log "Deleted old backup: $backup_file"
    deleted_any=1
  done < <(
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shooting-system-*.dump' -mtime +"$RETENTION_DAYS" -print0 |
      sort -z
  )

  if (( deleted_any == 0 )); then
    log "No old backups to delete"
  fi
}

main() {
  command -v "$PG_DUMP_BIN" >/dev/null 2>&1 || fail "pg_dump not found"
  command -v "$PG_RESTORE_BIN" >/dev/null 2>&1 || fail "pg_restore not found"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  umask 077

  local database_url dump_url timestamp backup_file
  database_url="$(read_database_url)"
  dump_url="$(pg_dump_url "$database_url")"
  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  backup_file="${BACKUP_DIR}/shooting-system-${timestamp}.dump"
  tmp_file="${backup_file}.tmp"

  log "Starting PostgreSQL backup"
  "$PG_DUMP_BIN" --format=custom --no-owner --no-acl --file="$tmp_file" "$dump_url"
  "$PG_RESTORE_BIN" --list "$tmp_file" >/dev/null
  mv "$tmp_file" "$backup_file"
  chmod 600 "$backup_file"
  log "Backup created: $backup_file"

  if [[ -n "$REMOTE_SYNC_COMMAND" ]]; then
    log "Running remote sync command"
    BACKUP_FILE="$backup_file" BACKUP_DIR="$BACKUP_DIR" bash -c "$REMOTE_SYNC_COMMAND"
    log "Remote sync command finished"
  else
    log "Remote sync command is not configured"
  fi

  prune_old_backups
  log "PostgreSQL backup finished"
}

trap '[[ -n "${tmp_file:-}" && -f "$tmp_file" ]] && rm -f -- "$tmp_file"' EXIT
main "$@"
