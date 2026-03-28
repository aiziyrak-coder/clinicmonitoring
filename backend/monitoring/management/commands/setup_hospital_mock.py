from django.core.management.base import BaseCommand
from django.db import transaction
from monitoring.models import Clinic, Department, Room, Bed, Patient, MonitorDevice, VitalHistoryEntry
import time
import random

class Command(BaseCommand):
    help = "Sets up 10 realistic mock patients with historical data for MediCentral audit."

    @transaction.atomic
    def handle(self, *args, **options):
        # 1. Clinic
        clinic, _ = Clinic.objects.get_or_create(
            id="central_hospital",
            defaults={"name": "MediCentral Bosh Kasalxonasi"}
        )

        # 2. Departments
        depts = [
            ("icu", "Reanimatsiya bo'limi (ICU)"),
            ("cardio", "Kardiologiya bo'limi"),
            ("neuro", "Nevrologiya bo'limi")
        ]
        dept_objs = []
        for d_id, d_name in depts:
            d, _ = Department.objects.get_or_create(id=d_id, defaults={"name": d_name, "clinic": clinic})
            dept_objs.append(d)

        # 3. Rooms & Beds & Patients
        patient_data = [
            ("p101", "Jasur Ahmedov", "icu", "O'tkir miokard infarkti", "Dr. Alimov"),
            ("p102", "Gulnora Karimboyeva", "icu", "Pnevmoniya, o'tkir nafas yetishmovchiligi", "Dr. Alimov"),
            ("p103", "Anvar Sobirov", "cardio", "Gipertoniya, 3-daraja", "Dr. Karimov"),
            ("p104", "Dilobar Olimova", "cardio", "Surunkali yurak yetishmovchiligi", "Dr. Karimov"),
            ("p105", "Rustam Qosimov", "neuro", "Bosh miya jarohati", "Dr. Rahmonova"),
            ("p106", "Zulayho Hakimova", "neuro", "Insultdan keyingi holat", "Dr. Rahmonova"),
            ("p107", "Bobur Mirzo", "icu", "Postoperatsion monitoring", "Dr. Alimov"),
            ("p108", "Nilufar G'aniyeva", "cardio", "Aritmiya", "Dr. Karimov"),
            ("p109", "Sardor Azimov", "icu", "Septik shok", "Dr. Alimov"),
            ("p110", "Malika Ergasheva", "neuro", "Meningit", "Dr. Rahmonova"),
        ]

        now_ms = int(time.time() * 1000)

        for i, (p_id, p_name, d_id, diag, doc) in enumerate(patient_data):
            dept = [d for d in dept_objs if d.id == d_id][0]
            room_name = f"Palata {100 + (i // 2) + 1}"
            room, _ = Room.objects.get_or_create(
                id=f"room_{100 + (i // 2) + 1}",
                defaults={"department": dept, "name": room_name}
            )
            
            bed_name = f"Karavat {i % 2 + 1}"
            bed, _ = Bed.objects.get_or_create(
                id=f"bed_{i + 1}",
                defaults={"room": room, "name": bed_name}
            )

            # Create Patient
            p, created = Patient.objects.update_or_create(
                id=p_id,
                defaults={
                    "name": p_name,
                    "room": f"{room_name} / {bed_name}",
                    "diagnosis": diag,
                    "doctor": doc,
                    "assigned_nurse": "Hamshira " + random.choice(["Lola", "Nigora", "Zulfiya"]),
                    "device_battery": random.uniform(20.0, 98.0),
                    "admission_date": now_ms - (random.randint(1, 10) * 86400000),
                    "bed": bed,
                    "clinic": clinic,
                    "hr": random.randint(60, 100),
                    "spo2": random.randint(94, 99),
                    "nibp_sys": random.randint(110, 140),
                    "nibp_dia": random.randint(70, 95),
                    "rr": random.randint(14, 22),
                    "temp": round(random.uniform(36.4, 37.2), 1),
                    "nibp_time": now_ms - 300000
                }
            )

            # Assign a device to each bed to make it look active
            MonitorDevice.objects.update_or_create(
                id=f"mock_dev_{i+1}",
                defaults={
                    "clinic": clinic,
                    "ip_address": f"192.168.1.{100 + i}",
                    "model": "MediCentral X-series",
                    "bed": bed,
                    "status": "online",
                    "hl7_enabled": True
                }
            )

            # Create some history entries (60 entries per patient)
            history_entries = []
            for j in range(60):
                ts = now_ms - (j * 30000) # 30s interval
                history_entries.append(VitalHistoryEntry(
                    patient=p,
                    timestamp=ts,
                    hr=float(p.hr + random.randint(-5, 5)),
                    spo2=float(p.spo2 + random.randint(-1, 1)),
                    nibp_sys=float(p.nibp_sys + random.randint(-5, 5)),
                    nibp_dia=float(p.nibp_dia + random.randint(-3, 3))
                ))
            VitalHistoryEntry.objects.filter(patient=p).delete()
            VitalHistoryEntry.objects.bulk_create(history_entries)

        self.stdout.write(self.style.SUCCESS("Successfully created 10 mock patients with real-world clinical data."))
