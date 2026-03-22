# Generated manually — HL7 NAT manzili

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("monitoring", "0004_fill_default_clinic"),
    ]

    operations = [
        migrations.AddField(
            model_name="monitordevice",
            name="hl7_peer_ip",
            field=models.GenericIPAddressField(
                blank=True,
                help_text="Ixtiyoriy: server HL7 ulanishida ko'radigan manzil (NAT bo'lsa shu yerda). Bo'sh bo'lsa ip_address/local_ip ishlatiladi.",
                null=True,
            ),
        ),
    ]
