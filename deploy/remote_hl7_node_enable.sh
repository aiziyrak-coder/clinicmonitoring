#!/usr/bin/env bash
# Node HL7 TCP bridge (6007) — Django HL7 (6006) bilan parallel; monitor Node ga yo'naltirilsa ishlatiladi.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
NODE_BIN=$(command -v node || true)
if [ -z "$NODE_BIN" ]; then
  echo "!!! node topilmadi"
  exit 1
fi

sed "s|/opt/clinicmonitoring|$APP_ROOT|g; s|ExecStart=/usr/bin/node|ExecStart=$NODE_BIN|g" \
  "$APP_ROOT/deploy/clinicmonitoring-hl7-node.service" > /etc/systemd/system/clinicmonitoring-hl7-node.service
chmod 644 /etc/systemd/system/clinicmonitoring-hl7-node.service
systemctl daemon-reload
systemctl enable clinicmonitoring-hl7-node
systemctl restart clinicmonitoring-hl7-node
sleep 1
systemctl is-active clinicmonitoring-hl7-node
ss -tlnp | grep -E ':6007\b' || true
echo "=== clinicmonitoring-hl7-node (6007) ishga tushdi. Django HL7: 6006. ==="
