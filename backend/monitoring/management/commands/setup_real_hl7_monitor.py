"""
Creative Medical K12 (yoki boshqa HL7 monitor) — bazada real qurilma + karavatdagi bemor.
Idempotent: qayta-qayta ishga tushirish xavfsiz (deploy skriptida chaqirish mumkin).

Ekrandagi tarmoq (lokal IP) va serverdagi TCP manbasi bir xil bo'lsa — `device_ip` yetarli.
NAT bo'lsa — server logida ko'rinadigan manzilni `--peer-ip` bilan bering yoki Admin da hl7_peer_ip.
"""
from __future__ import annotations

import time

from django.core.management.base import BaseCommand
from django.db import transaction

from monitoring.models import (
    Bed,
    Clinic,
    Department,
    MonitorDevice,
    Patient,
    Room,
)


DEFAULT_DEVICE_ID = "hl7_real"
DEFAULT_PATIENT_ID = "cm-k12-001"


class Command(BaseCommand):
    help = (
        "FJSTI klinikasi uchun Creative Medical K12 HL7 monitor va bitta haqiqiy bemorni "
        "bazaga yozadi (mock simulyatsiya yo'q — MONITORING_SIMULATION_ENABLED=false tavsiya)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--device-id",
            default=DEFAULT_DEVICE_ID,
            help="MonitorDevice primary key (default: hl7_real)",
        )
        parser.add_argument(
            "--patient-id",
            default=DEFAULT_PATIENT_ID,
            help="Patient primary key (default: cm-k12-001)",
        )
        parser.add_argument(
            "--patient-name",
            default="Bemor (K12 monitor)",
            help="Bemor F.I.Sh.",
        )
        parser.add_argument(
            "--device-ip",
            default="192.168.0.228",
            help="Qurilma lokal IP (HL7 manba sifatida server shu manzilni ko'rsa)",
        )
        parser.add_argument(
            "--peer-ip",
            default="",
            help="NAT bo'lsa: server HL7 logida ko'rinadigan tashqi manzil (bo'sh = ishlatilmaydi)",
        )
        parser.add_argument(
            "--mac",
            default="02:03:06:02:A3:F0",
            help="Qurilma MAC (ma'lumot)",
        )
        parser.add_argument(
            "--server-ip",
            default="167.71.53.238",
            help="Qurilmada 'Server IP' maydoni (ma'lumot)",
        )
        parser.add_argument(
            "--hl7-handshake",
            action="store_true",
            help="Ulanishda MLLP salom yuborish (ba'zi firmware; ko'pincha o'chiq — RST+0 bayt bo'lsa)",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        clinic, _ = Clinic.objects.get_or_create(
            id="fjsti",
            defaults={"name": "Farg'ona Jamoat Salomatligi Tibbiyot Instituti"},
        )
        dept, _ = Department.objects.get_or_create(
            id="cm_hl7_dept",
            defaults={"name": "HL7 monitoring (Creative K12)", "clinic": clinic},
        )
        if dept.clinic_id != clinic.id:
            dept.clinic = clinic
            dept.save(update_fields=["clinic"])

        room, _ = Room.objects.get_or_create(
            id="cm_hl7_room",
            defaults={"department": dept, "name": "Palata K12"},
        )
        if room.department_id != dept.id:
            room.department = dept
            room.save(update_fields=["department"])

        bed, _ = Bed.objects.get_or_create(
            id="cm_hl7_bed",
            defaults={"room": room, "name": "Karavat K12"},
        )
        if bed.room_id != room.id:
            bed.room = room
            bed.save(update_fields=["room"])

        device_id = options["device_id"]
        dev_ip = options["device_ip"].strip()
        peer_ip = options["peer_ip"].strip() or None
        mac = options["mac"].strip()

        defaults = {
            "clinic": clinic,
            "mac_address": mac,
            "model": "Creative Medical K12",
            "local_ip": dev_ip,
            "hl7_enabled": True,
            "hl7_port": 6006,
            "server_target_ip": options["server_ip"].strip() or None,
            "subnet_mask": "255.255.255.0",
            "gateway": "192.168.0.1",
            "bed": bed,
            "hl7_peer_ip": peer_ip,
        }

        device, created = MonitorDevice.objects.update_or_create(
            id=device_id,
            defaults={
                **defaults,
                "ip_address": dev_ip,
            },
        )
        # Eski xato: probe NAT tufayli hl7_peer_ip=127.0.0.1 — haqiqiy monitor emas
        if device.hl7_peer_ip in ("127.0.0.1", "::1"):
            device.hl7_peer_ip = None
            device.save(update_fields=["hl7_peer_ip"])
        device.hl7_connect_handshake = bool(options["hl7_handshake"])
        device.save(update_fields=["hl7_connect_handshake"])

        now_ms = int(time.time() * 1000)
        patient_id = options["patient_id"]
        pname = options["patient_name"].strip()

        Patient.objects.update_or_create(
            id=patient_id,
            defaults={
                "name": pname,
                "room": f"{bed.room.name} / {bed.name}",
                "diagnosis": "",
                "doctor": "",
                "assigned_nurse": "",
                "device_battery": 100.0,
                "admission_date": now_ms,
                "bed": bed,
                "hr": 0,
                "spo2": 0,
                "nibp_sys": 0,
                "nibp_dia": 0,
                "rr": 0,
                "temp": 36.6,
                "nibp_time": None,
            },
        )

        action = "yaratildi" if created else "yangilandi"
        self.stdout.write(
            self.style.SUCCESS(
                f"HL7 monitor {action}: id={device.id}, ip={device.ip_address}, "
                f"peer_ip={device.hl7_peer_ip or '—'}, bed={bed.id}. "
                f"Bemor: {patient_id} — {pname}. "
                f"Qurilmada Server {options['server_ip']}:6006, HL7 yoqilgan. "
                f"MLLP salom: {device.hl7_connect_handshake}. "
                f"NAT bo'lsa: --peer-ip <journaldagi peer IP>"
            )
        )
