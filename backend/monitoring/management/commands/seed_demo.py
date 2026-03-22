"""
Minimal infratuzilma + bitta real HL7 monitor (demo bemor / tarix / mock yo'q).
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from monitoring.models import (
    Bed,
    ClinicalNote,
    Clinic,
    Department,
    LabResult,
    Medication,
    MonitorDevice,
    Patient,
    Room,
    VitalHistoryEntry,
)


def _real_hl7_monitor_kwargs(bed: Bed, clinic: Clinic) -> dict:
    """
    Creative Medical K12 — ekrandagi tarmoq (HL7, port 6006).
    Lokal IP — paket manbasi; server IP — HL7 qabul qiluvchi (MediCentral).
    """
    return {
        "id": "hl7_real",
        "clinic": clinic,
        "ip_address": "192.168.0.228",
        "mac_address": "02:03:06:02:A3:F0",
        "model": "Creative Medical K12",
        "local_ip": "192.168.0.228",
        "hl7_enabled": True,
        "hl7_port": 6006,
        "server_target_ip": "167.71.53.238",
        "subnet_mask": "255.255.255.0",
        "gateway": "192.168.0.1",
        "bed": bed,
        "status": MonitorDevice.Status.OFFLINE,
        "last_seen": None,
    }


class Command(BaseCommand):
    help = (
        "Minimal joy (1 bo'lim, 1 xona, 1 karavat) va bitta real monitor. "
        "Bemorlar va boshqa mock ma'lumotlar yaratilmaydi — faqat --force bilan qayta yoziladi."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Barcha monitoring yozuvlarini o'chirib, minimal tuzilma + real qurilmani qayta yaratish",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        force = options["force"]

        if not force:
            if MonitorDevice.objects.filter(pk="hl7_real").exists():
                self.stdout.write(
                    self.style.WARNING(
                        "Real monitor (hl7_real) allaqachon bor. "
                        "Tozalab qayta yuklash: python manage.py seed_demo --force"
                    )
                )
                return
            if Department.objects.exists():
                self.stdout.write(
                    self.style.ERROR(
                        "Bazada eski/demo qoldiqlar bo'lishi mumkin. "
                        "To'liq tozalash va faqat real qurilma: python manage.py seed_demo --force"
                    )
                )
                return

        if force:
            VitalHistoryEntry.objects.all().delete()
            ClinicalNote.objects.all().delete()
            LabResult.objects.all().delete()
            Medication.objects.all().delete()
            Patient.objects.all().delete()
            MonitorDevice.objects.all().delete()
            Bed.objects.all().delete()
            Room.objects.all().delete()
            Department.objects.all().delete()

        clinic, _ = Clinic.objects.get_or_create(
            id="fjsti",
            defaults={"name": "Farg'ona Jamoat Salomatligi Tibbiyot Instituti"},
        )
        d1 = Department.objects.create(id="d1", name="Asosiy bo'lim", clinic=clinic)
        r1 = Room.objects.create(id="r1", department=d1, name="Palata 1")
        b1 = Bed.objects.create(id="b1", room=r1, name="Karavat 1")

        MonitorDevice.objects.create(**_real_hl7_monitor_kwargs(b1, clinic))

        self.stdout.write(
            self.style.SUCCESS(
                "Tayyor: 1 bo'lim, 1 xona, 1 karavat, 1 ta Creative Medical K12 (hl7_real). "
                "Bemorlarni o'zingiz qo'shasiz."
            )
        )
