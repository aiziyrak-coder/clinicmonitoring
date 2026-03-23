#!/usr/bin/env bash
# Monitoring noldan: baza tozalash + K12 + Daphne restart
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
cd "$APP_ROOT"
git fetch origin
git reset --hard origin/main
cd "$APP_ROOT/backend"
# shellcheck source=/dev/null
. .venv/bin/activate
export DJANGO_SQLITE_PATH="${DJANGO_SQLITE_PATH:-$APP_ROOT/backend/data/db.sqlite3}"
K12_PEER_IP="${K12_PEER_IP:-188.113.206.112}"
export K12_PEER_IP
python manage.py reset_monitoring_fresh
chown -R www-data:www-data "$APP_ROOT/backend/data" 2>/dev/null || true
systemctl restart clinicmonitoring-daphne
sleep 3
systemctl is-active --quiet clinicmonitoring-daphne && echo "Daphne: active"
