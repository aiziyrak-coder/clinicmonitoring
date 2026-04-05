from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import (
    action,
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from monitoring.api_mixins import ClinicScopedViewSetMixin
from monitoring.clinic_scope import get_clinic_for_user
from monitoring.models import Bed, Department, MonitorDevice, Patient, Room
from monitoring.serializers import (
    BedSerializer,
    DepartmentSerializer,
    DeviceVitalsIngestSerializer,
    MonitorDeviceSerializer,
    RoomSerializer,
)


class DepartmentViewSet(ClinicScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class RoomViewSet(ClinicScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer


class BedViewSet(ClinicScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Bed.objects.all()
    serializer_class = BedSerializer


class DeviceViewSet(ClinicScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = MonitorDevice.objects.all()
    serializer_class = MonitorDeviceSerializer

    @action(detail=True, methods=["post"], url_path="mark-online")
    def mark_online(self, request, pk=None):
        from monitoring.device_integration import mark_device_online_only
        device = self.get_object()
        mark_device_online_only(device)
        return Response(MonitorDeviceSerializer(device).data)

    @action(detail=True, methods=["get"], url_path="connection-check")
    def connection_check(self, request, pk=None):
        device: MonitorDevice = self.get_object()

        try:
            from monitoring.hl7_listener import (
                get_hl7_diagnostic_summary,
                get_hl7_listen_config,
                get_hl7_listener_status,
                is_hl7_listener_alive,
                probe_hl7_tcp_listening,
            )

            now_ms = int(time.time() * 1000)
            threshold_sec = float(os.environ.get("DEVICE_DATA_TIMEOUT_SECONDS", "90"))
            hl7_host, hl7_port, hl7_enabled = get_hl7_listen_config()
            thread_alive = is_hl7_listener_alive()
            port_accepts = probe_hl7_tcp_listening()
            hl7_status = get_hl7_listener_status()

            last_seen_ms = device.last_seen
            hl7_rx_ms = device.last_hl7_rx_at_ms
            seconds_since: float | None = None
            is_receiving = False
            if hl7_enabled:
                ref_ms = hl7_rx_ms
                if ref_ms is not None:
                    seconds_since = max(0.0, (now_ms - ref_ms) / 1000.0)
                    is_receiving = seconds_since <= threshold_sec
            else:
                ref_ms = last_seen_ms
                if last_seen_ms is not None:
                    seconds_since = max(0.0, (now_ms - last_seen_ms) / 1000.0)
                    is_receiving = seconds_since <= threshold_sec

            bed_assigned = device.bed_id is not None
            patient_on_bed = (
                Patient.objects.filter(bed_id=device.bed_id).exists()
                if bed_assigned
                else False
            )

            # warnings — faqat tuzatish talab qilinadigan holatlar; qolganlari hints
            warnings: list[str] = []
            hints: list[str] = []
            if hl7_enabled and not thread_alive:
                warnings.append(
                    "HL7 fon jarayoni ishlamayapti — backend (Daphne) ni qayta ishga tushiring."
                )
            if hl7_enabled and not port_accepts:
                warnings.append(
                    f"Serverda {hl7_port}-port ochiq emas yoki band — firewall va HL7_LISTEN_PORT ni tekshiring."
                )
            be = hl7_status.get("bindError")
            if hl7_enabled and be:
                warnings.append(f"HL7 port bog'lanmadi (bind): {be}")
            if not bed_assigned:
                warnings.append(
                    "Qurilma joy (bed) ga biriktirilmagan — vitallar bemorga yozilmaydi."
                )
            elif not patient_on_bed:
                bid = device.bed_id or "—"
                warnings.append(
                    f"Tanlangan joyda bemor yo'q (karavat {bid}). "
                    "Sozlamalar → Bemorlar: bemorni qabul qilib shu karavarga biriktiring. "
                    "Yoki: python manage.py reset_monitoring_fresh yoki setup_real_hl7_monitor."
                )
            
            hl7_diag = get_hl7_diagnostic_summary()
            tcp_no_hl7 = int(hl7_diag.get("tcpSessionsWithoutHl7Payload") or 0)
            has_hl7_bytes = hl7_diag.get("lastPayloadAtMs") is not None
            last_empty_tcp = hl7_diag.get("lastEmptySessionTcpBytes")
            
            # K12 / 0 bayt: TCP sessiyalar bor, lekin MSH+ HL7 hali yo'q (odatda qurilma tomoni)
            is_k12_zero_byte = (
                hl7_enabled
                and hl7_rx_ms is None
                and tcp_no_hl7 >= 1
                and not has_hl7_bytes
            )

            if hl7_enabled:
                if hl7_rx_ms is None and not is_k12_zero_byte:
                    hints.append(
                        "HL7: hali MSH paket kelmagan — «onlayn» ba'zan faqat TCP; vitallar HL7 kelgach."
                    )
                    hints.append(
                        "Monitor: ORU / numerics / markaziy stansiya chiqishi; manzil VPS IP:"
                        + str(hl7_port)
                        + " (TCP, HTTPS emas)."
                    )
                elif hl7_rx_ms is None and is_k12_zero_byte:
                    hints.append(
                        "HL7: TCP ulanishi qayd etilgan, lekin MSH paket hali yo'q — quyidagi K12 qadamlarni tekshiring."
                    )
                    hints.append(
                        "Qurilma: Menu → Internet → HL7 — server VPS tashqi IP, port "
                        + str(hl7_port)
                        + ", protokol HL7/MLLP."
                    )
                    hints.append(
                        "Menu → ORU yoki Numerics / markaziy stansiya — yuborish yoqilgan, interval 5–10 s."
                    )
                    hints.append(
                        "Sensorlar: ECG elektrod (lead on), SpO2, NIBP — ulangan bo'lmasa ko'p K12 HL7 yubormaydi."
                    )
                    hints.append(
                        "Server Daphne har ulanishda ORU/MLLP sinovlarini avtomatik bajaradi — "
                        "journalctl -u clinicmonitoring-daphne -n 80 da «ORU so'rovi» / «handshake» qatorlari."
                    )
                elif not is_receiving:
                    warnings.append(
                        f"Oxirgi HL7 paket {int(seconds_since or 0)} s oldin (chegara {int(threshold_sec)} s)."
                    )
            else:
                if last_seen_ms is None:
                    hints.append("REST vitals: hali ma'lumot kelmagan — tarmoq va firewall.")
                elif not is_receiving:
                    warnings.append(
                        f"Oxirgi ma'lumot {int(seconds_since or 0)} s oldin (chegara {int(threshold_sec)} s)."
                    )

            if hl7_enabled and hl7_rx_ms is None and last_empty_tcp is not None:
                try:
                    empty_n = int(last_empty_tcp)
                except (TypeError, ValueError):
                    empty_n = -1
                if empty_n == 0:
                    hs = device.hl7_connect_handshake
                    if hs is True:
                        hints.append(
                            "Oxirgi sessiya: TCP 0 bayt, «HL7 salom» yoqilgan — RST yoki 0 bayt bo'lsa «O'chirish» ni sinang."
                        )
                    elif hs is False:
                        hints.append(
                            "Oxirgi sessiya: TCP 0 bayt (salom o'chiq) — ORU menyusi, sensorlar, firewall 6006."
                        )
                    else:
                        hints.append(
                            "Oxirgi sessiya: TCP 0 bayt — «HL7 salom» Muhit (.env): HL7_SEND_CONNECT_HANDSHAKE."
                        )
                elif empty_n > 0:
                    hints.append(
                        f"Oxirgi sessiya: TCP {empty_n} bayt, MSH yo'q — kodlash/freyming. HL7_DEBUG / journalctl."
                    )
            if hl7_enabled and tcp_no_hl7 >= 2 and not has_hl7_bytes:
                hints.append(
                    "Bir nechta TCP sessiya HL7siz — bulut firewall 6006 va monitor HL7 chiqishi."
                )
            
            server_listen_ok = (not hl7_enabled) or (thread_alive and port_accepts and not be)
            pipeline_ok = bed_assigned and patient_on_bed
            if hl7_enabled:
                data_flow_ok = hl7_rx_ms is not None and is_receiving
            else:
                data_flow_ok = last_seen_ms is not None and is_receiving
            all_ok = bool(server_listen_ok and pipeline_ok and data_flow_ok)

            # UI: server/pipeline haqiqiy xato bo'lsa «warning», faqat K12 kutilayotgan bo'lsa «info»
            if all_ok:
                check_tone = "success"
            elif warnings:
                check_tone = "warning"
            else:
                check_tone = "info"

            summary_parts: list[str] = []
            k12_full_summary = (
                hl7_enabled
                and hl7_rx_ms is None
                and bed_assigned
                and patient_on_bed
                and server_listen_ok
                and is_k12_zero_byte
            )
            if server_listen_ok and hl7_enabled and not k12_full_summary:
                summary_parts.append("HL7 server tinglayapti.")
            elif not hl7_enabled:
                summary_parts.append("HL7 o'chirilgan (faqat REST vitals).")
            if hl7_enabled:
                if hl7_rx_ms is None:
                    if bed_assigned and patient_on_bed and server_listen_ok:
                        if is_k12_zero_byte:
                            summary_parts.append(
                                "HL7 server tinglayapti. TCP ulanishi bor; MSH+ HL7 hali kelmagan — "
                                "K12: ORU / sensorlar / HL7 menyusi (pastdagi qadamlar)."
                            )
                        else:
                            summary_parts.append("Server tayyor; HL7 paket monitor dan kutilmoqda.")
                    else:
                        summary_parts.append("HL7 jismoniy paket hali kelmagan.")
                elif is_receiving:
                    summary_parts.append("HL7 ma'lumot oqimi yaxshi (chegara ichida).")
                else:
                    summary_parts.append("HL7 ma'lumot kechikmoqda yoki to'xtagan.")
            else:
                if last_seen_ms is None:
                    summary_parts.append("Ma'lumot hali kelmagan.")
                elif is_receiving:
                    summary_parts.append("Ma'lumot oqimi yaxshi (chegara ichida).")
                else:
                    summary_parts.append("Ma'lumot kechikmoqda yoki to'xtagan.")
            if pipeline_ok:
                summary_parts.append("Joy va bemor biriktirilgan.")
            else:
                summary_parts.append("Joy/bemor zanjirini tekshiring.")

            return Response(
                {
                    "success": True,
                    "allOk": all_ok,
                    "deviceId": device.id,
                    "ipAddress": str(device.ip_address),
                    "nowServerTimeMs": now_ms,
                    "lastMessageAtMs": ref_ms,
                    "lastSeenAtMs": last_seen_ms,
                    "lastHl7RxAtMs": hl7_rx_ms,
                    "secondsSinceLastMessage": round(seconds_since, 2)
                    if seconds_since is not None
                    else None,
                    "isReceivingData": is_receiving,
                    "dataTimeoutSeconds": int(threshold_sec),
                    "isK12ZeroByte": is_k12_zero_byte,
                    "hl7": {
                        "enabled": hl7_enabled,
                        "listenHost": hl7_host,
                        "listenPort": hl7_port,
                        "threadAlive": thread_alive,
                        "localPortAcceptsConnections": port_accepts,
                        "bindError": hl7_status.get("bindError"),
                    },
                    "hl7Diagnostic": hl7_diag,
                    "firewallHints": [
                        "VPS (DigitalOcean / AWS / ...): Cloud → Firewall / Security Group → kiruvchi TCP 6006 ruxsat.",
                        "Server: sudo ufw status verbose; kerak bo‘lsa: sudo ufw allow 6006/tcp && sudo ufw reload",
                        "HL7 HTTPS (443) emas — monitor to‘g‘ri VPS tashqi IP:6006 ga TCP ulanadi.",
                    ],
                    "assignment": {
                        "bedAssigned": bed_assigned,
                        "patientOnBed": patient_on_bed,
                    },
                    "warnings": warnings,
                    "hints": hints,
                    "summary": " ".join(summary_parts),
                    "checkTone": check_tone,
                }
            )
        except Exception as exc:
            return Response(
                {
                    "success": False,
                    "error": "Tekshiruvda xatolik",
                    "detail": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PatientViewSet(ClinicScopedViewSetMixin, viewsets.ModelViewSet):
    from monitoring.serializers import PatientSerializer
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer

    def perform_create(self, serializer):
        patient = serializer.save()
        from monitoring.models import ClinicalAuditLog
        ClinicalAuditLog.objects.create(
            user=self.request.user if self.request.user.is_authenticated else None,
            action="ADMIT",
            patient=patient,
            details={"patient_name": patient.name, "bed_id": patient.bed_id},
            ip_address=self.request.META.get("REMOTE_ADDR"),
        )
        logger.info(f"Patient admitted: {patient.id} by {self.request.user}")

    def perform_destroy(self, instance):
        patient_id = instance.id
        patient_name = instance.name
        from monitoring.models import ClinicalAuditLog
        ClinicalAuditLog.objects.create(
            user=self.request.user if self.request.user.is_authenticated else None,
            action="DISCHARGE",
            details={"patient_id": patient_id, "patient_name": patient_name},
            ip_address=self.request.META.get("REMOTE_ADDR"),
        )
        super().perform_destroy(instance)
        logger.info(f"Patient discharged: {patient_id} by {self.request.user}")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def infrastructure(request):
    from monitoring.hl7_listener import get_hl7_diagnostic_summary, get_hl7_listener_status

    hl7_extra = {
        "hl7Diagnostic": get_hl7_diagnostic_summary(),
        "hl7ListenerStatus": get_hl7_listener_status(),
        "firewallHints": [
            "VPS: bulut panelida kiruvchi TCP 6006 (HL7) ochiq bo‘lsin.",
            "sudo ufw allow 6006/tcp && sudo ufw reload",
        ],
    }
    if request.user.is_superuser:
        return Response(
            {
                "departments": DepartmentSerializer(Department.objects.all(), many=True).data,
                "rooms": RoomSerializer(Room.objects.all(), many=True).data,
                "beds": BedSerializer(Bed.objects.all(), many=True).data,
                "devices": MonitorDeviceSerializer(MonitorDevice.objects.all(), many=True).data,
                **hl7_extra,
            }
        )
    clinic = get_clinic_for_user(request.user)
    if not clinic:
        return Response(
            {"departments": [], "rooms": [], "beds": [], "devices": []},
        )
    return Response(
        {
            "departments": DepartmentSerializer(
                Department.objects.filter(clinic=clinic), many=True
            ).data,
            "rooms": RoomSerializer(
                Room.objects.filter(department__clinic=clinic), many=True
            ).data,
            "beds": BedSerializer(
                Bed.objects.filter(room__department__clinic=clinic), many=True
            ).data,
            "devices": MonitorDeviceSerializer(
                MonitorDevice.objects.filter(clinic=clinic), many=True
            ).data,
            **hl7_extra,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patients_list(request):
    from monitoring.serializers import serialize_all_patients

    if request.user.is_superuser:
        return Response(serialize_all_patients())
    clinic = get_clinic_for_user(request.user)
    if not clinic:
        return Response([])
    return Response(serialize_all_patients(clinic.id))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def hl7_bridge_ingest(request):
    """
    Tashqi HL7 TCP bridge (masalan Node.js) JSON vitallarni yuboradi.
    Header: ``X-HL7-Bridge-Token`` yoki ``Authorization: Bearer <token>`` —
    ``HL7_BRIDGE_TOKEN`` muhitda bo'lsa majburiy; bo'lmasa faqat ``DEBUG=true`` da ruxsat.
    Body: ``deviceIp`` (majburiy), ``hr``, ``spo2``, ``nibpSys``, ``nibpDia``, ``rr``, ``temp``.
    """
    expected = os.environ.get("HL7_BRIDGE_TOKEN", "").strip()
    if expected:
        got = (request.headers.get("X-HL7-Bridge-Token") or "").strip()
        if not got:
            auth = request.headers.get("Authorization") or ""
            if auth.lower().startswith("bearer "):
                got = auth[7:].strip()
        if got != expected:
            return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        from django.conf import settings as dj_settings

        if not dj_settings.DEBUG:
            return Response(
                {"error": "HL7_BRIDGE_TOKEN is not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    data = request.data if isinstance(request.data, dict) else {}
    device_ip = (data.get("deviceIp") or data.get("device_ip") or "").strip()
    if not device_ip:
        return Response({"error": "deviceIp required"}, status=status.HTTP_400_BAD_REQUEST)

    vital_data = {k: data[k] for k in ("hr", "spo2", "nibpSys", "nibpDia", "rr", "temp") if k in data}
    ser = DeviceVitalsIngestSerializer(data=vital_data)
    ser.is_valid(raise_exception=True)
    payload = {k: ser.validated_data[k] for k in ser.validated_data if ser.validated_data[k] is not None}
    if not payload:
        return Response(
            {"error": "At least one vital field (hr, spo2, ...) required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from monitoring.device_integration import apply_vitals_payload

    try:
        # (clinic, ip) bo'yicha izlash — bir xil IP boshqa klinikada bo'lishi mumkin
        if request.user.is_authenticated and not request.user.is_superuser:
            from monitoring.clinic_scope import get_clinic_for_user
            clinic_obj = get_clinic_for_user(request.user)
            device = MonitorDevice.objects.filter(ip_address=device_ip, clinic=clinic_obj).first()
        else:
            qs = MonitorDevice.objects.filter(ip_address=device_ip)
            if qs.count() > 1:
                logger.warning("hl7_bridge: bir nechta qurilma topildi ip=%s, birinchisi olinadi", device_ip)
            device = qs.first()
        if not device:
            raise MonitorDevice.DoesNotExist
    except MonitorDevice.DoesNotExist:
        return Response({"error": "Device not registered"}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        apply_vitals_payload(device, payload, mark_online=True)
    return Response({"success": True, "message": "Data received"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def device_vitals_ingest(request, ip: str):
    from monitoring.device_integration import apply_vitals_payload

    ser = DeviceVitalsIngestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    if request.user.is_superuser:
        device = MonitorDevice.objects.filter(ip_address=ip).first()
    else:
        clinic = get_clinic_for_user(request.user)
        if not clinic:
            return Response({"error": "Clinic not found"}, status=status.HTTP_403_FORBIDDEN)
        device = MonitorDevice.objects.filter(ip_address=ip, clinic=clinic).first()
    if not device:
        return Response({"error": "Device not registered"}, status=status.HTTP_404_NOT_FOUND)
    payload = {k: ser.validated_data[k] for k in ser.validated_data if ser.validated_data[k] is not None}
    apply_vitals_payload(device, payload, mark_online=True)
    return Response({"success": True, "message": "Data received"})


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def gateway_vitals_ingest(request):
    """
    Local gateway va to'g'ridan-to'g'ri MLLP dan kelgan vitallarni saqlash.
    Autentifikatsiya: ixtiyoriy GATEWAY_TOKEN sarlavha.
    Body: { device_id, timestamp, heart_rate, spo2, systolic, diastolic, temperature, rr }
    """
    import os
    from monitoring.device_integration import apply_vitals_payload, resolve_hl7_device_by_peer_ip

    # Token tekshiruvi
    expected_token = os.environ.get("GATEWAY_TOKEN", "").strip()
    token_required = os.environ.get("GATEWAY_TOKEN_REQUIRED", "false").lower() in ("1", "true", "yes")
    if expected_token:
        provided_token = (request.headers.get("X-Gateway-Token") or "").strip()
        if provided_token != expected_token:
            return Response(
                {"error": "Invalid gateway token"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
    elif token_required:
        # Token o'rnatilmagan, lekin majburiy deb belgilangan
        return Response(
            {"error": "Gateway token not configured — set GATEWAY_TOKEN in .env"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    data = request.data if isinstance(request.data, dict) else {}

    device_id = (data.get("device_id") or "").strip()
    if not device_id:
        return Response(
            {"error": "device_id required (device IP address)"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Vitallarni olish va type xatolarini ushlash
    vitals: dict[str, Any] = {}
    try:
        if data.get("heart_rate") is not None:
            vitals["hr"] = int(data["heart_rate"])
        if data.get("spo2") is not None:
            vitals["spo2"] = int(data["spo2"])
        if data.get("systolic") is not None:
            vitals["nibpSys"] = int(data["systolic"])
        if data.get("diastolic") is not None:
            vitals["nibpDia"] = int(data["diastolic"])
        if data.get("temperature") is not None:
            vitals["temp"] = float(data["temperature"])
        if data.get("rr") is not None:
            vitals["rr"] = int(data["rr"])
    except (TypeError, ValueError) as conv_err:
        return Response(
            {"error": "Invalid vital value (number required)", "detail": str(conv_err)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not vitals:
        return Response(
            {"error": "No vitals (heart_rate, spo2, systolic, diastolic, temperature, rr)"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # --- Qurilmani aniqlash ---
    device = resolve_hl7_device_by_peer_ip(device_id, allow_nat_loopback=True)

    if not device:
        from monitoring.models import MonitorDevice

        hl7_devices = MonitorDevice.objects.filter(hl7_enabled=True)
        count = hl7_devices.count()

        if count == 1:
            # Bitta ro'yxatdagi qurilma — NAT/gateway orqali kelsa, peer IP ni avto yozamiz
            device = hl7_devices.first()
            if device.hl7_peer_ip != device_id:
                MonitorDevice.objects.filter(pk=device.pk).update(hl7_peer_ip=device_id)
                device.hl7_peer_ip = device_id
            logger.info(
                "gateway_vitals: bitta qurilma — avto-birlashtirildi device=%s peer=%s",
                device.pk, device_id,
            )
        else:
            # Bir nechta qurilma yoki hech biri — faqat admin qo'lda biriktirishi kerak
            logger.warning(
                "gateway_vitals: device topilmadi device_id=%s (jami hl7_enabled=%d)",
                device_id, count,
            )
            return Response(
                {
                    "error": "Device not registered",
                    "device_id": device_id,
                    "hint": (
                        "Admin panelda MonitorDevice yarating yoki hl7_peer_ip ni to'g'rilang: "
                        f"ip_address={device_id}, hl7_enabled=True, bed biriktiring, bemor qabul qiling. "
                        "Admin: /admin/monitoring/monitordevice/"
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

    # --- Vitallarni saqlash ---
    try:
        patient = apply_vitals_payload(device, vitals, mark_online=True)
        if patient:
            return Response(
                {
                    "success": True,
                    "device_id": device.id,
                    "patient_id": patient.id,
                }
            )
        # Qurilma topildi, lekin bed yoki bemor biriktirilmagan
        return Response(
            {
                "success": False,
                "device_id": device.id,
                "bed_id": device.bed_id,
                "hint": (
                    "Qurilmani karavat (bed) ga biriktiring va karavotga bemor qabul qiling. "
                    "Admin: /admin/monitoring/monitordevice/"
                ),
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    except Exception as exc:
        logger.exception("gateway_vitals: apply_vitals_payload xato device=%s", device.id)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def root(request):
    """`/` — API yo'riqnomasi (404 emas)."""
    return Response(
        {
            "service": "ClinicMonitoring API",
            "version": "1",
            "health": "/api/health/",
            "hl7Bridge": "/api/hl7/",
            "api": "/api/",
            "admin": "/admin/",
            "websocket": "/ws/monitoring/",
            "gateway": "/api/vitals/ (POST from local gateway)",
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    health_status = {"status": "ok", "database": "connected", "redis": "connected"}
    errs = {}

    # 1. Database check
    try:
        connection.ensure_connection()
    except Exception as exc:
        health_status["status"] = "unhealthy"
        health_status["database"] = "error"
        errs["database"] = str(exc)

    # 2. Redis (REDIS_URL bo'lsa — haqiqiy PING; bo'lmasa — in-memory channel layer)
    redis_url = (os.environ.get("REDIS_URL") or "").strip()
    try:
        if redis_url:
            import redis as redis_lib

            client = redis_lib.from_url(redis_url, socket_connect_timeout=2)
            client.ping()
            health_status["redis"] = "connected"
        else:
            from channels.layers import get_channel_layer

            if get_channel_layer() is None:
                health_status["status"] = "unhealthy"
                health_status["redis"] = "error"
                errs["redis"] = "channel layer yo'q"
            else:
                health_status["redis"] = "in_memory"
    except Exception as exc:
        health_status["status"] = "unhealthy"
        health_status["redis"] = "error"
        errs["redis"] = str(exc)

    if health_status["status"] != "ok":
        import django.conf as dj_conf
        resp_body: dict = dict(health_status)
        if dj_conf.settings.DEBUG:
            resp_body["details"] = errs
        else:
            # Production: aniq xato ma'lumotlari log ga boradi, response da emas
            logger.error("Health check failed: %s", errs)
        return Response(resp_body, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response(health_status)

