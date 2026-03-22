#!/usr/bin/env bash
# Serverda HL7 diagnostika: HL7_DEBUG=true + Daphne restart
# Masofadan: python deploy/deploy_remote.py hl7-debug
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
ENVF="$APP_ROOT/backend/.env"

echo "=== HL7_DEBUG (server) ==="
if [ ! -f "$ENVF" ]; then
  echo "Yaratilmoqda: $ENVF"
  mkdir -p "$(dirname "$ENVF")"
  touch "$ENVF"
fi

if grep -q "^HL7_DEBUG=" "$ENVF" 2>/dev/null; then
  sed -i 's/^HL7_DEBUG=.*/HL7_DEBUG=true/' "$ENVF"
  echo "HL7_DEBUG=true (yangilandi)"
else
  echo "" >> "$ENVF"
  echo "HL7_DEBUG=true" >> "$ENVF"
  echo "HL7_DEBUG=true (qo'shildi)"
fi

echo "=== clinicmonitoring-daphne restart ==="
systemctl restart clinicmonitoring-daphne
sleep 2
if systemctl is-active --quiet clinicmonitoring-daphne; then
  echo "Daphne: active"
else
  echo "!!! Daphne ishlamayapti"
  journalctl -u clinicmonitoring-daphne -n 30 --no-pager
  exit 1
fi

echo "=== health (localhost) ==="
curl -sS "http://127.0.0.1:8012/api/health/" -H "Host: clinicmonitoring.ziyrak.org" || true
echo
echo "=== remote_hl7_debug OK (journalctl: journalctl -u clinicmonitoring-daphne -f) ==="
