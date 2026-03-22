#!/usr/bin/env bash
# Daphne qayta ishga tushirish va HL7 bilan bog'liq oxirgi journal qatorlari
set -euo pipefail
echo "=== systemctl restart clinicmonitoring-daphne ==="
systemctl restart clinicmonitoring-daphne
sleep 3
echo "=== is-active ==="
systemctl is-active clinicmonitoring-daphne
echo "=== HL7 / peer (oxirgi 250 qator, filtrlangan) ==="
journalctl -u clinicmonitoring-daphne -n 250 --no-pager | grep -E 'HL7|188\.113|ml7|MLLP|peer=|handshake|Connection reset|qabul=' || echo "(filtr bo'sh — HL7 qatorlari yo'q yoki hali ulanish bo'lmagan)"
