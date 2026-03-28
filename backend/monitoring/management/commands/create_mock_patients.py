"""
5 ta bemor uchun real mock ma'lumotlar yaratish.
Klinikada test qilish uchun - haqiqiy monitor kabi vital ko'rsatkichlar bilan.

Ishlatish:
    python manage.py create_mock_patients
"""
from django.core.management.base import BaseCommand
from django.db import transaction
import time
from monitoring.models import Clinic, Department, Room, Bed, Patient, MonitorDevice


class Command(BaseCommand):
    help = "5 ta bemor uchun real mock ma'lumotlar yaratish"

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=== Mock bemorlarni yaratish boshlandi ===\n"))
        
        # 1. Klinika yaratish (agar yo'q bo'lsa)
        clinic, created = Clinic.objects.get_or_create(
            id="demo_clinic",
            defaults={"name": "Demo Klinikasi"}
        )
        msg_created = '🆕 Yaratildi' if created else '✓ Topildi'
        self.stdout.write(self.style.SUCCESS(f"{msg_created}: Klinika - {clinic.name} ({clinic.id})"))
        
        # 2. Admin user va profil
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        admin_user, admin_created = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@demo.com",
                "is_superuser": True,
                "is_staff": True
            }
        )
        
        from monitoring.models import UserProfile
        user_profile, profile_created = UserProfile.objects.get_or_create(
            user=admin_user,
            defaults={"clinic": clinic}
        )
        
        msg_admin = '✅ Yaratildi' if admin_created else '✓ Topildi'
        self.stdout.write(self.style.SUCCESS(f"{msg_admin}: Admin user - {admin_user.username}"))
        
        msg_profile = '✅ Bog\'landi' if profile_created else '✓ Yangilandi'
        self.stdout.write(self.style.SUCCESS(f"{msg_profile}: Profil → {clinic.name}"))
        self.stdout.write("")
        
        # 2. Bo'lim yaratish
        department, _ = Department.objects.get_or_create(
            id="reanimatsiya",
            defaults={
                "name": "Reanimatsiya Bo'limi",
                "clinic": clinic
            }
        )
        self.stdout.write(f"✓ Bo'lim: {department.name}")
        
        # 3. Xonalar va karavotlar yaratish
        rooms_data = [
            ("Palata 101", ["Karavot 1", "Karavot 2"]),
            ("Palata 102", ["Karavot 1", "Karavot 2"]),
            ("Palata 103", ["Karavot 1"]),
        ]
        
        beds = []
        for room_name, bed_names in rooms_data:
            room, _ = Room.objects.get_or_create(
                id=f"{room_name.lower().replace(' ', '_')}",
                defaults={
                    "name": room_name,
                    "department": department
                }
            )
            for bed_name in bed_names:
                bed, _ = Bed.objects.get_or_create(
                    id=f"{bed_name.lower().replace(' ', '_')}_{room_name.lower().replace(' ', '_')}",
                    defaults={
                        "name": bed_name,
                        "room": room
                    }
                )
                beds.append(bed)
        
        self.stdout.write(f"✓ {len(beds)} ta karavot yaratildi")
        
        # 4. 5 ta bemor ma'lumotlari
        # 1 ta SARIQ (YELLOW) + 4 ta YASHIL (NONE) - haqiqiy klinik holatlar
        patients_data = [
            {
                "name": "Иванова Мария Петровна",
                "age": 54,
                "diagnosis": "Сахарный диабет 2 типа - Гипергликемия",
                "doctor": "Др. Каримов Б.",
                "nurse": "Азизова М.",
                "vitals": {"hr": 92, "spo2": 97, "nibp_sys": 135, "nibp_dia": 85, "rr": 18, "temp": 36.8},
                "alarm": "YELLOW",  # 🟡 SARIQ - 1 ta
                "bed_index": 0
            },
            {
                "name": "Смирнов Алексей Владимирович",
                "age": 45,
                "diagnosis": "Послеоперационный период - Стабильное состояние",
                "doctor": "Др. Назаров Ф.",
                "nurse": "Курбонова Д.",
                "vitals": {"hr": 76, "spo2": 98, "nibp_sys": 125, "nibp_dia": 80, "rr": 16, "temp": 37.0},
                "alarm": "NONE",  # 🟢 YASHIL - 1 ta
                "bed_index": 1
            },
            {
                "name": "Ахмедова Зебинисо Акрамовна",
                "age": 38,
                "diagnosis": "Беременность 32 недели - Наблюдение",
                "doctor": "Др. Умарова Ш.",
                "nurse": "Мирзаева Г.",
                "vitals": {"hr": 82, "spo2": 99, "nibp_sys": 120, "nibp_dia": 80, "rr": 20, "temp": 36.6},
                "alarm": "NONE",  # 🟢 YASHIL - 2 ta
                "bed_index": 2
            },
            {
                "name": "Каримов Абдулла Саттарович",
                "age": 72,
                "diagnosis": "Реабилитация после инсульта - Улучшение",
                "doctor": "Др. Саидов К.",
                "nurse": "Юсупова З.",
                "vitals": {"hr": 78, "spo2": 98, "nibp_sys": 130, "nibp_dia": 85, "rr": 16, "temp": 36.7},
                "alarm": "NONE",  # 🟢 YASHIL - 3 ta
                "bed_index": 3
            },
            {
                "name": "Алиев Валий Алиевич",
                "age": 67,
                "diagnosis": "Гипертония I степень - Контроль",
                "doctor": "Др. Рахимов А.",
                "nurse": "Хамидова Н.",
                "vitals": {"hr": 72, "spo2": 99, "nibp_sys": 128, "nibp_dia": 82, "rr": 16, "temp": 36.6},
                "alarm": "NONE",  # 🟢 YASHIL - 4 ta
                "bed_index": 4
            }
        ]
        
        now_ms = int(time.time() * 1000)
        
        # 5. Bemorlarni yaratish
        for i, data in enumerate(patients_data):
            bed = beds[data["bed_index"]] if data["bed_index"] < len(beds) else beds[0]
            
            patient_id = f"patient_{i+1}"
            
            # Agar allaqachon bo'lsa yangilash
            patient, created = Patient.objects.update_or_create(
                id=patient_id,
                defaults={
                    "name": data["name"],
                    "age": data["age"],
                    "room": bed.room.name,
                    "diagnosis": data["diagnosis"],
                    "doctor": data["doctor"],
                    "assigned_nurse": data["nurse"],
                    "admission_date": now_ms - (i * 86400000),  # Har biri bir kun oldin
                    "bed": bed,
                    # Vital ko'rsatkichlar
                    "hr": data["vitals"]["hr"],
                    "spo2": data["vitals"]["spo2"],
                    "nibp_sys": data["vitals"]["nibp_sys"],
                    "nibp_dia": data["vitals"]["nibp_dia"],
                    "rr": data["vitals"]["rr"],
                    "temp": data["vitals"]["temp"],
                    "nibp_time": now_ms,
                    # Alarm
                    "alarm_level": data["alarm"],
                    "alarm_message": self._get_alarm_message(data["alarm"]),
                    # NEWS2 score
                    "news2_score": self._calculate_news2(data["vitals"]),
                    # Boshqa
                    "device_battery": 100.0 - (i * 5),
                    "is_pinned": data["alarm"] == "YELLOW"  # Faqat sariq alarmni pin qilamiz
                }
            )
            
            # Qurilma yaratish
            device_ip = f"192.168.155.{57 + i + 1}"
            device, _ = MonitorDevice.objects.update_or_create(
                id=f"device_{i+1}",
                defaults={
                    "clinic": clinic,
                    "ip_address": device_ip,
                    "hl7_peer_ip": device_ip,
                    "server_target_ip": "192.168.155.61",
                    "hl7_enabled": True,
                    "hl7_port": 6006,
                    "bed": bed,
                    "status": MonitorDevice.Status.ONLINE,
                    "model": "Philips IntelliVue MP5",
                    "last_hl7_rx_at_ms": now_ms
                }
            )
            
            status_icon = "🆕" if created else "🔄"
            self.stdout.write(
                self.style.SUCCESS(
                    f"{status_icon} {patient.name} ({patient.age} yosh)\n"
                    f"   📋 Tashxis: {patient.diagnosis}\n"
                    f"   👨‍⚕️ Shifokor: {patient.doctor}\n"
                    f"   💉 Hamshira: {patient.assigned_nurse}\n"
                    f"   🛏️ Joy: {bed.room.name} - {bed.name}\n"
                    f"   ❤️ HR: {patient.hr} | 💨 SpO2: {patient.spo2}% | 🩸 BP: {patient.nibp_sys}/{patient.nibp_dia}\n"
                    f"   🌡️ Temp: {patient.temp}°C | RR: {patient.rr}\n"
                    f"   ⚠️ Alarm: {patient.alarm_level} | NEWS2: {patient.news2_score}\n"
                    f"   🔌 Qurilma: {device_ip} (Online)"
                )
            )
        
        self.stdout.write(self.style.SUCCESS("\n=== 5 ta bemor muvaffaqiyatli yaratildi! ==="))
        self.stdout.write(self.style.SUCCESS("Dashboard: https://clinicmonitoring.ziyrak.org"))
    
    def _get_alarm_message(self, alarm_level):
        messages = {
            "YELLOW": "⚠️ Ehtiyotkorlik talab etiladi - Qon bosimi yuqori",
            "NONE": ""
        }
        return messages.get(alarm_level, "")
    
    def _calculate_news2(self, vitals):
        """NEWS2 score hisoblash (soddalashtirilgan)"""
        score = 0
        
        # HR
        hr = vitals["hr"]
        if hr < 40 or hr > 130: score += 3
        elif hr < 50 or hr > 110: score += 2
        elif hr < 55 or hr > 100: score += 1
        
        # SpO2
        spo2 = vitals["spo2"]
        if spo2 < 85: score += 3
        elif spo2 < 88: score += 2
        elif spo2 < 92: score += 1
        
        # BP
        sys = vitals["nibp_sys"]
        if sys < 80 or sys > 200: score += 3
        elif sys < 90 or sys > 180: score += 2
        elif sys < 100 or sys > 160: score += 1
        
        # Temp
        temp = vitals["temp"]
        if temp < 35.0 or temp > 39.0: score += 2
        elif temp < 36.0 or temp > 38.0: score += 1
        
        # RR
        rr = vitals["rr"]
        if rr < 8 or rr > 25: score += 3
        elif rr < 10 or rr > 22: score += 2
        elif rr < 12 or rr > 20: score += 1
        
        return min(score, 15)  # Max 15
