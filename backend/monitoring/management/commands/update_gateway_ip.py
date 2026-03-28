"""
Barcha HL7 qurilmalarga gateway IP manzilini o'rnatish.
Klinikadagi kompyuter (gateway) IP si barcha qurilmalarga server_target_ip sifatida yoziladi.

Ishlatish:
    python manage.py update_gateway_ip 192.168.155.61
"""
from django.core.management.base import BaseCommand
from django.db import models
from monitoring.models import MonitorDevice


class Command(BaseCommand):
    help = "Barcha HL7 qurilmalarga gateway IP manzilini o'rnatish"

    def add_arguments(self, parser):
        parser.add_argument(
            'gateway_ip',
            type=str,
            help='Klinikadagi gateway kompyuter IP manzili (masalan: 192.168.168.57)'
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Barcha qurilmalarni yangilash (default: faqat server_target_ip bo\'sh bo\'lganlar)',
        )

    def handle(self, *args, **options):
        gateway_ip = options['gateway_ip']
        update_all = options['all']
        
        self.stdout.write(self.style.SUCCESS(f'Gateway IP: {gateway_ip}'))
        
        # Qurilmalarni tanlash
        if update_all:
            devices = MonitorDevice.objects.filter(hl7_enabled=True)
            self.stdout.write(f"Barcha HL7 qurilmalar yangilanadi...")
        else:
            devices = MonitorDevice.objects.filter(
                hl7_enabled=True
            ).filter(
                models.Q(server_target_ip__isnull=True) | 
                models.Q(server_target_ip='')
            )
            self.stdout.write(f"Faqat server_target_ip bo'sh bo'lgan qurilmalar yangilanadi...")
        
        count = devices.count()
        self.stdout.write(f"Topilgan qurilmalar: {count}")
        
        updated = 0
        for device in devices:
            old_ip = device.server_target_ip
            device.server_target_ip = gateway_ip
            device.save(update_fields=['server_target_ip'])
            updated += 1
            self.stdout.write(
                f"  [{updated}/{count}] {device.id}: {old_ip or 'None'} -> {gateway_ip}"
            )
        
        self.stdout.write(self.style.SUCCESS(f'\nJami yangilandi: {updated} ta qurilma'))
        self.stdout.write(self.style.SUCCESS(f'Gateway IP: {gateway_ip}'))
