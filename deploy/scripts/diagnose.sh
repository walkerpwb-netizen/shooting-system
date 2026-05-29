#!/usr/bin/env bash
set -euo pipefail

echo "== Services =="
systemctl --no-pager --plain is-active shooting-backend.service pm2-ubuntu.service nginx postgresql shooting-postgres-backup.timer

echo
echo "== PM2 =="
pm2 status

echo
echo "== Health =="
curl -fsS http://127.0.0.1:8000/health
echo

echo
echo "== Public frontend =="
curl -fsSI https://system-strzelecki.pl | sed -n '1,20p'

echo
echo "== Disk =="
df -h /

echo
echo "== Latest PostgreSQL backups =="
ls -lh /home/ubuntu/backups/shooting-system/postgres | tail -n 10

echo
echo "== Recent backend logs =="
journalctl -u shooting-backend.service -n 30 --no-pager

echo
echo "== Recent PM2 frontend errors =="
tail -n 30 /home/ubuntu/.pm2/logs/shooting-frontend-error.log
