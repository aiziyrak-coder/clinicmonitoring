#!/usr/bin/env python3
"""Serverda bemorlarni tekshirish va qo'shish"""

import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "medicentral.settings")
sys.path.insert(0, "/opt/clinicmonitoring/backend")
django.setup()

from monitoring.models import Clinic, Patient, Bed, Department, Room, MonitorDevice
from django.contrib.auth import get_user_model

User = get_user_model()

print("=" * 60)
print("BAZA TEKSHIRUVI")
print("=" * 60)

# Clinics
clinics = Clinic.objects.all()
print(f"\n📊 Klinikalar: {clinics.count()} ta")
for c in clinics:
    print(f"   - {c.id}: {c.name}")

# Patients
patients = Patient.objects.all()
print(f"\n👥 Bemorlar: {patients.count()} ta")
for p in patients[:5]:
    bed_name = p.bed.name if p.bed else "Yo'q"
    print(f"   - {p.name} ({p.age} yosh) - {bed_name}")

# Admin user
admins = User.objects.filter(is_superuser=True)
print(f"\n👨‍💼 Admin users: {admins.count()} ta")
for admin in admins:
    try:
        profile = admin.monitoring_profile
        print(f"   - {admin.username} → Clinic: {profile.clinic_id}")
    except Exception as e:
        print(f"   - {admin.username} → Profil yo'q: {e}")

print("\n" + "=" * 60)
