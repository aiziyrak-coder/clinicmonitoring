#!/usr/bin/env bash
# Serverda ishga tushadi: /opt/clinicmonitoring dan
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
export APP_ROOT
REPO="${REPO:-https://github.com/aiziyrak-coder/clinicmonitoring.git}"

apt-get update -qq
apt-get install -y -qq python3-venv python3-pip nginx certbot python3-certbot-nginx git redis-server ufw curl rsync

# Node.js 20 LTS
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

mkdir -p "$APP_ROOT"
cd "$APP_ROOT"
if [ ! -d .git ]; then
  git clone "$REPO" .
else
  git fetch origin
  git reset --hard origin/main
fi

cd "$APP_ROOT/backend"
python3 -m venv .venv
# shellcheck source=/dev/null
. .venv/bin/activate
pip install -q -r requirements.txt

mkdir -p "$APP_ROOT/backend/data"
if [ ! -f .env ]; then
  cp .env.example .env
fi

python3 << 'PY'
import os
import re
import secrets
from pathlib import Path

APP_ROOT = os.environ.get("APP_ROOT", "/opt/clinicmonitoring")
p = Path(APP_ROOT) / "backend" / ".env"
t = p.read_text(encoding="utf-8")
if not re.search(r"^DJANGO_SECRET_KEY=\S+", t, re.M) or "o'zgartiring" in t or "dev-insecure" in t:
    k = secrets.token_urlsafe(48)
    if re.search(r"^DJANGO_SECRET_KEY=.*$", t, re.M):
        t = re.sub(r"^DJANGO_SECRET_KEY=.*$", f"DJANGO_SECRET_KEY={k}", t, flags=re.M)
    else:
        t += f"\nDJANGO_SECRET_KEY={k}\n"
t = re.sub(r"^DJANGO_DEBUG=.*$", "DJANGO_DEBUG=false", t, flags=re.M)
if not re.search(r"^DJANGO_DEBUG=", t, re.M):
    t += "\nDJANGO_DEBUG=false\n"
t = re.sub(
    r"^DJANGO_ALLOWED_HOSTS=.*$",
    "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,clinicmonitoring.ziyrak.org,clinicmonitoringapi.ziyrak.org,167.71.53.238",
    t,
    flags=re.M,
)
if not re.search(r"^DJANGO_CSRF_TRUSTED_ORIGINS=", t, re.M):
    t += "\nDJANGO_CSRF_TRUSTED_ORIGINS=https://clinicmonitoring.ziyrak.org,https://clinicmonitoringapi.ziyrak.org\n"
if not re.search(r"^CORS_ALLOWED_ORIGINS=", t, re.M):
    t += "CORS_ALLOWED_ORIGINS=https://clinicmonitoring.ziyrak.org\n"
if not re.search(r"^DJANGO_BEHIND_PROXY=", t, re.M):
    t += "DJANGO_BEHIND_PROXY=true\n"
if not re.search(r"^REDIS_URL=", t, re.M):
    t += "REDIS_URL=redis://127.0.0.1:6379/0\n"
if not re.search(r"^DJANGO_SQLITE_PATH=", t, re.M):
    t += "DJANGO_SQLITE_PATH=" + APP_ROOT + "/backend/data/db.sqlite3\n"
if re.search(r"^MONITORING_SIMULATION_ENABLED=", t, re.M):
    t = re.sub(r"^MONITORING_SIMULATION_ENABLED=.*$", "MONITORING_SIMULATION_ENABLED=false", t, flags=re.M)
else:
    t += "MONITORING_SIMULATION_ENABLED=false\n"
p.write_text(t, encoding="utf-8")
print(".env updated")
PY

export DJANGO_SQLITE_PATH="$APP_ROOT/backend/data/db.sqlite3"
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py ensure_fjsti_login
K12_PEER_IP="${K12_PEER_IP:-188.113.206.112}"
python manage.py setup_real_hl7_monitor \
  --device-ip 192.168.0.228 \
  --peer-ip "${K12_PEER_IP}" \
  --mac 02:03:06:02:A3:F0 \
  --server-ip 167.71.53.238
chown -R www-data:www-data "$APP_ROOT/backend/data" || true

systemctl enable --now redis-server || true

cd "$APP_ROOT/frontend"
npm ci
npm run build
mkdir -p /var/www/clinicmonitoring/frontend/dist
rsync -a --delete dist/ /var/www/clinicmonitoring/frontend/dist/

# systemd
sed "s|/opt/clinicmonitoring|$APP_ROOT|g" "$APP_ROOT/deploy/clinicmonitoring-daphne.service" > /etc/systemd/system/clinicmonitoring-daphne.service
systemctl daemon-reload
systemctl enable clinicmonitoring-daphne
systemctl restart clinicmonitoring-daphne

# nginx: avval HTTP
cp "$APP_ROOT/deploy/nginx-http-only.conf" /etc/nginx/sites-available/clinicmonitoring
ln -sf /etc/nginx/sites-available/clinicmonitoring /etc/nginx/sites-enabled/00-clinicmonitoring
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 6006/tcp || true
ufw --force enable || true

# HTTPS (DNS A yozuvlari server IP ga tushgan bo'lishi kerak)
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@ziyrak.org}"
CERT_DIR="/etc/letsencrypt/live/clinicmonitoring.ziyrak.org"
if certbot --nginx -d clinicmonitoring.ziyrak.org -d clinicmonitoringapi.ziyrak.org \
  --non-interactive --agree-tos --email "$CERTBOT_EMAIL" --redirect 2>/tmp/certbot.log; then
  echo "certbot: HTTPS OK"
else
  echo "certbot: xato (DNS / domen tekshiring). Log: /tmp/certbot.log"
  cat /tmp/certbot.log || true
fi

# Repodagi to'liq TLS konfig (certbot faylni aralashtirishi mumkin — bir xil yo'l bilan qayta yozamiz)
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  cp "$APP_ROOT/deploy/nginx-clinicmonitoring.conf" /etc/nginx/sites-available/clinicmonitoring
  nginx -t && systemctl reload nginx
fi

echo "=== Deploy tugadi ==="
systemctl status clinicmonitoring-daphne --no-pager || true
