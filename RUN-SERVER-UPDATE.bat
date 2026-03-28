@echo off
chcp 65001 >nul
echo ================================================
echo SERVERGA ULANISH VA BEMORLARNI YARATISH
echo ================================================
echo.

REM 1. Bemorlarni yaratish va xizmatlarni restart qilish
echo [1/3] Bemorlar yaratilmoqda...
ssh root@167.71.53.238 "cd /opt/clinicmonitoring/backend && source .venv/bin/activate && python manage.py create_mock_patients"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ XATOLIK! Serverga ulanish muvaffaqiyatsiz.
    echo Parolni tekshiring: Ziyrak2025Ai
    pause
    exit /b 1
)

echo.
echo [2/3] Xizmatlar restart qilinmoqda...
ssh root@167.71.53.238 "sudo systemctl restart clinicmonitoring-daphne && sudo systemctl restart clinicmonitoring-hl7-gateway || true && sudo systemctl restart clinicmonitoring-vitals-api || true && sudo nginx -t && sudo systemctl reload nginx"

echo.
echo [3/3] Statistika olinmoqda...
ssh root@167.71.53.238 "cd /opt/clinicmonitoring/backend && source .venv/bin/activate && python -c \"from monitoring.models import Patient,Clinic,Department,Room,Bed; print('📊 STATISTIKA:'); print(f'  Klinikalar: {Clinic.objects.count()} ta'); print(f'  Bo‘limlar: {Department.objects.count()} ta'); print(f'  Xonalar: {Room.objects.count()} ta'); print(f'  Karavotlar: {Bed.objects.count()} ta'); print(f'  Bemorlar: {Patient.objects.count()} ta')\""

echo.
echo ================================================
echo ✅ HAMMA NARSA TAYYOR!
echo ================================================
echo.
echo Platformani oching: https://clinicmonitoring.ziyrak.org
echo Login: admin
echo Parol: (sizning parolingiz)
echo.
pause
