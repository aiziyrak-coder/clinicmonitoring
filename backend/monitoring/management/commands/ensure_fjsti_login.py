"""Boshlang'ich klinika foydalanuvchisi: FJSTI / admin123"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from monitoring.models import Clinic, UserProfile


class Command(BaseCommand):
    help = "Klinika 'fjsti' va foydalanuvchi FJSTI (parol admin123) — yangi o'rnatishda ishga tushiring."

    def handle(self, *args, **options):
        clinic, _ = Clinic.objects.get_or_create(
            id="fjsti",
            defaults={"name": "Farg'ona Jamoat Salomatligi Tibbiyot Instituti"},
        )
        user, created = User.objects.get_or_create(
            username="FJSTI",
            defaults={"is_staff": True, "is_superuser": True},
        )
        user.set_password("admin123")
        user.is_staff = True
        user.is_superuser = True
        user.save()
        UserProfile.objects.update_or_create(
            user=user,
            defaults={"clinic": clinic},
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Tayyor: login=FJSTI, parol=admin123, klinika=fjsti. "
                "Yangi klinikalar va foydalanuvchilar Django Admin orqali."
            )
        )
