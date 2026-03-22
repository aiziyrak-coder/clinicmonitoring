"""
Barcha monitoring ma'lumotlarini o‘chirish (mahalliy testdan keyin tozalash uchun).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from monitoring.broadcast import broadcast_event
from monitoring.models import (
    Clinic,
    Bed,
    ClinicalNote,
    Department,
    LabResult,
    Medication,
    MonitorDevice,
    Patient,
    Room,
    VitalHistoryEntry,
)
from monitoring.serializers import serialize_all_patients


class Command(BaseCommand):
    help = "Bemorlar, infratuzilma (bo‘lim, xona, joy, qurilma) va bog‘liq yozuvlarni to‘liq o‘chiradi"

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-broadcast",
            action="store_true",
            help="WebSocket orqali bo‘sh ro‘yxat yubormaslik",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        VitalHistoryEntry.objects.all().delete()
        ClinicalNote.objects.all().delete()
        LabResult.objects.all().delete()
        Medication.objects.all().delete()
        Patient.objects.all().delete()
        MonitorDevice.objects.all().delete()
        Bed.objects.all().delete()
        Room.objects.all().delete()
        Department.objects.all().delete()

        self.stdout.write(self.style.SUCCESS("Monitoring ma'lumotlari tozalandi (jadvallar bo'sh)."))

        if not options["no_broadcast"]:
            for c in Clinic.objects.all():
                broadcast_event(
                    {"type": "initial_state", "patients": serialize_all_patients(c.id)},
                    c.id,
                )
            self.stdout.write("Ulangan WebSocket mijozlarga bo'sh holat yuborildi.")
