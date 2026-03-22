from django.db import migrations, models


def set_k12_handshake(apps, schema_editor):
    MonitorDevice = apps.get_model("monitoring", "MonitorDevice")
    MonitorDevice.objects.filter(id="hl7_real", hl7_connect_handshake__isnull=True).update(
        hl7_connect_handshake=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("monitoring", "0006_monitordevice_last_hl7_rx_at_ms"),
    ]

    operations = [
        migrations.AddField(
            model_name="monitordevice",
            name="hl7_connect_handshake",
            field=models.BooleanField(
                blank=True,
                help_text="None: HL7_SEND_CONNECT_HANDSHAKE muhiti; True/False: faqat shu qurilma uchun MLLP salom.",
                null=True,
            ),
        ),
        migrations.RunPython(set_k12_handshake, migrations.RunPython.noop),
    ]
