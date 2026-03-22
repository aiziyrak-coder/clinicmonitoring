#!/usr/bin/env bash
# To'g'ri vhost: cert allaqachon /etc/letsencrypt/live/clinicmonitoring.ziyrak.org/
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
cd "$APP_ROOT"
git pull origin main

cp "$APP_ROOT/deploy/nginx-clinicmonitoring.conf" /etc/nginx/sites-available/clinicmonitoring
# Birinchi yuklanishi uchun (boshqa saytlar bilan nom ziddiyati bo'lmasin)
ln -sf /etc/nginx/sites-available/clinicmonitoring /etc/nginx/sites-enabled/00-clinicmonitoring

nginx -t
systemctl reload nginx
echo "nginx clinicmonitoring yangilandi"
