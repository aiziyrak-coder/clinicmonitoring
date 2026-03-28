#!/usr/bin/env bash
# Serverda bemorlarni tekshirish

cd /opt/clinicmonitoring/backend
source .venv/bin/activate

python << 'EOF'
from monitoring.models import Clinic, Patient, User

print("=" * 60)
print("BAZA TEKSHIRUVI")
print("=" * 60)

clinics = Clinic.objects.all()
print(f"\n📊 Klinikalar: {clinics.count()} ta")
for c in clinics:
    print(f"   - {c.id}: {c.name}")

patients = Patient.objects.all()
print(f"\n👥 Bemorlar: {patients.count()} ta")
for p in patients[:5]:
    bed_name = p.bed.name if p.bed else "Yo'q"
    print(f"   - {p.name} ({p.age} yosh) - {bed_name}")

admins = User.objects.filter(is_superuser=True)
print(f"\n👨‍💼 Admin users: {admins.count()} ta")
for admin in admins:
    try:
        profile = admin.monitoring_profile
        print(f"   - {admin.username} → Clinic: {profile.clinic_id}")
    except Exception as e:
        print(f"   - {admin.username} → Profil yo'q: {e}")

print("\n" + "=" * 60)
EOF
