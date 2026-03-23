# HL7 yoqilgan qurilmalar: hl7_connect_handshake=None → True (K12 tavsiyasi — UI «Yoqish»)

from django.db import migrations


def null_handshake_to_true(apps, schema_editor):
    MonitorDevice = apps.get_model("monitoring", "MonitorDevice")
    MonitorDevice.objects.filter(
        hl7_enabled=True,
        hl7_connect_handshake__isnull=True,
    ).update(hl7_connect_handshake=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("monitoring", "0008_alter_monitordevice_hl7_connect_handshake_and_more"),
    ]

    operations = [
        migrations.RunPython(null_handshake_to_true, noop_reverse),
    ]
