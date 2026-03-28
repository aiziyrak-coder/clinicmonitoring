#!/usr/bin/env bash
# Serverda bo'lim/xona/palata qo'shish testi

cd /opt/clinicmonitoring/backend
source .venv/bin/activate

python << 'EOF'
from monitoring.models import Clinic, Department, Room, Bed
from django.contrib.auth import get_user_model

User = get_user_model()

print("=" * 60)
print("BO'LIM/XONA/PALATA TEST")
print("=" * 60)

# Klinikani olish
try:
    clinic = Clinic.objects.get(id="demo_clinic")
    print(f"✅ Klinika: {clinic.name} ({clinic.id})")
except Clinic.DoesNotExist:
    print("❌ demo_clinic topilmadi!")
    clinic = Clinic.objects.first()
    if clinic:
        print(f"   Boshqa klinika: {clinic.name} ({clinic.id})")

# Bo'lim yaratish testi
print("\n📊 BO'LIM YARATISH:")
try:
    dept, created = Department.objects.get_or_create(
        id="test_dept",
        defaults={
            "name": "Test Bo'limi",
            "clinic": clinic
        }
    )
    if created:
        print(f"✅ Bo'lim yaratildi: {dept.name}")
    else:
        print(f"✓ Bo'lim allaqachon bor: {dept.name}")
except Exception as e:
    print(f"❌ XATO: {e}")

# Xona yaratish testi
print("\n🏥 XONA YARATISH:")
try:
    room, created = Room.objects.get_or_create(
        id="test_room",
        defaults={
            "name": "Test Xonasi",
            "department": dept
        }
    )
    if created:
        print(f"✅ Xona yaratildi: {room.name}")
    else:
        print(f"✓ Xona allaqachon bor: {room.name}")
except Exception as e:
    print(f"❌ XATO: {e}")

# Palata yaratish testi
print("\n🛏️ PALATA YARATISH:")
try:
    bed, created = Bed.objects.get_or_create(
        id="test_bed",
        defaults={
            "name": "Test Karavot",
            "room": room
        }
    )
    if created:
        print(f"✅ Palata yaratildi: {bed.name}")
    else:
        print(f"✓ Palata allaqachon bor: {bed.name}")
except Exception as e:
    print(f"❌ XATO: {e}")

# Jami obyektlar
print("\n" + "=" * 60)
print("JAMI OBYEKTLAR:")
print(f"  Bo'limlar: {Department.objects.count()} ta")
print(f"  Xonalar: {Room.objects.count()} ta")
print(f"  Palatalar: {Bed.objects.count()} ta")
print("=" * 60)
EOF
