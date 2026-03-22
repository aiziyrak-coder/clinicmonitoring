"""
HL7 zanjiri audit — serverda (SSH) ishga tushiring:

  cd /opt/clinicmonitoring/backend && . .venv/bin/activate
  python manage.py hl7_audit
  python manage.py hl7_audit --send-local-oru
"""
from __future__ import annotations

import os
import socket
import time

from django.core.management.base import BaseCommand

from monitoring.hl7_listener import (
    get_hl7_diagnostic_summary,
    get_hl7_listener_status,
    get_hl7_listen_config,
)
from monitoring.models import MonitorDevice


class Command(BaseCommand):
    help = "HL7 tinglovchi, diagnostika va HL7 yoqilgan qurilmalar (audit)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--send-local-oru",
            action="store_true",
            help="127.0.0.1 ga minimal ORU^R01 (MLLP) yuborib qabul qilish zanjirini sinaydi",
        )

    def handle(self, *args, **options):
        host, port, en = get_hl7_listen_config()
        self.stdout.write(self.style.NOTICE("=== MediCentral HL7 audit ==="))
        self.stdout.write(f"HL7_LISTEN_ENABLED={en} host={host} port={port}")
        self.stdout.write(f"MONITORING_SIMULATION_ENABLED={os.environ.get('MONITORING_SIMULATION_ENABLED', '')}")
        self.stdout.write(f"HL7_SEND_CONNECT_HANDSHAKE={os.environ.get('HL7_SEND_CONNECT_HANDSHAKE', '')}")
        self.stdout.write(f"HL7_SEND_ACK={os.environ.get('HL7_SEND_ACK', '')}")
        self.stdout.write("")

        st = get_hl7_listener_status()
        self.stdout.write(self.style.NOTICE("--- Tinglovchi holati ---"))
        for k, v in st.items():
            self.stdout.write(f"  {k}: {v}")
        self.stdout.write("")

        diag = get_hl7_diagnostic_summary()
        self.stdout.write(self.style.NOTICE("--- Diagnostika (jarayon ichki) ---"))
        for k, v in diag.items():
            self.stdout.write(f"  {k}: {v}")
        self.stdout.write("")

        self.stdout.write(self.style.NOTICE("--- HL7 yoqilgan qurilmalar ---"))
        qs = MonitorDevice.objects.filter(hl7_enabled=True).order_by("id")
        if not qs.exists():
            self.stdout.write("  (yo'q)")
        for d in qs:
            self.stdout.write(
                f"  id={d.id} ip={d.ip_address} local={d.local_ip or '—'} "
                f"peer={d.hl7_peer_ip or '—'} bed={d.bed_id or '—'} "
                f"last_seen={d.last_seen} last_hl7_rx={d.last_hl7_rx_at_ms}"
            )
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "Eslatma: last_hl7_rx faqat server MSH+ paket qabul qilganda yangilanadi; "
                "TCP ulanishi emas. «last_seen» esa TCP/emlashdan ham bo'lishi mumkin."
            )
        )

        if options["send_local_oru"]:
            if not en:
                self.stdout.write(self.style.ERROR("HL7 o'chirilgan — sinov o'tkazilmadi."))
                return
            msg = (
                "MSH|^~\\&|AUDIT|_|_|_|"
                + time.strftime("%Y%m%d%H%M%S", time.gmtime())
                + "||ORU^R01|audit1|P|2.3\r"
                "PID|1||audit||Audit^Patient||19800101|M\r"
                "OBX|1|NM|8867-4^Heart Rate||72|bpm\r"
            )
            raw = b"\x0b" + msg.encode("utf-8") + b"\x1c\x0d"
            self.stdout.write(self.style.NOTICE(f"--- Sinov ORU yuborilmoqda 127.0.0.1:{port} ---"))
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(5.0)
                s.connect(("127.0.0.1", port))
                s.sendall(raw)
                ack = s.recv(16384)
                s.close()
                self.stdout.write(f"  Javob bayt: {len(ack)} (ACK kutilgan)")
                if ack:
                    self.stdout.write(f"  Dastlabki baytlar (hex): {ack[:64].hex()}")
            except OSError as exc:
                self.stdout.write(self.style.ERROR(f"  Xato: {exc}"))
        self.stdout.write(self.style.SUCCESS("Audit tugadi."))
