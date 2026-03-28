from __future__ import annotations

import time
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_ipv46_address
from rest_framework import serializers

from monitoring.models import Bed, Clinic, Department, MonitorDevice, Patient, Room


def patient_to_dict(p: Patient, include_history: bool = True) -> dict[str, Any]:
    meds = [
        {"id": m.external_id, "name": m.name, "dose": m.dose, "rate": m.rate or None}
        for m in p.medications.all()
    ]
    labs = [
        {
            "id": x.external_id,
            "name": x.name,
            "value": x.value,
            "unit": x.unit,
            "time": x.time,
            "isAbnormal": x.is_abnormal,
        }
        for x in p.labs.all()
    ]
    notes = [
        {"id": n.external_id, "text": n.text, "author": n.author, "time": n.time}
        for n in p.notes.all()
    ]
    history: list[dict[str, Any]] = []
    if include_history:
        entries = list(p.history_entries.order_by("-timestamp")[:60])
        entries.reverse()
        for h in entries:
            history.append(
                {
                    "timestamp": h.timestamp,
                    "hr": h.hr,
                    "spo2": h.spo2,
                    "nibpSys": h.nibp_sys,
                    "nibpDia": h.nibp_dia,
                }
            )

    sched = None
    if p.scheduled_interval_ms and p.scheduled_next_check:
        sched = {
            "intervalMs": p.scheduled_interval_ms,
            "nextCheckTime": p.scheduled_next_check,
        }

    return {
        "id": p.id,
        "name": p.name,
        "room": p.room,
        "diagnosis": p.diagnosis,
        "doctor": p.doctor,
        "assignedNurse": p.assigned_nurse,
        "deviceBattery": p.device_battery,
        "admissionDate": p.admission_date,
        "vitals": {
            "hr": p.hr,
            "spo2": p.spo2,
            "nibpSys": p.nibp_sys,
            "nibpDia": p.nibp_dia,
            "rr": p.rr,
            "temp": p.temp,
            "nibpTime": p.nibp_time,
        },
        "alarm": {
            "level": p.alarm_level,
            "message": p.alarm_message or None,
            "patientId": p.alarm_patient_id or None,
        },
        "alarmLimits": p.alarm_limits or {},
        "scheduledCheck": sched,
        "aiRisk": p.ai_risk,
        "history": history,
        "news2Score": p.news2_score,
        "isPinned": p.is_pinned,
        "medications": meds,
        "labs": labs,
        "notes": notes,
    }


def serialize_all_patients(clinic_id: str | None = None) -> list[dict[str, Any]]:
    qs = Patient.objects.all()
    if clinic_id:
        qs = qs.filter(bed__room__department__clinic_id=clinic_id)
    return [
        patient_to_dict(p)
        for p in qs.prefetch_related(
            "medications", "labs", "notes", "history_entries"
        )
    ]


class DepartmentSerializer(serializers.ModelSerializer):
    clinicId = serializers.CharField(source="clinic.id", read_only=True)

    class Meta:
        model = Department
        fields = ["id", "name", "clinicId"]
        extra_kwargs = {"id": {"required": False}}

    def create(self, validated_data):
        # Klinikani avto aniqlash - context orqali
        clinic = self.context.get("clinic")
        if not clinic:
            req = self.context.get("request")
            if req and hasattr(req, 'user') and req.user.is_authenticated:
                # Agar superuser bo'lsa, birinchi klinikani olamiz
                if req.user.is_superuser:
                    clinic = Clinic.objects.first()
                else:
                    # Oddiy user uchun uning klinikasini olamiz
                    from monitoring.clinic_scope import get_clinic_for_user
                    clinic = get_clinic_for_user(req.user)
        
        if clinic:
            validated_data["clinic"] = clinic
        else:
            raise serializers.ValidationError({"clinicId": "Klinika topilmadi"})
        
        # ID generatsiya qilish (agar yo'q bo'lsa)
        if "id" not in validated_data:
            import uuid
            validated_data["id"] = str(uuid.uuid4())[:8]
        
        return super().create(validated_data)


class RoomSerializer(serializers.ModelSerializer):
    departmentId = serializers.CharField(source="department.id", read_only=True)

    class Meta:
        model = Room
        fields = ["id", "name", "departmentId"]
        extra_kwargs = {"id": {"required": False}}
    
    def create(self, validated_data):
        # Department ni olish (frontend departmentId yuboradi)
        request = self.context.get('request')
        if request and hasattr(request, 'data'):
            dept_id = request.data.get('departmentId') or request.data.get('department_id')
            if dept_id:
                from monitoring.models import Department
                try:
                    department = Department.objects.get(id=dept_id)
                    validated_data['department'] = department
                except Department.DoesNotExist:
                    raise serializers.ValidationError({"departmentId": "Bo'lim topilmadi"})
        
        # ID generatsiya
        if "id" not in validated_data:
            name = validated_data.get("name", "room")
            dept = validated_data.get("department")
            dept_prefix = dept.id[:4] if dept else "rm"
            validated_data["id"] = f"{dept_prefix}_{name.lower().replace(' ', '_')}"
        
        return super().create(validated_data)


class BedSerializer(serializers.ModelSerializer):
    roomId = serializers.CharField(source="room.id", read_only=True)

    class Meta:
        model = Bed
        fields = ["id", "name", "roomId"]
        extra_kwargs = {"id": {"required": False}}
    
    def create(self, validated_data):
        # Room ni olish (frontend roomId yuboradi)
        request = self.context.get('request')
        if request and hasattr(request, 'data'):
            room_id = request.data.get('roomId') or request.data.get('room_id')
            if room_id:
                from monitoring.models import Room
                try:
                    room = Room.objects.get(id=room_id)
                    validated_data['room'] = room
                except Room.DoesNotExist:
                    raise serializers.ValidationError({"roomId": "Palata topilmadi"})
        
        # ID generatsiya
        if "id" not in validated_data:
            name = validated_data.get("name", "bed")
            room = validated_data.get("room")
            room_prefix = room.id[:4] if room else "bd"
            validated_data["id"] = f"{room_prefix}_{name.lower().replace(' ', '_')}"
        
        return super().create(validated_data)


class MonitorDeviceSerializer(serializers.ModelSerializer):
    ipAddress = serializers.IPAddressField(source="ip_address")
    macAddress = serializers.CharField(
        source="mac_address", max_length=32, allow_blank=True, required=False, default=""
    )
    model = serializers.CharField(required=False, allow_blank=True, default="")
    # Bo'sh qator yuborilganda IPAddressField xato berardi — CharField + validate
    localIp = serializers.CharField(
        source="local_ip",
        allow_blank=True,
        allow_null=True,
        required=False,
        default="",
    )
    hl7Enabled = serializers.BooleanField(source="hl7_enabled", required=False, default=True)
    hl7Port = serializers.IntegerField(source="hl7_port", required=False, default=6006)
    serverTargetIp = serializers.CharField(
        source="server_target_ip",
        allow_blank=True,
        allow_null=True,
        required=False,
        default="",
    )
    hl7PeerIp = serializers.CharField(
        source="hl7_peer_ip",
        allow_blank=True,
        allow_null=True,
        required=False,
        default="",
    )
    subnetMask = serializers.CharField(
        source="subnet_mask", max_length=32, allow_blank=True, required=False, default=""
    )
    gateway = serializers.CharField(max_length=64, allow_blank=True, required=False, default="")
    bedId = serializers.PrimaryKeyRelatedField(
        queryset=Bed.objects.all(), source="bed", allow_null=True, required=False
    )
    hl7ConnectHandshake = serializers.BooleanField(
        source="hl7_connect_handshake",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = MonitorDevice
        fields = [
            "id",
            "ipAddress",
            "macAddress",
            "model",
            "localIp",
            "hl7Enabled",
            "hl7Port",
            "serverTargetIp",
            "hl7PeerIp",
            "subnetMask",
            "gateway",
            "bedId",
            "status",
            "last_seen",
            "hl7ConnectHandshake",
        ]
        read_only_fields = ["id", "status", "last_seen"]

    def _normalize_optional_ip(self, attrs: dict[str, Any], key: str, api_key: str) -> None:
        if key not in attrs:
            return
        raw = attrs[key]
        if raw is None or (isinstance(raw, str) and raw.strip() == ""):
            attrs[key] = None
            return
        s = str(raw).strip()
        try:
            validate_ipv46_address(s)
        except DjangoValidationError:
            raise serializers.ValidationError(
                {api_key: "To'g'ri IPv4 yoki IPv6 manzilini kiriting."}
            )
        attrs[key] = s

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        self._normalize_optional_ip(attrs, "local_ip", "localIp")
        self._normalize_optional_ip(attrs, "server_target_ip", "serverTargetIp")
        self._normalize_optional_ip(attrs, "hl7_peer_ip", "hl7PeerIp")

        ip = attrs.get("ip_address")
        if ip is None and self.instance is not None:
            return attrs
        if ip is not None:
            clinic = attrs.get("clinic") or (
                self.instance.clinic if self.instance is not None else None
            )
            if clinic is None:
                clinic = self.context.get("clinic")
            qs = MonitorDevice.objects.filter(ip_address=ip)
            if clinic is not None:
                qs = qs.filter(clinic=clinic)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"ipAddress": "Bu IP manzil bilan qurilma allaqachon ro'yxatda."}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> MonitorDevice:
        if "clinic" not in validated_data and self.context.get("clinic"):
            validated_data["clinic"] = self.context["clinic"]
        validated_data["id"] = "dev" + str(int(time.time() * 1000))
        validated_data.setdefault("status", MonitorDevice.Status.OFFLINE)
        validated_data.setdefault("mac_address", "")
        validated_data.setdefault("model", "")
        validated_data.setdefault("hl7_enabled", True)
        validated_data.setdefault("hl7_port", 6006)
        # Yangi qurilmalar: MLLP salom standart o'chiq (K12 ko'pincha RST/0 bayt bermaslik uchun)
        if "hl7_connect_handshake" not in validated_data:
            validated_data["hl7_connect_handshake"] = False
        return super().create(validated_data)

    def to_representation(self, instance: MonitorDevice) -> dict[str, Any]:
        return {
            "id": instance.id,
            "clinicId": instance.clinic_id,
            "ipAddress": instance.ip_address,
            "macAddress": instance.mac_address,
            "model": instance.model,
            "localIp": instance.local_ip,
            "hl7Enabled": instance.hl7_enabled,
            "hl7Port": instance.hl7_port,
            "serverTargetIp": instance.server_target_ip,
            "hl7PeerIp": instance.hl7_peer_ip,
            "subnetMask": instance.subnet_mask,
            "gateway": instance.gateway,
            "bedId": instance.bed_id,
            "status": instance.status,
            "lastSeen": instance.last_seen,
            "lastHl7RxAtMs": instance.last_hl7_rx_at_ms,
            "hl7ConnectHandshake": instance.hl7_connect_handshake,
        }


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = "__all__"
        extra_kwargs = {"id": {"required": False}}

    def create(self, validated_data):
        if "id" not in validated_data:
            import random
            validated_data["id"] = "p" + str(random.randint(100000000, 999999999))
        if "admission_date" not in validated_data:
            validated_data["admission_date"] = int(time.time() * 1000)
        return super().create(validated_data)


class DeviceVitalsIngestSerializer(serializers.Serializer):
    hr = serializers.IntegerField(required=False)
    spo2 = serializers.IntegerField(required=False)
    nibpSys = serializers.IntegerField(required=False)
    nibpDia = serializers.IntegerField(required=False)
    rr = serializers.IntegerField(required=False)
    temp = serializers.FloatField(required=False)
