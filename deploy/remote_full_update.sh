#!/usr/bin/env bash
# To'liq yangilash: git, backend, frontend, nginx (sert bor bo'lsa HTTPS konfig), Daphne 8012.
# Serverda: bash /opt/clinicmonitoring/deploy/remote_full_update.sh
# Masofadan: python deploy/deploy_remote.py update
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
export APP_ROOT
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export CI=true

cd "$APP_ROOT"

echo "=== git (origin/main) ==="
git fetch origin
git reset --hard origin/main

echo "=== backend ==="
cd "$APP_ROOT/backend"
# shellcheck source=/dev/null
. .venv/bin/activate
pip install -q -r requirements.txt
export DJANGO_SQLITE_PATH="$APP_ROOT/backend/data/db.sqlite3"

if [ ! -f .env ]; then
  cp .env.example .env
fi
# Real HL7 uchun mock odatda o'chiq (agar .env da qator bo'lmasa)
if ! grep -q "^MONITORING_SIMULATION_ENABLED=" .env 2>/dev/null; then
  echo "MONITORING_SIMULATION_ENABLED=false" >> .env
fi
if ! grep -q "^HL7_SEND_CONNECT_HANDSHAKE=" .env 2>/dev/null; then
  echo "HL7_SEND_CONNECT_HANDSHAKE=true" >> .env
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py ensure_fjsti_login
python manage.py setup_real_hl7_monitor
chown -R www-data:www-data "$APP_ROOT/backend/data" 2>/dev/null || true

echo "=== frontend ==="
cd "$APP_ROOT/frontend"
npm ci --no-audit --no-fund
npm run build
mkdir -p /var/www/clinicmonitoring/frontend/dist
rsync -a --delete dist/ /var/www/clinicmonitoring/frontend/dist/
chown -R www-data:www-data /var/www/clinicmonitoring/frontend/dist 2>/dev/null || true

echo "=== systemd (Daphne :8012) ==="
sed "s|/opt/clinicmonitoring|$APP_ROOT|g" "$APP_ROOT/deploy/clinicmonitoring-daphne.service" > /etc/systemd/system/clinicmonitoring-daphne.service
chmod 644 /etc/systemd/system/clinicmonitoring-daphne.service
systemctl daemon-reload
systemctl enable clinicmonitoring-daphne
systemctl restart clinicmonitoring-daphne
sleep 2
if ! systemctl is-active --quiet clinicmonitoring-daphne; then
  echo "!!! clinicmonitoring-daphne ishlamayapti"
  journalctl -u clinicmonitoring-daphne -n 50 --no-pager
  exit 1
fi

echo "=== ufw (HL7 TCP 6006 — tashqidan monitor ulanishi uchun) ==="
if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 6006/tcp comment "MediCentral HL7" || true
  else
    echo "ufw faol emas — bulut firewall (DO/AWS) da 6006 TCP ni qo'lda oching."
  fi
else
  echo "ufw yo'q — server firewall / bulut xavfsizlik guruhida 6006 TCP ochiq ekanini tekshiring."
fi

echo "=== nginx ==="
CERT_DIR="/etc/letsencrypt/live/clinicmonitoring.ziyrak.org"
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  echo "TLS mavjud: nginx-clinicmonitoring.conf"
  cp "$APP_ROOT/deploy/nginx-clinicmonitoring.conf" /etc/nginx/sites-available/clinicmonitoring
else
  echo "TLS yo'q: nginx-http-only.conf"
  cp "$APP_ROOT/deploy/nginx-http-only.conf" /etc/nginx/sites-available/clinicmonitoring
fi
ln -sf /etc/nginx/sites-available/clinicmonitoring /etc/nginx/sites-enabled/00-clinicmonitoring
nginx -t
systemctl reload nginx

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@ziyrak.org}"
  if certbot --nginx -d clinicmonitoring.ziyrak.org -d clinicmonitoringapi.ziyrak.org \
    --non-interactive --agree-tos --email "$CERTBOT_EMAIL" --redirect 2>/tmp/cm_certbot_update.log; then
    echo "certbot: yangi sertifikat"
    if [ -f "$CERT_DIR/fullchain.pem" ]; then
      cp "$APP_ROOT/deploy/nginx-clinicmonitoring.conf" /etc/nginx/sites-available/clinicmonitoring
      nginx -t && systemctl reload nginx
    fi
  else
    echo "certbot: o'tmadi (DNS / domen). Log: /tmp/cm_certbot_update.log"
    cat /tmp/cm_certbot_update.log 2>/dev/null || true
  fi
fi

echo "=== tekshiruv (Daphne + HTTPS) ==="
curl -sS "http://127.0.0.1:8012/api/health/" -H "Host: clinicmonitoring.ziyrak.org" || true
echo
curl -sS "https://clinicmonitoring.ziyrak.org/api/health/" || true
echo
curl -sS "https://clinicmonitoringapi.ziyrak.org/api/health/" || true
echo
echo "=== remote_full_update OK ==="
