#!/usr/bin/env bash
# Deploydan keyin: HL7_BRIDGE_TOKEN, Daphne restart, POST /api/hl7/ tekshiruvi
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
ENVF="$APP_ROOT/backend/.env"

echo "=== HL7 bridge API (.env) ==="
if [ ! -f "$ENVF" ]; then
  echo "!!! $ENVF yo'q"
  exit 1
fi

if ! grep -q '^HL7_BRIDGE_TOKEN=' "$ENVF" 2>/dev/null; then
  T=$(openssl rand -hex 24)
  echo "HL7_BRIDGE_TOKEN=$T" >> "$ENVF"
  echo "HL7_BRIDGE_TOKEN qo'shildi (48 hex)."
else
  echo "HL7_BRIDGE_TOKEN allaqachon mavjud."
fi

echo "=== Daphne restart ==="
systemctl restart clinicmonitoring-daphne
sleep 2
systemctl is-active clinicmonitoring-daphne

TOKEN=$(grep '^HL7_BRIDGE_TOKEN=' "$ENVF" | tail -1 | cut -d= -f2-)
export TOKEN

echo "=== POST /api/hl7/ (localhost) ==="
CODE=$(curl -sS -o /tmp/cm_hl7_test.json -w "%{http_code}" -X POST "http://127.0.0.1:8012/api/hl7/" \
  -H "Host: clinicmonitoringapi.ziyrak.org" \
  -H "Content-Type: application/json" \
  -H "X-HL7-Bridge-Token: ${TOKEN}" \
  -d '{"deviceIp":"192.168.0.228","hr":72,"spo2":98}' || echo "000")
echo "HTTP $CODE"
cat /tmp/cm_hl7_test.json 2>/dev/null || true
echo

if command -v node >/dev/null 2>&1; then
  echo "=== Node.js ==="
  node --version
else
  echo "=== Node.js: o'rnatilmagan (HL7 Node TCP bridge ixtiyoriy) ==="
fi

if [ -f "$APP_ROOT/tools/hl7-tcp-server/server.js" ]; then
  echo "=== HL7 Node bridge fayli mavjud: tools/hl7-tcp-server/server.js ==="
  echo "Eslatma: 6006-port Django HL7 tinglovchisi bilan ziddiyat. Node uchun HL7_TCP_PORT=6007 va HL7_LISTEN_ENABLED=false kerak bo'lishi mumkin."
else
  echo "=== tools/hl7-tcp-server topilmadi ==="
fi

echo "=== remote_hl7_post_setup OK ==="
