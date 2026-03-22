#!/usr/bin/env bash
# HL7_DEBUG o'chirish (production) + Daphne restart
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
ENVF="$APP_ROOT/backend/.env"
echo "=== HL7_DEBUG off ==="
if [ -f "$ENVF" ] && grep -q "^HL7_DEBUG=" "$ENVF" 2>/dev/null; then
  sed -i 's/^HL7_DEBUG=.*/HL7_DEBUG=false/' "$ENVF"
  echo "HL7_DEBUG=false"
else
  echo "HL7_DEBUG qatori topilmadi"
fi
systemctl restart clinicmonitoring-daphne
sleep 2
systemctl is-active --quiet clinicmonitoring-daphne && echo "Daphne: active"
