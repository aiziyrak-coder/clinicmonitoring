#!/usr/bin/env bash
# Faqat hl7_real + bemor (cm-k12-001) — to'liq deploysiz
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
cd "$APP_ROOT/backend"
# shellcheck source=/dev/null
. .venv/bin/activate
export DJANGO_SQLITE_PATH="${DJANGO_SQLITE_PATH:-$APP_ROOT/backend/data/db.sqlite3}"
K12_PEER_IP="${K12_PEER_IP:-188.113.206.112}"
python manage.py setup_real_hl7_monitor \
  --device-ip 192.168.0.228 \
  --peer-ip "${K12_PEER_IP}" \
  --mac 02:03:06:02:A3:F0 \
  --server-ip 167.71.53.238
systemctl restart clinicmonitoring-daphne
sleep 2
systemctl is-active --quiet clinicmonitoring-daphne && echo "Daphne: active"
