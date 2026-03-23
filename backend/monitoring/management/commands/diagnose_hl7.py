"""
HL7 ulanish muammolarini to'liq diagnostika qilish.
Bu komanda barcha muammolarni aniqlab, yechim taklif qiladi.
"""
from __future__ import annotations

import socket
import time

from django.core.management.base import BaseCommand
from django.db import connection

from monitoring.hl7_listener import (
    get_hl7_diagnostic_summary,
    get_hl7_listener_status,
    is_hl7_listener_alive,
    probe_hl7_tcp_listening,
)
from monitoring.models import Bed, Clinic, MonitorDevice, Patient


class Command(BaseCommand):
    help = "HL7 ulanish muammolarini diagnostika qilish"

    def handle(self, *args, **options):
        self.stdout.write("=" * 60)
        self.stdout.write(self.style.NOTICE("HL7 DIAGNOSTIKA"))
        self.stdout.write("=" * 60)

        # 1. Database tekshiruvi
        self.stdout.write("\n1. MA'LUMOTLAR BAZASI:")
        try:
            connection.ensure_connection()
            self.stdout.write(self.style.SUCCESS("   ✓ Baza ulanishi OK"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"   ✗ Baza xatosi: {e}"))
            return

        # 2. Klinika tekshiruvi
        self.stdout.write("\n2. KLINIKA:")
        clinics = Clinic.objects.all()
        if not clinics:
            self.stdout.write(self.style.ERROR("   ✗ HECH QANDAY KLINIKA YO'Q!"))
            self.stdout.write("   → python manage.py setup_real_hl7_monitor")
        else:
            for c in clinics:
                self.stdout.write(self.style.SUCCESS(f"   ✓ {c.id}: {c.name}"))

        # 3. Qurilmalar tekshiruvi
        self.stdout.write("\n3. MONITORING QURILMALARI:")
        devices = MonitorDevice.objects.all()
        if not devices:
            self.stdout.write(self.style.ERROR("   ✗ HECH QANDAY QURILMA YO'Q!"))
            self.stdout.write("   → python manage.py setup_real_hl7_monitor")
        else:
            for d in devices:
                status = "✓" if d.hl7_enabled else "✗"
                bed_info = f"bed={d.bed_id}" if d.bed_id else "BED YO'Q!"
                self.stdout.write(
                    f"   {status} {d.id}: ip={d.ip_address}, local_ip={d.local_ip}, "
                    f"hl7_enabled={d.hl7_enabled}, {bed_info}"
                )
                if not d.bed_id:
                    self.stdout.write(
                        self.style.WARNING(f"      ⚠ Qurilmaga bed biriktirilmagan!")
                    )

        # 4. Bemorlar tekshiruvi
        self.stdout.write("\n4. BEMORLAR:")
        patients = Patient.objects.all()
        if not patients:
            self.stdout.write(self.style.ERROR("   ✗ HECH QANDAY BEMOR YO'Q!"))
            self.stdout.write("   → Admin panelda bemorni qabul qiling")
        else:
            for p in patients:
                bed_info = f"bed={p.bed_id}" if p.bed_id else "BED YO'Q!"
                self.stdout.write(f"   ✓ {p.id}: {p.name}, {bed_info}")
                if not p.bed_id:
                    self.stdout.write(
                        self.style.WARNING(f"      ⚠ Bemorga bed biriktirilmagan!")
                    )

        # 5. Bed → Device → Patient zanjiri
        self.stdout.write("\n5. ZANJIR TEKSHIRUVI (Bed → Device → Patient):")
        beds_with_patients = Bed.objects.filter(patients__isnull=False).distinct()
        for bed in beds_with_patients:
            patient = Patient.objects.filter(bed=bed).first()
            device = MonitorDevice.objects.filter(bed=bed).first()
            
            if patient and device:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"   ✓ {bed.id}: bemor={patient.name}, device={device.id}"
                    )
                )
            elif patient and not device:
                self.stdout.write(
                    self.style.ERROR(
                        f"   ✗ {bed.id}: bemor={patient.name}, device YO'Q!"
                    )
                )
            elif device and not patient:
                self.stdout.write(
                    self.style.ERROR(
                        f"   ✗ {bed.id}: device={device.id}, bemor YO'Q!"
                    )
                )

        # 6. HL7 Listener holati
        self.stdout.write("\n6. HL7 LISTENER HOLATI:")
        status = get_hl7_listener_status()
        self.stdout.write(f"   enabled: {status['enabled']}")
        self.stdout.write(f"   listenHost: {status['listenHost']}")
        self.stdout.write(f"   listenPort: {status['listenPort']}")
        self.stdout.write(f"   threadAlive: {status['threadAlive']}")
        self.stdout.write(f"   localPortAccepts: {status['localPortAcceptsConnections']}")
        
        if status['bindError']:
            self.stdout.write(self.style.ERROR(f"   ✗ bindError: {status['bindError']}"))

        if not status['threadAlive']:
            self.stdout.write(self.style.ERROR("   ✗ HL7 thread ISHLAMAYAPTI!"))
            self.stdout.write("   → Serverni qayta ishga tushiring (Daphne)")
        else:
            self.stdout.write(self.style.SUCCESS("   ✓ HL7 thread ishlayapti"))

        if not status['localPortAcceptsConnections']:
            self.stdout.write(self.style.ERROR("   ✗ Port 6006 ochiq emas!"))
            self.stdout.write("   → Firewall: sudo ufw allow 6006/tcp")
        else:
            self.stdout.write(self.style.SUCCESS("   ✓ Port 6006 ochiq"))

        # 7. Diagnostika ma'lumotlari
        self.stdout.write("\n7. HL7 DIAGNOSTIKA:")
        diag = get_hl7_diagnostic_summary()
        self.stdout.write(f"   lastPayloadAtMs: {diag['lastPayloadAtMs']}")
        self.stdout.write(f"   lastPayloadPeer: {diag['lastPayloadPeer']}")
        self.stdout.write(f"   tcpSessionsWithHl7Payload: {diag['tcpSessionsWithHl7Payload']}")
        self.stdout.write(f"   tcpSessionsWithoutHl7Payload: {diag['tcpSessionsWithoutHl7Payload']}")
        
        if diag['lastPayloadAtMs']:
            ago = (time.time() * 1000 - int(diag['lastPayloadAtMs'])) / 1000
            self.stdout.write(self.style.SUCCESS(f"   ✓ Oxirgi ma'lumot: {ago:.1f} soniya oldin"))
        else:
            self.stdout.write(self.style.ERROR("   ✗ HECH QANDAY MA'LUMOT KELMAGAN!"))

        # 8. Yechim takliflari
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.NOTICE("TEKSHIRISH BO'YICHA YECHIMLAR:"))
        self.stdout.write("=" * 60)
        
        self.stdout.write("""
1. Qurilmada (monitor) tekshiring:
   - Server IP: SIZNING_SERVER_IP manzili to'g'ri
   - Port: 6006
   - Protocol: HL7 (yoki MLLP)
   - Ekranda "Connected" yoki yashil indikator

2. Serverda firewall tekshiring:
   sudo ufw status verbose
   sudo ufw allow 6006/tcp
   sudo ufw reload

3. Cloud firewall (AWS/DigitalOcean):
   - Incoming TCP 6006 ochiq ekanligini tekshiring

4. Loglarni kuzatib boring:
   journalctl -u clinicmonitoring-daphne -f

5. Agar NAT bo'lsa (server 192.168.x.x ko'rmasa):
   - Qurilma IP (lokal) va server ko'radigan IP (tashqi) turlicha
   - Admin panelda device.hl7_peer_ip ni sozlang
   - Yoki HL7_NAT_SINGLE_DEVICE_FALLBACK=true (bitta qurilma uchun)

6. MLLP salom (handshake) muammosi bo'lsa:
   - Admin panelda device.hl7_connect_handshake ni o'zgartirib ko'ring
   - True/False qiymatlarini sinab ko'ring

7. To'liq qayta sozlash:
   python manage.py setup_real_hl7_monitor --peer-ip <SERVER_KORADIGAN_IP>
        """)
