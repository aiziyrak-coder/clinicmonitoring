from django.contrib.auth.models import User
from django.db import models


class Clinic(models.Model):
    """Har bir klinika — bemorlar, joylar va qurilmalar shu yerda ajratiladi."""

    id = models.SlugField(primary_key=True, max_length=64)
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class UserProfile(models.Model):
    """Klinika foydalanuvchisi — Django User bilan bog‘langan."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="monitoring_profile",
    )
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="staff_users",
    )

    class Meta:
        verbose_name = "Monitoring foydalanuvchi profili"
        verbose_name_plural = "Monitoring foydalanuvchi profillari"

    def __str__(self) -> str:
        return f"{self.user.username} @ {self.clinic_id}"


class Department(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    name = models.CharField(max_length=255)
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="departments",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Room(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.department.name} / {self.name}"


class Bed(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="beds")
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["name"]


class MonitorDevice(models.Model):
    class Status(models.TextChoices):
        ONLINE = "online", "Online"
        OFFLINE = "offline", "Offline"

    id = models.CharField(max_length=64, primary_key=True)
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="devices",
        help_text="Qurilma qaysi klinikaga tegishli (HL7 va ro'yxat filtri).",
    )
    # Qurilmaning tarmoq manzili (HL7/TCP ulanishni tanib olish uchun)
    ip_address = models.GenericIPAddressField()
    mac_address = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=255, blank=True, default="")
    # Ba'zi qurilmalar alohida "lokal IP" maydonini yuboradi — ixtiyoriy dublikat identifikator
    local_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="Qurilma ekranidagi lokal IP (tanish uchun)",
    )
    hl7_enabled = models.BooleanField(default=True)
    hl7_port = models.PositiveIntegerField(
        default=6006,
        help_text="Serverda HL7 MLLP tinglash porti (qurilmada ko'rsatilgan port bilan mos)",
    )
    server_target_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="Qurilmada 'Server IP' sifatida kiritilgan manzil (ma'lumot)",
    )
    # NAT / internet orqali ulanishda TCP manbasi odatda lokal 192.168.x.x emas — server ko'radigan IP
    hl7_peer_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="Ixtiyoriy: server HL7 ulanishida ko'radigan manzil (NAT bo'lsa shu yerda). Bo'sh bo'lsa ip_address/local_ip ishlatiladi.",
    )
    subnet_mask = models.CharField(max_length=32, blank=True, default="")
    gateway = models.CharField(max_length=64, blank=True, default="")
    bed = models.ForeignKey(Bed, null=True, blank=True, on_delete=models.SET_NULL, related_name="devices")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OFFLINE)
    last_seen = models.BigIntegerField(null=True, blank=True, help_text="Unix ms")
    last_hl7_rx_at_ms = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="HL7 paket (MSH+) qabul qilingan vaqt (Unix ms). Faqat haqiqiy HL7 ma'lumot.",
    )
    hl7_connect_handshake = models.BooleanField(
        null=True,
        blank=True,
        help_text="None: HL7_SEND_CONNECT_HANDSHAKE muhiti; True: ulanishda MLLP salom (ba'zi K12); False: yubormaslik.",
    )

    class Meta:
        ordering = ["model"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinic", "ip_address"],
                name="monitor_device_clinic_ip_uniq",
            ),
        ]


class Patient(models.Model):
    class AlarmLevel(models.TextChoices):
        NONE = "none", "None"
        BLUE = "blue", "Blue"
        YELLOW = "yellow", "Yellow"
        RED = "red", "Red"
        PURPLE = "purple", "Purple"

    id = models.CharField(max_length=64, primary_key=True)
    name = models.CharField(max_length=255)
    room = models.CharField(max_length=255, help_text="Ko‘rsatma matni (xona nomi)")
    diagnosis = models.TextField(blank=True)
    doctor = models.CharField(max_length=255, blank=True)
    assigned_nurse = models.CharField(max_length=255, blank=True)
    device_battery = models.FloatField(default=100.0)
    admission_date = models.BigIntegerField(help_text="Unix ms")

    hr = models.IntegerField(default=0)
    spo2 = models.IntegerField(default=0)
    nibp_sys = models.IntegerField(default=0)
    nibp_dia = models.IntegerField(default=0)
    rr = models.IntegerField(default=0)
    temp = models.FloatField(default=36.6)
    nibp_time = models.BigIntegerField(null=True, blank=True)

    alarm_level = models.CharField(max_length=16, choices=AlarmLevel.choices, default=AlarmLevel.NONE)
    alarm_message = models.TextField(blank=True)
    alarm_patient_id = models.CharField(max_length=64, blank=True)

    alarm_limits = models.JSONField(default=dict)
    news2_score = models.IntegerField(default=0)
    is_pinned = models.BooleanField(default=False)

    scheduled_interval_ms = models.IntegerField(null=True, blank=True)
    scheduled_next_check = models.BigIntegerField(null=True, blank=True)

    ai_risk = models.JSONField(null=True, blank=True)

    clinic = models.ForeignKey(
        Clinic, on_delete=models.CASCADE, related_name="patients", null=True, blank=True
    )
    bed = models.ForeignKey(Bed, null=True, blank=True, on_delete=models.SET_NULL, related_name="patients")

    class Meta:
        ordering = ["id"]


class Medication(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="medications")
    external_id = models.CharField(max_length=64)
    name = models.CharField(max_length=255)
    dose = models.CharField(max_length=255, blank=True)
    rate = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["name"]


class LabResult(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="labs")
    external_id = models.CharField(max_length=64)
    name = models.CharField(max_length=255)
    value = models.CharField(max_length=255)
    unit = models.CharField(max_length=64, blank=True)
    time = models.BigIntegerField()
    is_abnormal = models.BooleanField(default=False)


class ClinicalNote(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="notes")
    external_id = models.CharField(max_length=64)
    text = models.TextField()
    author = models.CharField(max_length=255)
    time = models.BigIntegerField()


class VitalHistoryEntry(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="history_entries")
    timestamp = models.BigIntegerField(db_index=True)
    hr = models.FloatField()
    spo2 = models.FloatField()
    nibp_sys = models.FloatField()
    nibp_dia = models.FloatField()

    class Meta:
        ordering = ["timestamp"]


class ClinicalAuditLog(models.Model):
    ACTION_CHOICES = [
        ("ADMIT", "Patient Admitted"),
        ("DISCHARGE", "Patient Discharged"),
        ("VITAL_CHANGE", "Vital Thresholds Changed"),
        ("DEVICE_LINK", "Device Linked/Unlinked"),
        ("SECURITY", "Security Event"),
    ]

    timestamp = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True
    )
    action = models.CharField(max_length=32, choices=ACTION_CHOICES)
    patient = models.ForeignKey(
        Patient, on_delete=models.SET_NULL, null=True, blank=True
    )
    details = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-timestamp"]
