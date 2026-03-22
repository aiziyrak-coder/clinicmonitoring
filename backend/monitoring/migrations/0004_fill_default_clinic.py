# Generated manually — mavjud ma'lumotlarni default klinikaga bog'lash

import django.db.models.deletion
from django.db import migrations, models


def forwards(apps, schema_editor):
    Clinic = apps.get_model("monitoring", "Clinic")
    Department = apps.get_model("monitoring", "Department")
    MonitorDevice = apps.get_model("monitoring", "MonitorDevice")
    Bed = apps.get_model("monitoring", "Bed")

    Clinic.objects.get_or_create(
        id="fjsti",
        defaults={"name": "Farg'ona Jamoat Salomatligi Tibbiyot Instituti"},
    )
    Department.objects.filter(clinic__isnull=True).update(clinic_id="fjsti")

    for dev in MonitorDevice.objects.filter(clinic__isnull=True):
        cid = "fjsti"
        if dev.bed_id:
            try:
                bed = Bed.objects.get(pk=dev.bed_id)
                room = bed.room
                if room:
                    dept = room.department
                    if dept and dept.clinic_id:
                        cid = dept.clinic_id
            except Exception:
                pass
        dev.clinic_id = cid
        dev.save(update_fields=["clinic_id"])


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("monitoring", "0003_clinic_multitenant"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
        migrations.AlterField(
            model_name="department",
            name="clinic",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="departments",
                to="monitoring.clinic",
            ),
        ),
        migrations.AlterField(
            model_name="monitordevice",
            name="clinic",
            field=models.ForeignKey(
                help_text="Qurilma qaysi klinikaga tegishli (HL7 va ro'yxat filtri).",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="devices",
                to="monitoring.clinic",
            ),
        ),
    ]
