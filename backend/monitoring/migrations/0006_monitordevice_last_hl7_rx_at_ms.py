from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("monitoring", "0005_monitordevice_hl7_peer_ip"),
    ]

    operations = [
        migrations.AddField(
            model_name="monitordevice",
            name="last_hl7_rx_at_ms",
            field=models.BigIntegerField(
                blank=True,
                help_text="HL7 paket (MSH+) serverda qabul qilingan vaqt (Unix ms). TCP ulanishi emas.",
                null=True,
            ),
        ),
    ]
