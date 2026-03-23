#!/usr/bin/env bash
# HL7 Vitals API (:3040) + TCP gateway (:6008) + nginx yo'nalishlari
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
cd "$APP_ROOT"

NODE_BIN=$(command -v node || true)
if [ -z "$NODE_BIN" ]; then
  echo "!!! node topilmadi. O'rnatish: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
  exit 1
fi

echo "=== npm (server) ==="
cd "$APP_ROOT/server"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi

echo "=== npm (gateway) ==="
cd "$APP_ROOT/gateway"
npm install --no-audit --no-fund 2>/dev/null || true

install_unit() {
  local name="$1"
  sed "s|/opt/clinicmonitoring|$APP_ROOT|g; s|ExecStart=/usr/bin/node|ExecStart=$NODE_BIN|g" \
    "$APP_ROOT/deploy/${name}.service" > "/etc/systemd/system/${name}.service"
  chmod 644 "/etc/systemd/system/${name}.service"
}

echo "=== systemd ==="
install_unit "clinicmonitoring-vitals-api"
install_unit "clinicmonitoring-hl7-gateway"
systemctl daemon-reload
systemctl enable clinicmonitoring-vitals-api
systemctl enable clinicmonitoring-hl7-gateway
systemctl restart clinicmonitoring-vitals-api
sleep 1
systemctl restart clinicmonitoring-hl7-gateway
sleep 1
systemctl is-active clinicmonitoring-vitals-api
systemctl is-active clinicmonitoring-hl7-gateway

echo "=== ufw ==="
if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 3040/tcp comment "MediCentral vitals API" || true
    ufw allow 6008/tcp comment "MediCentral HL7 gateway" || true
  fi
fi

echo "=== nginx (vitals upstream) ==="
if [ -f "$APP_ROOT/deploy/nginx-clinicmonitoring.conf" ]; then
  cp "$APP_ROOT/deploy/nginx-clinicmonitoring.conf" /etc/nginx/sites-available/clinicmonitoring
  nginx -t
  systemctl reload nginx
else
  echo "!!! nginx config topilmadi"
fi

echo "=== tekshiruv (localhost) ==="
curl -sS "http://127.0.0.1:3040/api/vitals" | head -c 400 || true
echo
curl -sS -o /tmp/vpost.out -w "POST HTTP %{http_code}\n" -X POST "http://127.0.0.1:3040/api/vitals" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"127.0.0.1","timestamp":"2026-01-01T00:00:00Z","heart_rate":72,"spo2":98,"systolic":120,"diastolic":80}' || true
head -c 200 /tmp/vpost.out 2>/dev/null || true
echo
ss -tlnp | grep -E ':3040\b|:6008\b' || true
echo "=== remote_vitals_stack OK ==="
echo "Dashboard: https://clinicmonitoringapi.ziyrak.org/vitals-ui/  yoki  http://127.0.0.1:3040/"
echo "Gateway TCP: 6008 -> POST http://127.0.0.1:3040/api/vitals"
