#!/usr/bin/env bash
# hl7_real uchun HL7 salom (MLLP handshake) o'chirish — ba'zi K12 firmware RST beradi
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/clinicmonitoring}"
cd "$APP_ROOT/backend"
# shellcheck source=/dev/null
. .venv/bin/activate
export DJANGO_SQLITE_PATH="${DJANGO_SQLITE_PATH:-$APP_ROOT/backend/data/db.sqlite3}"
python manage.py shell <<'PY'
from monitoring.models import MonitorDevice
d = MonitorDevice.objects.filter(id="hl7_real").first()
if d:
    d.hl7_connect_handshake = False
    d.save(update_fields=["hl7_connect_handshake"])
    print("hl7_real: hl7_connect_handshake=False")
else:
    print("hl7_real topilmadi")
PY
systemctl restart clinicmonitoring-daphne
sleep 2
systemctl is-active --quiet clinicmonitoring-daphne && echo "Daphne: active"
