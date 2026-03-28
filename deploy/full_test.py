#!/usr/bin/env python
"""
Serverda to'liq test - bemorlar va bo'lim/xona/palata
"""
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "medicentral.settings")
sys.path.insert(0, "/opt/clinicmonitoring/backend")
django.setup()

from monitoring.models import Clinic, Department, Room, Bed, Patient, MonitorDevice
from django.contrib.auth import get_user_model

User = get_user_model()

print("=" * 70)
print("TO'LIQ TEST - BEMORLAR VA BO'LIM/XONA/PALATA")
print("=" * 70)

# 1. Klinika
print("\n📊 1. KLINIKA:")
clinic, created = Clinic.objects.get_or_create(
    id="demo_clinic",
    defaults={"name": "Demo Klinikasi"}
)
print(f"{'✅ Yaratildi' if created else '✓ Topildi'}: {clinic.name} ({clinic.id})")

# 2. Admin user va profil
print("\n👨‍⚕️ 2. ADMIN USER:")
admin, _ = User.objects.get_or_create(
    username="admin",
    defaults={"email": "admin@demo.com", "is_superuser": True, "is_staff": True}
)

from monitoring.models import UserProfile
profile, created = UserProfile.objects.get_or_create(
    user=admin,
    defaults={"clinic": clinic}
)
print(f"{'✅ Yaratildi' if created else '✓ Yangilandi'}: {admin.username} → {clinic.name}")

# 3. Bo'lim
print("\n🏥 3. BO'LIM:")
dept, created = Department.objects.get_or_create(
    id="reanimatsiya",
    defaults={"name": "Reanimatsiya", "clinic": clinic}
)
print(f"{'✅ Yaratildi' if created else '✓ Topildi'}: {dept.name} ({dept.id})")

# 4. Xona
print("\n🚪 4. XONA:")
room, created = Room.objects.get_or_create(
    id="reanimatsiya_palata_1",
    defaults={"name": "Palata 1", "department": dept}
)
print(f"{'✅ Yaratildi' if created else '✓ Topildi'}: {room.name} ({room.id})")

# 5. Karavot
print("\n🛏️ 5. KARAVOT:")
bed, created = Bed.objects.get_or_create(
    id="reanimatsiya_palata_1_bed_1",
    defaults={"name": "Karavot 1", "room": room}
)
print(f"{'✅ Yaratildi' if created else '✓ Topildi'}: {bed.name} ({bed.id})")

# 6. Bemor
print("\n👤 6. BEMOR:")
patient_data = {
    "name": "Testova Test Testovna",
    "diagnosis": "Test tashxis",
    "doctor": "Dr. Test",
    "assigned_nurse": "Nurse Test",
    "admission_date": int(__import__('time').time() * 1000),
    "hr": 72,
    "spo2": 98,
    "nibp_sys": 120,
    "nibp_dia": 80,
    "rr": 16,
    "temp": 36.6,
    "alarm_level": "none",
    "news2_score": 0,
}

patient, created = Patient.objects.update_or_create(
    id="test_patient_1",
    defaults={**patient_data, "bed": bed}
)
print(f"{'✅ Yaratildi' if created else '✓ Yangilandi'}: {patient.name}")

# 7. Qurilma
print("\n🔌 7. QURILMA:")
device, created = MonitorDevice.objects.update_or_create(
    id=f"test_device_{int(__import__('time').time())}",
    defaults={
        "clinic": clinic,
        "ip_address": "192.168.155.100",
        "hl7_peer_ip": "192.168.155.100",
        "server_target_ip": "192.168.155.61",
        "hl7_enabled": True,
        "hl7_port": 6006,
        "hl7_connect_handshake": False,
        "status": "online",
        "model": "Test Device",
        "bed": bed,
    }
)
print(f"{'✅ Yaratildi' if created else '✓ Yangilandi'}: {device.id}")

# 8. Jami statistika
print("\n" + "=" * 70)
print("JAMI STATISTIKA:")
print(f"  📊 Klinikalar: {Clinic.objects.count()} ta")
print(f"  🏥 Bo'limlar: {Department.objects.count()} ta")
print(f"  🚪 Xonalar: {Room.objects.count()} ta")
print(f"  🛏️ Karavotlar: {Bed.objects.count()} ta")
print(f"  👤 Bemorlar: {Patient.objects.count()} ta")
print(f"  🔌 Qurilmalar: {MonitorDevice.objects.count()} ta")
print("=" * 70)

print("\n✅ HAMMA NARSA TAYYOR!")
print(f"\nPlatformani oching: https://clinicmonitoring.ziyrak.org")
print(f"Login: admin / (parol)")
