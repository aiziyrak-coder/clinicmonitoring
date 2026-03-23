"""
Barcha monitoring yozuvlarini o'chirib, K12 (hl7_real) + karavat + bemorni noldan yaratadi.
"""
from __future__ import annotations

import os

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "clear_monitoring_data + setup_real_hl7_monitor — noldan toza K12 tuzilmasi "
        "(klinika qoladi, foydalanuvchilar qoladi)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-broadcast",
            action="store_true",
            help="clear_monitoring_data bilan bir xil — WS bo'sh holat yubormaslik",
        )
        parser.add_argument(
            "--no-setup",
            action="store_true",
            help="Faqat ma'lumotlarni o'chirish (K12 qayta yaratilmasin)",
        )

    def handle(self, *args, **options):
        call_command("clear_monitoring_data", no_broadcast=options["no_broadcast"])
        if options["no_setup"]:
            self.stdout.write(self.style.WARNING("Faqat tozalash — setup o'tkazilmadi."))
            return

        peer = os.environ.get("K12_PEER_IP", "188.113.206.112").strip()
        call_command(
            "setup_real_hl7_monitor",
            device_ip="192.168.0.228",
            peer_ip=peer,
            mac="02:03:06:02:A3:F0",
            server_ip="167.71.53.238",
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Tayyor: noldan K12 (hl7_real), karavat, bemor. Daphne ni qayta ishga tushiring."
            )
        )
