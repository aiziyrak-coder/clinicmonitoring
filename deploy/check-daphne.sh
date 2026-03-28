#!/usr/bin/env bash
# Daphne loglarini olish

cd /opt/clinicmonitoring/backend
source .venv/bin/activate

echo "=== DAPHNE STATUS ==="
systemctl status clinicmonitoring-daphne --no-pager -l

echo ""
echo "=== JOURNAL LOGS ==="
journalctl -u clinicmonitoring-daphne -n 30 --no-pager

echo ""
echo "=== MANUAL START TEST ==="
daphne -b 127.0.0.1 -p 8012 medicentral.asgi:application &
sleep 3
curl -s http://127.0.0.1:8012/api/health/ || echo "Failed"
kill %1 2>/dev/null || true
