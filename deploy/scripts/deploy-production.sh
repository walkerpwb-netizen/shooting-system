#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/shooting-system}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-env-config}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
LOCK_FILE="${LOCK_FILE:-/tmp/shooting-system-deploy.lock}"

BACKEND_SERVICE="${BACKEND_SERVICE:-shooting-backend.service}"
FRONTEND_PM2_APP="${FRONTEND_PM2_APP:-shooting-frontend}"
PM2_CONFIG="${PM2_CONFIG:-deploy/pm2/ecosystem.config.cjs}"
BACKEND_UNIT_SRC="${BACKEND_UNIT_SRC:-deploy/systemd/shooting-backend.service}"
BACKEND_UNIT_DST="${BACKEND_UNIT_DST:-/etc/systemd/system/shooting-backend.service}"
NGINX_CONF_SRC="${NGINX_CONF_SRC:-deploy/nginx/shooting-system.conf}"
NGINX_CONF_DST="${NGINX_CONF_DST:-/etc/nginx/sites-available/shooting-system}"
BACKEND_VENV="${BACKEND_VENV:-backend/venv}"

log() {
  printf '\n== %s ==\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  printf '+ %s\n' "$*"
  "$@"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

ensure_clean_worktree() {
  local dirty_paths

  dirty_paths=$(
    {
      git diff --name-only
      git diff --cached --name-only
      git ls-files --others --exclude-standard
    } | sort -u
  )

  if [[ -n "$dirty_paths" ]]; then
    printf 'Refusing to deploy with local worktree changes:\n%s\n' "$dirty_paths" >&2
    printf '\nCommit, stash, or deliberately resolve these files before deploying.\n' >&2
    return 1
  fi
}

ensure_branch() {
  local current_branch
  current_branch=$(git branch --show-current)

  if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
    fail "Expected branch $DEPLOY_BRANCH, but current branch is $current_branch"
  fi
}

fast_forward_from_remote() {
  local local_head remote_head

  log "Fetching $DEPLOY_REMOTE/$DEPLOY_BRANCH"
  run git fetch "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"

  local_head=$(git rev-parse HEAD)
  remote_head=$(git rev-parse FETCH_HEAD)

  if [[ "$local_head" == "$remote_head" ]]; then
    echo "Already up to date."
    return
  fi

  if ! git merge-base --is-ancestor "$local_head" "$remote_head"; then
    fail "Local branch cannot fast-forward to $DEPLOY_REMOTE/$DEPLOY_BRANCH. Resolve divergence manually."
  fi

  run git merge --ff-only FETCH_HEAD
}

backup_path() {
  local path="$1"
  local label="$2"

  printf '%s.backup-before-%s-%s' "$path" "$label" "$(date +%Y%m%d-%H%M%S)"
}

sync_file_with_backup() {
  local src="$1"
  local dst="$2"
  local label="$3"
  local backup

  if sudo test -f "$dst" && sudo cmp -s "$src" "$dst"; then
    echo "$dst already matches $src"
    return 1
  fi

  backup=$(backup_path "$dst" "$label")

  if sudo test -e "$dst"; then
    run sudo cp "$dst" "$backup"
    echo "Backup written to $backup"
  fi

  run sudo cp "$src" "$dst"
  return 0
}

install_backend_dependencies() {
  local pip_bin="$REPO_DIR/$BACKEND_VENV/bin/pip"

  [[ -x "$pip_bin" ]] || fail "Backend virtualenv pip not found at $pip_bin"

  log "Installing backend dependencies"
  run "$pip_bin" install -r "$REPO_DIR/backend/requirements.txt"
}

build_frontend() {
  log "Building frontend"
  (
    cd "$REPO_DIR/frontend"
    run npm ci
    run npm run build
  )
}

run_migrations() {
  local alembic_bin="$REPO_DIR/$BACKEND_VENV/bin/alembic"

  [[ -x "$alembic_bin" ]] || fail "Alembic not found at $alembic_bin"

  log "Running database migrations"
  (
    cd "$REPO_DIR/backend"
    run "$alembic_bin" -c alembic.ini upgrade head
  )
}

sync_service_configs() {
  local backend_unit_changed=0

  log "Syncing service configs"
  if sync_file_with_backup "$REPO_DIR/$BACKEND_UNIT_SRC" "$BACKEND_UNIT_DST" "deploy"; then
    backend_unit_changed=1
  fi

  if [[ "$backend_unit_changed" -eq 1 ]]; then
    run sudo systemctl daemon-reload
    run sudo systemctl enable "$BACKEND_SERVICE"
  fi
}

restart_backend() {
  log "Restarting backend"
  run sudo systemctl restart "$BACKEND_SERVICE"
  run sudo systemctl is-active "$BACKEND_SERVICE"
}

reload_frontend() {
  log "Reloading frontend"
  (
    cd "$REPO_DIR"
    run pm2 startOrReload "$PM2_CONFIG" --update-env
    run pm2 save
    run pm2 status "$FRONTEND_PM2_APP" --no-color
  )
}

reload_nginx() {
  local nginx_changed=0

  log "Validating nginx config"
  if sync_file_with_backup "$REPO_DIR/$NGINX_CONF_SRC" "$NGINX_CONF_DST" "deploy"; then
    nginx_changed=1
  fi

  run sudo nginx -t

  if [[ "$nginx_changed" -eq 1 ]]; then
    run sudo systemctl reload nginx
  else
    echo "nginx config unchanged; reload skipped."
  fi

  run systemctl is-active nginx
}

run_health_checks() {
  log "Running health checks"
  run systemctl is-active postgresql
  run curl -fsS http://127.0.0.1:8000/health
  printf '\n'
  run curl -fsS https://system-strzelecki.pl/api/health
  printf '\n'
  run curl -fsSI https://system-strzelecki.pl/
}

main() {
  require_command git
  require_command npm
  require_command pm2
  require_command curl
  require_command flock

  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "Another deploy is already running: $LOCK_FILE"

  cd "$REPO_DIR"

  log "Preflight"
  ensure_branch
  ensure_clean_worktree
  fast_forward_from_remote

  install_backend_dependencies
  build_frontend
  run_migrations
  sync_service_configs
  restart_backend
  reload_frontend
  reload_nginx
  run_health_checks

  log "Deploy completed"
}

main "$@"
