import os

from django.apps import AppConfig


class MonitoringConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "monitoring"
    verbose_name = "Telemetriya monitoring"

    def ready(self):
        import sys

        argv = sys.argv
        argv_joined = " ".join(argv)
        if any(
            x in argv_joined
            for x in ("migrate", "makemigrations", "collectstatic", "test", "shell")
        ):
            return
        # manage.py buyruqlari (ensure_fjsti_login, seed_demo, ...) HL7 ni qayta ishga tushirmasin —
        # 6006 porti allaqachon Daphne jarayonida band bo'lishi mumkin.
        uses_manage = any(
            (a.endswith("manage.py") or a == "manage.py") for a in argv[:3]
        )
        if uses_manage and "runserver" not in argv:
            return
        # runserver: avto-qayta yuklovchi ota jarayonda ikki marta ishga tushmasin
        if "runserver" in argv and os.environ.get("RUN_MAIN") != "true":
            return
        try:
            from monitoring.hl7_listener import start_hl7_listener_thread
            from monitoring.simulation import start_simulation_thread

            # Fon vitallar simulyatsiyasi — odatda o'chiq (mock yo'q). Yoqish: MONITORING_SIMULATION_ENABLED=true
            _sim = os.environ.get("MONITORING_SIMULATION_ENABLED", "false").lower()
            if _sim in ("1", "true", "yes", "on"):
                start_simulation_thread()
            start_hl7_listener_thread()
        except Exception:
            # Migratsiya / DB tayyor bo‘lmaganda
            pass
