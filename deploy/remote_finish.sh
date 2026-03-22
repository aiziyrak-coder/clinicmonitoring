#!/usr/bin/env bash
# remote_deploy.sh npm dan keyin to'xtasa — qayta ishga tushirish
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
export APP_ROOT
cd "$APP_ROOT"
git pull origin main

cd "$APP_ROOT/backend"
. .venv/bin/activate
pip install -q -r requirements.txt
export DJANGO_SQLITE_PATH="$APP_ROOT/backend/data/db.sqlite3"
python manage.py migrate --noinput
python manage.py collectstatic --noinput
chown -R www-data:www-data "$APP_ROOT/backend/data" || true

cd "$APP_ROOT/frontend"
npm ci
npm run build
mkdir -p /var/www/clinicmonitoring/frontend/dist
rsync -a --delete dist/ /var/www/clinicmonitoring/frontend/dist/

sed "s|/opt/clinicmonitoring|$APP_ROOT|g" "$APP_ROOT/deploy/clinicmonitoring-daphne.service" > /etc/systemd/system/clinicmonitoring-daphne.service
systemctl daemon-reload
systemctl restart clinicmonitoring-daphne

cp "$APP_ROOT/deploy/nginx-http-only.conf" /etc/nginx/sites-available/clinicmonitoring
nginx -t
systemctl reload nginx

CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@ziyrak.org}"
certbot --nginx -d clinicmonitoring.ziyrak.org -d clinicmonitoringapi.ziyrak.org \
  --non-interactive --agree-tos --email "$CERTBOT_EMAIL" --redirect 2>/tmp/certbot2.log || cat /tmp/certbot2.log || true

echo "=== finish OK ==="
systemctl status clinicmonitoring-daphne --no-pager || true
